<template>
  <div class="recordView">
    <section v-if="canEdit" class="entryCard recordFormBar">
      <form class="entryForm" @submit.prevent="handleSave">
        <label>
          日付
          <DatePicker v-model="entryDate" input-class="datePickerInput" required />
        </label>
        <label>
          {{ config.weightLabel }}
          <span class="weightSelects">
            <select v-model.number="entryWeightInt">
              <option v-for="n in intOptions" :key="n" :value="n">{{ n }}</option>
            </select>
            <span class="weightDot">.</span>
            <select v-model.number="entryWeightDec">
              <option v-for="n in decOptions" :key="n" :value="n">{{ n }}</option>
            </select>
          </span>
        </label>
        <button type="submit" class="saveButton" :disabled="saving">保存</button>
      </form>
    </section>

    <section class="notes recordPanel">
      <p v-if="!canEdit && config.readOnlyMessage" class="readOnlyNotice">
        {{ config.readOnlyMessage }}
      </p>
      <table class="recordTable">
        <thead>
          <tr>
            <th>日付</th>
            <th class="recordWeight">体重</th>
            <th>更新日時</th>
            <th class="recordActions"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in pagedRows" :key="row.date">
            <tr :class="{ editing: isEditing(row) }">
              <td>
                <span v-if="isEditing(row)" class="editDot" aria-hidden="true"></span>
                {{ row.date }}
              </td>
              <td class="recordWeight">{{ row.weight.toFixed(1) }} kg</td>
              <td class="recordEnteredAt">{{ formatUpdatedAt(row.updatedAt, row.date) }}</td>
              <td class="recordActions">
                <template v-if="canEdit">
                  <template v-if="confirmingDate === row.date">
                    <button type="button" class="rowButton dangerButton" @click="handleDelete(row)">
                      本当に削除
                    </button>
                    <button type="button" class="rowButton" @click="cancelDelete">やめる</button>
                  </template>
                  <template v-else>
                    <button type="button" class="rowButton editButton" @click="startEdit(row)">
                      編集
                    </button>
                    <button type="button" class="rowButton deleteButton" @click="startConfirmDelete(row)">
                      削除
                    </button>
                  </template>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-if="allRows.length === 0" class="recordEmpty">{{ config.emptyMessage }}</p>
    </section>

    <footer v-if="canEdit || allRows.length > 0" class="recordFooter">
      <div v-if="allRows.length > 0" class="pager">
        <div class="pagerSummary">
          <span class="pagerTotal">全{{ allRows.length }}件</span>
          <label class="pagerControl">
            表示件数
            <select v-model.number="pageSize">
              <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
            </select>
          </label>
        </div>
        <div class="pagerNavigation">
          <button type="button" :disabled="page <= 1" @click="page--">前へ</button>
          <label class="pagerControl">
            ページ
            <select v-model.number="page">
              <option v-for="n in pageOptions" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <span class="pagerTotal">/ {{ totalPages }}</span>
          <button type="button" :disabled="page >= totalPages" @click="page++">次へ</button>
        </div>
      </div>
      <button
        type="button"
        class="authButton dataIoButton"
        @click="openDataIoDialog"
      >
        データ入出力
      </button>
    </footer>

    <div v-if="isEditOpen" class="modalBackdrop recordEditBackdrop" @click.self="cancelEdit">
      <section class="recordEditDialog" role="dialog" aria-modal="true" :aria-labelledby="editTitleId">
        <div class="modalHeader">
          <div>
            <p class="modalEyebrow">編集</p>
            <h2 :id="editTitleId">{{ config.editTitle }}</h2>
          </div>
          <button
            type="button"
            class="iconButton"
            aria-label="閉じる"
            :disabled="editingSaving"
            @click="cancelEdit"
          >
            ×
          </button>
        </div>
        <form class="recordEditForm" @submit.prevent="handleRowSave">
          <label>
            日付
            <DatePicker v-model="editDate" input-class="editDateInput" required />
          </label>
          <label>
            {{ config.weightLabel }}
            <span class="editWeightSelects">
              <select v-model.number="editWeightInt">
                <option v-for="n in intOptions" :key="n" :value="n">{{ n }}</option>
              </select>
              <span class="weightDot">.</span>
              <select v-model.number="editWeightDec">
                <option v-for="n in decOptions" :key="n" :value="n">{{ n }}</option>
              </select>
            </span>
          </label>
          <div class="dialogActions">
            <button type="button" class="authButton" :disabled="editingSaving" @click="cancelEdit">
              キャンセル
            </button>
            <button type="submit" class="saveButton" :disabled="editingSaving">保存</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="dataIoOpen" class="modalBackdrop" @click.self="closeDataIoDialog">
      <section class="dataIoDialog" role="dialog" aria-modal="true" :aria-labelledby="dataIoTitleId">
        <div class="modalHeader">
          <div>
            <p class="modalEyebrow">データ</p>
            <h2 :id="dataIoTitleId">データ入出力</h2>
          </div>
          <button type="button" class="iconButton" aria-label="閉じる" @click="closeDataIoDialog">×</button>
        </div>
        <div class="dataIoActions">
          <button v-if="canEdit" type="button" class="authButton" @click="selectImport">
            JSON一括入力
          </button>
          <button
            v-if="allRows.length > 0"
            type="button"
            class="authButton"
            @click="handleExport('csv')"
          >
            CSV出力
          </button>
          <button
            v-if="allRows.length > 0"
            type="button"
            class="authButton"
            @click="handleExport('json')"
          >
            JSON出力
          </button>
        </div>
      </section>
    </div>

    <div v-if="bulkOpen" class="modalBackdrop" @click.self="closeImportDialog">
      <section class="bulkDialog" role="dialog" aria-modal="true" :aria-labelledby="bulkTitleId">
        <div class="modalHeader">
          <div>
            <p class="modalEyebrow">一括入力</p>
            <h2 :id="bulkTitleId">JSON一括入力</h2>
          </div>
          <button type="button" class="iconButton" aria-label="閉じる" @click="closeImportDialog">×</button>
        </div>
        <p class="bulkHint">{{ config.bulkExample }}</p>
        <textarea v-model="bulkText" rows="9" spellcheck="false"></textarea>
        <div class="dialogActions">
          <button type="button" class="authButton" @click="closeImportDialog">キャンセル</button>
          <button type="button" class="saveButton" :disabled="importing" @click="handleImport">登録</button>
        </div>
        <p class="bulkStatus">{{ bulkStatus }}</p>
      </section>
    </div>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import DatePicker from "./DatePicker.vue";
