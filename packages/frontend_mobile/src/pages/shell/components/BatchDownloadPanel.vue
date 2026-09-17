<script setup lang="ts">
/**
 * 批量下载任务面板（A-07）—— 底部弹窗：任务列表 + 进度条 + 取消/重试/下载。
 *
 * 数据源：useBatchDownload（batchDownloadControllerGetUserTasks + 3s 轮询）。
 * 状态：PENDING 等待 / PROCESSING 打包中 / COMPLETED 已完成 / FAILED 失败 / CANCELLED 已取消
 */
import { watch } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { t } from '@/languages'
import { useBatchDownload, type BatchTaskItem } from '@/composables/useBatchDownload'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const {
  tasks,
  loading,
  loadTasks,
  downloadZip,
  cancelTask,
  retryFailedItems,
  startPolling,
  stopPolling,
} = useBatchDownload()

watch(
  () => props.show,
  (v) => {
    if (v) {
      void loadTasks()
      startPolling()
    } else {
      stopPolling()
    }
  }
)

function statusText(status: string): string {
  switch (status) {
    case 'PENDING':
      return t('等待中')
    case 'PROCESSING':
      return t('打包中')
    case 'COMPLETED':
      return t('已完成')
    case 'FAILED':
      return t('失败')
    case 'CANCELLED':
      return t('已取消')
    default:
      return status
  }
}

function statusClass(status: string): string {
  if (status === 'COMPLETED') return 'ok'
  if (status === 'FAILED') return 'err'
  if (status === 'CANCELLED') return 'cancel'
  return 'busy'
}

function progress(task: BatchTaskItem): number {
  if (!task.totalCount) return 0
  return Math.min(100, Math.round((task.completedCount / task.totalCount) * 100))
}

function displayName(task: BatchTaskItem): string {
  return task.name || task.itemNames?.[0] || task.taskId.slice(0, 8)
}

function onDownload(task: BatchTaskItem) {
  downloadZip(task.taskId)
}

async function onCancel(task: BatchTaskItem) {
  try {
    await showConfirmDialog({
      title: t('取消任务'),
      message: t('确定取消该下载任务？'),
      confirmButtonText: t('取消任务'),
      cancelButtonText: t('返回'),
    })
  } catch {
    return // 用户返回
  }
  await cancelTask(task.taskId)
  showToast(t('已取消'))
}

async function onRetryFailed(task: BatchTaskItem) {
  await retryFailedItems(task.taskId)
  showToast(t('已重试失败项'))
}
</script>

<template>
  <van-popup v-model:show="props.show" position="bottom" round :style="{ height: '70%' }" @update:show="emit('update:show', $event)">
    <div class="bd-panel">
      <div class="panel-header">
        <span class="panel-title">{{ t('下载任务') }}</span>
        <button class="panel-close" @click="emit('update:show', false)">
          <van-icon name="cross" size="18" />
        </button>
      </div>

      <div v-if="loading && tasks.length === 0" class="bd-state">
        <van-loading size="24" />
        <span class="bd-state-text">{{ t('加载中...') }}</span>
      </div>

      <div v-else-if="tasks.length === 0" class="bd-state">
        <van-icon name="down" size="40" />
        <span class="bd-state-text">{{ t('暂无下载任务') }}</span>
      </div>

      <div v-else class="bd-list">
        <div v-for="task in tasks" :key="task.taskId" class="bd-item">
          <div class="bd-item-top">
            <span class="bd-item-name">{{ displayName(task) }}</span>
            <span class="bd-status" :class="statusClass(task.status)">{{ statusText(task.status) }}</span>
          </div>
          <div class="bd-progress-row">
            <van-progress
              class="bd-progress"
              :percentage="progress(task)"
              :show-percent="false"
              :color="task.status === 'FAILED' ? '#ee0a24' : task.status === 'COMPLETED' ? '#00a99e' : 'var(--accent)'"
            />
            <span class="bd-count">{{ task.completedCount }}/{{ task.totalCount }}</span>
          </div>
          <div v-if="task.errorCount" class="bd-error-count">{{ t('失败 {count} 项', { count: String(task.errorCount) }) }}</div>
          <div class="bd-actions">
            <button v-if="task.status === 'COMPLETED'" class="bd-btn primary" @click="onDownload(task)">
              {{ t('下载') }}
            </button>
            <button v-if="task.status === 'PENDING' || task.status === 'PROCESSING'" class="bd-btn" @click="onCancel(task)">
              {{ t('取消') }}
            </button>
            <button v-if="task.status === 'FAILED'" class="bd-btn" @click="onRetryFailed(task)">
              {{ t('重试失败项') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.bd-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 14px;
  border-bottom: 0.5px solid var(--divider);
  flex-shrink: 0;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-close {
  border: none;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
}

.bd-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--text-tertiary);
}

.bd-state-text {
  font-size: 13px;
}

.bd-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
}

.bd-item {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bd-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bd-item-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bd-status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 8px;
  flex-shrink: 0;

  &.ok {
    color: #00a99e;
    background: rgba(0, 169, 158, 0.14);
  }

  &.err {
    color: #ee0a24;
    background: rgba(238, 10, 36, 0.1);
  }

  &.cancel {
    color: var(--text-tertiary);
    background: rgba(255, 255, 255, 0.06);
  }

  &.busy {
    color: var(--accent);
    background: rgba(0, 169, 158, 0.14);
  }
}

.bd-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bd-progress {
  flex: 1;
}

.bd-count {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.bd-error-count {
  font-size: 12px;
  color: #ee0a24;
}

.bd-actions {
  display: flex;
  gap: 8px;
}

.bd-btn {
  padding: 6px 14px;
  border: 1px solid var(--divider);
  border-radius: 14px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }

  &.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
}
</style>
