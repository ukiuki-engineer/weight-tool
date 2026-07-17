// Vue アプリの起点。
// 認証状態・測定値/目標値(records)・画面切替・表示ユーザー切替を管理する。

import {
  onAuth,
  login,
  logout,
  loadRecords,
  loadUserAccess,
  saveUserSettings,
} from "./services/firebase-store.js?v=20260717-4";
import { showNotice } from "./services/notification.js";
import { loadSfc } from "./sfc-loader.js?v=20260718-1";

const VIEW_OPTIONS = [
  { value: "graph", label: "グラフ" },
  { value: "summary", label: "サマリー" },
  { value: "entry", label: "入力" },
  { value: "target", label: "目標" },
];

const {
  createApp,
  defineAsyncComponent,
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} = Vue;

const GraphView = defineAsyncComponent(() => loadSfc("./pages/Graph.vue"));
const SummaryView = defineAsyncComponent(() => loadSfc("./pages/Summary.vue"));
const EntryView = defineAsyncComponent(() => loadSfc("./pages/Entry.vue"));
const TargetView = defineAsyncComponent(() => loadSfc("./pages/Target.vue"));
const AppNotice = defineAsyncComponent(() => loadSfc("./components/AppNotice.vue"));

function authUserName(authUser) {
  return authUser?.displayName?.trim()
    || authUser?.email?.split("@")[0]
    || "ユーザー";
}

function ownUserLabel(name) {
  return `${name}（自分）`;
}

