<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { t } from '@/languages';
import { parseWorkData, getWorkCreator, parseUserData, type Work } from '../../../composables/useCooperate';
import { useUser } from '../../../composables/useUser';
import { useEditorStore } from '../../../stores/editor';
import { useCollabStore } from '../../../stores/collab';
import { storeToRefs } from 'pinia';
import { showConfirmDialog } from 'vant';
import FloatingPopup from '../../../components/FloatingPopup.vue';
import WorkCard, { type WorkDisplay } from '../../../components/WorkCard.vue';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { user } = useUser();
const editorStore = useEditorStore();
const collabStore = useCollabStore();

const {
  isCadReady,
  works,
  currentWorkId,
  loading,
  connecting,
  creating,
  joiningWorkId,
  fileNameCache,
  projectNameCache,
  myProjectIds,
} = storeToRefs(collabStore);

const { fetchWorks, createWork, joinWork, exitWork, startCadCheck, stopCadCheck } = collabStore;

const show = ref(true);

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  startCadCheck();
  fetchWorks(true);
  pollTimer = setInterval(() => fetchWorks(false), 8000);
});

onBeforeUnmount(() => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  stopCadCheck();
});

// --- 当前文件的协同 work ---
const currentFileWorks = computed(() => {
  const fileId = editorStore.state.fileId;
  // 本地图纸内容 MD5（本地文件打开时记录），作为本地协同识别标识
  const fileHash = editorStore.state.fileHash;
  const filtered = works.value.filter((w) => {
    const data = parseWorkData(w.work_data);
    if (!data) return false;
    if (data.v === 3 && data.sourceType === 'local') {
      if (fileId === '' && data.drawingId === '') {
        // 本地图纸（drawingId 为空串）：优先按内容 MD5 匹配，使同一张本地图纸的
        // 协同准确聚合；无 hash（历史数据）时回退到按创建者/参与者匹配
        if (fileHash) return data.fileHash === fileHash;
        return user.value && (data.creatorId === user.value.id || w.link_user_ids.includes(user.value.id));
      }
      return data.drawingId === fileId;
    }
    return data.drawingId === fileId;
  });
  if (currentWorkId.value !== null && !filtered.some((w) => w.work_id === currentWorkId.value)) {
    const activeWork = works.value.find((w) => w.work_id === currentWorkId.value);
    if (activeWork) return [...filtered, activeWork];
  }
  return filtered;
});

// ----------
function mapWorkToDisplay(w: Work): WorkDisplay {
  const data = parseWorkData(w.work_data);
  const creator = data ? getWorkCreator(data) : {};
  const sourceType = data && data.v === 3 ? data.sourceType : null;
  const drawingKey =
    sourceType === 'local' && data && data.v === 3
      ? data.fileHash || ''
      : (data?.drawingId || '');
  const drawingName = data?.drawingId && fileNameCache.value[data.drawingId]
    ? fileNameCache.value[data.drawingId]
    : (data && data.v === 3 ? data.drawingName : '') || t('未知图纸');
  const projectName = data?.projectId
    ? (projectNameCache.value[data.projectId] ?? t('未知项目'))
    : t('个人空间');

  const participants: { name: string; avatar?: string }[] = [];
  for (const ud of w.link_user_data) {
    try {
      const parsed = parseUserData(ud);
      if (parsed) participants.push({ name: parsed.name, avatar: parsed.avatar });
    } catch { /* ignore */ }
  }

  const base = window.location.origin + window.location.pathname.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('collabWorkId', String(w.work_id));
  if (data?.drawingId) params.set('drawingId', data.drawingId);
  if (data?.projectId) params.set('projectId', data.projectId);
  if (data?.v === 3 && data.libraryKey) params.set('library', data.libraryKey);
  const shareUrl = `${base}?${params.toString()}`;

  const isCurrentFile =
    data && data.v === 3 && data.sourceType === 'local'
      ? !!data.fileHash && data.fileHash === editorStore.state.fileHash
      : data?.drawingId === editorStore.state.fileId;

  return {
    work: w,
    projectName,
    drawingName,
    isCurrentFile,
    isJoined: currentWorkId.value === w.work_id,
    onlineCount: w.link_user_ids.length,
    creatorName: creator.name || '',
    participants,
    shareUrl,
    sourceType,
    drawingKey,
  };
}

const myWorks = computed(() =>
  works.value
    .filter((w) => user.value && w.real_user_id === user.value.id)
    .map(mapWorkToDisplay)
    .sort((a, b) => b.work.work_id - a.work.work_id),
);

