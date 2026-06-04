<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { cooperateControllerResolveShareNode } from '../../api-sdk';
import { showToast } from 'vant';
import { useUser } from '../../composables/useUser';

const { isAuthenticated } = useUser();

const loading = ref(true);
const error = ref<string | null>(null);
const fileName = ref('');
const collaborationEnabled = ref(false);
const fileId = ref('');
const token = ref('');

function extractToken(): string | null {
  const match = window.location.pathname.match(/\/share\/(.+)/);
  return match ? match[1] : null;
}

onMounted(async () => {
  token.value = extractToken() || '';
  if (!token.value) {
    error.value = '无效的分享链接';
    loading.value = false;
    return;
  }

  try {
    const result = await cooperateControllerResolveShareNode({
      path: { token: token.value },
    });
    if (result.error) {
      error.value = '分享链接不存在或已失效';
      loading.value = false;
      return;
    }
    const data = result.data as {
      name: string;
      id: string;
      collaborationEnabled: boolean;
    };
    fileName.value = data.name || '未知图纸';
    fileId.value = data.id;
    collaborationEnabled.value = data.collaborationEnabled ?? false;
  } catch {
    error.value = '加载分享信息失败';
  }
  loading.value = false;
});

function handleOpen() {
  if (!fileId.value || !token.value) return;
  const target = `/?fileId=${encodeURIComponent(fileId.value)}&shareToken=${encodeURIComponent(token.value)}&fromShare=1`;
  window.location.href = target;
}

function handleLogin() {
  const currentUrl = encodeURIComponent(window.location.href);
  window.location.href = `/login?redirect=${currentUrl}`;
}
</script>

<template>
  <div class="share-landing">
    <div v-if="loading" class="share-landing-body">
      <van-loading type="spinner" color="#1989fa" />
      <p class="share-landing-text">正在加载分享信息...</p>
    </div>

    <div v-else-if="error" class="share-landing-body">
      <van-icon name="warning-o" size="64" color="#ff4444" />
      <p class="share-landing-title">无法打开分享</p>
      <p class="share-landing-text">{{ error }}</p>
    </div>

    <div v-else class="share-landing-body">
      <van-icon name="share-o" size="64" color="#1989fa" />
      <p class="share-landing-title">图纸分享</p>
      <div class="share-file-info">
        <van-icon name="description-o" size="24" color="#666" />
        <span class="share-file-name">{{ fileName }}</span>
      </div>
      <div v-if="collaborationEnabled" class="share-collab-badge">
        <van-icon name="friends-o" size="14" />
        <span>允许实时协同</span>
      </div>
      <div v-else class="share-collab-badge share-collab-badge-off">
        <van-icon name="lock" size="14" />
        <span>仅查看</span>
      </div>

      <div class="share-actions">
        <van-button
          v-if="isAuthenticated"
          type="primary"
          block
          round
          size="large"
          @click="handleOpen"
        >
          打开图纸
        </van-button>
        <van-button
          v-else
          type="primary"
          block
          round
          size="large"
          @click="handleLogin"
        >
          登录后查看
        </van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.share-landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f7f8fa;
  padding: 24px;
  box-sizing: border-box;
}

.share-landing-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 400px;
}

.share-landing-title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-top: 16px;
  margin-bottom: 8px;
}

.share-landing-text {
  font-size: 14px;
  color: #999;
  margin-top: 12px;
}

.share-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 12px 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  width: 100%;
  box-sizing: border-box;
}

.share-file-name {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-collab-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding: 4px 12px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 20px;
  font-size: 12px;
}

.share-collab-badge-off {
  background: #fff3e0;
  color: #e65100;
}

.share-actions {
  margin-top: 32px;
  width: 100%;
}
</style>
