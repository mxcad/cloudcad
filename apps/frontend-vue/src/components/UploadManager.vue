<template>
  <div class="upload-manager">
    <!-- 上传触发按钮（Vuetify 优先：v-btn） -->
    <v-btn
      :color="color"
      :size="size"
      :block="block"
      :variant="variant"
      :prepend-icon="icon || 'mdi-upload'"
      :loading="progress.isActive.value"
      :disabled="progress.isActive.value"
      @click="handleSelectFiles"
    >
      {{ buttonText }}
    </v-btn>

    <!-- 进度条（Vuetify 优先：v-progress-linear） -->
    <v-progress-linear
      v-if="progress.isActive.value"
      :model-value="progress.percent.value"
      :indeterminate="progress.percent.value === 0"
      color="primary"
      height="4"
      rounded
      class="mt-2"
    />

    <!-- 进度消息 -->
    <div v-if="progress.isActive.value && progress.message.value" class="text-caption text-medium-emphasis mt-1 text-center">
      {{ progress.message.value }}
    </div>

    <!-- 错误提示 Snackbar -->
    <v-snackbar v-model="showError" :timeout="5000" color="error" location="top right">
      {{ errorMsg }}
      <template #actions>
        <v-btn variant="text" @click="showError = false">{{ t('common.close') }}</v-btn>
      </template>
    </v-snackbar>

    <!-- 成功提示 Snackbar -->
    <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top right">
      {{ successMsg }}
    </v-snackbar>

    <!-- 登录提示对话框（未登录时保存/上传需要的提示） -->
    <v-dialog v-model="showLoginPrompt" max-width="420">
      <v-card rounded="lg">
        <v-card-item>
          <template #title>{{ t('auth.loginRequired') }}</template>
          <template #subtitle>{{ loginPromptMsg }}</template>
        </v-card-item>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="showLoginPrompt = false">{{ t('common.later') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="goToLogin">{{ t('auth.goToLogin') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUpload } from '@/composables/useUpload';
import { useProgress } from '@/composables/useProgress';
import { useAuthStore } from '@/stores/auth.store';
import { useCadEvents } from '@/composables/useCadEvents';
import { useRouter } from 'vue-router';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  nodeId?: string;
  buttonText?: string;
  color?: string;
  size?: string;
  block?: boolean;
  variant?: 'flat' | 'text' | 'outlined' | 'plain' | 'elevated' | 'tonal';
  icon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  nodeId: '',
  buttonText: '上传 CAD 文件',
  color: 'primary',
  size: 'large',
  block: true,
  variant: 'flat',
  icon: 'mdi-upload',
});

const emit = defineEmits<{
  success: [params: { nodeId?: string; name: string; hash: string }];
  error: [error: string];
}>();

const auth = useAuthStore();
const upload = useUpload();
const progress = useProgress();
const events = useCadEvents();
const router = useRouter();

const showError = ref(false);
const showSuccess = ref(false);
const showLoginPrompt = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
const loginPromptMsg = ref('');

const isAuthenticated = computed(() => auth.isAuthenticated);

/** 选择文件并上传 */
function handleSelectFiles(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dwg,.dxf,.mxweb,.mxwbe';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    document.body.removeChild(input);
    if (!file) return;
    startUpload(file);
  };

  input.click();
}

function startUpload(file: File): void {
  upload.setNodeId(props.nodeId);

  if (isAuthenticated.value) {
    upload.uploadAuthenticated(file, {
      onProgress: () => {}, // progress is handled by useProgress internally
      onSuccess: (params) => {
        successMsg.value = `文件已打开: ${params.name}`;
        showSuccess.value = true;
        events.emit('file-opened', params);
        emit('success', params);
      },
      onError: (error) => {
        errorMsg.value = error;
        showError.value = true;
        emit('error', error);
      },
    });
  } else {
    upload.uploadPublic(file, {
      onProgress: () => {},
      onSuccess: (params) => {
        successMsg.value = `文件已打开: ${params.name}`;
        showSuccess.value = true;
        events.emit('file-opened', params);
        emit('success', params);
      },
      onError: (error) => {
        errorMsg.value = error;
        showError.value = true;
        emit('error', error);
      },
    });
  }
}

/** 需要在保存时登录的提示 */
function showLoginRequired(action: string): void {
  loginPromptMsg.value = `${action}需要登录，是否前往登录页面？`;
  showLoginPrompt.value = true;
}

function goToLogin(): void {
  showLoginPrompt.value = false;
  router.push('/login');
}

// 监听保存/导出需要的登录提示事件
events.on('save-required', (payload: { action: string }) => {
  showLoginRequired(payload.action);
});

defineExpose({ showLoginRequired });
</script>

<style scoped>
.upload-manager {
  width: 100%;
}
</style>
