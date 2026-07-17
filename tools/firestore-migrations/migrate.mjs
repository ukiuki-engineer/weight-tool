#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import {
  FieldValue,
  Firestore,
  Timestamp,
} from "@google-cloud/firestore";

const HISTORY_COLLECTION = "_migrations";
const MIGRATION_PATTERN = /^\d{8}T\d{6}Z_[a-z0-9_]+\.mjs$/;
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;
const migrationsDirectory = new URL("./migrations/", import.meta.url);

function usage() {
  return [
    "Usage: npm run migrate [-- --dry-run|--status]",
    "",
    "  --dry-run  対象件数だけ確認し、データと履歴を更新しない",
    "  --status   マイグレーションの適用状況を表示する",
    "  --help     このヘルプを表示する",
  ].join("\n");
}

export function parseArguments(args) {
  const supported = new Set(["--dry-run", "--status", "--help"]);
  const unknown = args.filter((arg) => !supported.has(arg));
  if (unknown.length > 0) {
    throw new Error(`未対応の引数です: ${unknown.join(", ")}`);
  }
  if (args.includes("--dry-run") && args.includes("--status")) {
    throw new Error("--dry-run と --status は同時に指定できません。");
  }
  return {
    dryRun: args.includes("--dry-run"),
    help: args.includes("--help"),
    status: args.includes("--status"),
  };
}

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function loadMigrations(directory = migrationsDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of files) {
    if (!MIGRATION_PATTERN.test(fileName)) {
      throw new Error(
        `マイグレーション名が不正です: ${fileName}\n` +
        "YYYYMMDDTHHmmssZ_description.mjs の形式にしてください。",
      );
    }
  }

  return Promise.all(files.map(async (fileName) => {
    const fileUrl = new URL(fileName, directory);
    const content = await readFile(fileUrl, "utf8");
    const fileChecksum = checksum(content);
    const id = basename(fileName, ".mjs");
    const module = await import(`${fileUrl.href}?checksum=${fileChecksum}`);
    if (module.id !== id) {
      throw new Error(`${fileName} の id はファイル名と一致させてください。`);
    }
    if (typeof module.up !== "function") {
      throw new Error(`${fileName} に up() がありません。`);
    }
    return {
      checksum: fileChecksum,
      description: module.description || id,
      fileName,
      id,
      up: module.up,
    };
  }));
}

async function loadHistory(db) {
  const snapshot = await db.collection(HISTORY_COLLECTION).get();
  return new Map(snapshot.docs.map((document) => [document.id, document.data()]));
}

function assertAppliedChecksum(migration, history) {
  if (history?.status !== "completed") return;
  if (history.checksum !== migration.checksum) {
    throw new Error(
      `適用済みマイグレーションが変更されています: ${migration.fileName}`,
    );
  }
}

async function showStatus(db, migrations) {
  const history = await loadHistory(db);
  migrations.forEach((migration) => {
    const applied = history.get(migration.id);
    assertAppliedChecksum(migration, applied);
    console.log(`${applied?.status || "pending"}\t${migration.fileName}`);
  });

  const knownIds = new Set(migrations.map((migration) => migration.id));
  [...history.entries()]
    .filter(([id]) => !knownIds.has(id))
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([id, applied]) => {
      console.log(`${applied.status || "unknown"}\t${id} (ファイルなし)`);
    });
}

function isFreshLock(history) {
  if (history?.status !== "running") return false;
  const startedAt = history.startedAt?.toMillis?.();
  return Number.isFinite(startedAt) && Date.now() - startedAt < LOCK_TIMEOUT_MS;
}

async function claimMigration(db, migration) {
  const historyRef = db.collection(HISTORY_COLLECTION).doc(migration.id);
  let claimed = true;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(historyRef);
    const history = snapshot.exists ? snapshot.data() : null;
    assertAppliedChecksum(migration, history);
    if (history?.status === "completed") {
      claimed = false;
      return;
    }
    if (isFreshLock(history)) {
      throw new Error(`${migration.fileName} は別のプロセスが実行中です。`);
    }

    transaction.set(historyRef, {
      attempt: FieldValue.increment(1),
      checksum: migration.checksum,
      completedAt: FieldValue.delete(),
      description: migration.description,
      error: FieldValue.delete(),
      failedAt: FieldValue.delete(),
      fileName: migration.fileName,
      startedAt: FieldValue.serverTimestamp(),
      status: "running",
    }, { merge: true });
  });

  return claimed;
}

async function completeMigration(historyRef, migration, startedAt, result) {
  await historyRef.set({
    checksum: migration.checksum,
    completedAt: FieldValue.serverTimestamp(),
    executionMs: Date.now() - startedAt,
    result: result ?? {},
    status: "completed",
  }, { merge: true });
}

async function failMigration(historyRef, error) {
  await historyRef.set({
    error: String(error?.message || error).slice(0, 1000),
    failedAt: FieldValue.serverTimestamp(),
    status: "failed",
  }, { merge: true });
}

async function runMigrations(db, migrations, { dryRun }) {
  for (const migration of migrations) {
    const historyRef = db.collection(HISTORY_COLLECTION).doc(migration.id);
    if (!dryRun && !(await claimMigration(db, migration))) {
      console.log(`skip\t${migration.fileName}`);
      continue;
    }

    console.log(`${dryRun ? "dry-run" : "run"}\t${migration.fileName}`);
    const startedAt = Date.now();
    try {
      const result = await migration.up({
        db,
        dryRun,
        FieldValue,
        log: (message) => console.log(`  ${message}`),
        Timestamp,
      });
      if (!dryRun) {
        await completeMigration(historyRef, migration, startedAt, result);
      }
      console.log(`${dryRun ? "checked" : "done"}\t${migration.fileName}`);
    } catch (error) {
      if (!dryRun) {
        try {
          await failMigration(historyRef, error);
        } catch (historyError) {
          console.error("失敗履歴の保存にも失敗しました。", historyError);
        }
      }
      throw error;
    }
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log(usage());
    return;
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!projectId) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT が未設定です。.env.local または環境変数で指定してください。",
    );
  }

  const migrations = await loadMigrations();
  const db = new Firestore({ projectId });

  console.log(`project\t${projectId}`);
  try {
    if (options.status) {
      await showStatus(db, migrations);
      return;
    }
    await runMigrations(db, migrations, options);
  } finally {
    await db.terminate();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
