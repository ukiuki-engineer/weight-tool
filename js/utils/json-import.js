// JSON一括登録の入力テキストを検証して記録配列に変換する。
// 期待形式: [{ "date": "YYYY-MM-DD", "weight": 数値 }, ...]
// data.js のような JS オブジェクト形式(キー引用符なし・末尾カンマ・
// シングルクォート・配列前後の余計なテキスト)も受け付ける。
// 戻り値: { records } または { error }

// 最初の [ から最後の ] までを取り出す(「const X = [...];」のコピペ対策)
function extractArrayText(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

// JS形式のゆるい書き方を正式なJSONに変換する
function normalizeLooseJson(text) {
  return text
    .replace(/'([^']*)'/g, '"$1"') // シングルクォート → ダブルクォート
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":') // 裸のキーを引用
    .replace(/,(\s*[}\]])/g, "$1"); // 末尾カンマを除去
}

export function parseRecordsJson(text) {
  const arrayText = extractArrayText(text);
  let data;
  try {
    data = JSON.parse(arrayText);
  } catch {
    try {
      data = JSON.parse(normalizeLooseJson(arrayText));
    } catch {
      return { error: "JSONとして解釈できません。形式を確認してください。" };
    }
  }

  if (!Array.isArray(data)) {
    return { error: '配列 [ { "date": ..., "weight": ... }, ... ] の形にしてください。' };
  }
  if (data.length === 0) {
    return { error: "データが0件です。" };
  }

  const records = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const date = row?.date;
    const weight = Number(row?.weight);
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(weight)
    ) {
      return {
        error: `${i + 1}件目が不正です(date は "YYYY-MM-DD"、weight は数値)。`,
      };
    }
    records.push({ date, weight });
  }

  return { records };
}
