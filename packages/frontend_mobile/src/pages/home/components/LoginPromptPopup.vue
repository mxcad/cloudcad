<script setup lang="ts">
import { ref } from 'vue';
import { t } from '@/languages';
import DialogBase from '../../../components/DialogBase.vue';

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
  <DialogBase
    :show="show"
    :title="t('需要登录')"
    closeable
    :close-on-click-overlay="!waiting"
    @close="onClose"
  >
    <div v-if="!waiting" class="login-prompt-body">
      <van-icon name="contact" size="48" color="var(--primary)" />
      <p class="login-prompt-text">{{ t('请先登录后再执行此操作') }}</p>
    </div>
    <div v-else class="login-prompt-body">
      <van-loading type="spinner" size="48" color="var(--primary)" />
      <p class="login-prompt-text">{{ t('请在打开的页面中完成登录...') }}</p>
    </div>
    <template #footer>
      <div v-if="!waiting" class="login-prompt-footer">
        <van-button type="primary" block @click="onLogin">
          {{ t('前往登录') }}
        </van-button>
        <van-button plain block @click="onClose">
          {{ t('取消') }}
        </van-button>
      </div>
      <div v-else class="login-prompt-footer">
        <van-button plain block @click="onClose">
          {{ t('取消等待') }}
        </van-button>
      </div>
    </template>
  </DialogBase>
</template>

<style scoped lang="scss">
.login-prompt-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-xl) var(--space-lg) var(--space-lg);
}

.login-prompt-text {
  margin-top: var(--space-md);
  font-size: var(--font-size-body);
  color: var(--text-tertiary);
  text-align: center;
}

.login-prompt-footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-lg) var(--space-lg);
}
</style>
