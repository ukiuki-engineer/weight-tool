<template>
  <RecordManagerView
    kind="target"
    :rows="records.targets"
    :fallback-weights="records.weights"
    :uid="uid"
    :can-edit="canEdit"
    @saved="$emit('saved', $event)"
    @deleted="$emit('deleted', $event)"
    @imported="$emit('imported', $event)"
  />
</template>

<script>
import RecordManagerView from "../components/RecordManager.vue";

export default {
  name: "Target",
  components: { RecordManagerView },
  props: {
    records: { type: Object, required: true },
    uid: { type: String, required: true },
    canEdit: { type: Boolean, default: true },
  },
  emits: ["saved", "deleted", "imported"],
};
</script>
