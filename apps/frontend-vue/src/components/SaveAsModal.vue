<template>
  <v-dialog :model-value="show" max-width="520" persistent @update:model-value="$emit('close')">
    <v-card rounded="lg">
      <v-card-item>
        <template #title>{{ t('file.saveAs') }}</template>
        <template #subtitle>{{ t('file.selectSaveLocation') }}</template>
      </v-card-item>

      <v-card-text>
        <v-text-field
          v-model="fileName"
          :label="t('file.fileName')"
          variant="outlined"
          density="comfortable"
          hide-details
        />

        <v-radio-group v-model="target" class="mt-4" hide-details>
          <v-radio :label="t('file.myDrawingsPersonal')" value="personal" />
          <v-radio
            v-for="p in projects"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </v-radio-group>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="$emit('close')">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          @click="$emit('save', { fileName, target })"
        >
          {{ t('common.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Project { id: string; name: string }

defineProps<{
  show: boolean;
  projects?: Project[];
  saving?: boolean;
}>();

defineEmits<{
  close: [];
  save: [data: { fileName: string; target: string }];
}>();

const fileName = ref('');
const target = ref('personal');
</script>
