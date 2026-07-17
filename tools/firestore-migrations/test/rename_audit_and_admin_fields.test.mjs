import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecordUpdate,
  buildUserUpdate,
} from "../migrations/20260717T145752Z_rename_audit_and_admin_fields.mjs";

const deleted = Symbol("deleted");
const createTime = { toDate() {}, toMillis() { return 1; } };
const updateTime = { toDate() {}, toMillis() { return 2; } };

function recordSnapshot(data) {
  return { createTime, data: () => data, updateTime };
}

test("adminをisAdminへ移行する", () => {
  assert.deepEqual(buildUserUpdate({ admin: true }, deleted), {
    admin: deleted,
    isAdmin: true,
  });
});

test("既存のisAdminを優先してadminだけ削除する", () => {
  assert.deepEqual(buildUserUpdate({ admin: true, isAdmin: false }, deleted), {
    admin: deleted,
  });
});

test("権限フィールドがないユーザーにはisAdmin falseを設定する", () => {
  assert.deepEqual(buildUserUpdate({}, deleted), { isAdmin: false });
});

test("FirestoreメタデータからcreatedAtとupdatedAtを設定する", () => {
  assert.deepEqual(buildRecordUpdate(recordSnapshot({ enteredAt: "legacy" }), deleted), {
    createdAt: createTime,
    enteredAt: deleted,
    updatedAt: updateTime,
  });
});

test("移行済みレコードは更新しない", () => {
  assert.equal(buildRecordUpdate(recordSnapshot({ createdAt: createTime, updatedAt: updateTime }), deleted), null);
});
