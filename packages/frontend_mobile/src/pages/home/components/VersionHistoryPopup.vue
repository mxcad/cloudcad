<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { t } from '@/languages';
import { relativeTime } from '@cloudcad/platform';
import { useVersionHistory, type VersionEntry } from '../../../composables/useVersionHistory';
import FloatingPopup from "../../../components/FloatingPopup.vue"

const props = withDefaults(
  defineProps<{
    /** 显式目标（列表内入口：文件未打开编辑器）；缺省走编辑器当前图纸 */
    target?: { projectId: string; filePath: string; fileId?: string }
  }>(),
  { target: undefined }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** 列表内入口选中历史版本：由页面负责打开该文件（带 ?v= 版本号） */
  (e: 'open-version', payload: { nodeId: string; revision: number }): void;
}>();

const show = ref(true);
const { loading, entries, totalCount, error, loadHistory, openHistoricalVersion, reset } = useVersionHistory();

// 后端返回时间正序 [r0(初始), r1, ..., rN]，渲染反转（顶部最新、底部 r0）
const displayEntries = computed(() =>
  [...entries.value].reverse().map((entry, index) => ({
    entry,
    versionIndex: entry.revision === -1 ? 0 : totalCount.value - index,
  }))
);

onMounted(() => {
  loadHistory(props.target);
});

function onClose() {
  show.value = false;
  reset();
  emit('close');
}

// E-25 预热：选中版本后保持弹窗显示「准备中」，待文件加载（含转换）完成再关
const preparing = ref(false);

async function onSelectVersion(entry: VersionEntry) {
  if (props.target?.fileId) {
    // 列表内入口：文件未打开编辑器，交给页面走统一打开入口（URL 带 ?v= 版本号）
    emit('open-version', { nodeId: props.target.fileId, revision: entry.revision });
    onClose();
    return;
  }
  preparing.value = true;
  try {
    await openHistoricalVersion(entry.revision);
  } finally {
    preparing.value = false;
    onClose();
  }
}

// E-25 相对时间：对齐 PC VersionHistoryModal，口径收敛到 @cloudcad/platform relativeTime
function formatRelativeTime(dateStr: string): string {
  const r = relativeTime(dateStr);
  if (r.tier === 'just_now') return t('刚刚');
  switch (r.unit) {
    case 'minute': return t('{n} 分钟前', { n: r.value });
    case 'hour': return t('{n} 小时前', { n: r.value });
    case 'day': return t('{n} 天前', { n: r.value });
    case 'week': return t('{n} 周前', { n: r.value });
    case 'month': return t('{n} 个月前', { n: r.value });
    case 'year': return t('{n} 年前', { n: r.value });
    default: return dateStr;
  }
}
</script>

<template>
  <FloatingPopup
    v-model:show="show"
    :title="t('版本历史')"
    @close="onClose"
  >
    <van-loading v-if="loading" class="loading-state" />

    <div v-else-if="preparing" class="loading-state">
      <van-loading size="24" />
      <p class="preparing-text">{{ t('正在准备历史版本文件，请稍候...') }}</p>
    </div>

    <div v-else-if="error" class="error-state">
      <van-icon name="warning-o" color="var(--danger)" size="40" />
      <p>{{ error }}</p>
      <van-button size="small" @click="loadHistory(target)">{{ t('重试') }}</van-button>
    </div>

    <template v-else-if="entries.length === 0">
      <van-empty :description="t('暂无版本历史')" />
    </template>

    <div v-else class="version-list">
      <div
        v-for="({ entry, versionIndex }, index) in displayEntries"
        :key="index"
        class="version-item"
        @click="onSelectVersion(entry)"
      >
        <div class="version-revision">r{{ versionIndex }}</div>
        <div class="version-info">
          <div class="version-message">{{ entry.message || t('无说明') }}</div>
          <div class="version-meta">
            <span class="version-author">{{ entry.author || entry.userName || t('未知') }}</span>
            <span class="version-date">{{ formatRelativeTime(entry.date) }}</span>
          </div>
        </div>
        <van-icon name="arrow" class="version-arrow" />
      </div>
    </div>
  </FloatingPopup >
</template>

<style scoped lang="scss">
.loading-state {
  margin-top: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.preparing-text {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.error-state {
  text-align: center;
  padding: 40px var(--space-lg);
  color: var(--text-tertiary);
  font-size: var(--font-size-body);
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
}

.version-item {
  display: flex;
  align-items: center;
  padding: var(--space-md);
  border-radius: var(--popup-card-radius);
  background: var(--popup-card-bg);
  border: var(--popup-card-border);
  cursor: pointer;
  transition: background 0.2s;
}

.version-item:active {
  background: var(--active-color);
}

.version-revision {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: var(--font-size-sm);
  flex-shrink: 0;
  margin-right: var(--space-md);
}

.version-info {
  flex: 1;
  min-width: 0;
}

.version-message {
  font-size: var(--font-size-body);
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.version-meta {
  display: flex;
  gap: var(--space-md);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.version-arrow {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
</style>