const projectWorks = computed(() => {
  const myIds = new Set(myWorks.value.map((m) => m.work.work_id));
  return works.value
    .filter((w) => {
      if (myIds.has(w.work_id)) return false;
      const data = parseWorkData(w.work_data);
      if (!data) return false;
      if (data.v === 3 && (data.sourceType === 'local' || data.sourceType === 'my' || data.sourceType === 'share')) return false;
      if (!data.projectId) return false;
      return myProjectIds.value.includes(data.projectId);
    })
    .map(mapWorkToDisplay)
    .sort((a, b) => b.work.work_id - a.work.work_id)
});

const activeWork = computed(() =>
  currentWorkId.value !== null
    ? works.value.find((w) => w.work_id === currentWorkId.value)
    : null,
);

/** 按图纸唯一标识（本地=fileHash，云图=nodeId）聚合协同卡片 */
interface DrawingGroup {
  key: string;
  label: string;
  isLocal: boolean;
  items: WorkDisplay[];
}

function groupByDrawing(items: WorkDisplay[]): DrawingGroup[] {
  const order: string[] = [];
  const map = new Map<string, DrawingGroup>();
  for (const item of items) {
    const key = item.drawingKey || '__unknown__';
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: item.drawingName,
        isLocal: item.sourceType === 'local',
        items: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.items.push(item);
  }
  return order.map((k) => map.get(k)!);
}

const myDrawingGroups = computed(() => groupByDrawing(myWorks.value));
const projectDrawingGroups = computed(() => groupByDrawing(projectWorks.value));

const totalWorksCount = computed(() =>
  currentFileWorks.value.length + myWorks.value.length + projectWorks.value.length,
);

// --- Handlers ---

async function checkUnsavedBeforeAction(): Promise<boolean> {
  if (editorStore.state.isModified) {
    try {
      await showConfirmDialog({
        title: t('未保存的更改'),
        message: t('当前图纸有未保存的更改，确定要继续吗？'),
        confirmButtonText: t('确定'),
        cancelButtonText: t('取消'),
      });
    } catch {
      return false;
    }
  }
  return true;
}

function handleCreateWork() {
  if (creating.value || connecting.value) return;
  checkUnsavedBeforeAction().then((ok) => {
    if (ok) createWork(mapUser());
  });
}

function handleJoinWork(workId: number) {
  if (connecting.value) return;
  checkUnsavedBeforeAction().then((ok) => {
    if (ok) joinWork(workId, mapUser());
  });
}

async function handleExitWork() {
  try {
    await showConfirmDialog({
      title: t('退出协同'),
      message: t('确定要退出当前协同吗？'),
      confirmButtonText: t('确定'),
      cancelButtonText: t('取消'),
      zIndex: 2100,
    } as any);
    exitWork();
  } catch {
    // 用户取消
  }
}

function handleClose() {
  show.value = false;
  emit('close');
}

function handleRefresh() {
  fetchWorks(true);
}

function mapUser() {
  if (!user.value) return undefined;
  return { id: user.value.id, name: user.value.username, avatar: user.value.avatar };
}
</script>

