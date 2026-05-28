<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'login'): void;
}>();

const show = ref(true);

function onLogin() {
  show.value = false;
  emit('login');
}

function onClose() {
  show.value = false;
  emit('close');
}
</script>

<template>
  <van-dialog
    v-model:show="show"
    title="需要登录"
    :show-confirm-button="false"
    :show-cancel-button="false"
    closeable
    @close="onClose"
  >
    <div class="login-prompt-body">
      <van-icon name="contact" size="48" color="#1989fa" />
      <p class="login-prompt-text">请先登录后再执行此操作</p>
    </div>
    <template #footer>
      <div class="login-prompt-footer">
        <van-button type="primary" block @click="onLogin">
          前往登录
        </van-button>
        <van-button plain block style="margin-top: 8px;" @click="onClose">
          取消
        </van-button>
      </div>
    </template>
  </van-dialog>
</template>

<style scoped>
.login-prompt-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 16px;
}

.login-prompt-text {
  margin-top: 12px;
  font-size: 14px;
  color: #666;
  text-align: center;
}

.login-prompt-footer {
  padding: 0 16px 16px;
}
</style>
