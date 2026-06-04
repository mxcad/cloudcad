<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import {
  cooperateControllerCreateShare,
  cooperateControllerRevokeShare,
  cooperateControllerListShares,
  cooperateControllerUpdateShare,
} from '../api-sdk';
import { useUser } from '../composables/useUser';
import { useEditorState } from '../composables/useEditorState';

interface ShareItem {
  id: string;
  token: string;
  url: string;
  fileId: string;
  fileName: string;
  collaborationEnabled: boolean;
  expiresAt: string | null;
  usedCount: number;
  createdAt: string;
}

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { isAuthenticated } = useUser();
const { state } = useEditorState();

const show = ref(true);
const creating = ref(false);
const loading = ref(false);
const step = ref<'form' | 'result'>('form');

const collaborationEnabled = ref(false);
const expiration = ref<'never' | '1d' | '3d' | '7d' | 'custom'>('never');
const customDays = ref(7);

const createdUrl = ref('');
const createdToken = ref('');
const createdExpiresAt = ref<string | null>(null);

const existingShares = ref<ShareItem[]>([]);

onMounted(async () => {
  if (!state.fileId || !isAuthenticated.value) return;
  await loadExistingShares();
});

async function loadExistingShares() {
  loading.value = true;
  try {
    const result = await cooperateControllerListShares({
      query: { fileId: state.fileId!, pageSize: 50 },
    });
    if (!result.error && result.data) {
      const data = result.data as unknown as { items: ShareItem[] };
      existingShares.value = (data.items || []).filter(
        (s) => !s.expiresAt || new Date(s.expiresAt) > new Date()
      );
    }
  } catch {
    // silently fail
  }
  loading.value = false;
}

function getExpiresInSeconds(): number | undefined {
  switch (expiration.value) {
    case 'never': return undefined;
    case '1d': return 86400;
    case '3d': return 259200;
    case '7d': return 604800;
    case 'custom': return customDays.value * 86400;
    default: return undefined;
  }
}

async function handleCreate() {
  if (!state.fileId) {
    showToast('请先打开图纸');
    return;
  }
  if (!isAuthenticated.value) {
    showToast('请先登录');
    return;
  }

  creating.value = true;
  try {
    const expiresIn = getExpiresInSeconds();
    const result = await cooperateControllerCreateShare({
      body: {
        fileId: state.fileId,
        collaborationEnabled: collaborationEnabled.value,
        ...(expiresIn !== undefined ? { expiresIn } : {}),
      },
    });
    if (result.error) {
      showToast('创建分享失败');
      creating.value = false;
      return;
    }
    const data = result.data as unknown as { url: string; token: string; expiresAt: string | null };
    createdUrl.value = data.url;
    createdToken.value = data.token;
    createdExpiresAt.value = data.expiresAt;
    step.value = 'result';
    await loadExistingShares();
  } catch {
    showToast('创建分享失败');
  }
  creating.value = false;
}

