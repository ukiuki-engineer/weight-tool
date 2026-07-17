# Firestore migrations

Firestoreのデータ移行を日時順に実行し、`_migrations/{migrationId}`へ実行履歴を保存します。
フロントエンドとは依存関係を分離しており、公式Firestoreサーバークライアントはこのディレクトリ内だけで使用します。

## 初期設定

Node.js 22以上とGoogle Cloud CLIを使用します。

```sh
cd tools/firestore-migrations
npm install
cp .env.example .env.local
gcloud auth application-default login
```

`.env.local`に保存するのは接続先のプロジェクトIDだけです。認証情報はApplication Default Credentialsから取得します。

```dotenv
GOOGLE_CLOUD_PROJECT=weight-tool-16c8e
```

サービスアカウントキーを使用せざるを得ない場合はJSONをリポジトリ外に置き、`.env.local`には絶対パスだけを指定します。

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## 実行

```sh
npm run migrate:status
npm run migrate:dry-run
npm run migrate
```

`npm run migrate`は`migrations/`を自動で走査するため、ファイル名の指定は不要です。ファイルはUTCで次の形式にします。

```text
YYYYMMDDTHHmmssZ_description.mjs
```

完了済みマイグレーションは再実行しません。失敗または30分以上残っている実行中履歴は再試行できます。マイグレーション本体も、途中まで反映された状態から安全に再実行できるよう冪等に実装します。

適用済みファイルの内容を変更するとチェックサムエラーになります。修正が必要な場合は新しいマイグレーションファイルを追加します。
