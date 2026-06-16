<script setup lang="ts">
import { ref } from 'vue';
import DialogBase from '../../../components/DialogBase.vue';

const emit = defineEmits<{
  (e: 'confirm', message: string): void;
  (e: 'cancel'): void;
}>();

const show = ref(true);
const commitMessage = ref('');

function onConfirm() {
  emit('confirm', commitMessage.value);
  show.value = false;
}

function onCancel() {
  emit('cancel');
  show.value = false;
}
</script>

<template>
  <DialogBase
    :show="show"
    title="保存文件"
    show-cancel-button
    confirm-text="保存"
    @confirm="onConfirm"
    @cancel="onCancel"
  >
    <van-field
      v-model="commitMessage"
      type="textarea"
      rows="2"
      placeholder="修改说明（可选）"
      autosize
    />
  </DialogBase>
</template>
