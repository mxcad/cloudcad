<script setup lang="ts">
/**
 * 通知弹框（移动端）。
 *
 * 直接消费 useNoticeStream()，App.vue 只需挂一个 <NoticeDialog />。
 * title/body 按后端原文渲染（不走 t()）：管理员按目标语言填写公告，前端不二次翻译。
 * 只有固定 UI 文案（按钮）走 i18n。
 *
 * close-on-click-overlay=false：这是系统公告不是随手可关的提示，点遮罩不算确认。
 * 无右上角关闭按钮：与 PC 端一致，停机公告关掉就等于错过。
 */
import { computed } from 'vue';
import { t } from '@/languages';
import { useNoticeStream, type Notice } from '@/composables/useNoticeStream';

const { active, acknowledge } = useNoticeStream();

const LEVEL_COLOR: Record<string, string> = {
  info: '#009cff',
  warning: '#d97706',
  danger: '#ef4444',
};

const show = computed(() => active.value !== null);

const accentColor = computed(() => {
  const notice = active.value;
  return (notice && LEVEL_COLOR[notice.level]) || LEVEL_COLOR.info;
});

function confirm(notice: Notice) {
  acknowledge(notice);
}
</script>

<template>
  <van-dialog
    :show="show"
    :title="active?.title ?? ''"
    :show-confirm-button="false"
    :show-cancel-button="false"
    :close-on-click-overlay="false"
    class="notice-dialog"
  >
    <div
      v-if="active"
      class="notice-body"
      :style="{ borderColor: accentColor }"
    >
      <p class="notice-text">{{ active.body }}</p>
    </div>
    <template #footer>
      <van-button
        type="primary"
        block
        round
        size="large"
        :disabled="!active"
        @click="active && confirm(active)"
      >
        {{ t('知道了') }}
      </van-button>
    </template>
  </van-dialog>
</template>

<style scoped lang="scss">
.notice-body {
  padding: var(--space-md) var(--space-lg) var(--space-lg);
  border-top: 3px solid var(--primary);
}

.notice-text {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
