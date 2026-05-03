<template>
  <v-dialog :model-value="show" max-width="400" persistent @update:model-value="$emit('close')">
    <v-card rounded="lg">
      <v-card-item>
        <template #title>{{ t('file.exportDrawing') }}</template>
        <template #subtitle>{{ fileName }}</template>
      </v-card-item>

      <v-card-text>
        <v-radio-group v-model="format" hide-details>
          <v-radio :label="t('file.formatDwg')" value="dwg" />
          <v-radio :label="t('file.formatDxf')" value="dxf" />
          <v-radio :label="t('file.formatPdf')" value="pdf" />
          <v-radio :label="t('file.formatPng')" value="png" />
        </v-radio-group>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="$emit('close')">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          @click="$emit('download', format)"
        >
          {{ t('file.downloadFormat', { format: format.toUpperCase() }) }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

defineProps<{
  show: boolean;
  fileName?: string;
  loading?: boolean;
}>();

defineEmits<{
  close: [];
  download: [format: string];
}>();

const format = ref('dwg');
</script>
