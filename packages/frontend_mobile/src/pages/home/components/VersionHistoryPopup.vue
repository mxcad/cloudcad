<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useVersionHistory, type VersionEntry } from '../../../composables/useVersionHistory';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const show = ref(true);
const { loading, entries, error, loadHistory, openHistoricalVersion, reset } = useVersionHistory();

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
  <van-popup
    :show="show"
    position="bottom"
    round
    :style="{ height: '80vh' }"
    @close="onClose"
  >
    <div class="popup-header">
      <span class="popup-title">版本历史</span>
      <button class="popup-close" @click="onClose">✕</button>
    </div>

    <div class="popup-body">
      <van-loading v-if="loading" style="margin-top: 40px;" />

      <div v-else-if="error" class="error-state">
        <van-icon name="warning-o" color="#ff4444" size="40" />
        <p>{{ error }}</p>
        <van-button size="small" @click="loadHistory">重试</van-button>
      </div>

      <template v-else-if="entries.length === 0">
        <van-empty description="暂无版本历史" />
      </template>

      <div v-else class="version-list">
        <div
          v-for="entry in entries"
          :key="entry.revision"
          class="version-item"
          @click="onSelectVersion(entry)"
        >
          <div class="version-revision">r{{ entry.revision }}</div>
          <div class="version-info">
            <div class="version-message">{{ entry.message || '无说明' }}</div>
            <div class="version-meta">
              <span class="version-author">{{ entry.author || entry.userName || '未知' }}</span>
              <span class="version-date">{{ formatDate(entry.date) }}</span>
            </div>
          </div>
          <van-icon name="arrow" class="version-arrow" />
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.popup-title {
  font-size: 18px;
  font-weight: 600;
}

.popup-close {
  background: none;
  border: none;
  font-size: 16px;
  padding: 4px 8px;
}

.popup-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.error-state {
  text-align: center;
  padding: 40px 16px;
  color: #666;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background: #f8f8f8;
  cursor: pointer;
  transition: background 0.2s;
}

.version-item:active {
  background: #eee;
}

.version-revision {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #1989fa;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
  margin-right: 12px;
}

.version-info {
  flex: 1;
  min-width: 0;
}

.version-message {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #999;
}

.version-arrow {
  color: #ccc;
  flex-shrink: 0;
}
</style>
