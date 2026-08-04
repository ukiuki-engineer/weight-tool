<template>
  <section class="chartControls">
    <div class="rangePicker">
      <div class="rangeBar">
        <button
          v-for="range in ranges"
          :key="range.key"
          type="button"
          :class="{ active: activeRange === range.key }"
          @click="setRange(range.key)"
        >
          {{ range.label }}
        </button>
      </div>

      <div v-if="activeRange === 'custom'" class="customRangeFields">
        <label>
          <span>開始</span>
          <DatePicker
            v-model="customStartDate"
            input-class="customRangeInput"
            alt-format="Y/m/d"
          />
        </label>
        <span class="customRangeSeparator" aria-hidden="true">-</span>
        <label>
          <span>終了</span>
          <DatePicker
            v-model="customEndDate"
            input-class="customRangeInput"
            alt-format="Y/m/d"
          />
        </label>
      </div>
    </div>

    <div class="seriesToggles">
      <button
        v-for="series in seriesDefs"
        :key="series.key"
        type="button"
        :class="{ off: !seriesVisible[series.key] }"
        @click="toggleSeries(series)"
      >
        <span
          class="seriesDot"
          :style="{ background: seriesVisible[series.key] ? series.color : '#c3cad3' }"
        ></span>
        {{ series.label }}
      </button>
    </div>
  </section>

  <section class="chartCard">
    <canvas id="weightChart"></canvas>
  </section>

  <p class="chartHint">
    スワイプ/ドラッグで期間移動、ピンチ(PCはCtrl+ホイール)で拡大縮小
  </p>

  <section class="movingAverageGuide">
    <h2>体重の流れは7日移動平均で見ましょう</h2>
    <p>
      日々の体重は水分量や食事、測る時間によって上下します。脂肪が減っていても、見かけ上の体重が増えることもあります。
    </p>
    <p>
      7日移動平均は直近7日分をならした線なので、1日の増減に振り回されずに体重の増減を確認できます。
    </p>
  </section>
</template>

<script>
// グラフページ。
import { nextTick, onMounted, reactive, ref, watch } from "vue";
import DatePicker from "../components/DatePicker.vue";
import {
  drawChart,
  getVisibleChartWindow,
  setChartRange,
  setSeriesVisibility,
} from "@weight-tool/chart";

const RANGES = [
  { key: "month", label: "今月" },
  { key: "3m", label: "3ヶ月" },
  { key: "6m", label: "6ヶ月" },
  { key: "all", label: "全期間" },
  { key: "custom", label: "任意" },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDateString(value) {
  if (!DATE_PATTERN.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
  );
}

// datasetIndex は chart.js 側のデータセット並び順に対応
const SERIES = [
  { key: "raw", label: "実測値", color: "#60a5fa", datasetIndex: 0 },
  { key: "movingAverage", label: "7日移動平均", color: "#14b8a6", datasetIndex: 1 },
  { key: "target", label: "目標", color: "#f97316", datasetIndex: 2 },
];

export default {
  name: "Graph",
  components: { DatePicker },
  props: {
    records: { type: Object, required: true },
    active: { type: Boolean, default: true },
  },
  setup(props) {
    const activeRange = ref("month");
    const seriesVisible = reactive({
      raw: false,
      movingAverage: true,
      target: true,
    });
    const customStartDate = ref("");
    const customEndDate = ref("");

    function customRange() {
      if (!isDateString(customStartDate.value)) return null;
      if (!isDateString(customEndDate.value)) return null;
      return {
        min: customStartDate.value,
        max: customEndDate.value,
      };
    }

    function rangeSpec() {
      if (activeRange.value !== "custom") return activeRange.value;
      return customRange() ?? "month";
    }

    function redraw() {
      drawChart(
        props.records.weights,
        props.records.targets,
        rangeSpec(),
        seriesVisible,
      );
    }

    function setRange(key) {
      activeRange.value = key;
      if (key === "custom") {
        const hadCustomRange = Boolean(customRange());
        const currentWindow = getVisibleChartWindow();
        if (!customStartDate.value) customStartDate.value = currentWindow?.min || "";
        if (!customEndDate.value) customEndDate.value = currentWindow?.max || "";
        if (hadCustomRange && customRange()) redraw();
        return;
      }
      setChartRange(key);
    }

    function toggleSeries(series) {
      seriesVisible[series.key] = !seriesVisible[series.key];
      setSeriesVisibility(series.datasetIndex, seriesVisible[series.key]);
    }

    onMounted(async () => {
      await nextTick();
      redraw();
    });

    watch(() => props.records, redraw, { deep: true });
    watch([customStartDate, customEndDate], () => {
      if (activeRange.value !== "custom" || !customRange()) return;
      redraw();
    });
    watch(
      () => props.active,
      async (isActive) => {
        if (!isActive) return;
        await nextTick();
        redraw();
      },
    );

    return {
      ranges: RANGES,
      seriesDefs: SERIES,
      activeRange,
      customStartDate,
      customEndDate,
      seriesVisible,
      setRange,
      toggleSeries,
    };
  },
};
</script>
