<template>
  <section class="summary">
    <div v-for="item in summaryItems" :key="item.label" class="summaryItem">
      <div class="summaryLabel">{{ item.label }}</div>
      <div class="summaryValue">{{ item.value }}</div>
      <div class="summarySub">{{ item.sub }}</div>
    </div>
  </section>
</template>

<script>
// サマリーページ。
import { computed } from "vue";
import { buildSummary } from "@weight-tool/chart";

export default {
  name: "Summary",
  props: {
    records: { type: Object, required: true },
  },
  setup(props) {
    const summaryItems = computed(() =>
      buildSummary(props.records.weights, props.records.targets),
    );
    return { summaryItems };
  },
};
</script>
