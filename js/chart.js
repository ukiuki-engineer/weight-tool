// グラフの計算・描画ロジック。
// Vue には依存せず、測定値・目標値を引数で受け取る純粋な関数群。
// 外部から使うのは buildChartRows / buildSummary / drawChart / setChartRange の4つ。
//
// グラフ操作は chartjs-plugin-zoom(CDN読み込み)を使用:
//   - ドラッグ/スワイプで表示期間を移動
//   - ピンチ / Ctrl+ホイールでズーム
//   - 凡例クリックで系列の表示切替
// Y軸は表示中の範囲のデータに合わせて自動フィットする。

const CONFIG = {
  movingAverageDays: 7,
  minMovingAverageCount: 1,
  breakLineAfterDaysWithoutMeasurement: 7,
};

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function diffDays(a, b) {
  const ms =
    parseDate(formatDate(a)).getTime() - parseDate(formatDate(b)).getTime();
  return Math.round(ms / 86400000);
}

function sortRecords(records) {
  return [...records].sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function getDateRange(weightRecords, targetRecords) {
  const dates = [...weightRecords, ...targetRecords].map((row) =>
    parseDate(row.date),
  );
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const today = parseDate(formatDate(new Date()));
  return { min, max: max > today ? max : today };
}

function buildDailyDates(start, end) {
  const dates = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    dates.push(formatDate(d));
  }
  return dates;
}

function makeWeightMap(records) {
  const map = new Map();
  for (const row of records) {
    if (row.date && typeof row.weight === "number") {
      map.set(row.date, row.weight);
    }
  }
  return map;
}

function interpolateTarget(dateString, targets) {
  if (targets.length === 0) return null;

  const current = parseDate(dateString);

  if (current <= parseDate(targets[0].date)) {
    return targets[0].weight;
  }

  for (let i = 0; i < targets.length - 1; i++) {
    const prev = targets[i];
    const next = targets[i + 1];
    const prevDate = parseDate(prev.date);
    const nextDate = parseDate(next.date);

    if (current >= prevDate && current <= nextDate) {
      const totalDays = diffDays(nextDate, prevDate);
      const elapsedDays = diffDays(current, prevDate);
      const ratio = totalDays === 0 ? 0 : elapsedDays / totalDays;
      return prev.weight + (next.weight - prev.weight) * ratio;
    }
  }

  return targets[targets.length - 1].weight;
}

function calculateMovingAverage(dateString, weightMap) {
  const current = parseDate(dateString);
  const today = parseDate(formatDate(new Date()));
  if (current > today) return null;

  const values = [];
  let lastMeasuredDate = null;

  for (let i = CONFIG.movingAverageDays - 1; i >= 0; i--) {
    const d = addDays(current, -i);
    const key = formatDate(d);
    if (weightMap.has(key)) {
      values.push(weightMap.get(key));
      lastMeasuredDate = d;
    }
  }

  if (values.length < CONFIG.minMovingAverageCount) return null;

  const daysSinceLastMeasurement = diffDays(current, lastMeasuredDate);
  if (daysSinceLastMeasurement >= CONFIG.breakLineAfterDaysWithoutMeasurement) {
    return null;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
}

export function buildChartRows(weights, targets) {
  const weightRecords = sortRecords(weights || []);
  const targetRecords = sortRecords(targets || []);
  const weightMap = makeWeightMap(weightRecords);
  const targetMap = makeWeightMap(targetRecords);
  const range = getDateRange(weightRecords, targetRecords);
  const dates = buildDailyDates(range.min, range.max);

  return dates.map((date) => ({
    date,
    weight: weightMap.get(date) ?? null,
    movingAverage: calculateMovingAverage(date, weightMap),
    target: targetMap.get(date) ?? null,
    targetForDiff: interpolateTarget(date, targetRecords),
  }));
}

// ---- サマリー ----

function getLatestNonNull(rows, key) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][key] !== null && rows[i][key] !== undefined) {
      return rows[i];
    }
  }
  return null;
}

