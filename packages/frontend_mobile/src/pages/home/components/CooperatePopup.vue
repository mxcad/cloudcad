<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useCooperate } from '../../../composables/useCooperate';
import { useUser } from '../../../composables/useUser';

interface Work {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
}

interface CollaborateWorkData {
  v: 1;
  drawingId: string;
  projectId: string | null;
}

function parseWorkData(raw: string): CollaborateWorkData | null {
  try {
    const parsed = JSON.parse(atob(raw));
    if (parsed && parsed.v === 1 && typeof parsed.drawingId === 'string') {
      return parsed as CollaborateWorkData;
    }
  } catch {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1 && typeof parsed.drawingId === 'string') {
        return parsed as CollaborateWorkData;
      }
    } catch {
      return null;
    }
  }
  return null;
}

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { user } = useUser();

const {
  isCadReady,
  works,
  currentWorkId,
  loading,
  connecting,
  fetchWorks,
  createWork,
  joinWork,
  exitWork,
} = useCooperate();

const show = ref(true);

onMounted(() => {
  fetchWorks();
});

function handleCreateWork() {
  createWork(user.value ?? undefined);
}

function handleJoinWork(workId: number) {
  joinWork(workId, user.value ?? undefined);
}

function handleExitWork() {
  exitWork();
}

function handleClose() {
  show.value = false;
  emit('close');
}

function getWorkName(work: Work): string {
  const data = parseWorkData(work.work_data);
  if (data?.drawingId) {
    return `图纸 ${data.drawingId.slice(0, 8)}...`;
  }
  return `协同 #${work.work_id}`;
}
</script>

<template>
  <van-popup
    v-model:show="show"
    position="bottom"
    round
    :style="{ height: '60vh' }"
    closeable
    title="实时协同"
    @close="handleClose"
  >
    <div class="cooperate-container">
      <div class="cooperate-header">
        <span class="cooperate-title">实时协同</span>
        <div class="cooperate-actions">
          <van-button
            size="small"
            type="primary"
            :disabled="!isCadReady || connecting"
            :loading="connecting"
            @click="handleCreateWork"
          >
            创建协同
          </van-button>
          <van-button
            size="small"
            plain
            :disabled="loading"
            :loading="loading"
            @click="fetchWorks"
            style="margin-left: 8px;"
          >
            刷新列表
          </van-button>
        </div>
      </div>

      <div v-if="!isCadReady" class="cooperate-status">
        <van-icon name="warning-o" size="32" color="#999" />
        <p>CAD 引擎未就绪</p>
      </div>

      <div v-else-if="currentWorkId !== null" class="cooperate-session">
        <div class="cooperate-session-info">
          <van-icon name="friends-o" size="24" color="#07c160" />
          <span>当前协同: {{ currentWorkId }}</span>
        </div>
        <van-button
          size="small"
          type="danger"
          plain
          @click="handleExitWork"
        >
          退出
        </van-button>
      </div>

      <div v-else-if="loading" class="cooperate-status">
        <van-loading />
        <p>加载中...</p>
      </div>

      <div v-else-if="works.length === 0" class="cooperate-status">
        <van-icon name="info-o" size="32" color="#999" />
        <p>暂无可用协同</p>
        <span class="cooperate-hint">点击"创建协同"开始协作</span>
      </div>

      <div v-else class="cooperate-list">
        <div class="cooperate-list-title">可用协同 ({{ works.length }})</div>
        <div
          v-for="work in works"
          :key="work.work_id"
          class="cooperate-list-item"
        >
          <div class="cooperate-list-item-info">
            <van-icon name="friends-o" size="20" color="#1989fa" />
            <span>{{ getWorkName(work) }}</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            :disabled="connecting"
            :loading="connecting"
            @click="handleJoinWork(work.work_id)"
          >
            加入
          </van-button>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.cooperate-container {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.cooperate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.cooperate-title {
  font-size: 18px;
  font-weight: 600;
}

.cooperate-actions {
  display: flex;
}

.cooperate-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #999;
}

.cooperate-hint {
  font-size: 12px;
  color: #bbb;
}

.cooperate-session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f0f9f0;
  border-radius: 8px;
  margin-bottom: 16px;
}

.cooperate-session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.cooperate-list {
  flex: 1;
  overflow-y: auto;
}

.cooperate-list-title {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin-bottom: 8px;
}

.cooperate-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 8px;
}

.cooperate-list-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
</style>
