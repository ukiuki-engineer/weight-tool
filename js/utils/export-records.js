// 体重・目標データのCSV/JSON生成とブラウザ保存を担当する。

function exportRows(rows) {
  return [...rows]
    .filter((row) => row?.date && Number.isFinite(Number(row.weight)))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((row) => ({
      date: row.date,
      weight: Number(row.weight),
      ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    }));
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function recordsToCsv(rows) {
  const lines = ["日付,体重,作成日時,更新日時"];
  exportRows(rows).forEach((row) => {
    lines.push([
      escapeCsv(row.date),
      escapeCsv(row.weight),
      escapeCsv(row.createdAt || ""),
      escapeCsv(row.updatedAt || ""),
    ].join(","));
  });
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function recordsToJson(rows) {
  return `${JSON.stringify(exportRows(rows), null, 2)}\n`;
}

function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}${month}${day}`;
}

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadRecords(rows, kind, format) {
  const baseName = kind === "target" ? "targets" : "weights";
  const filename = `${baseName}-${todayString()}.${format}`;
  if (format === "csv") {
    download(recordsToCsv(rows), filename, "text/csv;charset=utf-8");
    return;
  }
  if (format === "json") {
    download(recordsToJson(rows), filename, "application/json;charset=utf-8");
    return;
  }
  throw new Error(`未対応の出力形式です: ${format}`);
}
