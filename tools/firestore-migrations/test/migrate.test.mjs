import assert from "node:assert/strict";
import test from "node:test";
import { loadMigrations, parseArguments } from "../migrate.mjs";

test("引数なしで通常実行モードになる", () => {
  assert.deepEqual(parseArguments([]), {
    dryRun: false,
    help: false,
    status: false,
  });
});

test("マイグレーションファイルを自動検出する", async () => {
  const migrations = await loadMigrations();
  assert.deepEqual(migrations.map((migration) => migration.id), [
    "20260717T145752Z_rename_audit_and_admin_fields",
  ]);
});

test("未対応の引数を拒否する", () => {
  assert.throws(() => parseArguments(["migration-file.mjs"]), /未対応の引数/);
});
