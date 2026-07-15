# AGENTS.md

このファイルは、このリポジトリで AI コーディングエージェント(Codex、Claude Code など)が作業するときのプロジェクト指示です。
Claude Code は `CLAUDE.md`(このファイルをインポートする1行のみ)経由で読み込みます。

## プロジェクト概要

- 体重管理グラフです。データは Firebase Firestore で管理し、Google ログインした本人のみ読み書きできます。
- ビルド工程はありません。`python3 -m http.server 8000` で起動し `http://localhost:8000/` を開くと動きます(`file://` 直接は不可)。
- UI は Vue 3(CDN のグローバルビルド)、グラフ描画は Chart.js CDN、Firebase SDK は gstatic の ES モジュール CDN を使っています。
- ページ構成: `index.html`(グラフ)+ `entry.html`(入力)の2ページ。1ページ=1つの実 HTML ファイルを維持してください(SPA ルーター化しない)。
- 主要ファイル:
  - `app.js` … グラフの計算・描画ロジック(DOM 状態は引数 state で受け取る純粋関数群)
  - `graph-page.js` / `entry-page.js` … 各ページの Vue アプリ
  - `firebase-store.js` … 認証と Firestore 読み書きの共通モジュール
  - `firebase-config.js` … Firebase の接続設定
- `firebase-config.js` は Firebase の接続設定です。シークレットではないためコミット対象です(データ保護は Firestore のセキュリティルール側)。
- `SETUP.local.md` は個人用のセットアップメモで `.gitignore` 対象です。セキュリティルール本文や UID などリポジトリに載せない情報はここに書きます。
- `migrate.html` は旧 `data.js` 形式から Firestore への一括移行ページでした。移行は完了済みで `data.js` は削除されています。

## 作業方針

- Vue 3(CDN)+ 素朴な HTML / CSS 構成を維持してください。
- npm パッケージやビルドツールは追加しないでください(ライブラリは CDN 読み込みのみ)。
- 体重・目標値のデータ形式は `README.md` の「データ構造(Firestore)」に合わせてください。
- 日付文字列は `YYYY-MM-DD` を使い、既存のローカル日付処理に合わせてください。
- 表示文言は日本語で、現在の UI の短い表現に揃えてください。
- 変更は依頼範囲に限定し、不要なリファクタリングや見た目の大幅変更は避けてください。

## 確認方法

- JavaScript の構文確認:

```sh
node --check app.js
node --check firebase-store.js
node --check graph-page.js
node --check entry-page.js
```

- ブラウザ確認:

```sh
python3 -m http.server 8000
```

その後、`http://localhost:8000/` を開いて確認してください。Firebase Auth と ES モジュールの制約により、`index.html` を直接(`file://`)開いても動きません。

## 実装メモ

- `buildChartRows()` が実測値、7日移動平均、目標値、差分判定用の補間目標値をまとめます。
- `drawChart(state)` が描画の入口で、サマリーカード用の配列(`buildSummaryItems()` の結果)を返します。state は Vue 側の表示条件(期間・系列の表示切替)です。
- 測定値・目標値は `window.WEIGHT_RECORDS` / `window.TARGET_RECORDS` に入れてから `drawChart()` を呼びます(graph-page.js が Firestore 読み込み後に設定)。
- 目標体重の点表示は入力日付の値を使い、差分判定では `interpolateTarget()` による補間値を使います。
- Firestore のデータ構造は `users/{uid}/weights/{YYYY-MM-DD}` と `users/{uid}/targets/{YYYY-MM-DD}`(いずれも `{ weight: number }`)。
