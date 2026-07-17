<template>
  <section class="chartControls">
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
</template>

<script>
// グラフページ。
import { nextTick, onMounted, reactive, ref, watch } from "vue";
import {
  drawChart,
  setChartRange,
  setSeriesVisibility,
} from "@weight-tool/chart";

const RANGES = [
  { key: "month", label: "今月" },
  { key: "3m", label: "3ヶ月" },
  { key: "6m", label: "6ヶ月" },
  { key: "all", label: "全期間" },
];

// datasetIndex は chart.js 側のデータセット並び順に対応
const SERIES = [
  { key: "raw", label: "実測値", color: "#60a5fa", datasetIndex: 0 },
  { key: "movingAverage", label: "7日移動平均", color: "#14b8a6", datasetIndex: 1 },
  { key: "target", label: "目標", color: "#f97316", datasetIndex: 2 },
];

export default {
  name: "Graph",
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

    function redraw() {
      drawChart(
        props.records.weights,
        props.records.targets,
        activeRange.value,
        seriesVisible,
      );
    }

    function setRange(key) {
      activeRange.value = key;
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
      seriesVisible,
      setRange,
      toggleSeries,
    };
  },
};
</script>