import {
  deleteTarget,
  deleteWeight,
  saveTarget,
  saveTargets,
  saveWeight,
  saveWeights,
} from "@weight-tool/firebase-store";
import { downloadRecords } from "@weight-tool/export-records";
import { parseRecordsJson } from "@weight-tool/json-import";
import { showNotice } from "@weight-tool/notification";
import {
  PAGE_SIZE_OPTIONS,
  combineWeight,
  formatUpdatedAt,
  splitWeight,
} from "@weight-tool/record-utils";

const KIND_CONFIG = {
  weight: {
    weightLabel: "体重[kg]",
    editTitle: "記録を編集",
    emptyMessage: "まだ記録がありません。",
    readOnlyMessage: "",
    bulkExample: '形式: [ { date: "2026-05-13", weight: 111.3 }, ... ] — 旧data.jsのJS形式のコピペOK、同じ日付は上書き',
    sortOrder: "desc",
    saveOne: saveWeight,
    deleteOne: deleteWeight,
    saveMany: saveWeights,
    savedMessage: (date) => `${date} を保存しました。`,
    deletedMessage: (row) => `${row.date} の記録(${row.weight.toFixed(1)}kg)を削除しました。`,
    readOnlyStatus: "記録は閲覧のみです。",
  },
  target: {
    weightLabel: "目標体重[kg]",
    editTitle: "目標を編集",
    emptyMessage: "まだ目標がありません。",
    readOnlyMessage: "目標は閲覧のみです。",
    bulkExample: '形式: [ { date: "2026-07-31", weight: 104.5 }, ... ] — 旧data.jsのJS形式のコピペOK、同じ日付は上書き',
    sortOrder: "asc",
    saveOne: saveTarget,
    deleteOne: deleteTarget,
    saveMany: saveTargets,
    savedMessage: (date) => `${date} の目標を保存しました。`,
    deletedMessage: (row) => `${row.date} の目標(${row.weight.toFixed(1)}kg)を削除しました。`,
    readOnlyStatus: "目標は閲覧のみです。",
  },
};