function isWeekend(dateString) {
  const day = parseDate(dateString).getDay();
  return day === 0 || day === 6;
}

function getNearestFutureWeekendTarget(rows) {
  const today = parseDate(formatDate(new Date()));
  for (const row of rows) {
    const date = parseDate(row.date);
    if (date < today) continue;
    if (!isWeekend(row.date)) continue;
    if (typeof row.targetForDiff !== "number") continue;
    return {
      value: row.targetForDiff,
      date: row.date,
    };
  }
  return null;
}

function getCurrentMonthTarget(targets) {
  const targetRecords = sortRecords(targets || []);
  if (targetRecords.length === 0) return null;

  const today = parseDate(formatDate(new Date()));
  const monthEndDateString = formatDate(getMonthEnd(today));
  const value = interpolateTarget(monthEndDateString, targetRecords);
  if (typeof value !== "number" || Number.isNaN(value)) return null;

  return {
    value: Number(value.toFixed(2)),
    date: monthEndDateString,
  };
}

function getStatusText(diff) {
  if (diff === null) return "-";
  if (diff <= 0) return "順調";
  if (diff <= 1) return "ほぼ順調";
  if (diff <= 2) return "様子見";
  return "見直し候補";
}

function buildSummaryItems(summaryRows, allRows, targets) {
  const latestWeight = getLatestNonNull(summaryRows, "weight");
  const latestAverage = getLatestNonNull(summaryRows, "movingAverage");
  const latestTargetRow = getLatestNonNull(allRows, "target");
  const nearestFutureWeekendTarget = getNearestFutureWeekendTarget(allRows);
  const currentMonthTarget = getCurrentMonthTarget(targets);
  const targetAtAverageDate = latestAverage
    ? summaryRows.find((row) => row.date === latestAverage.date)?.targetForDiff
    : null;
  const latestTarget = nearestFutureWeekendTarget
    ? nearestFutureWeekendTarget
    : latestTargetRow
      ? { value: latestTargetRow.target, date: latestTargetRow.date }
      : null;

  const diff =
    latestAverage && typeof targetAtAverageDate === "number"
      ? Number((latestAverage.movingAverage - targetAtAverageDate).toFixed(2))
      : null;
  const targetComparisonText =
    diff === null || typeof targetAtAverageDate !== "number"
      ? ""
      : `目標(${targetAtAverageDate.toFixed(2)}kg)${diff > 0 ? "より上" : "以下"}`;

  return [
    {
      label: "最新測定値",
      value: latestWeight ? `${latestWeight.weight.toFixed(1)} kg` : "-",
      sub: latestWeight?.date ?? "",
    },
    {
      label: "7日移動平均",
      value: latestAverage ? `${latestAverage.movingAverage.toFixed(2)} kg` : "-",
      sub: latestAverage?.date ?? "",
    },
    {
      label: "目標差(現在日換算)",
      value: diff === null ? "-" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)} kg`,
      sub: targetComparisonText,
    },
    {
      label: "直近の目標値",
      value: latestTarget ? `${latestTarget.value.toFixed(2)} kg` : "-",
      sub: latestTarget?.date ?? "",
    },
    {
      label: "今月の目標",
      value: currentMonthTarget
        ? `${currentMonthTarget.value.toFixed(2)} kg`
        : "-",
      sub: currentMonthTarget?.date ?? "",
    },
    {
      label: "判定目安",
      value: getStatusText(diff),
      sub: "週単位で見る",
    },
  ];
}

// サマリーカードの配列を返す(全期間のデータから現在の状況を計算する)
export function buildSummary(weights, targets) {
  const rows = buildChartRows(weights, targets);
  const today = parseDate(formatDate(new Date()));
  const summaryRows = rows.filter((row) => parseDate(row.date) <= today);
  return buildSummaryItems(summaryRows, rows, targets);
}

// ---- グラフ描画 ----

let chart = null;

const RANGE_MONTHS = { "1m": 1, "3m": 3, "6m": 6 };

function isNarrowScreen() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function formatTickLabel(label) {
  const [, month, day] = label.split("-");
  return `${Number(month)}/${Number(day)}`;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatTooltipTitle(label) {
  const date = parseDate(label);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

// プリセットから表示ウィンドウ(ラベル値)を計算する。
// "month": 先月末日〜今月末日(初期表示)
// "1m"/"3m"/"6m": 今日からN月遡る / "all": 全期間
function calcWindow(labels, rangeKey) {
  const first = labels[0];
  const last = labels[labels.length - 1];

  const clamp = (label) => {
    if (label < first) return first;
    if (label > last) return last;
    return label;
  };

  if (rangeKey === "month") {
    const today = new Date();
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      min: clamp(formatDate(prevMonthEnd)),
      max: clamp(formatDate(monthEnd)),
    };
  }

  const months = RANGE_MONTHS[rangeKey];
  if (!months) return { min: first, max: last };

  let endLabel = formatDate(new Date());
  if (endLabel > last) endLabel = last;
  if (endLabel < first) endLabel = first;

  const start = parseDate(endLabel);
  start.setMonth(start.getMonth() - months);
  let startLabel = formatDate(start);
  if (startLabel < first) startLabel = first;

  return { min: startLabel, max: endLabel };
}

// 表示中のX範囲にあわせてY軸を自動フィットし、
// 表示密度に応じて実測値の点の大きさも調整する
function refitY(targetChart) {
  const c = targetChart || chart;
  if (!c) return;
  const labels = c.data.labels;
  const xScale = c.scales.x;
  const minIndex = Math.max(0, Math.floor(xScale.min ?? 0));
  const maxIndex = Math.min(
    labels.length - 1,
    Math.ceil(xScale.max ?? labels.length - 1),
  );

  const values = [];
  c.data.datasets.forEach((dataset, i) => {
    if (!c.isDatasetVisible(i)) return;
    for (let j = minIndex; j <= maxIndex; j++) {
      const value = dataset.data[j];
      if (typeof value === "number") values.push(value);
    }
  });

  if (values.length > 0) {
    c.options.scales.y.min = Math.floor(Math.min(...values) - 5);
    c.options.scales.y.max = Math.ceil(Math.max(...values) + 5);
  }

  const windowDays = maxIndex - minIndex;
  c.data.datasets[0].pointRadius = windowDays > 60 ? 0 : 3;

  c.update("none");
}

// ホバー/タッチ位置に縦のカーソル線を描く
const crosshairPlugin = {
  id: "crosshair",
  afterDatasetsDraw(c) {
    const active = c.tooltip?.getActiveElements?.() ?? [];
    if (active.length === 0) return;
    const x = active[0].element.x;
    const { top, bottom } = c.chartArea;
    const ctx = c.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },
};

function movingAverageGradient(context) {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return "rgba(20, 184, 166, 0.1)";
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgba(20, 184, 166, 0.18)");
  gradient.addColorStop(1, "rgba(20, 184, 166, 0)");
  return gradient;
}

// visibility: { raw, movingAverage, target } 各系列の表示状態(UI側のトグルと同期)
export function drawChart(
  weights,
  targets,
  rangeKey = "month",
  visibility = { raw: false, movingAverage: true, target: true },
) {
  const rows = buildChartRows(weights, targets);
  const labels = rows.map((row) => row.date);
  const canvas = document.getElementById("weightChart");

  // 目標線は日次の補間値で連続に描く(点が1つしか画面内になくても線が出るように)。
  // 補間は直線なので、点同士を結ぶ従来の見た目と同じ。線は目標の入力期間内のみ。
  const sortedTargets = sortRecords(targets || []);
  const firstTargetDate = sortedTargets[0]?.date ?? null;
  const lastTargetDate = sortedTargets[sortedTargets.length - 1]?.date ?? null;
  const targetLineData = rows.map((row) =>
    firstTargetDate && row.date >= firstTargetDate && row.date <= lastTargetDate
      ? row.targetForDiff
      : null,
  );
  // マーカーは実際に目標を入力した日付にだけ出す
  const targetPointRadius = (context) =>
    rows[context.dataIndex]?.target != null ? 4 : 0;

  // UMD版は自動登録されるが、念のため明示的にも登録しておく
  if (window.ChartZoom) Chart.register(window.ChartZoom);

  if (chart) chart.destroy();

  const initialWindow = calcWindow(labels, rangeKey);

  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "実測値",
          data: rows.map((row) => row.weight),
          hidden: !visibility.raw,
          spanGaps: true,
          tension: 0,
          borderColor: "#60a5fa",
          backgroundColor: "#60a5fa",
          pointBackgroundColor: "#60a5fa",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 1.5,
        },
        {
          label: "7日移動平均",
          data: rows.map((row) => row.movingAverage),
          hidden: !visibility.movingAverage,
          spanGaps: true,
          tension: 0,
          borderColor: "#14b8a6",
          backgroundColor: movingAverageGradient,
          fill: "start",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: "#14b8a6",
        },
        {
          label: "目標",
          data: targetLineData,
          hidden: !visibility.target,
          spanGaps: true,
          tension: 0,
          borderColor: "#f97316",
          backgroundColor: "#f97316",
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: targetPointRadius,
          pointHoverRadius: (context) =>
            rows[context.dataIndex]?.target != null ? 6 : 0,
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        x: {
          min: initialWindow.min,
          max: initialWindow.max,
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: isNarrowScreen() ? 6 : 12,
            font: { size: 11 },
            color: "#8a94a3",
            callback(value) {
              return formatTickLabel(this.getLabelForValue(value));
            },
          },
          grid: { display: false },
          border: { color: "#dde3ea" },
        },
        y: {
          ticks: {
            font: { size: 11 },
            color: "#8a94a3",
            callback: (value) => `${value}`,
          },
          grid: { color: "rgba(148, 163, 184, 0.18)" },
          border: { display: false },
        },
      },
      plugins: {
        // 系列の表示切替はUI側のトグルボタン(Graph.vue)で行う
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.88)",
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          filter: (item) => item.parsed.y !== null,
          callbacks: {
            title: (items) => formatTooltipTitle(items[0].label),
            label: (item) =>
              ` ${item.dataset.label}: ${Number(item.parsed.y).toFixed(2)} kg`,
          },
        },
        zoom: {
          pan: {
            enabled: true,
            mode: "x",
            onPan: ({ chart: c }) => refitY(c),
          },
          zoom: {
            wheel: { enabled: true, modifierKey: "ctrl" },
            pinch: { enabled: true },
            mode: "x",
            onZoom: ({ chart: c }) => refitY(c),
          },
          limits: {
            x: { min: "original", max: "original", minRange: 7 },
          },
        },
      },
    },
    plugins: [crosshairPlugin],
  });

  refitY(chart);
}

// 期間プリセット("1m" | "3m" | "6m" | "all")を適用する
export function setChartRange(rangeKey) {
  if (!chart) return;
  const labels = chart.data.labels;
  const nextWindow = calcWindow(labels, rangeKey);
  chart.options.scales.x.min = nextWindow.min;
  chart.options.scales.x.max = nextWindow.max;
  refitY(chart);
}

// 系列の表示/非表示を切り替える(datasetIndex: 0=実測値, 1=移動平均, 2=目標)
export function setSeriesVisibility(datasetIndex, visible) {
  if (!chart) return;
  chart.setDatasetVisibility(datasetIndex, visible);
  refitY(chart);
}
