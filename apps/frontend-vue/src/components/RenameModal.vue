<template>
  <v-dialog v-model="isOpen" max-width="400">
    <v-card>
      <v-card-title>{{ isEditing ? t('file.rename') : t('folder.create') }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="localName"
          :label="t('file.name')"
          :placeholder="t('file.namePlaceholder')"
          variant="outlined"
          density="compact"
          hide-details="auto"
          autofocus
          @keyup.enter="handleConfirm"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleClose">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :loading="loading"
          :disabled="!localName.trim()"
          @click="handleConfirm"
        >
          {{ t('common.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { FileSystemNode } from '@/composables/useFileSystemData';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  isOpen: boolean;
  editingNode: FileSystemNode | null;
  newName: string;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  'update:newName': [value: string];
  confirm: [];
}>();

const localNewName = ref(props.newName);
const localIsOpen = ref(props.isOpen);

const isEditing = computed(() => !!props.editingNode);

watch(() => props.isOpen, (val) => {
  localIsOpen.value = val;
});

watch(() => props.newName, (val) => {
  localNewName.value = val;
});

watch(localNewName, (val) => {
  emit('update:newName', val);
});

watch(localIsOpen, (val) => {
  emit('update:isOpen', val);
});

function handleClose(): void {
  emit('update:isOpen', false);
}

function handleConfirm(): void {
  if (localNewName.value.trim()) {
    emit('confirm');
  }
}
</script>
