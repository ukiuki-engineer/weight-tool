// Firebase プロジェクトへの接続設定。
// 値の確認場所: Firebase コンソール > プロジェクトの設定 > マイアプリ > SDK の設定と構成
//
// この設定は「接続先の識別子」であり、シークレットではない(Firebase 公式の見解)。
// ブラウザで動くアプリの性質上、サイト訪問者には必ず見える値なので、
// GitHub Pages 公開時はこのファイルをコミットして配信する(.gitignore から外す)。
// データの保護は Firestore のセキュリティルールが担う。
export const firebaseConfig = {
  apiKey: "AIzaSyCwVJt3ZjTMN4An6szybxLZ79-Zi-XXsF4",
  authDomain: "weight-tool-16c8e.firebaseapp.com",
  projectId: "weight-tool-16c8e",
  storageBucket: "weight-tool-16c8e.firebasestorage.app",
  messagingSenderId: "308861122326",
  appId: "1:308861122326:web:fe216afb0ca1f0c1880237",
  measurementId: "G-NVB155PF5Q",
};
