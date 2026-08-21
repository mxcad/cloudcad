<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { t } from '@/languages';
import { useVersionHistory, type VersionEntry } from '../../../composables/useVersionHistory';
import FloatingPopup from "../../../components/FloatingPopup.vue"

const emit = defineEmits<{
  (e: 'close'): void;
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
  loadHistory();
});

function onClose() {
  show.value = false;
  reset();
  emit('close');
}

function onSelectVersion(entry: VersionEntry) {
  openHistoricalVersion(entry.revision);
  onClose();
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
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

    <div v-else-if="error" class="error-state">
      <van-icon name="warning-o" color="var(--danger)" size="40" />
      <p>{{ error }}</p>
      <van-button size="small" @click="loadHistory">{{ t('重试') }}</van-button>
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
            <span class="version-date">{{ formatDate(entry.date) }}</span>
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
