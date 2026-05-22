<script setup lang="ts">
import { ref } from 'vue';

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
  <van-dialog
    v-model:show="show"
    title="保存文件"
    show-cancel-button
    confirm-button-text="保存"
    @confirm="onConfirm"
    @cancel="onCancel"
  >
    <div style="padding: 16px;">
      <van-field
        v-model="commitMessage"
        type="textarea"
        rows="2"
        placeholder="修改说明（可选）"
        autosize
      />
    </div>
  </van-dialog>
</template>
