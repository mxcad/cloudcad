<script setup lang="ts">
import { t } from '@/languages';
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
}

const props = withDefaults(defineProps<{
  display: WorkDisplay;
  connecting: boolean;
  showFooter?: boolean;
}>(), {
  showFooter: true,
});

const emit = defineEmits<{
  (e: 'share', workId: number): void;
  (e: 'join', workId: number): void;
  (e: 'exit'): void;
}>();
</script>

<template>
  <div
    class="card"
    :class="{ 'card-joined': display.isJoined }"
  >
    <div class="card-row">
      <div v-if="showFooter" class="card-info">
        <span class="card-name">{{ display.drawingName }}</span>
        <span class="card-meta">
          {{ display.projectName }}{{ display.creatorName ? ' · ' + display.creatorName : '' }}
        </span>
      </div>
      <span v-else class="card-name">{{ display.drawingName }}</span>
      <span class="card-online">{{ display.onlineCount }}{{ t('在线') }}</span>
    </div>
    <div v-if="showFooter" class="card-footer">
      <div class="card-avatars">
        <template v-if="display.participants.length === 0">
          <span class="card-no-users">{{ t('暂无参与者') }}</span>
        </template>
        <div
          v-for="(p, i) in display.participants.slice(0, 5)"
          :key="i"
          class="avatar"
          :title="p.name"
        >
          <img v-if="p.avatar" :src="p.avatar" class="avatar-img" />
          <span v-else class="avatar-txt">{{ p.name?.[0] || '?' }}</span>
        </div>
        <div
          v-if="display.participants.length > 5"
          class="avatar avatar-more"
        >
          +{{ display.participants.length - 5 }}
        </div>
      </div>
      <div class="card-actions">
        <van-button size="small" plain round @click="emit('share', display.work.work_id)">{{ t('分享') }}</van-button>
        <van-button
          v-if="display.isJoined"
          size="small"
          type="danger"
          plain round
          @click="emit('exit')"
        >{{ t('退出') }}</van-button>
        <van-button
          v-else
          size="small"
          type="primary"
          round
          :loading="connecting"
          :disabled="connecting"
          @click="emit('join', display.work.work_id)"
        >{{ t('加入') }}</van-button>
      </div>
    </div>
    <div v-else class="card-actions">
      <van-button size="small" plain round @click="emit('share', display.work.work_id)">{{ t('分享') }}</van-button>
      <van-button
        size="small"
        type="primary"
        round
        :loading="connecting"
        :disabled="connecting"
        @click="emit('join', display.work.work_id)"
      >{{ t('加入') }}</van-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
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
