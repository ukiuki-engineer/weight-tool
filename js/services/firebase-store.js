// Firebase の初期化・認証・Firestore 読み書きを担当するサービス。

import { firebaseConfig } from "../config/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  initializeAuth,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDoc,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  deleteField,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { currentTimestamp } from "../utils/record-utils.js?v=20260717-4";

const LOGIN_STORAGE_ERROR_MESSAGE = "このブラウザではログイン用の一時保存が使えません。SafariまたはChromeで開き直してください。";
const GOOGLE_LOGIN_STATE_KEY = "weight-tool-google-login-state";
const GOOGLE_LOGIN_STATE_COOKIE = "weight_tool_google_login_state";
const GOOGLE_LOGIN_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const LEGACY_REDIRECT_LOGIN_PARAM = "loginRedirect";

export function canUseSessionStorage() {
  if (typeof window === "undefined") return false;
  try {
    const storage = window.sessionStorage;
    if (!storage) return false;
    const key = `weight-tool-auth-check-${Date.now()}`;
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: canUseSessionStorage() ? browserSessionPersistence : inMemoryPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
const db = getFirestore(app);

function isAuthStorageError(error) {
  return error?.code === "auth/web-storage-unsupported"
    || error?.code === "auth/operation-not-supported-in-this-environment"
    || error?.message?.includes("sessionStorage")
    || error?.message?.includes("missing initial state")
    || error?.message?.includes("Unable to save initial state");
}

function googleProvider() {
  return new GoogleAuthProvider();
}

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return window.navigator?.standalone === true
    || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

function isIosDevice() {
  if (typeof window === "undefined") return false;
  const navigator = window.navigator || {};
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  return /\biP(hone|ad|od)\b/.test(platform)
    || /\biP(hone|ad|od)\b/.test(userAgent)
    || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function shouldUseManualGoogleLogin() {
  return isStandaloneApp() || isIosDevice();
}

function appContinueUri() {
  const url = new URL(window.location.href);
  url.searchParams.delete(LEGACY_REDIRECT_LOGIN_PARAM);
  url.hash = "";
  return url.toString();
}

function clearGoogleLoginHash() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(LEGACY_REDIRECT_LOGIN_PARAM);
    url.hash = "";
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  } catch (error) {
  }
}

function googleLoginCookieAttributes(maxAgeSeconds) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  return `; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function googleLoginStateFromCookie() {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  const prefix = `${GOOGLE_LOGIN_STATE_COOKIE}=`;
  const cookie = cookies.find((row) => row.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function saveGoogleLoginStateCookie(value) {
  if (typeof document === "undefined") return;
  document.cookie = `${GOOGLE_LOGIN_STATE_COOKIE}=${encodeURIComponent(value)}${googleLoginCookieAttributes(600)}`;
}

function clearGoogleLoginStateCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${GOOGLE_LOGIN_STATE_COOKIE}=${googleLoginCookieAttributes(0)}`;
}

function pendingGoogleLoginState() {
  const cookieState = googleLoginStateFromCookie();
  if (!canUseSessionStorage()) return cookieState;
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_LOGIN_STATE_KEY);
    if (!raw) return cookieState;
    const state = JSON.parse(raw);
    if (!state?.value || Date.now() - Number(state.createdAt) > GOOGLE_LOGIN_STATE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(GOOGLE_LOGIN_STATE_KEY);
      return cookieState;
    }
    return state.value;
  } catch (error) {
    return cookieState;
  }
}

function savePendingGoogleLoginState(value) {
  if (!canUseSessionStorage()) {
    throw new Error(LOGIN_STORAGE_ERROR_MESSAGE);
  }
  window.sessionStorage.setItem(GOOGLE_LOGIN_STATE_KEY, JSON.stringify({
    value,
    createdAt: Date.now(),
  }));
  saveGoogleLoginStateCookie(value);
}

function clearPendingGoogleLoginState() {
  clearGoogleLoginStateCookie();
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(GOOGLE_LOGIN_STATE_KEY);
  } catch (error) {
  }
}

