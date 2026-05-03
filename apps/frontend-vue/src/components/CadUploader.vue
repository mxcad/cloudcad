<template>
  <div class="cad-uploader">
    <!-- 上传按钮 -->
    <v-btn
      color="primary"
      size="large"
      block
      prepend-icon="mdi-upload"
      :loading="progress.isActive"
      :disabled="!isAuthenticated"
      @click="handleSelectFiles"
    >
      {{ buttonText }}
    </v-btn>

    <!-- 提示信息 Snackbar -->
    <v-snackbar
      v-model="showToast"
      :timeout="3000"
      location="top-right"
    >
      {{ message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUppyUpload, type LoadFileParam } from '@/composables/useUppyUpload';
import { useAuthStore } from '@/stores/auth.store';
import { useProgress, PROGRESS_STAGES } from '@/composables/useProgress';
import { useCadEngine } from '@/composables/useCadEngine';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  nodeId?: string;
  buttonText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  nodeId: '',
  buttonText: '上传 CAD 文件',
});

const emit = defineEmits<{
  success: [param: LoadFileParam];
  error: [error: string];
}>();

const authStore = useAuthStore();
const progress = useProgress();
const cadEngine = useCadEngine();
const { selectFiles } = useUppyUpload();

const isAuthenticated = computed(() => authStore.isAuthenticated);
const showToast = ref(false);
const message = ref('');

function showMessage(msg: string): void {
  message.value = msg;
  showToast.value = true;
}

async function handleSelectFiles(): Promise<void> {
  if (!isAuthenticated.value) {
    showMessage(t('upload.pleaseLoginFirst'));
    emit('error', t('auth.userNotLoggedIn'));
    return;
  }

  selectFiles({
    nodeId: props.nodeId,
    onFileQueued: (file) => {
      progress.start(PROGRESS_STAGES.UPLOAD, t('upload.uploadingFile', { name: file.name }));
    },
    onBeginUpload: () => {
      progress.update(t('upload.uploading'), 0);
    },
    onProgress: (percentage) => {
      progress.update(t('upload.uploading'), percentage);
    },
    onSuccess: async (param) => {
      progress.update(PROGRESS_STAGES.PROCESSING, 100);
      emit('success', param);

      showMessage(t('upload.uploadSuccess'));

      setTimeout(() => {
        progress.finish();
      }, 500);
    },
    onError: (error) => {
      progress.finish();
      showMessage(t('upload.uploadFailed', { error }));
      emit('error', error);
    },
  });
}
</script>

<style scoped>
.cad-uploader {
  width: 100%;
}
</style>
