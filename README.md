# 体重管理グラフ

体重の測定値と目標値を記録し、7日移動平均と目標体重を比較するグラフツール。

## 技術要素

- Vue 3(CDN版) + vue3-sfc-loader(SFCをブラウザでコンパイル)
- Chart.js(CDN版)
- Firebase
  - Firestore: データ保存(Security Rulesで本人と管理者の権限を制御)
  - Authentication: Googleログイン
- ビルド工程なしの静的サイト(HTML + CSS + JS + Vue SFC)

## データ構造(Firestore)

- `users/{uid}` … `{ name: string, memo: string, defaultView: string, admin?: boolean }`
- `users/{uid}/weights/{YYYY-MM-DD}` … `{ weight: number, enteredAt?: string }`
- `users/{uid}/targets/{YYYY-MM-DD}` … `{ weight: number, enteredAt?: string }`

`enteredAt` は更新日時のISO文字列。既存データのように未設定の場合は画面で `-` 表示。

管理者権限はソースコードにUIDを書かず、`users/{uid}` の `admin` で管理します。
一般ユーザーが `admin` を変更できないように Firestore Security Rules で保護してください。
マイページ設定は `users/{uid}` に保存し、ブラウザのlocalStorageやIndexedDBには保存しません。Firebase Authのログイン状態はsessionStorageに限定します。
Security Rulesは `firestore.rules` で管理し、`firebase.json` からデプロイします。
`users/{uid}` が存在しない場合は初回ログイン時に作成し、管理者のユーザー切り替え一覧へ登録します。


## ローカルでの動作確認

- 1) サーバーを起動する  
※`file://`では動かない

```sh
python3 -m http.server 8000
```

- 2) `http://localhost:8000/` を開く
