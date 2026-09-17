<script setup lang="ts">
import { ref } from 'vue';
import { t } from '@/languages';
import { showToast } from 'vant';
import ShareLinkSheet from './ShareLinkSheet.vue';
import { copyText } from '@/utils/clipboard';
import type { Work } from '../composables/useCooperate';

export interface WorkDisplay {
  work: Work;
  projectName: string;
  drawingName: string;
  isCurrentFile: boolean;
  isJoined: boolean;
  onlineCount: number;
  creatorName: string;
  participants: { name: string; avatar?: string }[];
  shareUrl: string;
  sourceType?: 'my' | 'project' | 'library' | 'local' | 'share' | null;
  drawingKey?: string;
}

const props = withDefaults(defineProps<{
  display: WorkDisplay;
  connecting: boolean;
  showFooter?: boolean;
}>(), {
  showFooter: true,
});

const emit = defineEmits<{
  (e: 'join', workId: number): void;
  (e: 'exit'): void;
}>();

const showLinkSheet = ref(false);
const linkSheetUrl = ref('');

async function handleShare() {
  const url = props.display.shareUrl;
  const result = await copyText(url);
  // 两级降级都失败：弹出只读输入框让用户手动选中复制
  if (result === 'failed') {
    linkSheetUrl.value = url;
    showLinkSheet.value = true;
    return;
  }
  showToast(t('分享链接已复制'));
}
</script>

<template>
  <div
    class="work-card"
    :class="{ 'work-card-active': display.isJoined }"
  >
    <ShareLinkSheet v-model:show="showLinkSheet" :url="linkSheetUrl" :title="t('分享协同')" />

    <!-- 主体行 -->
    <div class="card-main">
      <div class="card-info">
        <div class="card-title-row">
          <span class="card-title">{{ display.drawingName }}</span>
          <span v-if="display.sourceType === 'local'" class="card-local-tag">{{ t('本地') }}</span>
        </div>
        <span v-if="showFooter" class="card-meta">
          <template v-if="display.sourceType === 'local'">
            {{ t('协同ID') }}: {{ display.work.work_id }}
          </template>
          <template v-else>
            {{ display.projectName }}{{ display.creatorName ? ' · ' + display.creatorName : '' }}
          </template>
        </span>
      </div>
      <span class="card-badge">
        <span class="badge-dot" />
        {{ display.onlineCount }}
      </span>
    </div>

    <!-- 底部行：头像 + 按钮 -->
    <div v-if="showFooter" class="card-foot">
      <div class="avatars">
        <span v-if="display.participants.length === 0" class="no-participants">暂无参与者</span>
        <div
          v-for="(p, i) in display.participants.slice(0, 5)"
          :key="i"
          class="avatar"
          :title="p.name"
        >
          <img v-if="p.avatar" :src="p.avatar" class="avatar-img" />
          <span v-else class="avatar-initial">{{ p.name?.[0] || '?' }}</span>
        </div>
        <div v-if="display.participants.length > 5" class="avatar avatar-more">
          +{{ display.participants.length - 5 }}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-outline" @click="handleShare">分享</button>
        <button
          v-if="display.isJoined"
          class="btn btn-danger"
          @click="emit('exit')"
        >退出</button>
        <button
          v-else
          class="btn btn-primary"
          :disabled="connecting"
          @click="emit('join', display.work.work_id)"
        >
          <van-loading v-if="connecting" color="#fff" size="14px" />
          <span v-else>加入</span>
        </button>
      </div>
    </div>

    <!-- 简化版（无 footer） -->
    <div v-else class="card-actions">
      <button class="btn btn-outline" @click="handleShare">分享</button>
      <button
        class="btn btn-primary"
        :disabled="connecting"
        @click="emit('join', display.work.work_id)"
      >
        <van-loading v-if="connecting" color="#fff" size="14px" />
        <span v-else>加入</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* ===== 卡片容器 ===== */
.work-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--van-background);
  border: 1px solid var(--van-border-color);
  border-radius: var(--radius-lg);
}

.work-card-active {
  border-color: rgba(255, 167, 106, 0.4);
  box-shadow: 0 0 0 1px rgba(255, 167, 106, 0.15);
}

/* ===== 主体行 ===== */
.card-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
}

.card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.card-title {
  font-size: var(--font-size-body);
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.card-meta {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.card-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

/* ===== 底部行 ===== */
.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.avatars {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.no-participants {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.card-actions {
  display: flex;
  gap: var(--space-xs);
  flex-shrink: 0;
}

/* ===== 头像 ===== */
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  margin-left: -8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--van-background);
  flex-shrink: 0;

  &:first-child {
    margin-left: 0;
  }
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.avatar-more {
  background: var(--bg-elevated);
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 500;
}

/* ===== 按钮 ===== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  padding: 0 14px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    opacity: 0.85;
  }
}

.btn-primary {
  background: var(--btn-primary-bg, var(--primary));
  color: #fff;
}

.btn-danger {
  background: var(--danger);
  color: #fff;
}

.btn-outline {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-color);
}
</style>
