<script setup lang="ts">
/**
 * 分享当前图纸（E-07）—— 编辑器菜单「分享」打开的底部弹窗。
 *
 * 对齐 PC ShareDialog 的移动端形态：有效期选择 + 创建 + 链接/二维码 + 复制，
 * 外加当前文件已有的分享列表（撤销）。有效期字段 expiresIn 单位为秒（后端契约）。
 * 数据端点与 ShareManagePage 完全一致（shareController*），此处不重新实现文件选择器。
 */
import { ref, watch, computed } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import QRCode from 'qrcode'
import ShareLinkSheet from '@/components/ShareLinkSheet.vue'
import { copyText } from '@/utils/clipboard'
import { t } from '@/languages'
import { useAuthState } from '@/composables/useAuthState'
import {
  shareControllerCreateShare,
  shareControllerRevokeShare,
  shareControllerGetFileShares,
} from '@cloudcad/api-sdk/sdk.gen'

type Expiration = '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom' | 'never'

interface FileShareItem {
  id: string
  token: string
  name?: string
  expiresAt?: string | null
  usedCount?: number
  createdAt?: string
}

const props = withDefaults(
  defineProps<{
    show: boolean
    fileId: string
    fileName?: string
  }>(),
  {
    fileName: '',
  }
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'close'): void
}>()

const visible = computed({
  get: () => props.show,
  set: (val) => {
    emit('update:show', val)
    if (!val) emit('close')
  },
})

// 壳模式下登录走 PC 页：未登录时给引导，不发起请求
const { isAuthenticated } = useAuthState()

const expiration = ref<Expiration>('7d')
const customDays = ref(1)
const creating = ref(false)
const created = ref<{ token: string; url?: string; expiresAt?: string | null } | null>(null)
const qrDataUrl = ref('')
const existingShares = ref<FileShareItem[]>([])
const loadingShares = ref(false)

const expirationItems: Array<{ value: Expiration; label: string }> = [
  { value: '2h', label: t('2 小时') },
  { value: '6h', label: t('6 小时') },
  { value: '12h', label: t('12 小时') },
  { value: '1d', label: t('1 天') },
  { value: '3d', label: t('3 天') },
  { value: '7d', label: t('7 天') },
  { value: 'custom', label: t('自定义') },
  { value: 'never', label: t('永不过期') },
]

function expiresIn(exp: Expiration): number | undefined {
  if (exp === 'never') return undefined
  if (exp === 'custom') return Math.max(1, customDays.value) * 86400
  return {
    '2h': 7200,
    '6h': 21600,
    '12h': 43200,
    '1d': 86400,
    '3d': 259200,
    '7d': 604800,
  }[exp]
}

function shareUrl(token: string): string {
  return `${location.origin}/share/${token}`
}

async function loadExistingShares() {
  if (!props.fileId) return
  loadingShares.value = true
  try {
    const res = await shareControllerGetFileShares({ path: { fileId: props.fileId } })
    if (res.error) return
    const raw = res.data as FileShareItem[] | undefined
    existingShares.value = Array.isArray(raw) ? raw : []
  } catch {
    existingShares.value = []
  } finally {
    loadingShares.value = false
  }
}

async function handleCreate() {
  if (!props.fileId) {
    showToast(t('请先打开图纸'))
    return
  }
  if (!isAuthenticated.value) {
    showToast(t('请先登录'))
    return
  }
  creating.value = true
  created.value = null
  try {
    const expiresInValue = expiresIn(expiration.value)
    const res = await shareControllerCreateShare({
      body: {
        fileId: props.fileId,
        ...(expiresInValue !== undefined ? { expiresIn: expiresInValue } : {}),
      },
    })
    if (res.error) {
      showToast(String(res.error))
      return
    }
    const raw = res.data as { token?: string; url?: string; expiresAt?: string | null } | undefined
    if (!raw?.token) {
      showToast(t('创建失败，请重试'))
      return
    }
    created.value = { token: raw.token, url: raw.url, expiresAt: raw.expiresAt }
    const url = raw.url || shareUrl(raw.token)
    try {
      qrDataUrl.value = await QRCode.toDataURL(url, { width: 160, margin: 1 })
    } catch {
      qrDataUrl.value = ''
    }
    showToast(t('分享链接已创建'))
    void loadExistingShares()
  } catch {
    showToast(t('创建失败，请重试'))
  } finally {
    creating.value = false
  }
}

const showLinkSheet = ref(false)
const linkSheetUrl = ref('')

async function copyLink() {
  if (!created.value) return
  const url = created.value.url || shareUrl(created.value.token)
  const result = await copyText(url)
  if (result === 'failed') {
    linkSheetUrl.value = url
    showLinkSheet.value = true
    return
  }
  showToast(t('已复制链接'))
}

async function handleRevoke(item: FileShareItem) {
  try {
    await showConfirmDialog({
      title: t('撤销分享'),
      message: t('撤销后对方将无法继续访问该图纸，确定撤销？'),
      confirmButtonText: t('撤销'),
      cancelButtonText: t('取消'),
    })
  } catch {
    return
  }
  try {
    // 撤销端点按 token 查（DELETE /api/v1/shares/:token → findUnique({ where: { token } })），
    // 传 DB id 会 404
    await shareControllerRevokeShare({ path: { token: item.token } })
    showToast(t('已撤销'))
    if (created.value?.token === item.token) created.value = null
    void loadExistingShares()
  } catch {
    showToast(t('撤销失败'))
  }
}

function isShareExpired(item: FileShareItem): boolean {
  if (!item.expiresAt) return false
  const exp = new Date(item.expiresAt).getTime()
  if (Number.isNaN(exp)) return false
  return exp <= Date.now()
}

