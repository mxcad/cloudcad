<template>
  <v-dialog :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)" max-width="400" persistent>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ t('project.transferOwnership') }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="onClose" />
      </v-card-title>

      <v-card-text class="pa-4">
        <v-alert type="warning" variant="tonal" class="mb-4">
          <strong>{{ t('project.importantNotice') }}</strong>
          <p class="mt-2">{{ t('project.transferWarning') }}</p>
        </v-alert>

        <div class="d-flex align-center pa-4 rounded bg-surface-variant">
          <v-avatar size="48" color="primary" class="mr-4">
            <span class="text-h6">{{ displayName[0]?.toUpperCase() }}</span>
          </v-avatar>
          <div>
            <div class="text-h6">{{ displayName }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ member?.email }}</div>
          </div>
        </div>

        <v-list class="mt-4" density="compact">
          <v-list-item prepend-icon="mdi-check" :title="t('project.transferPoint1')" />
          <v-list-item prepend-icon="mdi-check" :title="t('project.transferPoint2')" />
          <v-list-item prepend-icon="mdi-check" :title="t('project.transferPoint3')" />
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onClose">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="loading" @click="onConfirm">{{ t('project.confirmTransfer') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  isOpen: boolean;
  member: {
    id: string;
    email: string;
    username?: string;
    nickname?: string;
    projectRoleName?: string;
  } | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const displayName = computed(() => {
  return props.member?.nickname || props.member?.username || props.member?.email || t('common.unknownUser');
});
</script>
