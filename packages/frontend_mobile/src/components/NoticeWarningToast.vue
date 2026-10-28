<script setup lang="ts">
/**
 * 通知 warning 轻提示（移动端）：toast，不弹框。
 *
 * 与 PC 端三级分流契约一致（见 frontend NoticeProvider）：danger 弹框阻塞、
 * warning 用轻提示、info 只在列表可见不主动呈现。移动端没有通知列表，warning
 * 提示即其唯一呈现通道（无点击跳转）。
 *
 * 队列推进逻辑（一次一条 / 展示即 ack / 消失后下一条）收编为纯模块
 * createWarningToastQueue（utils/warningToastQueue.ts），本组件只注入
 * vant showToast 作为展示动作。与 NoticeDialog 共享 useNoticeStream 的
 * 模块级状态（acks），互不冲突。App.vue 只需挂一个 <NoticeWarningToast />。
 */
import { onUnmounted, watch } from 'vue';
import { showToast } from 'vant';
import { useNoticeStream } from '@/composables/useNoticeStream';
import { createWarningToastQueue } from '@/utils/warningToastQueue';

/** warning 提示展示时长：比普通操作反馈（3s）长，公告正文需要阅读时间 */
const WARNING_TOAST_DURATION_MS = 8000;

const { warnings, acknowledge } = useNoticeStream();

const queue = createWarningToastQueue({
  getWarnings: () => warnings.value,
  acknowledge,
  show: (notice) =>
    showToast({ message: notice.title, duration: WARNING_TOAST_DURATION_MS }),
  durationMs: WARNING_TOAST_DURATION_MS,
});

watch(warnings, () => queue.maybeShowNext(), { immediate: true });

onUnmounted(() => queue.dispose());
</script>

<template>
  <!-- 纯副作用组件：无可见内容，toast 由 vant 全局渲染 -->
  <span v-if="false" aria-hidden="true" />
</template>
