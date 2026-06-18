<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { t } from '@/languages';
import { useCooperate, parseWorkData, getWorkCreator, parseUserData, type Work } from '../../../composables/useCooperate';
import { useUser } from '../../../composables/useUser';
import { useEditorState } from '../../../composables/useEditorState';
import { showConfirmDialog } from 'vant';
import FloatingPopup from "../../../components/FloatingPopup.vue"
import CollabShareModal from "../../../components/CollabShareModal.vue"

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { user } = useUser();
const { state, setCollaborationState } = useEditorState();

const {
  isCadReady,
  works,
  currentWorkId,
  loading,
  connecting,
  fileNameCache,
  projectNameCache,
  myProjectIds,
  fetchWorks,
  createWork,
  joinWork,
  exitWork,
} = useCooperate();

const show = ref(true);
const showShareWorkId = ref<number | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  fetchWorks();
  pollTimer = setInterval(fetchWorks, 8000);
});

onBeforeUnmount(() => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
});

// --- 当前文件的协同 work ---
const currentFileWorks = computed(() => {
  const fileId = state.fileId;
  const filtered = works.value.filter((w) => {
    const data = parseWorkData(w.work_data);
    if (!data) return false;
    if (data.v === 3 && data.sourceType === 'local') {
      if (fileId === '' && data.drawingId === '') {
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

// --- 分组 ---
interface WorkDisplay {
  work: Work;
  projectName: string;
  drawingName: string;
  isCurrentFile: boolean;
  isJoined: boolean;
  onlineCount: number;
  creatorName: string;
  participants: { name: string; avatar?: string }[];
}

function mapWorkToDisplay(w: Work): WorkDisplay {
  const data = parseWorkData(w.work_data);
  const creator = data ? getWorkCreator(data) : {};
  const drawingName = data?.drawingId && fileNameCache.value[data.drawingId]
    ? fileNameCache.value[data.drawingId]
    : (data && data.v === 3 ? data.drawingName : '') || '未知图纸';
  const projectName = data?.projectId
    ? (projectNameCache.value[data.projectId] ?? '未知项目')
    : '个人空间';

  const participants: { name: string; avatar?: string }[] = [];
  for (const ud of w.link_user_data) {
    try {
      const parsed = parseUserData(ud);
      if (parsed) participants.push({ name: parsed.name, avatar: parsed.avatar });
    } catch { /* ignore */ }
  }

  return {
    work: w,
    projectName,
    drawingName,
    isCurrentFile: data?.drawingId === state.fileId,
    isJoined: currentWorkId.value === w.work_id,
    onlineCount: w.link_user_ids.length,
    creatorName: creator.name || '',
    participants,
  };
}

const myWorks = computed(() =>
  works.value
    .filter((w) => user.value && w.real_user_id === user.value.id)
    .map(mapWorkToDisplay)
    .sort((a, b) => b.work.work_id - a.work.work_id)
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
    .sort((a, b) => b.work.work_id - a.work.work_id);
});

const activeWork = computed(() =>
  currentWorkId.value !== null
    ? works.value.find((w) => w.work_id === currentWorkId.value)
    : null
);

// --- Handlers ---

async function checkUnsavedBeforeAction(): Promise<boolean> {
  if (state.isModified) {
    try {
      await showConfirmDialog({
        title: '未保存的更改',
        message: '当前图纸有未保存的更改，确定要继续吗？',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      });
    } catch {
      return false;
    }
  }
  return true;
}

function handleCreateWork() {
  if (connecting.value) return;
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

function handleExitWork() {
  exitWork();
}

function handleClose() {
  show.value = false;
  emit('close');
}

function handleShare(workId: number) {
  showShareWorkId.value = workId;
}

function handleShareClose() {
  showShareWorkId.value = null;
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
    <div class="cooperate-body">
      <!-- 加载中 -->
      <div v-if="loading && works.length === 0" class="state-box">
        <van-loading />
        <p class="state-text">{{ t('加载中...') }}</p>
      </div>

      <!-- 空状态 -->
      <div v-else-if="works.length === 0" class="state-box">
        <van-icon name="friends-o" size="40" color="#ccc" />
        <p class="state-text">{{ t('暂无活跃协同') }}</p>
        <p class="state-desc">{{ t('创建协同以开始实时协作') }}</p>
      </div>

      <template v-else>
        <!-- 当前协同会话 -->
        <div v-if="currentWorkId !== null && activeWork" class="session-bar">
          <div class="session-row">
            <span class="session-dot" />
            <span class="session-name">{{ state.fileName || t('当前图纸') }}</span>
          </div>
          <div class="session-row">
            <span class="session-count">{{ activeWork.link_user_ids.length }}人在线</span>
            <div class="session-actions">
              <van-button size="small" plain round @click="handleShare(activeWork.work_id)">分享</van-button>
              <van-button size="small" type="danger" plain round @click="handleExitWork">退出</van-button>
            </div>
          </div>
        </div>

        <!-- 协同列表 -->
        <div class="list">
          <div v-if="currentFileWorks.length > 0 && currentWorkId === null" class="group">
            <div class="group-title">当前图纸</div>
            <div v-for="w in currentFileWorks" :key="w.work_id" class="card">
              <div class="card-row">
                <span class="card-name">{{ mapWorkToDisplay(w).drawingName }}</span>
                <span class="card-online">{{ w.link_user_ids.length }}在线</span>
              </div>
              <div class="card-actions">
                <van-button size="small" plain round @click="handleShare(w.work_id)">分享</van-button>
                <van-button size="small" type="primary" round :loading="connecting" :disabled="connecting" @click="handleJoinWork(w.work_id)">加入</van-button>
              </div>
            </div>
          </div>

          <div v-if="myWorks.length > 0" class="group">
            <div class="group-title">我创建的</div>
            <div v-for="w in myWorks" :key="w.work.work_id" class="card" :class="{ 'card-joined': w.isJoined }">
              <div class="card-row">
                <div class="card-info">
                  <span class="card-name">{{ w.drawingName }}</span>
                  <span class="card-meta">{{ w.projectName }}{{ w.creatorName ? ' · ' + w.creatorName : '' }}</span>
                </div>
                <span class="card-online">{{ w.onlineCount }}在线</span>
              </div>
              <div class="card-footer">
                <div class="card-avatars">
                  <template v-if="w.participants.length === 0">
                    <span class="card-no-users">暂无参与者</span>
                  </template>
                  <div v-for="(p, i) in w.participants.slice(0, 5)" :key="i" class="avatar" :title="p.name">
                    <img v-if="p.avatar" :src="p.avatar" class="avatar-img" />
                    <span v-else class="avatar-txt">{{ p.name?.[0] || '?' }}</span>
                  </div>
                  <div v-if="w.participants.length > 5" class="avatar avatar-more">+{{ w.participants.length - 5 }}</div>
                </div>
                <div class="card-actions">
                  <van-button size="small" plain round @click="handleShare(w.work.work_id)">分享</van-button>
                  <van-button v-if="w.isJoined" size="small" type="danger" plain round @click="handleExitWork">退出</van-button>
                  <van-button v-else size="small" type="primary" round :loading="connecting" :disabled="connecting" @click="handleJoinWork(w.work.work_id)">加入</van-button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="projectWorks.length > 0" class="group">
            <div class="group-title">项目协同</div>
            <div v-for="w in projectWorks" :key="w.work.work_id" class="card" :class="{ 'card-joined': w.isJoined }">
              <div class="card-row">
                <div class="card-info">
                  <span class="card-name">{{ w.drawingName }}</span>
                  <span class="card-meta">{{ w.projectName }}{{ w.creatorName ? ' · ' + w.creatorName : '' }}</span>
                </div>
                <span class="card-online">{{ w.onlineCount }}在线</span>
              </div>
              <div class="card-footer">
                <div class="card-avatars">
                  <template v-if="w.participants.length === 0">
                    <span class="card-no-users">暂无参与者</span>
                  </template>
                  <div v-for="(p, i) in w.participants.slice(0, 5)" :key="i" class="avatar" :title="p.name">
                    <img v-if="p.avatar" :src="p.avatar" class="avatar-img" />
                    <span v-else class="avatar-txt">{{ p.name?.[0] || '?' }}</span>
                  </div>
                  <div v-if="w.participants.length > 5" class="avatar avatar-more">+{{ w.participants.length - 5 }}</div>
                </div>
                <div class="card-actions">
                  <van-button size="small" plain round @click="handleShare(w.work.work_id)">分享</van-button>
                  <van-button v-if="w.isJoined" size="small" type="danger" plain round @click="handleExitWork">退出</van-button>
                  <van-button v-else size="small" type="primary" round :loading="connecting" :disabled="connecting" @click="handleJoinWork(w.work.work_id)">加入</van-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <van-button
        block
        round
        type="primary"
        size="large"
        :disabled="!isCadReady || connecting"
        :loading="connecting"
        @click="handleCreateWork"
      >
        {{ t('创建协同') }}
      </van-button>
    </template>

    <CollabShareModal
      v-if="showShareWorkId !== null"
      :work-id="showShareWorkId"
      @close="handleShareClose"
    />
  </FloatingPopup>
</template>

<style scoped lang="scss">
.cooperate-body {
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

// --- 空/加载 ---
.state-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl) var(--space-lg);
}

.state-text {
  margin: 0;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}

.state-desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

// --- 当前会话条 ---
.session-bar {
  margin: var(--space-sm) var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-elevated);
  border-radius: 10px;
  border: 1px solid var(--primary);
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);

  &:last-child {
    margin-bottom: 0;
  }
}

.session-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success, #52c41a);
  flex-shrink: 0;
  margin-right: var(--space-sm);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.session-name {
  flex: 1;
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-count {
  font-size: var(--font-size-sm);
  color: var(--primary);
}

.session-actions {
  display: flex;
  gap: var(--space-sm);
}

// --- 列表 ---
.list {
  padding-bottom: var(--space-sm);
}

.group {
  margin-top: var(--space-xs);
}

.group-title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-tertiary);
  padding: var(--space-sm) var(--space-lg) var(--space-xs);
}

// --- 卡片 ---
.card {
  margin: var(--space-xs) var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-elevated);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.card-joined {
  border-color: var(--primary);
}

.card-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.card-info {
  flex: 1;
  min-width: 0;
  margin-right: var(--space-sm);
}

.card-name {
  display: block;
  font-size: var(--font-size-body);
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  margin-top: 2px;
}

.card-online {
  font-size: var(--font-size-sm);
  color: var(--primary);
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 3px;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.card-avatars {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.card-no-users {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.card-actions {
  display: flex;
  gap: var(--space-xs);
  flex-shrink: 0;
}

// --- 头像 ---
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-txt {
  background: var(--primary-light);
  color: var(--primary);
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-more {
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-size: 9px;
}
</style>
