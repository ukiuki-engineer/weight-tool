// 体重・目標記録で共通利用する変換・表示処理。
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function currentEnteredAt() {
  return new Date().toISOString();
}

export function withEnteredAt(records, enteredAt = currentEnteredAt()) {
  return records.map((row) => ({
    ...row,
    enteredAt: row.enteredAt || enteredAt,
  }));
}

export function splitWeight(weight, fallback = 60) {
  const value = Number.isFinite(Number(weight)) ? Number(weight) : fallback;
  return {
    int: Math.floor(value),
    dec: Math.round(value * 10) % 10,
  };
}

export function combineWeight(weightInt, weightDec) {
  return weightInt + weightDec / 10;
}

export function formatEnteredAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
