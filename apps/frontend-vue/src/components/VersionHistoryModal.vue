<template>
  <v-dialog :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)" max-width="800" persistent>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ t('file.versionHistory') }} - {{ node?.name || t('file.defaultFileName') }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="onClose" />
      </v-card-title>

      <v-card-text class="pa-4">
        <div v-if="loading" class="d-flex justify-center align-center py-8">
          <v-progress-circular indeterminate color="primary" />
          <span class="ml-4">{{ t('common.loading') }}</span>
        </div>

        <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">
          {{ error }}
        </v-alert>

        <div v-else-if="entries.length === 0" class="d-flex flex-column align-center justify-center py-8">
          <v-icon icon="mdi-history" size="48" color="grey-lighten-1" class="mb-4" />
          <p class="text-center text-medium-emphasis">{{ t('file.noVersionHistory') }}</p>
        </div>

        <v-list v-else density="compact" class="border rounded">
          <v-list-item
            v-for="entry in entries"
            :key="entry.revision"
            class="py-3"
          >
            <template #prepend>
              <v-chip size="small" variant="outlined" class="mr-3 font-weight-bold">
                r{{ entry.revision }}
              </v-chip>
            </template>

            <v-list-item-title class="font-weight-medium">
              {{ entry.userName || entry.author || t('common.system') }}
            </v-list-item-title>

            <v-list-item-subtitle>
              {{ formatDate(entry.date) }}
              <span v-if="extractUserNote(entry.message)" class="ml-2">
                · {{ extractUserNote(entry.message) }}
              </span>
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                variant="text"
                size="small"
                color="primary"
                @click="onOpenVersion(entry.revision)"
              >
                {{ t('common.view') }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onClose">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { SvnLogEntryDto } from '@/services/apiClient';
import type { FileSystemNode } from '@/composables/useFileSystemData';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  isOpen: boolean;
  node: FileSystemNode | null;
  entries: SvnLogEntryDto[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenVersion: (revision: number) => void;
}

const props = defineProps<Props>();

const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? t('common.justNow') : t('common.minutesAgo', { minutes });
    }
    return t('common.hoursAgo', { hours });
  } else if (days === 1) {
    return t('common.yesterday');
  } else if (days < 7) {
    return t('common.daysAgo', { days });
  }

  return d.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const extractUserNote = (message: string): string | null => {
  const saveMatch = message.match(/^Save:\s*.+?\s*-\s*(.+)$/i);
  if (saveMatch) {
    return saveMatch[1]?.trim() ?? null;
  }
  return null;
};
</script>