createApp({
  components: { AppNotice, GraphView, SummaryView, EntryView, TargetView },
  setup() {
    const user = ref(null);
    const ready = ref(false);
    const message = ref("確認中…");
    const view = ref("graph"); // "graph" | "summary" | "entry" | "target"
    const records = reactive({ weights: [], targets: [] });
    const userSelectRef = ref(null);
    const userMenuRef = ref(null);
    const userMenuOpen = ref(false);
    const myPageOpen = ref(false);
    const userName = ref("");
    const userMemo = ref("");
    const userDefaultView = ref("graph");
    const userNameDraft = ref("");
    const userMemoDraft = ref("");
    const userDefaultViewDraft = ref("graph");
    const myPageSaving = ref(false);
    const loggingIn = ref(false);

    // 表示中ユーザーのUID(管理者は他ユーザーに切り替えて読み書きできる)
    const viewUid = ref(null);
    const isAdmin = ref(false);
    const userOptions = ref([]);
    let userSelect = null;
    const displayName = computed(() =>
      userName.value
        || user.value?.displayName
        || user.value?.email?.split("@")[0]
        || "ユーザー",
    );
    const avatarInitial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || "U");
    const defaultViewPreview = computed(() => {
      const selected = VIEW_OPTIONS.find((option) => option.value === userDefaultViewDraft.value);
      return `起動後: ${selected?.label || "グラフ"}`;
    });

    function normalizeDefaultView(value) {
      return VIEW_OPTIONS.some((option) => option.value === value) ? value : "graph";
    }

    function applyUserSettings(settings = {}) {
      userName.value = typeof settings.name === "string" ? settings.name : "";
      userMemo.value = typeof settings.memo === "string" ? settings.memo : "";
      userDefaultView.value = normalizeDefaultView(settings.defaultView);
    }

    function updateOwnUserOption(name) {
      if (!user.value) return;
      const option = {
        uid: user.value.uid,
        name: ownUserLabel(name?.trim() || authUserName(user.value)),
      };
      userOptions.value = [
        option,
        ...userOptions.value.filter((current) => current.uid !== user.value.uid),
      ];
    }

    function toggleUserMenu() {
      userMenuOpen.value = !userMenuOpen.value;
    }

    function destroyUserSelect() {
      if (!userSelect) return;
      userSelect.destroy();
      userSelect = null;
    }

    function syncUserSelectValue() {
      if (!userSelect || !viewUid.value) return;
      if (userSelect.getValue() === viewUid.value) return;
      userSelect.setValue(viewUid.value, true);
    }

    async function refreshUserSelect() {
      if (!isAdmin.value) {
        destroyUserSelect();
        return;
      }
      await nextTick();
      if (!userSelectRef.value || !window.TomSelect) return;
      if (!userSelect) {
        userSelect = new window.TomSelect(userSelectRef.value, {
          create: false,
          controlInput: null,
          persist: false,
          maxOptions: null,
          searchField: [],
          placeholder: "ユーザーを選択",
          render: {
            item(data, escape) {
              return `<div class="userSelectItem">${escape(data.text)}</div>`;
            },
            option(data, escape) {
              return `<div class="userSelectOption">${escape(data.text)}</div>`;
            },
          },
          onChange(value) {
            if (!value || value === viewUid.value) return;
            viewUid.value = value;
          },
        });
      }
      syncUserSelectValue();
    }

    async function loadAccessFor(authUser) {
      isAdmin.value = false;
      userOptions.value = [{ uid: authUser.uid, name: ownUserLabel(authUserName(authUser)) }];

      try {
        const access = await loadUserAccess();
        if (user.value?.uid !== authUser.uid) return;
        applyUserSettings(access.currentUser);
        view.value = userDefaultView.value;
        isAdmin.value = access.isAdmin;
        const ownOption = {
          uid: authUser.uid,
          name: ownUserLabel(access.currentUser.name || authUserName(authUser)),
        };
        userOptions.value = [ownOption];
        if (!access.isAdmin) return;

        userOptions.value = [
          ownOption,
          ...access.users.filter((option) => option.uid !== authUser.uid),
        ];
      } catch (error) {
        console.warn("ユーザー権限の取得に失敗しました。", error);
      }
    }

    function openMyPage() {
      userMenuOpen.value = false;
      userNameDraft.value = userName.value || user.value?.displayName || "";
      userMemoDraft.value = userMemo.value;
      userDefaultViewDraft.value = userDefaultView.value;
      myPageOpen.value = true;
    }

    function closeMyPage() {
      myPageOpen.value = false;
    }

    async function saveMyPage() {
      if (!user.value) return;
      const settings = {
        name: userNameDraft.value.trim(),
        memo: userMemoDraft.value.trim(),
        defaultView: normalizeDefaultView(userDefaultViewDraft.value),
      };
      myPageSaving.value = true;
      try {
        const saved = await saveUserSettings(settings);
        applyUserSettings(saved);
        updateOwnUserOption(saved.name);
        showNotice("マイページを保存しました。");
      } catch (error) {
        showNotice(`保存に失敗しました: ${error.message}`, "error", 4000);
      } finally {
        myPageSaving.value = false;
      }
    }

    async function handleLogout() {
      userMenuOpen.value = false;
      myPageOpen.value = false;
      try {
        await logout();
      } catch (error) {
        showNotice(`ログアウトに失敗しました: ${error.message}`, "error", 4000);
      }
    }

    async function loadFor(uid) {
      ready.value = false;
      message.value = "データを読み込み中…";
      try {
        const loaded = await loadRecords(uid);
        records.weights = loaded.weights;
        records.targets = loaded.targets;
        ready.value = true;
      } catch (error) {
        ready.value = false;
        message.value = `データの読み込みに失敗しました: ${error.message}`;
      }
    }

    async function handleLogin() {
      if (loggingIn.value) return;
      loggingIn.value = true;
      message.value = "ログイン中…";
      try {
        await login();
      } catch (error) {
        message.value = `ログインに失敗しました: ${error.message}`;
      } finally {
        loggingIn.value = false;
      }
    }

    onAuth(async (authUser) => {
      user.value = authUser;
      if (!authUser) {
        ready.value = false;
        viewUid.value = null;
        isAdmin.value = false;
        userOptions.value = [];
        userMenuOpen.value = false;
        myPageOpen.value = false;
        applyUserSettings();
        message.value = "Googleでログインするとデータを表示します。";
        return;
      }
      applyUserSettings();
      view.value = "graph";
      viewUid.value = authUser.uid;
      await Promise.all([
        loadAccessFor(authUser),
        loadFor(authUser.uid),
      ]);
    });

    // 表示ユーザー切替(セレクト変更)で読み直す
    watch(viewUid, async (uid, previous) => {
      if (!uid || !previous || uid === previous) return;
      await loadFor(uid);
    });

    watch([isAdmin, viewUid], () => {
      refreshUserSelect();
    });

    watch(userOptions, () => {
      destroyUserSelect();
      refreshUserSelect();
    });

    // 入力画面で保存されたら records に反映する(同日付は上書き)
    function onSaved({ date, weight, createdAt = "", updatedAt = "", previousDate = null }) {
      const replacedDates = new Set([date, previousDate].filter(Boolean));
      records.weights = [
        ...records.weights.filter((row) => !replacedDates.has(row.date)),
        { date, weight, createdAt, updatedAt },
      ];
    }

    function onDeleted({ date }) {
      records.weights = records.weights.filter((row) => row.date !== date);
    }

    function onTargetSaved({ date, weight, createdAt = "", updatedAt = "", previousDate = null }) {
      const replacedDates = new Set([date, previousDate].filter(Boolean));
      records.targets = [
        ...records.targets.filter((row) => !replacedDates.has(row.date)),
        { date, weight, createdAt, updatedAt },
      ];
    }

    function onTargetDeleted({ date }) {
      records.targets = records.targets.filter((row) => row.date !== date);
    }

    // JSON一括登録の反映(同日付は上書き)
    function mergeRecords(current, incoming) {
      const incomingDates = new Set(incoming.map((row) => row.date));
      return [
        ...current.filter((row) => !incomingDates.has(row.date)),
        ...incoming,
      ];
    }

    function onImported(rows) {
      records.weights = mergeRecords(records.weights, rows);
    }

    function onTargetImported(rows) {
      records.targets = mergeRecords(records.targets, rows);
    }

    onMounted(() => {
      document.addEventListener("click", handleDocumentClick);
      document.addEventListener("keydown", handleKeydown);
      refreshUserSelect();
    });

    onBeforeUnmount(() => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeydown);
      destroyUserSelect();
    });

    function handleDocumentClick(event) {
      if (!userMenuOpen.value) return;
      if (userMenuRef.value?.contains(event.target)) return;
      userMenuOpen.value = false;
    }

    function handleKeydown(event) {
      if (event.key !== "Escape") return;
      userMenuOpen.value = false;
      myPageOpen.value = false;
    }

    return {
      user,
      ready,
      message,
      view,
      records,
      viewOptions: VIEW_OPTIONS,
      userOptions,
      viewUid,
      isAdmin,
      userSelectRef,
      userMenuRef,
      userMenuOpen,
      myPageOpen,
      userNameDraft,
      userMemoDraft,
      userDefaultViewDraft,
      myPageSaving,
      loggingIn,
      displayName,
      avatarInitial,
      defaultViewPreview,
      handleLogin,
      handleLogout,
      toggleUserMenu,
      openMyPage,
      closeMyPage,
      saveMyPage,
      onSaved,
      onDeleted,
      onTargetSaved,
      onTargetDeleted,
      onImported,
      onTargetImported,
    };
  },
}).mount("#app");
