<template>
  <v-container fill-height fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="6" lg="4" class="text-center">
        <v-icon size="64" color="error" icon="mdi-alert-circle-outline" class="mb-4" />

        <div class="text-h5 font-weight-bold mb-2">{{ t('error.pageError') }}</div>

        <div class="text-body-2 text-medium-emphasis mb-6">
          {{ displayMessage }}
        </div>

        <div class="d-flex justify-center ga-3">
          <v-btn variant="outlined" prepend-icon="mdi-refresh" @click="retry">
            {{ t('common.retry') }}
          </v-btn>
          <v-btn variant="flat" color="primary" prepend-icon="mdi-home" to="/dashboard">
            {{ t('common.backToHome') }}
          </v-btn>
        </div>

        <!-- 详情折叠 -->
        <v-expand-transition>
          <div v-if="showDetail" class="mt-6 text-left">
            <v-card variant="outlined" rounded="lg" class="pa-4">
              <pre class="text-caption text-medium-emphasis overflow-auto" style="max-height: 200px">{{ detailText }}</pre>
            </v-card>
          </div>
        </v-expand-transition>

        <v-btn
          variant="text"
          size="small"
          class="mt-3"
          :append-icon="showDetail ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="showDetail = !showDetail"
        >
          {{ showDetail ? t('common.hideDetail') : t('common.viewDetail') }}
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { getErrorMessage } from '@/utils/errorHandler';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const props = defineProps<{
  error?: unknown;
}>();

const emit = defineEmits<{
  retry: [];
}>();

const showDetail = ref(false);

const displayMessage = computed(() => {
  if (!props.error) return t('error.unknownError');
  return getErrorMessage(props.error);
});

const detailText = computed(() => {
  if (!props.error) return '';
  if (props.error instanceof Error) {
    return props.error.stack || props.error.message;
  }
  try {
    return JSON.stringify(props.error, null, 2);
  } catch {
    return String(props.error);
  }
});

function retry(): void {
  emit('retry');
}
</script>
