<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { t } from '@/languages';
import { useCooperate } from '../../../composables/useCooperate';
import { useUser } from '../../../composables/useUser';
import FloatingPopup from "../../../components/FloatingPopup.vue"

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

function mapUser(u: { id: string; username: string; avatar?: string } | null) {
  if (!u) return undefined;
  return { id: u.id, name: u.username, avatar: u.avatar };
}

function handleCreateWork() {
  createWork(mapUser(user.value));
}

function handleJoinWork(workId: number) {
  joinWork(workId, mapUser(user.value));
}

function handleExitWork() {
  exitWork();
}

function handleClose() {
  show.value = false;
  emit('close');
}

function getWorkName(work: Pick<Work, 'work_data' | 'work_id'>): string {
  const data = parseWorkData(work.work_data);
  if (data?.drawingId) {
    return `图纸 ${data.drawingId.slice(0, 8)}...`;
  }
  return `协同 #${work.work_id}`;
}
</script>

<template>
  <FloatingPopup
    v-model:show="show"
    :title="t('实时协同')"
    @close="handleClose"
  >
    <div class="cooperate-body">
      <div v-if="!isCadReady" class="cooperate-status">
        <van-icon name="warning-o" size="32" color="var(--text-muted)" />
        <p>{{ t('CAD 引擎未就绪') }}</p>
      </div>

      <div v-else-if="currentWorkId !== null" class="cooperate-session">
        <div class="cooperate-session-info">
          <van-icon name="friends-o" size="24" color="var(--success)" />
          <span>{{ t('当前协同') }}: {{ currentWorkId }}</span>
        </div>
        <van-button size="small" type="danger" plain @click="handleExitWork">
          {{t('退出')}}
        </van-button>
      </div>

      <div v-else-if="loading" class="cooperate-status">
        <van-loading />
        <p>{{ t('加载中...') }}</p>
      </div>

      <div v-else-if="works.length === 0" class="cooperate-status">
        <van-icon name="info-o" size="32" color="var(--text-muted)" />
        <p>{{ t('暂无可用协同') }}</p>
        <span class="cooperate-hint">{{ t('点击"创建协同"开始协作') }}</span>
      </div>

      <div v-else class="cooperate-list">
        <div class="cooperate-list-title">{{ t('可用协同') }} ({{ works.length }})</div>
        <div
          v-for="work in works"
          :key="work.work_id"
          class="cooperate-list-item"
        >
          <div class="cooperate-list-item-info">
            <van-icon name="friends-o" size="20" color="var(--primary)" />
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
            {{ t('加入') }}
          </van-button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="cooperate-footer">
        <van-button
          size="small"
          type="primary"
          :disabled="!isCadReady || connecting"
          :loading="connecting"
          @click="handleCreateWork"
        >
          {{ t('创建协同') }}
        </van-button>
        <van-button
          size="small"
          plain
          :disabled="loading"
          :loading="loading"
          @click="fetchWorks"
        >
          {{ t('刷新列表') }}
        </van-button>
      </div>
    </template>
  </FloatingPopup>
</template>

<style scoped lang="scss">
.cooperate-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.cooperate-footer {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  padding-bottom: calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
}

.cooperate-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  color: var(--text-tertiary);
  font-size: var(--font-size-body);
}

.cooperate-hint {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.cooperate-session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: var(--space-md) var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  font-size: var(--font-size-body);
}

.cooperate-session-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-body);
  font-weight: 500;
}

.cooperate-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-lg) var(--space-md);
}

.cooperate-list-title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-tertiary);
  margin-bottom: var(--space-sm);
}

.cooperate-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-sm);
}

.cooperate-list-item-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-body);
  color: var(--text-primary);
}
</style>