function formatExpiry(dateStr?: string | null): string {
  if (!dateStr) return t('永不过期')
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return t('永不过期')
  return d.toLocaleDateString()
}

// 弹窗打开时重置并拉取已有分享
watch(
  () => props.show,
  (val) => {
    if (val) {
      expiration.value = '7d'
      customDays.value = 1
      created.value = null
      qrDataUrl.value = ''
      void loadExistingShares()
    }
  },
  { immediate: true }
)

function onClose() {
  visible.value = false
}
</script>

<template>
  <van-popup v-model:show="visible" position="bottom" round :style="{ height: '78%' }">
    <div class="share-current">
      <div class="sc-header">
        <span class="sc-title">{{ t('分享当前图纸') }}</span>
        <van-icon name="cross" size="18" @click="onClose" />
      </div>

      <div class="sc-body">
        <!-- 未登录引导 -->
        <div v-if="!isAuthenticated" class="sc-empty">
          <span class="sc-empty-text">{{ t('请先登录后再分享图纸') }}</span>
        </div>
        <!-- 未打开图纸 -->
        <div v-else-if="!fileId" class="sc-empty">
          <span class="sc-empty-text">{{ t('请先打开图纸') }}</span>
        </div>

        <template v-else>
          <!-- 文件信息 -->
          <div class="sc-file">
            <van-icon name="description" size="22" />
            <span class="sc-file-name">{{ fileName || t('当前图纸') }}</span>
          </div>

          <!-- 有效期 -->
          <div class="sc-section">
            <div class="sc-section-title">{{ t('链接有效期') }}</div>
            <div class="sc-expiry-grid">
              <div
                v-for="item in expirationItems"
                :key="item.value"
                class="sc-expiry"
                :class="{ 'sc-expiry--active': expiration === item.value }"
                @click="expiration = item.value"
              >
                {{ item.label }}
              </div>
            </div>
            <van-field
              v-if="expiration === 'custom'"
              v-model="customDays"
              type="number"
              :label="t('天数')"
              :placeholder="t('请输入天数')"
              input-align="right"
            />
          </div>

          <!-- 创建 -->
          <button class="sc-create" :disabled="creating" @click="handleCreate">
            {{ creating ? t('创建中...') : t('创建分享链接') }}
          </button>

          <!-- 创建成功：链接 + 二维码 -->
          <div v-if="created" class="sc-result">
            <div class="sc-qr">
              <img v-if="qrDataUrl" :src="qrDataUrl" :alt="t('分享二维码')" class="sc-qr-img" />
            </div>
            <div class="sc-link">
              <input class="sc-link-input" :value="created.url || shareUrl(created.token)" readonly />
              <button class="sc-copy" @click="copyLink">{{ t('复制') }}</button>
            </div>
            <div class="sc-expiry-note">
              {{ t('有效期') }}：{{ formatExpiry(created.expiresAt) }}
            </div>
          </div>

          <!-- 已有分享 -->
          <div v-if="existingShares.length > 0" class="sc-section">
            <div class="sc-section-title">
              {{ t('已有分享') }}（{{ existingShares.length }}）
            </div>
            <van-loading v-if="loadingShares" size="20" />
            <div v-else class="sc-share-list">
              <div v-for="item in existingShares" :key="item.id" class="sc-share-item">
                <div class="sc-share-info">
                  <span class="sc-share-expiry">{{ formatExpiry(item.expiresAt) }}</span>
                  <span v-if="isShareExpired(item)" class="sc-share-status">{{ t('已过期') }}</span>
                  <span v-if="typeof item.usedCount === 'number'" class="sc-share-used">
                    {{ t('已访问 {count} 次', { count: String(item.usedCount) }) }}
                  </span>
                </div>
                <button class="sc-revoke" @click="handleRevoke(item)">{{ t('撤销') }}</button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </van-popup>

  <ShareLinkSheet v-model:show="showLinkSheet" :url="linkSheetUrl" />
</template>

<style scoped lang="scss">
.share-current {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}

.sc-title {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
}

.sc-header :deep(.van-icon-cross) {
  color: var(--text-primary);
}

.sc-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.sc-empty {
  padding: 40px 0;
  text-align: center;
}

.sc-empty-text {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.sc-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.sc-file-name {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-section-title {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.sc-expiry-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.sc-expiry {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;

  &--active {
    color: var(--primary);
    border-color: var(--primary);
    font-weight: 600;
  }
}

.sc-create {
  padding: 12px;
  font-size: var(--font-size-body);
  font-weight: 600;
  color: #fff;
  background: var(--accent, #00a99e);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.sc-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.sc-qr-img {
  width: 160px;
  height: 160px;
  border-radius: var(--radius-md);
}

.sc-link {
  width: 100%;
  display: flex;
  gap: 8px;
}

.sc-link-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.sc-copy {
  flex-shrink: 0;
  padding: 0 18px;
  font-size: var(--font-size-sm);
  color: #fff;
  background: var(--accent, #00a99e);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.sc-expiry-note {
  font-size: 12px;
  color: var(--text-tertiary);
}

.sc-share-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sc-share-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.sc-share-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sc-share-expiry {
  font-size: 12px;
  color: var(--text-primary);
}

.sc-share-status {
  font-size: 11px;
  color: var(--text-tertiary);
}

.sc-share-used {
  font-size: 11px;
  color: var(--text-tertiary);
}

.sc-revoke {
  flex-shrink: 0;
  padding: 5px 14px;
  font-size: 12px;
  color: var(--error, #ef4444);
  background: transparent;
  border: 1px solid var(--error, #ef4444);
  border-radius: var(--radius-md);
  cursor: pointer;
}
</style>
