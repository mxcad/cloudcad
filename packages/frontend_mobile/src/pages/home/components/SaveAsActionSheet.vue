<script setup lang="ts">
import { ref } from 'vue';

export interface SaveAsOption {
  label: string;
  value: 'personal' | 'project' | 'library-drawing' | 'library-block';
  disabled?: boolean;
}

const props = defineProps<{
  options: SaveAsOption[];
}>();

const emit = defineEmits<{
  (e: 'select', value: string): void;
  (e: 'cancel'): void;
}>();

const show = ref(true);

function onSelect(item: { value: string }) {
  emit('select', item.value);
  show.value = false;
}

function onCancel() {
  emit('cancel');
  show.value = false;
}
</script>

<template>
  <van-action-sheet
    v-model:show="show"
    title="另存为"
    :actions="options"
    cancel-text="取消"
    @select="onSelect"
    @cancel="onCancel"
  />
</template>
