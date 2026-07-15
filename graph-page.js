// グラフページ(index.html)の Vue アプリ。
// グラフの計算・描画は app.js(グローバル関数)に任せる。

import { onAuth, login, logout, loadRecords } from "./firebase-store.js";

const { createApp, ref, reactive, watch, nextTick } = Vue;

createApp({
  setup() {
    const user = ref(null);
    const ready = ref(false);
    const message = ref("確認中…");
    const dateBounds = reactive({ min: "", max: "" });
    const controls = reactive({
      startDate: "",
      endDate: "",
      showRaw: false,
      showMovingAverage: true,
      showTarget: true,
    });
    const summaryItems = ref([]);

    function redraw() {
      summaryItems.value = drawChart(controls);
    }

    async function handleLogin() {
      message.value = "ログイン中…";
      try {
        await login();
      } catch (error) {
        message.value = `ログインに失敗しました: ${error.message}`;
      }
    }

    onAuth(async (authUser) => {
      user.value = authUser;
      if (!authUser) {
        ready.value = false;
        message.value = "Googleでログインするとデータを表示します。";
        return;
      }
      message.value = "データを読み込み中…";
      try {
        const records = await loadRecords(authUser.uid);
        window.WEIGHT_RECORDS = records.weights;
        window.TARGET_RECORDS = records.targets;
        const range = getDefaultDateRange(buildChartRows());
        if (range) {
          dateBounds.min = range.min;
          dateBounds.max = range.max;
          controls.startDate = range.start;
          controls.endDate = range.end;
        }
        ready.value = true;
        await nextTick();
        redraw();
      } catch (error) {
        ready.value = false;
        message.value = `データの読み込みに失敗しました: ${error.message}`;
      }
    });

    watch(controls, () => {
      if (ready.value) redraw();
    });

    return {
      user,
      ready,
      message,
      dateBounds,
      controls,
      summaryItems,
      handleLogin,
      logout,
    };
  },
}).mount("#app");
