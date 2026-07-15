# 体重管理グラフ

体重の測定値と目標値を記録し、7日移動平均と目標体重を比較するグラフツール。

## 技術要素

- Vue 3(CDN版)
- Chart.js(CDN版)
- Firebase
  - Firestore: データ保存(本人のUIDのみ読み書き可のセキュリティルール)
  - Authentication: Googleログイン
- ビルド工程なしの静的サイト(HTML + CSS + JS のみ)


## ローカルでの動作確認

- 1) サーバーを起動する  
※`file://`では動かない

```sh
python3 -m http.server 8000
```

- 2) `http://localhost:8000/` を開く

