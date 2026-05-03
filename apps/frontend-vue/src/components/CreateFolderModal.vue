<template>
  <v-dialog v-model="isOpen" max-width="400">
    <v-card>
      <v-card-title>{{ t('folder.create') }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="localFolderName"
          :label="t('folder.name')"
          :placeholder="t('folder.namePlaceholder')"
          variant="outlined"
          density="compact"
          hide-details="auto"
          autofocus
          @keyup.enter="handleCreate"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleClose">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :loading="loading"
          :disabled="!localFolderName.trim()"
          @click="handleCreate"
        >
          {{ t('common.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  isOpen: boolean;
  folderName: string;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  'update:folderName': [value: string];
  create: [];
}>();

const localFolderName = ref(props.folderName);
const localIsOpen = ref(props.isOpen);

watch(() => props.isOpen, (val) => {
  localIsOpen.value = val;
});

watch(() => props.folderName, (val) => {
  localFolderName.value = val;
});

watch(localFolderName, (val) => {
  emit('update:folderName', val);
});

watch(localIsOpen, (val) => {
  emit('update:isOpen', val);
});

function handleClose(): void {
  emit('update:isOpen', false);
}

function handleCreate(): void {
  if (localFolderName.value.trim()) {
    emit('create');
  }
}
</script>
