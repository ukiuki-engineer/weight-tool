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
        <span class="entryStatus">{{ status }}</span>
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
              <td class="recordEnteredAt">{{ formatEnteredAt(row.enteredAt) }}</td>
              <td class="recordActions">
                <template v-if="canEdit && !isEditing(row)">
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
            <tr v-if="isEditing(row)" class="recordEditRow">
              <td colspan="4">
                <div class="recordEditPanel">
                  <span class="editDot" aria-hidden="true"></span>
                  <label>
                    日付
                    <DatePicker
                      v-model="editDate"
                      input-class="inlineDateInput"
                      alt-format="Y-m-d"
                      required
                    />
                  </label>
                  <label>
                    {{ config.weightLabel }}
                    <span class="inlineWeightSelects">
                      <select v-model.number="editWeightInt">
                        <option v-for="n in intOptions" :key="n" :value="n">{{ n }}</option>
                      </select>
                      <span class="weightDot">.</span>
                      <select v-model.number="editWeightDec">
                        <option v-for="n in decOptions" :key="n" :value="n">{{ n }}</option>
                      </select>
                    </span>
                  </label>
                  <div class="recordEditActions">
                    <button
                      type="button"
                      class="rowButton saveRowButton"
                      :disabled="editingSaving"
                      @click="handleRowSave(row)"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      class="rowButton"
                      :disabled="editingSaving"
                      @click="cancelEdit"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-if="allRows.length === 0" class="recordEmpty">{{ config.emptyMessage }}</p>
    </section>

    <footer v-if="canEdit || allRows.length > 0" class="recordFooter">
      <button v-if="canEdit" type="button" class="authButton" @click="openImportDialog">
        JSONで一括登録
      </button>
      <div v-if="allRows.length > 0" class="pager">
        <span class="pagerTotal">全{{ allRows.length }}件</span>
        <label class="pagerControl">
          表示件数
          <select v-model.number="pageSize">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
          </select>
        </label>
        <button type="button" :disabled="page <= 1" @click="page--">前へ</button>
        <label class="pagerControl">
          ページ
          <select v-model.number="page">
            <option v-for="n in pageOptions" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <span class="pagerTotal">/ {{ totalPages }}ページ</span>
        <button type="button" :disabled="page >= totalPages" @click="page++">次へ</button>
      </div>
    </footer>

    <div v-if="bulkOpen" class="modalBackdrop" @click.self="closeImportDialog">
      <section class="bulkDialog" role="dialog" aria-modal="true" :aria-labelledby="bulkTitleId">
        <div class="modalHeader">
          <div>
            <p class="modalEyebrow">一括登録</p>
            <h2 :id="bulkTitleId">JSONで一括登録</h2>
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
import { computed, ref, watch } from "vue";
import DatePicker from "./DatePicker.vue";
import {
  deleteTarget,
  deleteWeight,
  saveTarget,
  saveTargets,
  saveWeight,
  saveWeights,
} from "@weight-tool/firebase-store";
import { parseRecordsJson } from "@weight-tool/json-import";
import {
  PAGE_SIZE_OPTIONS,
  combineWeight,
  currentEnteredAt,
  formatEnteredAt,
  splitWeight,
  withEnteredAt,
} from "@weight-tool/record-utils";

