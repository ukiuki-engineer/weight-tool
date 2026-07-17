# AGENTS.md

このファイルは、このリポジトリで AI コーディングエージェント(Codex、Claude Code など)が作業するときのプロジェクト指示です。
Claude Code は `CLAUDE.md`(このファイルをインポートする1行のみ)経由で読み込みます。

## プロジェクト概要

- 体重管理グラフです。データは Firebase Firestore で管理し、Google ログインした本人のみ読み書きできます。
- ビルド工程はありません。`python3 -m http.server 8000` で起動し `http://localhost:8000/` を開くと動きます(`file://` 直接は不可)。
- UI は Vue 3(CDN のグローバルビルド) + vue3-sfc-loader(CDN)で `.vue` をブラウザ内コンパイルします。グラフ描画は Chart.js + chartjs-plugin-zoom + hammer.js(いずれも CDN)、Firebase SDK は gstatic の ES モジュール CDN を使っています。
- 画面構成: HTML は `index.html` 1枚で、「グラフ」「サマリー」「入力」「目標」の4画面をタブで切り替えます(vue-router は使わない。ビュー切替は `view` 変数と v-show)。ヘッダーとタブは sticky でスクロール追従します。
- 権限は2層: Firestore ルール(サーバー側の強制)+ UI の出し分け。管理者は `users/{uid}` の `admin: true` で判定し、`users` コレクションから切り替え対象を取得します。一般ユーザーは自分の測定値のみ読み書き可、自分の目標は閲覧のみです。
- ディレクトリ構成:
  - `index.html` … ルート画面(ヘッダー、タブ、ビュー呼び出し)と CDN 読み込み
  - `css/style.css` … 全スタイル
  - `js/app.js` … Vue アプリの起点(認証、records 保持、画面切替)
  - `js/sfc-loader.js` … vue3-sfc-loader の設定と SFC 用依存モジュールの受け渡し
  - `js/pages/Graph.vue` / `Summary.vue` / `Entry.vue` / `Target.vue` … ページコンポーネント
  - `js/components/RecordManager.vue` … 入力・目標画面の共通コンポーネント
  - `js/components/DatePicker.vue` / `AppNotice.vue` … 共通日付入力・全画面通知コンポーネント
  - `js/services/firebase-store.js` / `notification.js` … Firebase処理と共通通知サービス
  - `js/config/firebase-config.js` … Firebase の接続設定
  - `js/utils/record-utils.js` / `json-import.js` / `export-records.js` … 記録の変換・表示・入出力
  - `js/chart.js` … グラフ計算・描画(Vue 非依存。records と表示条件を引数で受け取る)
  - `firestore.rules` / `firebase.json` … Firestore Security Rules とデプロイ設定
  - `manifest.webmanifest` / `icons/` … ホーム画面追加用のPWAマニフェストとアイコン(PNGは生成済みの成果物)
- `firebase-config.js` はシークレットではないためコミット対象です(データ保護は Firestore のセキュリティルール側)。
- UID や管理者一覧をソースコードへ直接記述しないでください。ユーザー名と管理者権限は Firestore の `users/{uid}` で管理します。
- アプリデータを localStorage や IndexedDB に保存しないでください。マイページ設定は Firestore、Firebase Auth のログイン状態は sessionStorage を使用します。
- `users/{uid}` の親ドキュメントは初回ログイン時に自動作成し、サブコレクションだけのユーザーを残さないでください。
- `SETUP.local.md` は個人用のセットアップメモで `.gitignore` 対象です。UID などリポジトリに載せない情報はここに書きます。

## 作業方針

- Vue 3(CDN) + vue3-sfc-loader + Vue SFC の構成を維持してください。
- UI コンポーネントは `.vue` に `<template>` と `<script>` を記述し、テンプレート文字列を通常の `.js` に戻さないでください。
- npm パッケージやビルドツールは追加しないでください(ライブラリは CDN 読み込みのみ)。
- 体重・目標値のデータ形式は `README.md` の「データ構造(Firestore)」に合わせてください。
- 日付文字列は `YYYY-MM-DD` を使い、既存のローカル日付処理に合わせてください。
- 表示文言は日本語で、現在の UI の短い表現に揃えてください。
- 変更は依頼範囲に限定し、不要なリファクタリングや見た目の大幅変更は避けてください。

## 確認方法

- JavaScript の構文確認:

```sh
node --check js/app.js
node --check js/sfc-loader.js
node --check js/chart.js
node --check js/services/firebase-store.js
```

- ブラウザ確認:

```sh
python3 -m http.server 8000
```

その後、`http://localhost:8000/` を開いて確認してください。Firebase Auth と ES モジュールの制約により、`index.html` を直接(`file://`)開いても動きません。

## 実装メモ

- データの流れ: `js/app.js` が起動時に Firestore から読み込んで reactive な `records` として保持し、各ページへ props で渡します。入力画面の保存は `saved` イベントで app.js に通知され、records 更新 → `js/pages/Graph.vue` の watch で即再描画されます。
- `buildChartRows(weights, targets)` が実測値、7日移動平均、目標値、差分判定用の補間目標値をまとめます。
- `drawChart(weights, targets, rangeKey, visibility)` がグラフ描画の入口、`setChartRange(rangeKey)` が期間プリセット("month"=先月末〜今月末が初期値|"3m"|"6m"|"all")の適用です。
- グラフ操作は chartjs-plugin-zoom(スワイプで期間移動、ピンチ/Ctrl+ホイールでズーム)。系列の表示切替は `js/pages/Graph.vue` のトグルチップ(`setSeriesVisibility()`。Chart.js 標準凡例は非表示)。Y軸は表示範囲のデータに自動フィット(refitY)。
- `buildSummary(weights, targets)` がサマリーカード用の配列を返します(全期間データから現在の状況を計算)。
- 体重の入力は選択式(整数部30〜200 + 小数部0〜9)。初期値は直近の記録から補完します。
- 目標線は日次補間値(`targetForDiff`)で連続描画し、マーカーは目標を入力した日付にのみ表示します。差分判定も同じ補間値を使います。
- Firestore のデータ構造は `users/{uid}/weights/{YYYY-MM-DD}` と `users/{uid}/targets/{YYYY-MM-DD}`(いずれも `{ weight: number }`)。
