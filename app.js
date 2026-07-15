const CONFIG = {
  movingAverageDays: 7,
  minMovingAverageCount: 1,
  breakLineAfterDaysWithoutMeasurement: 7,
  yAxisMinPaddingKg: 10,
  yAxisMinStepKg: 10,
  yAxisMaxPaddingKg: 10,
  yAxisMaxStepKg: 10,
};

let chart = null;

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

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getPreviousMonthEnd(date) {
  return addDays(getMonthStart(date), -1);
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

function makeTargetMap(records) {
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

function buildChartRows() {
  const weightRecords = sortRecords(WEIGHT_RECORDS || []);
  const targetRecords = sortRecords(TARGET_RECORDS || []);
  const weightMap = makeWeightMap(weightRecords);
  const targetMap = makeTargetMap(targetRecords);
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

function getDateBounds(rows) {
  if (rows.length === 0) {
    return null;
  }
  return {
    min: parseDate(rows[0].date),
    max: parseDate(rows[rows.length - 1].date),
  };
}

// 表示期間の初期値と選択可能範囲を返す(Vue側で日付入力にバインドする)
function getDefaultDateRange(rows) {
  const bounds = getDateBounds(rows);
  if (!bounds) return null;

  const today = parseDate(formatDate(new Date()));
  let defaultStart = getPreviousMonthEnd(today);
  let defaultEnd = getMonthEnd(today);

  if (defaultStart < bounds.min) defaultStart = bounds.min;
  if (defaultStart > bounds.max) defaultStart = bounds.max;
  if (defaultEnd < bounds.min) defaultEnd = bounds.min;
  if (defaultEnd > bounds.max) defaultEnd = bounds.max;

  if (defaultStart > defaultEnd) {
    defaultStart = defaultEnd;
  }

  return {
    min: formatDate(bounds.min),
    max: formatDate(bounds.max),
    start: formatDate(defaultStart),
    end: formatDate(defaultEnd),
  };
}

function getSelectedDateRange(rows, state) {
  const bounds = getDateBounds(rows);
  if (!bounds) return null;

  const startValue = state.startDate || formatDate(bounds.min);
  const endValue = state.endDate || formatDate(bounds.max);
  let startDate = parseDate(startValue);
  let endDate = parseDate(endValue);

  if (Number.isNaN(startDate.getTime())) startDate = bounds.min;
  if (Number.isNaN(endDate.getTime())) endDate = bounds.max;

  if (startDate < bounds.min) startDate = bounds.min;
  if (startDate > bounds.max) startDate = bounds.max;
  if (endDate < bounds.min) endDate = bounds.min;
  if (endDate > bounds.max) endDate = bounds.max;

  if (startDate > endDate) {
    const temp = startDate;
    startDate = endDate;
    endDate = temp;
  }

  return { startDate, endDate };
}

function filterRowsByDateRange(rows, range) {
  if (rows.length === 0) return rows;
  if (!range) return rows;

  return rows.filter((row) => {
    const date = parseDate(row.date);
    return date >= range.startDate && date <= range.endDate;
  });
}

function getLatestNonNull(rows, key) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][key] !== null && rows[i][key] !== undefined) {
      return rows[i];
    }
  }
  return null;
}

function getVisibleSeries(state) {
  return {
    raw: state.showRaw,
    movingAverage: state.showMovingAverage,
    target: state.showTarget,
  };
}

function collectVisibleValues(rows, visibleSeries) {
  const values = [];
  for (const row of rows) {
    if (visibleSeries.raw && typeof row.weight === "number") {
      values.push(row.weight);
    }
    if (
      visibleSeries.movingAverage &&
      typeof row.movingAverage === "number"
    ) {
      values.push(row.movingAverage);
    }
    if (visibleSeries.target && typeof row.target === "number") {
      values.push(row.target);
    }
  }

  return values;
}

function calculateYAxisMin(rows, visibleSeries) {
  const values = collectVisibleValues(rows, visibleSeries);

  if (values.length === 0) return undefined;

  const minValue = Math.min(...values);
  const paddedMin = minValue - CONFIG.yAxisMinPaddingKg;
  return Math.floor(paddedMin / CONFIG.yAxisMinStepKg) * CONFIG.yAxisMinStepKg;
}

function calculateYAxisMax(rows, visibleSeries) {
  const values = collectVisibleValues(rows, visibleSeries);

  if (values.length === 0) return undefined;

  const maxValue = Math.max(...values);
  const paddedMax = maxValue + CONFIG.yAxisMaxPaddingKg;
  return Math.ceil(paddedMax / CONFIG.yAxisMaxStepKg) * CONFIG.yAxisMaxStepKg;
}

function getXAxisLabelStep(totalDays) {
  if (totalDays <= 14) return 1;
  if (totalDays <= 45) return 3;
  if (totalDays <= 120) return 7;
  if (totalDays <= 240) return 14;
  return 30;
}

function getXAxisGridStep(totalDays) {
  const targetGridLineCount = 22;
  const rawStep = Math.ceil(totalDays / targetGridLineCount);
  const candidates = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90];
  for (const step of candidates) {
    if (rawStep <= step) return step;
  }
  return rawStep;
}

