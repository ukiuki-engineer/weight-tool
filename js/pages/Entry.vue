<template>
  <RecordManagerView
    kind="weight"
    :rows="records.weights"
    :uid="uid"
    :can-edit="true"
    @saved="$emit('saved', $event)"
    @deleted="$emit('deleted', $event)"
    @imported="$emit('imported', $event)"
  />
</template>

<script>
import RecordManagerView from "../components/RecordManager.vue";

export default {
  name: "Entry",
  components: { RecordManagerView },
  props: {
    records: { type: Object, required: true },
    uid: { type: String, required: true },
  },
  emits: ["saved", "deleted", "imported"],
};
</script>