async function createGoogleAuthUri() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: "google.com",
        continueUri: appContinueUri(),
        customParameter: { prompt: "select_account" },
      }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.authUri) {
    const detail = result.error?.message || "認証URLを取得できませんでした";
    throw new Error(`Googleログインを開始できませんでした: ${detail}`);
  }
  return result.authUri;
}

async function loginWithManualGoogleRedirect() {
  const authUri = await createGoogleAuthUri();
  const state = new URL(authUri).searchParams.get("state");
  if (!state) {
    throw new Error("Googleログインの状態を作成できませんでした。");
  }
  savePendingGoogleLoginState(state);
  window.location.assign(authUri);
  return new Promise(() => {});
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function completeRedirectLogin() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const idToken = params.get("id_token");
  const error = params.get("error");
  const returnedState = params.get("state");

  if (!idToken && !error) return null;

  clearGoogleLoginHash();
  try {
    if (error) {
      const detail = params.get("error_description") || error;
      throw new Error(`Googleログインがキャンセルまたは拒否されました: ${detail}`);
    }

    const expectedState = pendingGoogleLoginState();
    if (!expectedState || returnedState !== expectedState) {
      throw new Error("Googleログインの状態を確認できませんでした。もう一度ログインしてください。");
    }

    return await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } catch (error) {
    if (isAuthStorageError(error)) {
      throw new Error(LOGIN_STORAGE_ERROR_MESSAGE);
    }
    throw error;
  } finally {
    clearPendingGoogleLoginState();
  }
}

export async function login() {
  if (!canUseSessionStorage()) {
    throw new Error(LOGIN_STORAGE_ERROR_MESSAGE);
  }
  try {
    if (shouldUseManualGoogleLogin()) {
      return await loginWithManualGoogleRedirect();
    }
    return await signInWithPopup(auth, googleProvider());
  } catch (error) {
    clearPendingGoogleLoginState();
    if (isAuthStorageError(error)) {
      throw new Error(LOGIN_STORAGE_ERROR_MESSAGE);
    }
    throw error;
  }
}

export function logout() {
  return signOut(auth);
}

function requireCurrentUser() {
  if (!auth.currentUser) throw new Error("ログインしていません");
  return auth.currentUser;
}

function userFromSnapshot(docSnap) {
  const data = docSnap.data();
  return {
    uid: docSnap.id,
    name: typeof data.name === "string" ? data.name.trim() : "",
    memo: typeof data.memo === "string" ? data.memo.trim() : "",
    defaultView: typeof data.defaultView === "string" ? data.defaultView : "graph",
    isAdmin: typeof data.isAdmin === "boolean" ? data.isAdmin : data.admin === true,
  };
}

function initialUser(currentUser) {
  const fallbackName = currentUser.email?.split("@")[0] || "ユーザー";
  return {
    uid: currentUser.uid,
    name: currentUser.displayName?.trim() || fallbackName,
    memo: "",
    defaultView: "graph",
    isAdmin: false,
  };
}

function usersFromSnapshot(snapshot) {
  return snapshot.docs
    .map(userFromSnapshot)
    .filter((user) => user.uid && user.name)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

// users/{uid} の isAdmin で権限を判定し、管理者だけがユーザー一覧を取得する。
export async function loadUserAccess() {
  const currentUser = requireCurrentUser();
  const currentUserRef = doc(db, "users", currentUser.uid);
  const currentUserSnapshot = await getDoc(currentUserRef);
  if (!currentUserSnapshot.exists()) {
    const createdUser = initialUser(currentUser);
    await setDoc(currentUserRef, {
      name: createdUser.name,
      memo: createdUser.memo,
      defaultView: createdUser.defaultView,
      isAdmin: false,
    });
    return { isAdmin: false, currentUser: createdUser, users: [createdUser] };
  }

  const currentUserData = userFromSnapshot(currentUserSnapshot);
  if (!currentUserData.isAdmin) {
    return { isAdmin: false, currentUser: currentUserData, users: [currentUserData] };
  }

  const snapshot = await getDocs(collection(db, "users"));
  return { isAdmin: true, currentUser: currentUserData, users: usersFromSnapshot(snapshot) };
}

export async function saveUserSettings({ name, memo, defaultView }) {
  const currentUser = requireCurrentUser();
  const settings = { name, memo, defaultView };
  await setDoc(doc(db, "users", currentUser.uid), settings, { merge: true });
  return settings;
}

function normalizeTimestamp(value) {
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  return "";
}

function recordsFromSnapshot(snapshot) {
  return snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
        date: docSnap.id,
        weight: data.weight,
        createdAt: normalizeTimestamp(data.createdAt),
        updatedAt: normalizeTimestamp(data.updatedAt || data.enteredAt),
      };
    })
    .filter((row) => row.date && typeof row.weight === "number");
}

