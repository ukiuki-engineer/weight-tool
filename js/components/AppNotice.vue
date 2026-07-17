<template>
  <div
    v-if="notice"
    class="appNotice"
    :class="[
      `appNotice-${notice.type}`,
      {
        'appNotice-entering': entering,
        'appNotice-leaving': leaving,
      },
    ]"
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
    const entering = ref(false);
    const leaving = ref(false);
    let unsubscribe = null;
    let enterFrame = null;
    let leaveTimer = null;
    let removeTimer = null;

    function clearTimers() {
      if (enterFrame !== null) {
        cancelAnimationFrame(enterFrame);
        enterFrame = null;
      }
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    }

    function displayNotice(nextNotice) {
      clearTimers();
      entering.value = true;
      notice.value = nextNotice;
      leaving.value = false;
      enterFrame = requestAnimationFrame(() => {
        enterFrame = requestAnimationFrame(() => {
          entering.value = false;
          enterFrame = null;
        });
      });
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

    return { notice, entering, leaving };
  },
};
</script>
