// 入力ページ(entry.html)の Vue アプリ。

import { onAuth, login, logout, loadRecords, saveWeight } from "./firebase-store.js";

const { createApp, ref, computed } = Vue;

function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

createApp({
  setup() {
    const user = ref(null);
    const ready = ref(false);
    const message = ref("確認中…");
    const weights = ref([]);
    const entryDate = ref(todayString());
    const entryWeight = ref(null);
    const status = ref("");
    const saving = ref(false);

    const recentRecords = computed(() =>
      [...weights.value]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 7),
    );

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
        message.value = "Googleでログインすると入力できます。";
        return;
      }
      message.value = "データを読み込み中…";
      try {
        const records = await loadRecords(authUser.uid);
        weights.value = records.weights;
        ready.value = true;
      } catch (error) {
        ready.value = false;
        message.value = `データの読み込みに失敗しました: ${error.message}`;
      }
    });

    async function handleSave() {
      const date = entryDate.value;
      const weight = Number(entryWeight.value);
      if (!date || !Number.isFinite(weight)) {
        status.value = "日付と体重を入力してください。";
        return;
      }

      saving.value = true;
      status.value = "保存中…";
      try {
        await saveWeight(date, weight);
        weights.value = [
          ...weights.value.filter((row) => row.date !== date),
          { date, weight },
        ];
        status.value = `${date} を保存しました。`;
        entryWeight.value = null;
      } catch (error) {
        status.value = `保存に失敗しました: ${error.message}`;
      } finally {
        saving.value = false;
      }
    }

    return {
      user,
      ready,
      message,
      entryDate,
      entryWeight,
      status,
      saving,
      recentRecords,
      handleLogin,
      logout,
      handleSave,
    };
  },
}).mount("#app");