<template>
  <FloatingPopup
    v-model:show="show"
    :title="t('实时协同')"
    @close="handleClose"
  >
    <!-- 顶部刷新栏 -->
    <div v-if="!(loading && works.length === 0)" class="toolbar">
      <span class="toolbar-status">
        <span v-if="currentWorkId !== null" class="status-dot" />
        {{ currentWorkId !== null ? t('协同中') : `${totalWorksCount}${t('个活跃协同')}` }}
      </span>
      <button class="toolbar-refresh" :disabled="loading" @click="handleRefresh">
        <van-icon name="replay" :class="{ 'spin': loading }" />
      </button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading && works.length === 0" class="state-box">
      <van-loading size="24px" />
      <p class="state-text">{{ t('加载中...') }}</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="works.length === 0" class="state-box">
      <van-icon name="friends-o" size="48"  />
      <p class="state-text">{{ t('暂无活跃协同') }}</p>
      <p class="state-desc">{{ t('创建协同以开始实时协作') }}</p>
    </div>

    <!-- 主内容 -->
    <div v-else class="card-list">
      <!-- 当前图纸 -->
      <div v-if="currentFileWorks.length > 0 && currentWorkId === null" class="group">
        <div class="group-title">{{ t('当前图纸') }}</div>
        <WorkCard
          v-for="w in currentFileWorks"
          :key="w.work_id"
          :display="mapWorkToDisplay(w)"
          :connecting="joiningWorkId === w.work_id"
          :show-footer="false"
          @join="handleJoinWork"
        />
      </div>

      <!-- 我创建的：按图纸聚合 -->
      <div v-if="myWorks.length > 0" class="group">
        <div class="group-title">{{ t('我创建的') }}</div>
        <div
          v-for="g in myDrawingGroups"
          :key="g.key"
          class="drawing-group"
        >
          <div class="drawing-group-header">
            <span class="drawing-group-title">{{ g.label }}</span>
            <span v-if="g.isLocal" class="card-local-tag">{{ t('本地') }}</span>
            <span class="drawing-group-count">{{ g.items.length }}{{ t('个协同') }}</span>
          </div>
          <div class="drawing-group-body">
            <WorkCard
              v-for="w in g.items"
              :key="w.work.work_id"
              :display="w"
              :connecting="joiningWorkId === w.work.work_id"
              @join="handleJoinWork"
              @exit="handleExitWork"
            />
          </div>
        </div>
      </div>

      <!-- 项目协同：按图纸聚合 -->
      <div v-if="projectWorks.length > 0" class="group">
        <div class="group-title">{{ t('项目协同') }}</div>
        <div
          v-for="g in projectDrawingGroups"
          :key="g.key"
          class="drawing-group"
        >
          <div class="drawing-group-header">
            <span class="drawing-group-title">{{ g.label }}</span>
            <span v-if="g.isLocal" class="card-local-tag">{{ t('本地') }}</span>
            <span class="drawing-group-count">{{ g.items.length }}{{ t('个协同') }}</span>
          </div>
          <div class="drawing-group-body">
            <WorkCard
              v-for="w in g.items"
              :key="w.work.work_id"
              :display="w"
              :connecting="joiningWorkId === w.work.work_id"
              @join="handleJoinWork"
              @exit="handleExitWork"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <template #footer>
      <button
        v-if="currentWorkId === null"
        class="btn-create"
        :disabled="!isCadReady || creating || connecting"
        @click="handleCreateWork"
      >
        <van-loading v-if="creating || connecting" color="#fff" size="16px" />
        <span v-else>{{ t('创建协同') }}</span>
      </button>
      <button
        v-else
        class="btn-exit"
        :disabled="connecting"
        @click="handleExitWork"
      >
        {{ t('退出协同') }}
      </button>
    </template>

  </FloatingPopup>
</template>

<style scoped lang="scss">
/* ===== 顶部工具栏 ===== */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--van-border-color);
}

.toolbar-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--van-font-size-sm);

}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.toolbar-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--van-background);
  border-radius: var(--radius-sm);
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
  }

  &:active {
    background: var(--border-light);
  }

  :deep(.van-icon) {
    font-size: 16px;
    color: var(--van-text-color-2);

    &.spin {
      animation: spin 1s linear infinite;
    }
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== 状态 ===== */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl) var(--space-lg);
}

.state-text {
  margin: 0;
  font-size: var(--van-font-size-md);
  color: var(--van-text-color-2);
}

.state-desc {
  margin: 0;
  font-size: var(--van-font-size-sm);

}

/* ===== 卡片列表 ===== */
.card-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.group-title {
  font-size: var(--van-font-size-xs);
  font-weight: 600;

  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 var(--space-xs);
}

/* ===== 按图纸聚合分组 ===== */
.drawing-group {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color, var(--van-border-color));
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.drawing-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-xs) var(--space-sm);
  background: color-mix(in srgb, var(--text-primary) 3%, transparent);
  border-bottom: 1px solid var(--border-color, var(--van-border-color));
}

.drawing-group-title {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawing-group-count {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.drawing-group-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-xs);
}

.card-local-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--info, #3b82f6);
  background: color-mix(in srgb, #3b82f6 10%, transparent);
  border: 1px solid color-mix(in srgb, #3b82f6 30%, transparent);
  border-radius: var(--radius-full);
}

/* ===== 创建按钮 ===== */
.btn-create,
.btn-exit {
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: var(--van-font-size-lg);
  font-weight: 500;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-create {
  color: #fff;
  background: var(--btn-primary-bg, var(--primary));
}

.btn-exit {
  color: var(--danger);
  background: var(--van-background);
  border: 1px solid var(--danger);
}
</style>
