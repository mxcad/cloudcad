<template>
  <v-dialog v-model="isOpen" max-width="500">
    <v-card>
      <v-card-title>{{ editingProject ? t('project.edit') : t('project.create') }}</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="handleSubmit">
          <v-text-field
            v-model="localFormData.name"
            :label="t('project.name')"
            :placeholder="t('project.namePlaceholder')"
            variant="outlined"
            density="compact"
            hide-details="auto"
            :rules="[v => !!v || t('validation.required', { field: t('project.name') })]"
            autofocus
          />
          <v-textarea
            v-model="localFormData.description"
            :label="t('project.description')"
            :placeholder="t('project.descriptionPlaceholder')"
            variant="outlined"
            density="compact"
            hide-details="auto"
            rows="3"
            class="mt-4"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleClose">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :loading="loading"
          :disabled="!localFormData.name.trim()"
          @click="handleSubmit"
        >
          {{ editingProject ? t('common.save') : t('common.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FileSystemNode } from '@/composables/useFileSystemData';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  isOpen: boolean;
  editingProject: FileSystemNode | null;
  formData: { name: string; description: string };
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  'update:formData': [value: { name: string; description: string }];
  submit: [];
}>();

const localFormData = ref({ ...props.formData });
const localIsOpen = ref(props.isOpen);

watch(() => props.isOpen, (val) => {
  localIsOpen.value = val;
});

watch(() => props.formData, (val) => {
  localFormData.value = { ...val };
}, { deep: true });

watch(localFormData, (val) => {
  emit('update:formData', { ...val });
}, { deep: true });

watch(localIsOpen, (val) => {
  emit('update:isOpen', val);
});

function handleClose(): void {
  emit('update:isOpen', false);
}

function handleSubmit(): void {
  if (localFormData.value.name.trim()) {
    emit('submit');
  }
}
</script>