function shouldShowXAxisGridLine(index, totalDays, step) {
  return index === 0 || index === totalDays - 1 || index % step === 0;
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

function getCurrentMonthTarget() {
  const targetRecords = sortRecords(TARGET_RECORDS || []);
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

// サマリーカードの表示内容を配列で返す(Vue側で v-for 表示する)
function buildSummaryItems(summaryRows, allRows) {
  const latestWeight = getLatestNonNull(summaryRows, "weight");
  const latestAverage = getLatestNonNull(summaryRows, "movingAverage");
  const latestTargetRow = getLatestNonNull(allRows, "target");
  const nearestFutureWeekendTarget = getNearestFutureWeekendTarget(allRows);
  const currentMonthTarget = getCurrentMonthTarget();
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

function getStatusText(diff) {
  if (diff === null) return "-";
  if (diff <= 0) return "順調";
  if (diff <= 1) return "ほぼ順調";
  if (diff <= 2) return "様子見";
  return "見直し候補";
}

// state: { startDate, endDate, showRaw, showMovingAverage, showTarget }
// 描画してサマリーカードの配列を返す
function drawChart(state) {
  const visibleSeries = getVisibleSeries(state);
  const baseRows = buildChartRows();
  const selectedRange = getSelectedDateRange(baseRows, state);
  const rows = filterRowsByDateRange(baseRows, selectedRange);
  const today = parseDate(formatDate(new Date()));
  const summaryRows = rows.filter((row) => parseDate(row.date) <= today);
  const yAxisMin = calculateYAxisMin(rows, visibleSeries);
  const yAxisMax = calculateYAxisMax(rows, visibleSeries);
  const xAxisLabelStep = getXAxisLabelStep(rows.length);
  const xAxisGridStep = getXAxisGridStep(rows.length);

  const summaryItems = buildSummaryItems(summaryRows, rows);

  const ctx = document.getElementById("weightChart");

  if (chart) {
    chart.destroy();
  }

  const datasets = [];

  if (visibleSeries.raw) {
    datasets.push({
      label: "実測値[kg]",
      data: rows.map((row) => row.weight),
      showLine: true,
      spanGaps: true,
      tension: 0,
      borderColor: "#3b82f6",
      backgroundColor: "#3b82f6",
      pointBackgroundColor: "#3b82f6",
      pointBorderColor: "#ffffff",
      pointBorderWidth: 1.5,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
    });
  }

  if (visibleSeries.movingAverage) {
    datasets.push({
      label: "7日移動平均[kg]",
      data: rows.map((row) => row.movingAverage),
      spanGaps: true,
      tension: 0,
      borderColor: "#14b8a6",
      backgroundColor: "#14b8a6",
      borderWidth: 3,
      pointRadius: 2,
      pointBackgroundColor: "#14b8a6",
    });
  }

  if (visibleSeries.target) {
    datasets.push({
      label: "目標体重[kg]",
      data: rows
        .filter((row) => typeof row.target === "number")
        .map((row) => ({ x: row.date, y: Number(row.target.toFixed(2)) })),
      showLine: true,
      spanGaps: false,
      clip: false,
      tension: 0,
      borderWidth: 2,
      borderColor: "#f97316",
      backgroundColor: "#f97316",
      pointStyle: "circle",
      pointRadius: 6,
      pointHoverRadius: 8,
      pointBackgroundColor: "#f97316",
      pointBorderColor: "#f97316",
      pointBorderWidth: 1,
    });
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map((row) => row.date),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
        },
        tooltip: {
          callbacks: {
            label(context) {
              const raw = context.raw;
              const value =
                raw && typeof raw === "object" && "y" in raw ? raw.y : raw;
              if (
                value === null ||
                value === undefined ||
                Number.isNaN(Number(value))
              ) {
                return `${context.dataset.label}: -`;
              }
              return `${context.dataset.label}: ${Number(value).toFixed(2)} kg`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: false,
            callback(value, index) {
              const label = rows[index]?.date;
              if (!label) return "";
              if (
                index !== 0 &&
                index !== rows.length - 1 &&
                index % xAxisLabelStep !== 0
              ) {
                return "";
              }
              const [, month, day] = label.split("-");
              return `${Number(month)}/${Number(day)}`;
            },
          },
          grid: {
            display: true,
            color(context) {
              const index =
                typeof context.index === "number" ? context.index : -1;
              if (index < 0) return "rgba(148, 163, 184, 0.28)";
              return shouldShowXAxisGridLine(index, rows.length, xAxisGridStep)
                ? "rgba(148, 163, 184, 0.28)"
                : "rgba(0, 0, 0, 0)";
            },
            lineWidth(context) {
              const index =
                typeof context.index === "number" ? context.index : -1;
              if (index < 0) return 1;
              return shouldShowXAxisGridLine(index, rows.length, xAxisGridStep)
                ? 1
                : 0;
            },
          },
        },
        y: {
          min: yAxisMin,
          max: yAxisMax,
          title: {
            display: true,
            text: "体重[kg]",
          },
        },
      },
    },
  });

  return summaryItems;
}
