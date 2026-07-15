// Firebase の初期化・認証・Firestore 読み書きの共通モジュール。
// グラフページ(graph-page.js)と入力ページ(entry-page.js)の両方から使う。

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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

function recordsFromSnapshot(snapshot) {
  return snapshot.docs
    .map((docSnap) => ({ date: docSnap.id, weight: docSnap.data().weight }))
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

// 同じ日付は上書き
export async function saveWeight(date, weight) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインしていません");
  await setDoc(doc(db, "users", user.uid, "weights", date), { weight });
}
