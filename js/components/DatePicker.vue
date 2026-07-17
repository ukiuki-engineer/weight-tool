<template>
  <input
    ref="inputRef"
    type="text"
    :class="inputClass"
    :value="modelValue"
    :required="required"
    autocomplete="off"
    inputmode="numeric"
  />
</template>

<script>
// FlatpickrをVueのv-modelで扱う共通日付入力。
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getJapaneseHolidayName } from "@weight-tool/japanese-holidays";

function decorateWeekdays(instance) {
  instance.calendarContainer?.querySelectorAll(".flatpickr-weekday").forEach((element) => {
    const label = element.textContent.trim();
    element.classList.toggle("jpSundayHeader", label === "日");
    element.classList.toggle("jpSaturdayHeader", label === "土");
  });
}

function decorateDay(_selectedDates, _dateString, _instance, dayElement) {
  const date = dayElement.dateObj;
  if (!(date instanceof Date)) return;

  const day = date.getDay();
  dayElement.classList.toggle("jpSunday", day === 0);
  dayElement.classList.toggle("jpSaturday", day === 6);

  const holidayName = getJapaneseHolidayName(date);
  dayElement.classList.toggle("jpHoliday", Boolean(holidayName));
  if (holidayName) {
    dayElement.dataset.holidayName = holidayName;
    dayElement.title = holidayName;
  } else {
    delete dayElement.dataset.holidayName;
    dayElement.removeAttribute("title");
  }
}

export default {
  name: "DatePicker",
  props: {
    modelValue: { type: String, default: "" },
    inputClass: { type: String, default: "" },
    altFormat: { type: String, default: "Y年m月d日" },
    required: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const inputRef = ref(null);
    let picker = null;

    function emitFromInput() {
      emit("update:modelValue", inputRef.value?.value || "");
    }

    onMounted(() => {
      if (!inputRef.value || !window.flatpickr) {
        inputRef.value?.addEventListener("change", emitFromInput);
        return;
      }

      picker = window.flatpickr(inputRef.value, {
        altInput: true,
        altInputClass: `${props.inputClass} datePickerAlt`.trim(),
        altFormat: props.altFormat,
        dateFormat: "Y-m-d",
        defaultDate: props.modelValue || undefined,
        allowInput: true,
        disableMobile: true,
        locale: window.flatpickr.l10ns?.ja || undefined,
        onReady(_selectedDates, _dateString, instance) {
          decorateWeekdays(instance);
        },
        onDayCreate: decorateDay,
        onChange(_selectedDates, dateString) {
          emit("update:modelValue", dateString);
        },
        onClose(_selectedDates, dateString) {
          emit("update:modelValue", dateString);
        },
      });
    });

    watch(() => props.modelValue, (value) => {
      if (picker) {
        picker.setDate(value || null, false, "Y-m-d");
      } else if (inputRef.value && inputRef.value.value !== value) {
        inputRef.value.value = value || "";
      }
    });

    onBeforeUnmount(() => {
      inputRef.value?.removeEventListener("change", emitFromInput);
      picker?.destroy();
      picker = null;
    });

    return { inputRef };
  },
};
</script>
