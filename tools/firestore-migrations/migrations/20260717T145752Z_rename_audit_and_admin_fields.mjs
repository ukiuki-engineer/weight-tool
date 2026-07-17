export const id = "20260717T145752Z_rename_audit_and_admin_fields";
export const description = "enteredAtをcreatedAt/updatedAtへ移行し、adminをisAdminへ変更";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isFirestoreTimestamp(value) {
  return value && typeof value.toDate === "function" && typeof value.toMillis === "function";
}

export function buildUserUpdate(data, deleteField) {
  const update = {};
  if (typeof data.isAdmin !== "boolean") {
    update.isAdmin = data.admin === true;
  }
  if (hasOwn(data, "admin")) {
    update.admin = deleteField;
  }
  return Object.keys(update).length > 0 ? update : null;
}

export function buildRecordUpdate(snapshot, deleteField) {
  const data = snapshot.data();
  const update = {};
  if (!isFirestoreTimestamp(data.createdAt)) {
    update.createdAt = snapshot.createTime;
  }
  if (!isFirestoreTimestamp(data.updatedAt)) {
    update.updatedAt = snapshot.updateTime;
  }
  if (hasOwn(data, "enteredAt")) {
    update.enteredAt = deleteField;
  }
  return Object.keys(update).length > 0 ? update : null;
}

export async function up({ db, dryRun, FieldValue, log }) {
  const userRefs = await db.collection("users").listDocuments();
  const userSnapshots = userRefs.length > 0 ? await db.getAll(...userRefs) : [];
  const recordSnapshots = await Promise.all(
    userRefs.flatMap((userRef) => ["weights", "targets"].map(async (collectionId) => ({
      collectionId,
      snapshot: await userRef.collection(collectionId).get(),
    }))),
  );
  const deleteField = FieldValue.delete();
  const updates = [];

  userSnapshots.filter((snapshot) => snapshot.exists).forEach((snapshot) => {
    const data = buildUserUpdate(snapshot.data(), deleteField);
    if (data) updates.push({ data, ref: snapshot.ref, type: "users" });
  });

  recordSnapshots.forEach(({ collectionId, snapshot: collectionSnapshot }) => {
    collectionSnapshot.docs.forEach((snapshot) => {
      const data = buildRecordUpdate(snapshot, deleteField);
      if (data) updates.push({ data, ref: snapshot.ref, type: collectionId });
    });
  });

  const result = {
    targets: updates.filter((update) => update.type === "targets").length,
    users: updates.filter((update) => update.type === "users").length,
    weights: updates.filter((update) => update.type === "weights").length,
  };
  log(`users: ${result.users}件`);
  log(`weights: ${result.weights}件`);
  log(`targets: ${result.targets}件`);

  if (dryRun || updates.length === 0) return result;

  const writer = db.bulkWriter();
  updates.forEach(({ data, ref }) => writer.update(ref, data));
  await writer.close();
  return result;
}