async function handleRevoke(token: string) {
  try {
    await showConfirmDialog({
      title: '撤销分享',
      message: '确定要撤销这个分享链接吗？撤销后原有链接将无法访问。',
      confirmButtonText: '确定撤销',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  try {
    const result = await cooperateControllerRevokeShare({
      path: { token },
    });
    if (!result.error) {
      showToast('已撤销分享');
      existingShares.value = existingShares.value.filter((s) => s.token !== token);
      if (createdToken.value === token) {
        step.value = 'form';
        createdUrl.value = '';
        createdToken.value = '';
        createdExpiresAt.value = null;
      }
    }
  } catch {
    showToast('撤销分享失败');
  }
}

async function handleToggleCollab(token: string, enabled: boolean) {
  try {
    const result = await cooperateControllerUpdateShare({
      path: { token },
      body: { collaborationEnabled: enabled },
    });
    if (!result.error) {
      existingShares.value = existingShares.value.map((s) =>
        s.token === token ? { ...s, collaborationEnabled: enabled } : s
      );
      showToast(enabled ? '已开启协同' : '已关闭协同');
    }
  } catch {
    showToast('修改失败');
  }
}

function handleCopy(url: string) {
  navigator.clipboard.writeText(url).then(
    () => showToast('链接已复制'),
    () => showToast('复制失败')
  );
}

function handleClose() {
  show.value = false;
  emit('close');
}

function handleBack() {
  step.value = 'form';
}

function getExpiryLabel(item: { expiresAt: string | null }): string {
  if (!item.expiresAt) return '永不过期';
  const expires = typeof item.expiresAt === 'string' ? item.expiresAt : (item.expiresAt as unknown as string);
  const diff = new Date(expires).getTime() - Date.now();
  if (diff <= 0) return '已过期';
  const days = Math.ceil(diff / 86400000);
  return `${days}天后过期`;
}

const expiryOptions = [
  { value: 'never' as const, label: '永不过期' },
  { value: '1d' as const, label: '1天' },
  { value: '3d' as const, label: '3天' },
  { value: '7d' as const, label: '7天' },
  { value: 'custom' as const, label: '自定义' },
];
</script>

<template>
  <van-popup
    v-model:show="show"
    position="bottom"
    round
    :style="{ height: '70vh' }"
    closeable
    title="分享图纸"
    @close="handleClose"
  >
    <div class="share-container">
      <div class="share-header">
        <van-button
          v-if="step === 'result'"
          size="small"
          plain
          @click="handleBack"
        >
          返回
        </van-button>
        <span class="share-title">{{ step === 'form' ? '分享图纸' : '分享链接已创建' }}</span>
      </div>

      <!-- Step 1: Create form -->
      <template v-if="step === 'form'">
        <div class="share-file-name-bar">
          <van-icon name="description-o" size="18" color="#666" />
          <span>{{ state.fileName || '当前图纸' }}</span>
        </div>

        <div class="share-form-group">
          <div class="share-form-row">
            <span class="share-form-label">允许加入实时协同</span>
            <van-switch v-model="collaborationEnabled" size="24" />
          </div>
          <p class="share-form-hint">开启后，接收者可加入实时协同编辑</p>
        </div>

        <div class="share-form-group">
          <span class="share-form-label">有效期</span>
          <div class="share-expiry-grid">
            <van-button
              v-for="opt in expiryOptions"
              :key="opt.value"
              size="small"
              :plain="expiration !== opt.value"
              :type="expiration === opt.value ? 'primary' : 'default'"
              @click="expiration = opt.value"
              class="share-expiry-btn"
            >
              {{ opt.label }}
            </van-button>
          </div>
          <div v-if="expiration === 'custom'" class="share-custom-days">
            <van-field
              v-model="customDays"
              type="digit"
              label="天数"
              placeholder="输入天数"
              :min="1"
              :max="365"
              style="width: 120px;"
            />
          </div>
        </div>

        <van-button
          type="primary"
          block
          round
          size="large"
          :loading="creating"
          :disabled="creating"
          @click="handleCreate"
        >
          创建分享链接
        </van-button>

        <!-- Existing shares list -->
        <div v-if="existingShares.length > 0" class="share-existing">
          <div class="share-existing-title">已有分享链接 ({{ existingShares.length }})</div>
          <div
            v-for="item in existingShares"
            :key="item.token"
            class="share-existing-item"
          >
            <div class="share-existing-info">
              <div class="share-existing-url">
                <span class="share-existing-token">/share/{{ item.token.slice(0, 8) }}...</span>
                <span
                  :class="['share-existing-collab', item.collaborationEnabled ? 'on' : 'off']"
                  @click="handleToggleCollab(item.token, !item.collaborationEnabled)"
                >
                  {{ item.collaborationEnabled ? '协同开' : '协同关' }}
                </span>
              </div>
              <div class="share-existing-meta">
                <span>{{ getExpiryLabel(item) }}</span>
                <span>· {{ item.usedCount }}次</span>
              </div>
            </div>
            <div class="share-existing-actions">
              <van-button size="mini" plain @click="handleCopy(item.url)">复制</van-button>
              <van-button size="mini" plain type="danger" @click="handleRevoke(item.token)">撤销</van-button>
            </div>
          </div>
        </div>
      </template>

      <!-- Step 2: Result -->
      <template v-if="step === 'result'">
        <div class="share-result">
          <van-icon name="success" size="64" color="#07c160" />
          <p class="share-result-title">分享链接已创建</p>

          <div class="share-result-url">
            <span class="share-result-url-text">{{ createdUrl }}</span>
            <van-button
              size="small"
              type="primary"
              plain
              @click="handleCopy(createdUrl)"
            >
              复制
            </van-button>
          </div>

          <div class="share-result-info">
            <span>协同: {{ collaborationEnabled ? '开启' : '关闭' }}</span>
            <span v-if="createdExpiresAt">· {{ getExpiryLabel({ expiresAt: createdExpiresAt }) }}</span>
          </div>

          <div class="share-result-actions">
            <van-button
              type="danger"
              plain
              block
              round
              @click="handleRevoke(createdToken)"
            >
              撤销分享
            </van-button>
          </div>
        </div>
      </template>
    </div>
  </van-popup>
</template>

<style scoped>
.share-container {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.share-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  min-height: 36px;
}

.share-title {
  font-size: 18px;
  font-weight: 600;
  margin-left: 12px;
}

.share-file-name-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
}

.share-form-group {
  margin-bottom: 20px;
}

.share-form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.share-form-label {
  font-size: 15px;
  font-weight: 500;
  display: block;
  margin-bottom: 8px;
}

.share-form-row .share-form-label {
  margin-bottom: 0;
}

.share-form-hint {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
}

.share-expiry-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.share-expiry-btn {
  flex: 1;
  min-width: 60px;
}

.share-custom-days {
  margin-top: 8px;
}

.share-existing {
  margin-top: 24px;
}

.share-existing-title {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin-bottom: 8px;
}

.share-existing-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 8px;
}

.share-existing-info {
  flex: 1;
  min-width: 0;
}

.share-existing-url {
  display: flex;
  align-items: center;
  gap: 6px;
}

.share-existing-token {
  font-size: 13px;
  color: #333;
  font-family: monospace;
}

.share-existing-collab {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  cursor: pointer;
}

.share-existing-collab.on {
  background: #e8f5e9;
  color: #2e7d32;
}

.share-existing-collab.off {
  background: #fff3e0;
  color: #e65100;
}

.share-existing-meta {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.share-existing-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 8px;
}

.share-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 24px;
}

.share-result-title {
  font-size: 18px;
  font-weight: 600;
  margin-top: 12px;
  margin-bottom: 20px;
}

.share-result-url {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 12px;
}

.share-result-url-text {
  flex: 1;
  font-size: 12px;
  color: #333;
  word-break: break-all;
  font-family: monospace;
}

.share-result-info {
  font-size: 13px;
  color: #666;
  margin-bottom: 24px;
}

.share-result-actions {
  width: 100%;
}
</style>
