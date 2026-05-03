<template>
  <v-dialog v-model="localIsOpen" max-width="400">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleCancel">{{ defaultCancelText }}</v-btn>
        <v-btn
          :color="confirmColor"
          :loading="loading"
          @click="handleConfirm"
        >
          {{ confirmText || defaultConfirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  type?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '确定',
  type: 'warning',
  loading: false,
});

const defaultConfirmText = computed(() => t('common.confirm'));
const defaultCancelText = computed(() => t('common.cancel'));

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  confirm: [];
  cancel: [];
}>();

const localIsOpen = ref(props.isOpen);

const confirmColor = computed(() => {
  switch (props.type) {
    case 'danger':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'primary';
  }
});

watch(() => props.isOpen, (val) => {
  localIsOpen.value = val;
});

watch(localIsOpen, (val) => {
  emit('update:isOpen', val);
});

function handleConfirm(): void {
  emit('confirm');
}

function handleCancel(): void {
  emit('update:isOpen', false);
  emit('cancel');
}
</script>
