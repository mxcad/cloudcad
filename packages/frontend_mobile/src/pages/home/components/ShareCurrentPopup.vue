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
import { useShareLinkCopy } from '@/composables/useShareLinkCopy'
import { t } from '@/languages'
import { useAuthState } from '@/composables/useAuthState'
import {
  shareControllerCreateShare,
  shareControllerRevokeShare,
  shareControllerGetFileShares,
} from '@cloudcad/api-sdk/sdk.gen'
import {
  SHARE_CUSTOM_DAYS_DEFAULT,
  SHARE_CUSTOM_DAYS_MAX,
  SHARE_CUSTOM_DAYS_MIN,
  SHARE_EXPIRATION_DEFAULT,
  clampCustomDays,
  computeExpiresInSeconds,
  type ShareExpirationOption,
} from '@cloudcad/platform'
import { errMsg } from '@/utils/apiError'
import { shareUrl } from '@/utils/shareUrl'

// 后端 getFileShares 只返回 token/url/expiresAt/createdAt/createdBy/fileName
// （无 id、无 usedCount，且服务端已过滤掉已过期项）
interface FileShareItem {
  token: string
  url?: string
  expiresAt?: string | null
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

// 显式类型：档位含第 9 档 'immediate'（对齐 PC ExpirationPicker 九档）
const expiration = ref<ShareExpirationOption>(SHARE_EXPIRATION_DEFAULT)
const customDays = ref(SHARE_CUSTOM_DAYS_DEFAULT)
const creating = ref(false)
const created = ref<{ token: string; url?: string; expiresAt?: string | null } | null>(null)
const qrDataUrl = ref('')
const existingShares = ref<FileShareItem[]>([])
const loadingShares = ref(false)
// G-09：已有分享加载失败不再静默吞掉（对齐 PC 的 listError 状态）
const sharesLoadFailed = ref(false)

const expirationItems: Array<{ value: ShareExpirationOption; label: string }> = [
  { value: '2h', label: t('2 小时') },
  { value: '6h', label: t('6 小时') },
  { value: '12h', label: t('12 小时') },
  { value: '1d', label: t('1 天') },
  { value: '3d', label: t('3 天') },
  { value: '7d', label: t('7 天') },
  { value: 'custom', label: t('自定义') },
  { value: 'immediate', label: t('立即过期') },
  { value: 'never', label: t('永不过期') },
]

// 预设秒数收敛到 @cloudcad/platform（与 PC 共用）
function expiresIn(exp: ShareExpirationOption): number | undefined {
  return computeExpiresInSeconds(exp, customDays.value)
}

// 自定义天数输入实时钳制：显示=保存（van-field 回传字符串，Number() 归一后走同一 clampCustomDays）
function onCustomDaysInput(v: string | number) {
  customDays.value = clampCustomDays(Number(v))
}

// 分享链接一律取后端返回的 url（CreateShareResponseDto.url 必填）。
// 不本地拼 `/share/{token}`——PC 端只有 `/shares`（管理页）、移动端路由表里也没有
// `/share/:token`，拼出来是两端都打不开的死链。后端漏返回 url 时宁可显示为空并
// 提示失败，也不生成一个静默失效的链接。

async function loadExistingShares() {
  if (!props.fileId) return
  loadingShares.value = true
  try {
    const res = await shareControllerGetFileShares({ path: { fileId: props.fileId } })
    if (res.error) {
      // 权限/网络错误不再静默：留错误态 + 重试，避免「已有分享」区凭空消失
      sharesLoadFailed.value = true
      existingShares.value = []
      return
    }
    const raw = res.data as FileShareItem[] | undefined
    // url 在后端是相对 path，展示/复制前统一绝对化（与 ShareManagePage 同一出口）
    existingShares.value = Array.isArray(raw)
      ? raw.map((s) => ({ ...s, url: shareUrl(s.url) }))
      : []
    sharesLoadFailed.value = false
  } catch {
    sharesLoadFailed.value = true
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
      showToast(errMsg(res.error, t('创建失败，请重试')))
      return
    }
    const raw = res.data as { token?: string; url?: string; expiresAt?: string | null } | undefined
    if (!raw?.token) {
      showToast(t('创建失败，请重试'))
      return
    }
    created.value = { token: raw.token, url: shareUrl(raw.url), expiresAt: raw.expiresAt }
    if (!raw.url) {
      showToast(t('创建失败，请重试'))
      return
    }
    try {
      qrDataUrl.value = await QRCode.toDataURL(raw.url, { width: 160, margin: 1 })
    } catch {
      qrDataUrl.value = ''
    }
    showToast(t('分享链接已创建'))
    void loadExistingShares()
  } catch (e) {
    showToast(errMsg(e, t('创建失败，请重试')))
  } finally {
    creating.value = false
  }
}