// { weights, targets } を返す。日付昇順。
export async function loadRecords(uid) {
  const [weightsSnap, targetsSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, "weights")),
    getDocs(collection(db, "users", uid, "targets")),
  ]);
  return {
    weights: recordsFromSnapshot(weightsSnap),
    targets: recordsFromSnapshot(targetsSnap),
  };
}

// 書き込み先は「表示中ユーザー」のuid。
// 自分以外への書き込みは管理者のみ(Firestoreルール側で強制される)。
function docFor(uid, col, date) {
  requireCurrentUser();
  if (!uid) throw new Error("書き込み先ユーザーが不明です");
  return doc(db, "users", uid, col, date);
}

// 同じ日付は上書き
async function saveRecord(uid, col, date, weight) {
  const recordRef = docFor(uid, col, date);
  const localTimestamp = currentTimestamp();
  let createdAt = "";

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(recordRef);
    if (snapshot.exists()) {
      createdAt = normalizeTimestamp(snapshot.data().createdAt);
      transaction.set(recordRef, {
        weight,
        updatedAt: serverTimestamp(),
        enteredAt: deleteField(),
      }, { merge: true });
      return;
    }

    createdAt = localTimestamp;
    transaction.set(recordRef, {
      weight,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return { createdAt, updatedAt: localTimestamp };
}

export async function saveWeight(uid, date, weight) {
  return saveRecord(uid, "weights", date, weight);
}

export async function deleteWeight(uid, date) {
  await deleteDoc(docFor(uid, "weights", date));
}

export async function saveTarget(uid, date, weight) {
  return saveRecord(uid, "targets", date, weight);
}

export async function deleteTarget(uid, date) {
  await deleteDoc(docFor(uid, "targets", date));
}

// 一括登録。Firestoreのバッチ上限(500件)を避けて分割書き込みする
async function saveMany(uid, col, records) {
  const existingSnapshot = await getDocs(collection(db, "users", uid, col));
  const existingByDate = new Map(
    existingSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()]),
  );
  const localTimestamp = currentTimestamp();
  const savedRecords = records.map((row) => {
    const existing = existingByDate.get(row.date);
    return {
      ...row,
      createdAt: existing ? normalizeTimestamp(existing.createdAt) : localTimestamp,
      updatedAt: localTimestamp,
    };
  });

  for (let i = 0; i < records.length; i += 400) {
    const batch = writeBatch(db);
    for (const row of records.slice(i, i + 400)) {
      const recordRef = docFor(uid, col, row.date);
      if (existingByDate.has(row.date)) {
        batch.set(recordRef, {
          weight: row.weight,
          updatedAt: serverTimestamp(),
          enteredAt: deleteField(),
        }, { merge: true });
      } else {
        batch.set(recordRef, {
          weight: row.weight,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingByDate.set(row.date, {});
      }
    }
    await batch.commit();
  }

  return savedRecords;
}

export async function saveWeights(uid, records) {
  return saveMany(uid, "weights", records);
}

export async function saveTargets(uid, records) {
  return saveMany(uid, "targets", records);
}
