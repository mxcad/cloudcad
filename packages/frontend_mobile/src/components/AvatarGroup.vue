<script setup lang="ts">
import { t } from '@/languages';

withDefaults(defineProps<{
  participants: { name: string; avatar?: string }[];
  max?: number;
}>(), {
  max: 5,
});
</script>

<template>
  <div class="card-avatars">
    <template v-if="participants.length === 0">
      <span class="card-no-users">{{ t('暂无参与者') }}</span>
    </template>
    <div
      v-for="(p, i) in participants.slice(0, max)"
      :key="i"
      class="avatar"
      :title="p.name"
    >
      <img v-if="p.avatar" :src="p.avatar" class="avatar-img" />
      <span v-else class="avatar-txt">{{ p.name?.[0] || '?' }}</span>
    </div>
    <div
      v-if="participants.length > max"
      class="avatar avatar-more"
    >
      +{{ participants.length - max }}
    </div>
  </div>
</template>

<style scoped lang="scss">
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