// 复制走唯一出口 useShareLinkCopy（与 ShareManagePage 共用同一套回落 + 行内反馈）
const { copiedKey, showLinkSheet, linkSheetUrl, copy } = useShareLinkCopy()

function copyLink() {
  void copy(created.value?.url ?? '')
}

function copyExistingShare(item: FileShareItem) {
  void copy(item.url ?? '')
}

async function handleRevoke(item: FileShareItem) {
  try {
    await showConfirmDialog({
      title: t('撤销分享'),
      message: t('撤销后该分享链接将立即失效，确定撤销？'),
      confirmButtonText: t('撤销'),
      cancelButtonText: t('取消'),
    })
  } catch {
    return
  }
  try {
    // 撤销端点按 token 查（DELETE /api/v1/shares/:token → findUnique({ where: { token } })），
    // 传 DB id 会 404
    const res = await shareControllerRevokeShare({ path: { token: item.token } })
    if (res.error) {
      showToast(errMsg(res.error, t('撤销失败')))
      return
    }
    showToast(t('已撤销'))
    if (created.value?.token === item.token) created.value = null
    void loadExistingShares()
  } catch (e) {
    showToast(errMsg(e, t('撤销失败')))
  }
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
      expiration.value = SHARE_EXPIRATION_DEFAULT
      customDays.value = SHARE_CUSTOM_DAYS_DEFAULT
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
              :model-value="customDays"
              type="number"
              :label="t('天数')"
              :placeholder="t('请输入天数')"
              input-align="right"
              :min="SHARE_CUSTOM_DAYS_MIN"
              :max="SHARE_CUSTOM_DAYS_MAX"
              @update:model-value="onCustomDaysInput"
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
              <input class="sc-link-input" :value="created.url || ''" readonly />
              <button class="sc-copy" @click="copyLink">
                <van-icon v-if="copiedKey === created?.url" name="success" size="14" />
                <span v-else>{{ t('复制') }}</span>
              </button>
            </div>
            <div class="sc-expiry-note">
              {{ t('有效期') }}：{{ formatExpiry(created.expiresAt) }}
            </div>
          </div>

          <!-- 已有分享（对齐 PC ShareDialog 列表视图：链接 + 复制 + 有效期 + 撤销） -->
          <div v-if="!loadingShares" class="sc-section">
            <div class="sc-section-title">
              {{ t('已有分享') }}{{ existingShares.length > 0 ? `（${existingShares.length}）` : '' }}
            </div>
            <div v-if="sharesLoadFailed" class="sc-share-empty sc-share-empty--error">
              <van-icon name="warning-o" size="20" />
              <span>{{ t('加载失败，请重试') }}</span>
              <button class="sc-retry" @click="loadExistingShares">{{ t('重试') }}</button>
            </div>
            <div v-else-if="existingShares.length === 0" class="sc-share-empty">
              {{ t('还没有分享过这个文件') }}
            </div>
            <div v-else class="sc-share-list">
              <div v-for="item in existingShares" :key="item.token" class="sc-share-item">
                <div v-if="item.url" class="sc-share-row">
                  <input class="sc-share-url" :value="item.url" readonly />
                  <button class="sc-share-copy" @click="copyExistingShare(item)">
                    <van-icon v-if="copiedKey === item.url" name="success" size="14" />
                    <span v-else>{{ t('复制') }}</span>
                  </button>
                </div>
                <div class="sc-share-row sc-share-row--meta">
                  <span class="sc-share-expiry">{{ formatExpiry(item.expiresAt) }}</span>
                  <button class="sc-revoke" @click="handleRevoke(item)">{{ t('撤销') }}</button>
                </div>
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
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.sc-share-row {
  display: flex;
  align-items: center;
  gap: 8px;

  &--meta {
    justify-content: space-between;
  }
}

.sc-share-url {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.sc-share-copy {
  flex-shrink: 0;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.sc-share-expiry {
  font-size: 12px;
  color: var(--text-tertiary);
}

.sc-share-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.sc-share-empty--error {
  color: var(--error, #ef4444);
}

.sc-retry {
  padding: 4px 14px;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
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
