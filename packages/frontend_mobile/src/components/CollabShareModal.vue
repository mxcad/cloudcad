<script setup lang="ts">
import { ref, computed } from 'vue';
import { t } from '@/languages';
import { showToast } from 'vant';
import QRCode from 'qrcode';
import FloatingPopup from './FloatingPopup.vue';

const props = defineProps<{
  workId: number;
  drawingId?: string;
  projectId?: string | null;
  libraryKey?: 'drawing' | 'block';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const show = ref(true);
const copied = ref(false);
const qrDataUrl = ref('');

const shareUrl = computed(() => {
  const base = window.location.origin + window.location.pathname.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('collabWorkId', String(props.workId));
  if (props.drawingId) params.set('drawingId', props.drawingId);
  if (props.projectId) params.set('projectId', props.projectId);
  if (props.libraryKey) params.set('library', props.libraryKey);
  return `${base}?${params.toString()}`;
});

// Generate QR code on mount
import { onMounted } from 'vue';
onMounted(async () => {
  try {
    qrDataUrl.value = await QRCode.toDataURL(shareUrl.value, {
      width: 160,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    // QR generation failed silently
  }
});

function handleCopy() {
  navigator.clipboard.writeText(shareUrl.value).then(() => {
    copied.value = true;
    showToast(t('链接已复制'));
    setTimeout(() => { copied.value = false; }, 2000);
  }).catch(() => {
    showToast(t('复制失败'));
  });
}

function handleClose() {
  show.value = false;
  emit('close');
}
</script>

<template>
  <FloatingPopup
    v-model:show="show"
    :title="t('分享协同')"
    @close="handleClose"
  >
    <div class="share-body">
      <!-- QR Code -->
      <div v-if="qrDataUrl" class="share-qr-section">
        <img :src="qrDataUrl" alt="QR Code" class="share-qr-img" />
      </div>
      <div v-else class="share-qr-section">
        <div class="share-qr-placeholder" />
      </div>

      <!-- URL -->
      <div class="share-url-section">
        <span class="share-url-text">{{ shareUrl }}</span>
      </div>

      <!-- Copy button -->
      <van-button
        block
        :type="copied ? 'success' : 'primary'"
        :icon="copied ? 'success' : 'link-o'"
        @click="handleCopy"
      >
        {{ copied ? t('已复制') : t('复制链接') }}
      </van-button>
    </div>

    <template #footer>
      <div style="padding: 8px 16px; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));">
        <van-button block plain @click="handleClose">
          {{ t('完成') }}
        </van-button>
      </div>
    </template>
  </FloatingPopup>
</template>

<style scoped lang="scss">
.share-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px;
}

.share-qr-section {
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.share-qr-img {
  display: block;
  width: 160px;
  height: 160px;
}

.share-qr-placeholder {
  width: 160px;
  height: 160px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.share-url-section {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.share-url-text {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  word-break: break-all;
  line-height: 1.5;
}
</style>
