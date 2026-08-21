<script setup lang="ts">
import { ref } from 'vue';
import { t } from '@/languages';

const props = withDefaults(defineProps<{
  waiting?: boolean;
}>(), {
  waiting: false,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'login'): void;
}>();

const show = ref(true);

function onLogin() {
  emit('login');
}

function onClose() {
  show.value = false;
  emit('close');
}
</script>

<template>
  <van-dialog
    :show="show"
    :title="t('需要登录')"
    :show-confirm-button="false"
    :show-cancel-button="false"
    closeable
    :close-on-click-overlay="!waiting"
    @close="onClose"
    @update:show="onClose"
  >
    <div v-if="!waiting" class="login-prompt-body">
      <div class="login-prompt-icon">
        <van-icon name="contact" size="52" />
      </div>
      <p class="login-prompt-title">{{ t('需要登录') }}</p>
      <p class="login-prompt-desc">{{ t('请先登录后再执行此操作') }}</p>
    </div>
    <div v-else class="login-prompt-body">
      <van-loading type="spinner" size="48" color="var(--primary)" />
      <p class="login-prompt-title">{{ t('正在跳转登录...') }}</p>
      <p class="login-prompt-desc">{{ t('请在打开的页面中完成登录') }}</p>
    </div>
    <template #footer>
      <van-button
        v-if="!waiting"
        type="primary"
        block
        round
        size="large"
        @click="onLogin"
      >
        {{ t('前往登录') }}
      </van-button>
      <van-button
        v-else
        plain
        block
        round
        size="large"
        @click="onClose"
      >
        {{ t('取消等待') }}
      </van-button>
    </template>
  </van-dialog>
</template>

<style scoped lang="scss">
.login-prompt-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-lg) 0 0;
}

.login-prompt-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  color: var(--primary);
  margin-bottom: var(--space-md);
}

.login-prompt-title {
  margin: 0;
  font-size: var(--font-size-title);
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

.login-prompt-desc {
  margin: var(--space-xs) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  text-align: center;
}
</style>