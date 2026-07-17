// Firebase の初期化・認証・Firestore 読み書きを担当するサービス。

import { firebaseConfig } from "../config/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  initializeAuth,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
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
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { currentEnteredAt } from "../utils/record-utils.js";

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
const db = getFirestore(app);

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function login() {
  return signInWithPopup(auth, new GoogleAuthProvider());
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
    isAdmin: data.admin === true,
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

// users/{uid} の admin で権限を判定し、管理者だけがユーザー一覧を取得する。
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

function normalizeEnteredAt(value) {
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
        enteredAt: normalizeEnteredAt(data.enteredAt),
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
export async function saveWeight(uid, date, weight, enteredAt = currentEnteredAt()) {
  await setDoc(docFor(uid, "weights", date), { weight, enteredAt });
  return { enteredAt };
}

export async function deleteWeight(uid, date) {
  await deleteDoc(docFor(uid, "weights", date));
}

export async function saveTarget(uid, date, weight, enteredAt = currentEnteredAt()) {
  await setDoc(docFor(uid, "targets", date), { weight, enteredAt });
  return { enteredAt };
}

export async function deleteTarget(uid, date) {
  await deleteDoc(docFor(uid, "targets", date));
}

// 一括登録。Firestoreのバッチ上限(500件)を避けて分割書き込みする
async function saveMany(uid, col, records) {
  for (let i = 0; i < records.length; i += 400) {
    const batch = writeBatch(db);
    for (const row of records.slice(i, i + 400)) {
      batch.set(docFor(uid, col, row.date), {
        weight: row.weight,
        enteredAt: row.enteredAt || currentEnteredAt(),
      });
    }
    await batch.commit();
  }
}

export async function saveWeights(uid, records) {
  await saveMany(uid, "weights", records);
}

export async function saveTargets(uid, records) {
  await saveMany(uid, "targets", records);
}