function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function defaultTargetDate(targets) {
  if (targets.length === 0) {
    const today = new Date();
    return formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  }
  const last = parseDate(
    [...targets].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1).date,
  );
  return formatDate(new Date(last.getFullYear(), last.getMonth() + 2, 0));
}

export default {
  name: "RecordManager",
  components: { DatePicker },
  props: {
    rows: { type: Array, required: true },
    uid: { type: String, required: true },
    kind: { type: String, required: true },
    canEdit: { type: Boolean, default: true },
    fallbackWeights: { type: Array, default: () => [] },
  },
  emits: ["saved", "deleted", "imported"],
  setup(props, { emit }) {
    const config = computed(() => KIND_CONFIG[props.kind] || KIND_CONFIG.weight);
    const bulkTitleId = computed(() => `${props.kind}BulkDialogTitle`);
    const dataIoTitleId = computed(() => `${props.kind}DataIoDialogTitle`);
    const editTitleId = computed(() => `${props.kind}EditDialogTitle`);
    const entryDate = ref(props.kind === "target" ? defaultTargetDate(props.rows) : todayString());
    const saving = ref(false);
    const page = ref(1);
    const pageSize = ref(PAGE_SIZE_OPTIONS[0]);
    const confirmingDate = ref(null);
    const editingDate = ref(null);
    const editDate = ref("");
    const editingSaving = ref(false);
    let confirmTimer = null;

    const allRows = computed(() =>
      [...props.rows].sort((a, b) => {
        if (config.value.sortOrder === "asc") return a.date < b.date ? -1 : 1;
        return a.date < b.date ? 1 : -1;
      }),
    );

    function initialWeightValue() {
      if (props.kind === "target") {
        const lastTarget = allRows.value.at(-1);
        const latestWeight = [...props.fallbackWeights].sort((a, b) =>
          a.date < b.date ? 1 : -1,
        )[0];
        return lastTarget?.weight ?? latestWeight?.weight ?? 60;
      }
      return allRows.value[0]?.weight ?? 60;
    }

    const initialWeight = splitWeight(initialWeightValue(), 60);
    const entryWeightInt = ref(initialWeight.int);
    const entryWeightDec = ref(initialWeight.dec);
    const editWeightInt = ref(initialWeight.int);
    const editWeightDec = ref(initialWeight.dec);
    const intOptions = Array.from({ length: 171 }, (_, i) => i + 30);
    const decOptions = Array.from({ length: 10 }, (_, i) => i);

    const totalPages = computed(() =>
      Math.max(1, Math.ceil(allRows.value.length / pageSize.value)),
    );
    const pageOptions = computed(() =>
      Array.from({ length: totalPages.value }, (_, i) => i + 1),
    );
    const pagedRows = computed(() =>
      allRows.value.slice(
        (page.value - 1) * pageSize.value,
        page.value * pageSize.value,
      ),
    );

    watch(pageSize, () => {
      page.value = 1;
    });
    watch(totalPages, (total) => {
      if (page.value > total) page.value = total;
    });

    async function handleSave() {
      if (!props.canEdit) {
        showNotice(config.value.readOnlyStatus, "error", 4000);
        return;
      }
      const date = entryDate.value;
      const weight = combineWeight(entryWeightInt.value, entryWeightDec.value);
      if (!date) {
        showNotice("日付を入力してください。", "error", 4000);
        return;
      }

      saving.value = true;
      try {
        const timestamps = await config.value.saveOne(props.uid, date, weight);
        emit("saved", { date, weight, ...timestamps });
        showNotice(config.value.savedMessage(date));
        if (props.kind === "target") {
          entryDate.value = defaultTargetDate([
            ...props.rows,
            { date, weight, ...timestamps },
          ]);
        }
      } catch (error) {
        showNotice(`保存に失敗しました: ${error.message}`, "error", 4000);
      } finally {
        saving.value = false;
      }
    }

    function isEditing(row) {
      return props.canEdit && editingDate.value === row.date;
    }

    const isEditOpen = computed(() => editingDate.value !== null);

    function startEdit(row) {
      if (!props.canEdit) return;
      cancelDelete();
      const weight = splitWeight(row.weight);
      editingDate.value = row.date;
      editDate.value = row.date;
      editWeightInt.value = weight.int;
      editWeightDec.value = weight.dec;
    }

    function resetEdit() {
      editingDate.value = null;
      editDate.value = "";
    }

    function cancelEdit() {
      if (editingSaving.value) return;
      resetEdit();
    }

    async function handleRowSave() {
      if (!props.canEdit) {
        showNotice(config.value.readOnlyStatus, "error", 4000);
        return;
      }
      const previousDate = editingDate.value;
      const date = editDate.value;
      const weight = combineWeight(editWeightInt.value, editWeightDec.value);
      if (!date) {
        showNotice("日付を入力してください。", "error", 4000);
        return;
      }

      editingSaving.value = true;
      try {
        const timestamps = await config.value.saveOne(props.uid, date, weight);
        if (previousDate !== date) {
          await config.value.deleteOne(props.uid, previousDate);
        }
        emit("saved", { date, weight, ...timestamps, previousDate });
        resetEdit();
        showNotice(config.value.savedMessage(date));
      } catch (error) {
        showNotice(`保存に失敗しました: ${error.message}`, "error", 4000);
      } finally {
        editingSaving.value = false;
      }
    }

    function startConfirmDelete(row) {
      if (!props.canEdit) return;
      cancelEdit();
      confirmingDate.value = row.date;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        confirmingDate.value = null;
      }, 5000);
    }

    function cancelDelete() {
      clearTimeout(confirmTimer);
      confirmingDate.value = null;
    }

    async function handleDelete(row) {
      if (!props.canEdit) {
        showNotice(config.value.readOnlyStatus, "error", 4000);
        return;
      }
      cancelDelete();
      try {
        await config.value.deleteOne(props.uid, row.date);
        emit("deleted", { date: row.date });
        showNotice(config.value.deletedMessage(row));
      } catch (error) {
        showNotice(`削除に失敗しました: ${error.message}`, "error", 4000);
      }
    }

    const bulkOpen = ref(false);
    const bulkText = ref("");
    const bulkStatus = ref("");
    const importing = ref(false);
    const dataIoOpen = ref(false);

    function openDataIoDialog() {
      dataIoOpen.value = true;
    }

    function closeDataIoDialog() {
      dataIoOpen.value = false;
    }

    function selectImport() {
      closeDataIoDialog();
      openImportDialog();
    }

    function openImportDialog() {
      if (!props.canEdit) return;
      bulkStatus.value = "";
      bulkOpen.value = true;
    }

    function closeImportDialog() {
      bulkOpen.value = false;
      bulkStatus.value = "";
    }

    async function handleImport() {
      if (!props.canEdit) {
        bulkStatus.value = config.value.readOnlyStatus;
        return;
      }
      const { records: parsed, error } = parseRecordsJson(bulkText.value);
      if (error) {
        bulkStatus.value = error;
        return;
      }
      importing.value = true;
      bulkStatus.value = `${parsed.length}件を登録中…`;
      try {
        const savedRows = await config.value.saveMany(props.uid, parsed);
        emit("imported", savedRows);
        bulkText.value = "";
        bulkStatus.value = "";
        bulkOpen.value = false;
        showNotice(`${savedRows.length}件を登録しました。`);
      } catch (error) {
        bulkStatus.value = "";
        showNotice(`登録に失敗しました: ${error.message}`, "error", 4000);
      } finally {
        importing.value = false;
      }
    }

    function handleExport(format) {
      try {
        downloadRecords(allRows.value, props.kind, format);
        closeDataIoDialog();
        showNotice(`${format.toUpperCase()}を出力しました。`);
      } catch (error) {
        showNotice(`出力に失敗しました: ${error.message}`, "error", 4000);
      }
    }

    onBeforeUnmount(() => {
      clearTimeout(confirmTimer);
    });

    return {
      config,
      bulkTitleId,
      dataIoTitleId,
      editTitleId,
      entryDate,
      entryWeightInt,
      entryWeightDec,
      editDate,
      editWeightInt,
      editWeightDec,
      intOptions,
      decOptions,
      saving,
      editingSaving,
      page,
      pageSize,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      confirmingDate,
      allRows,
      totalPages,
      pageOptions,
      pagedRows,
      formatUpdatedAt,
      handleSave,
      isEditing,
      isEditOpen,
      startEdit,
      cancelEdit,
      handleRowSave,
      startConfirmDelete,
      cancelDelete,
      handleDelete,
      bulkOpen,
      bulkText,
      bulkStatus,
      importing,
      dataIoOpen,
      openDataIoDialog,
      closeDataIoDialog,
      selectImport,
      openImportDialog,
      closeImportDialog,
      handleImport,
      handleExport,
    };
  },
};
</script>
