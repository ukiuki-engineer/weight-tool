<template>
  <div
    v-if="notice"
    class="appNotice"
    :class="[`appNotice-${notice.type}`, { 'appNotice-leaving': leaving }]"
    role="status"
    aria-live="polite"
  >
    {{ notice.message }}
  </div>
</template>

<script>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { clearNotice, subscribeNotices } from "@weight-tool/notification";

const FADE_DURATION = 500;

export default {
  name: "AppNotice",
  setup() {
    const notice = ref(null);
    const leaving = ref(false);
    let unsubscribe = null;
    let leaveTimer = null;
    let removeTimer = null;

    function clearTimers() {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    }

    function displayNotice(nextNotice) {
      clearTimers();
      notice.value = nextNotice;
      leaving.value = false;
      leaveTimer = setTimeout(() => {
        leaving.value = true;
      }, nextNotice.duration);
      removeTimer = setTimeout(() => {
        clearNotice(nextNotice.id);
        if (notice.value?.id === nextNotice.id) notice.value = null;
      }, nextNotice.duration + FADE_DURATION);
    }

    onMounted(() => {
      unsubscribe = subscribeNotices(displayNotice);
    });

    onBeforeUnmount(() => {
      clearTimers();
      unsubscribe?.();
    });

    return { notice, leaving };
  },
};
</script>