const KIND_CONFIG = {
  weight: {
    weightLabel: "体重[kg]",
    emptyMessage: "まだ記録がありません。",
    readOnlyMessage: "",
    bulkExample: '形式: [ { date: "2026-05-13", weight: 111.3 }, ... ] — 旧data.jsのJS形式のコピペOK、同じ日付は上書き',
    sortOrder: "desc",
    saveOne: saveWeight,
    deleteOne: deleteWeight,
    saveMany: saveWeights,
    savedMessage: (date) => `${date} を保存しました。`,
    editingMessage: (date) => `${date} を編集中です。`,
    deletedMessage: (row) => `${row.date} の記録(${row.weight.toFixed(1)}kg)を削除しました。`,
    readOnlyStatus: "記録は閲覧のみです。",
  },
  target: {
    weightLabel: "目標体重[kg]",
    emptyMessage: "まだ目標がありません。",
    readOnlyMessage: "目標は閲覧のみです。",
    bulkExample: '形式: [ { date: "2026-07-31", weight: 104.5 }, ... ] — 旧data.jsのJS形式のコピペOK、同じ日付は上書き',
    sortOrder: "asc",
    saveOne: saveTarget,
    deleteOne: deleteTarget,
    saveMany: saveTargets,
    savedMessage: (date) => `${date} の目標を保存しました。`,
    editingMessage: (date) => `${date} の目標を編集中です。`,
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
    const entryDate = ref(props.kind === "target" ? defaultTargetDate(props.rows) : todayString());
    const status = ref("");
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
        status.value = config.value.readOnlyStatus;
        return;
      }
      const date = entryDate.value;
      const weight = combineWeight(entryWeightInt.value, entryWeightDec.value);
      if (!date) {
        status.value = "日付を入力してください。";
        return;
      }

      const enteredAt = currentEnteredAt();
      saving.value = true;
      status.value = "保存中…";
      try {
        await config.value.saveOne(props.uid, date, weight, enteredAt);
        emit("saved", { date, weight, enteredAt });
        status.value = config.value.savedMessage(date);
        if (props.kind === "target") {
          entryDate.value = defaultTargetDate([
            ...props.rows,
            { date, weight, enteredAt },
          ]);
        }
      } catch (error) {
        status.value = `保存に失敗しました: ${error.message}`;
      } finally {
        saving.value = false;
      }
    }

    function isEditing(row) {
      return props.canEdit && editingDate.value === row.date;
    }

    function startEdit(row) {
      if (!props.canEdit) return;
      cancelDelete();
      const weight = splitWeight(row.weight);
      editingDate.value = row.date;
      editDate.value = row.date;
      editWeightInt.value = weight.int;
      editWeightDec.value = weight.dec;
      status.value = config.value.editingMessage(row.date);
    }

    function cancelEdit() {
      editingDate.value = null;
      editDate.value = "";
      editingSaving.value = false;
    }

    async function handleRowSave(row) {
      if (!props.canEdit) {
        status.value = config.value.readOnlyStatus;
        return;
      }
      const previousDate = editingDate.value || row.date;
      const date = editDate.value;
      const weight = combineWeight(editWeightInt.value, editWeightDec.value);
      if (!date) {
        status.value = "日付を入力してください。";
        return;
      }

      const enteredAt = currentEnteredAt();
      editingSaving.value = true;
      status.value = "保存中…";
      try {
        await config.value.saveOne(props.uid, date, weight, enteredAt);
        if (previousDate !== date) {
          await config.value.deleteOne(props.uid, previousDate);
        }
        emit("saved", { date, weight, enteredAt, previousDate });
        cancelEdit();
        status.value = config.value.savedMessage(date);
      } catch (error) {
        status.value = `保存に失敗しました: ${error.message}`;
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
        status.value = config.value.readOnlyStatus;
        return;
      }
      cancelDelete();
      status.value = "削除中…";
      try {
        await config.value.deleteOne(props.uid, row.date);
        emit("deleted", { date: row.date });
        status.value = config.value.deletedMessage(row);
      } catch (error) {
        status.value = `削除に失敗しました: ${error.message}`;
      }
    }

    const bulkOpen = ref(false);
    const bulkText = ref("");
    const bulkStatus = ref("");
    const importing = ref(false);

    function openImportDialog() {
      if (!props.canEdit) return;
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
      const rows = withEnteredAt(parsed);
      importing.value = true;
      bulkStatus.value = `${rows.length}件を登録中…`;
      try {
        await config.value.saveMany(props.uid, rows);
        emit("imported", rows);
        bulkStatus.value = `${rows.length}件を登録しました。`;
        bulkText.value = "";
        bulkOpen.value = false;
      } catch (error) {
        bulkStatus.value = `登録に失敗しました: ${error.message}`;
      } finally {
        importing.value = false;
      }
    }

    return {
      config,
      bulkTitleId,
      entryDate,
      entryWeightInt,
      entryWeightDec,
      editDate,
      editWeightInt,
      editWeightDec,
      intOptions,
      decOptions,
      status,
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
      formatEnteredAt,
      handleSave,
      isEditing,
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
      openImportDialog,
      closeImportDialog,
      handleImport,
    };
  },
};
</script>
