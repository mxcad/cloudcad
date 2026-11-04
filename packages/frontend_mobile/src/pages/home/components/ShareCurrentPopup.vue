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
import PosterPreviewPopup from '@/components/share/PosterPreviewPopup.vue'
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
  SHARE_POSTER_DEFAULT_LAYOUT,
  type SharePosterLayout,
} from '@cloudcad/platform'
import { errMsg, unwrap } from '@/utils/apiError'
import { shareUrl } from '@/utils/shareUrl'
import { formatShareExpiry } from '@/utils/shareDate'
import { composeSharePosterDataUrl } from '@/utils/sharePoster'
import { triggerBlobDownload } from '@/utils/download'
import type { PosterRegion } from '@/stores/posterRegion'

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
    /** 指定区域结果（home 框选完成后传入）；null/未传 = 整图包围盒 */
    region?: PosterRegion | null
  }>(),
  {
    fileName: '',
    region: null,
  }
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'close'): void
  /** 用户点「指定区域」：请求 home 关闭弹窗、在底层编辑器上框选（当前图纸已打开） */
  (e: 'pick-region'): void
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

// 「已有分享」列表里不重复列刚刚创建的那条：它已在上方结果区展示（二维码 +
// 链接 + 复制 + 有效期），列表区再出一份同样的链接会把「已创建 1 个」显示成
// 两条完全相同的条目，读起来像后端重复建了两条。
const listShares = computed(() =>
  existingShares.value.filter((s) => s.token !== created.value?.token)
)

// 分享图片二维码内容：优先刚创建的分享链接；否则已有分享中最近一条（url 已绝对化）
const activePosterShareUrl = computed(
  () => created.value?.url ?? listShares.value[0]?.url ?? ''
)

async function loadExistingShares() {
  if (!props.fileId) return
  loadingShares.value = true
  try {
    const res = await shareControllerGetFileShares({ path: { fileId: props.fileId } })
    // 权限/网络/业务错误不再静默：留错误态 + 重试，避免「已有分享」区凭空消失
    const raw = unwrap<FileShareItem[]>(res)
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
    const raw = unwrap<{ token?: string; url?: string; expiresAt?: string | null }>(res)
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
    unwrap(res)
    showToast(t('已撤销'))
    if (created.value?.token === item.token) created.value = null
    void loadExistingShares()
  } catch (e) {
    showToast(errMsg(e, t('撤销失败')))
  }
}

// 弹窗打开时拉取已有分享。注意：不再在此重置 created/有效期——它们由 onClose
// （用户主动关闭）清理；指定区域返回时 home 直接设 show=false 不经 onClose，
// created/海报保留（否则指定区域返回会因 created 被清而丢掉分享图片区块）。
watch(
  () => props.show,
  (val) => {
    if (val) {
      void loadExistingShares()
    }
  },
  { immediate: true }
)

// ── 分享图片（海报）：补齐 PC ShareDialog 的分享图片能力 ──
// 当前图纸已在编辑器打开（fileId === editorState.fileId），故出图走
// renderSharePosterInBackground（内部跳过后台开图，不触发 fetchFileNode 登录门槛）；
// 指定区域由 home 关闭弹窗后在底层编辑器框选，结果经 props.region 传回。
// 海报选项（底部名称/二维码大小）与 ShareManagePage C-36 一致：
// 底部名称 = 一个输入框（默认文件名称，清空即不显示）；二维码与「扫一扫看图纸」文字一体缩放。
const posterDataUrl = ref('')
const posterBlob = ref<Blob | null>(null)
const posterHasBorder = ref(false)
const posterGenerating = ref(false)
// 分享图片抽屉（共享 PosterPreviewPopup）：「生成图片」按钮打开；已有海报直接展示
const showPosterPopup = ref(false)
// 当前海报二维码链接：默认刚创建/已有分享最近一条；点某条已有分享「分享图片」时切到该条
const posterShareUrl = ref('')

/** 「生成图片」按钮：始终用默认分享链接（刚创建或已有分享最近一条）。 */
async function openPosterPopup() {
  posterShareUrl.value = activePosterShareUrl.value
  if (!posterDataUrl.value) {
    await generatePoster()
    if (!posterDataUrl.value) return
  }
  showPosterPopup.value = true
}

/** 已有分享行内「分享图片」：用该条分享链接生成/重合成海报并打开抽屉。 */
async function openPosterPopupFor(item: FileShareItem) {
  if (!item.url) {
    showToast(t('分享图片生成失败'))
    return
  }
  posterShareUrl.value = item.url
  if (!posterBlob.value) {
    await generatePoster()
  } else {
    // 海报图纸图可复用（同一图纸），仅换二维码内容重合成
    await rerenderPoster()
  }
  if (posterDataUrl.value) showPosterPopup.value = true
}
const posterRegion = ref<PosterRegion | null>(props.region ?? null)
const footerName = ref('')
const posterQrScale = ref(1)

const posterOpts = computed(() => ({
  footerText: footerName.value.trim() || null,
  qrScale: posterQrScale.value,
}))

// 版式（手机竖版/正方形/横版）：与 PC 一致三档，预览内调整（改动即重合成预览）。
// 版式选择弹层在共享 PosterPreviewPopup 组件内；此处只持有值，变化触发重合成。
const posterLayout = ref<SharePosterLayout>(SHARE_POSTER_DEFAULT_LAYOUT)

/** 出图（有 region 用区域，无 region 整图包围盒）并合成海报预览。 */
async function generatePoster(region?: PosterRegion | null) {
  if (!props.fileId) {
    showToast(t('请先打开图纸'))
    return
  }
  if (!posterShareUrl.value) {
    showToast(t('分享图片生成失败'))
    return
  }
  if (posterGenerating.value) return
  posterGenerating.value = true
  try {
    const { renderSharePosterInBackground } = await import(
      '@/services/backgroundRender'
    )
    // 未显式传 region（「生成分享图片」按钮）时沿用已指定区域；指定区域返回（region 显式传）覆盖
    const effectiveRegion = region !== undefined ? region : posterRegion.value
    const result = await renderSharePosterInBackground(
      props.fileId,
      effectiveRegion ?? null
    )
    if (!result?.posterBlob) {
      showToast(t('分享图片生成失败'))
      return
    }
    posterBlob.value = result.posterBlob
    posterHasBorder.value = result.hasBorder
    // 每次生成，底部名称默认回文件名称（清空输入框即不显示）
    footerName.value = props.fileName
    await rerenderPoster()
  } catch (e) {
    showToast(e instanceof Error && e.message ? e.message : t('分享图片生成失败'))
  } finally {
    posterGenerating.value = false
  }
}

/** 用缓存的图纸图 Blob + 当前海报选项重合成（选项调整时调用；不重新引擎截图）。 */
let posterRecomposeSeq = 0
async function rerenderPoster() {
  if (!posterBlob.value || !posterShareUrl.value) return
  const seq = ++posterRecomposeSeq
  const opts = posterOpts.value
  const next = await composeSharePosterDataUrl({
    shareUrl: posterShareUrl.value,
    fileName: props.fileName,
    thumbnail: posterBlob.value,
    scanText: t('扫一扫看图纸'),
    footerText: opts.footerText,
    qrScale: opts.qrScale,
    layout: posterLayout.value,
    thumbnailHasBorder: posterHasBorder.value,
  })
  // 只认最后一次（连续拖动/输入时旧结果晚到不覆盖新图）；保留旧图直到新图就绪，避免闪烁
  if (seq === posterRecomposeSeq) posterDataUrl.value = next
}

/** 下载当前已合成的海报（所见即所得：预览里是什么就下载什么，不二次生成）。 */
function downloadPoster() {
  const dataUrl = posterDataUrl.value
  if (!dataUrl) {
    showToast(t('分享图片生成失败'))
    return
  }
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/)
  if (!m || !m[2]) {
    showToast(t('分享图片生成失败'))
    return
  }
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  triggerBlobDownload(
    new Blob([bytes], { type: m[1] }),
    `${props.fileName || '分享'}-分享图.png`
  )
  showToast(t('分享图片已下载'))
}

function onPickRegion() {
  // 关闭抽屉让出画布：PosterPreviewPopup 的 van-popup teleport 到 body，
  // 仅关父弹窗（home 里 showShareCurrent=false）不影响它，不关会遮挡底层引擎框选。
  showPosterPopup.value = false
  emit('pick-region')
}

/** 重置海报：恢复默认（整图包围盒、默认版式/二维码大小/底部名称），并用默认方式重新截图。 */
async function handleResetPoster() {
  if (!props.fileId) return
  // 重置全部海报选项为默认（footerName 由 generatePoster 内部默认回文件名称）
  posterRegion.value = null
  posterLayout.value = SHARE_POSTER_DEFAULT_LAYOUT
  posterQrScale.value = 1
  // 显式传 null → renderSharePosterInBackground 走整图包围盒（默认方式），边框按内容包围盒检测
  await generatePoster(null)
}

// 指定区域结果传入（home 框选完成后重开弹窗）→ 用该区域重新出图，完成后自动重开抽屉
watch(
  () => props.region,
  (region) => {
    posterRegion.value = region ?? null
    if (region) {
      void generatePoster(region).then(() => {
        if (posterDataUrl.value) showPosterPopup.value = true
      })
    }
  }
)

// 海报选项变化 → 250ms 节流重合成（连续拖动只留最后一次）
let posterOptsTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [footerName, posterQrScale],
  () => {
    if (posterOptsTimer) clearTimeout(posterOptsTimer)
    posterOptsTimer = setTimeout(() => void rerenderPoster(), 250)
  }
)

// 版式改动 → 重合成预览（组件 emit update:layout 更新 posterLayout）
watch([posterLayout], () => void rerenderPoster())

function onClose() {
  visible.value = false
  // 用户主动关闭：重置分享结果与海报，下次打开是全新面板。
  // 指定区域返回不经 onClose（home 直接设 show=false），created/海报/有效期保留。
  expiration.value = SHARE_EXPIRATION_DEFAULT
  customDays.value = SHARE_CUSTOM_DAYS_DEFAULT
  created.value = null
  qrDataUrl.value = ''
  posterDataUrl.value = ''
  showPosterPopup.value = false
  posterBlob.value = null
  posterRegion.value = props.region ?? null
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
              {{ t('有效期') }}：{{ formatShareExpiry(created.expiresAt) }}
            </div>
          </div>

          <!-- 分享图片（海报）：统一 PosterPreviewPopup 抽屉（与管理页一致）。
               「生成图片」打开抽屉；下载/指定区域/版式/底部名称/二维码大小都在抽屉内。
               有分享链接（刚创建或已有分享最近一条）才可生成。 -->
          <div v-if="activePosterShareUrl" class="sc-section">
            <div class="sc-section-title">{{ t('分享图片') }}</div>
            <button
              class="sc-poster-generate"
              :disabled="posterGenerating"
              @click="openPosterPopup"
            >
              {{ posterGenerating ? t('生成中...') : t('生成分享图片') }}
            </button>
          </div>

          <!-- 已有分享（对齐 PC ShareDialog 列表视图：链接 + 复制 + 有效期 + 撤销）。
               刚创建的那条已在上方结果区展示，若它也是唯一一条，整节收起——
               否则标题下只剩「还没有分享过这个文件」，与结果区自相矛盾。 -->
          <div v-if="!loadingShares && (listShares.length > 0 || !created)" class="sc-section">
            <div class="sc-section-title">
              {{ t('已有分享') }}{{ listShares.length > 0 ? `（${listShares.length}）` : '' }}
            </div>
            <div v-if="sharesLoadFailed" class="sc-share-empty sc-share-empty--error">
              <van-icon name="warning-o" size="20" />
              <span>{{ t('加载失败，请重试') }}</span>
              <button class="sc-retry" @click="loadExistingShares">{{ t('重试') }}</button>
            </div>
            <div v-else-if="listShares.length === 0" class="sc-share-empty">
              {{ t('还没有分享过这个文件') }}
            </div>
            <div v-else class="sc-share-list">
              <div v-for="item in listShares" :key="item.token" class="sc-share-item">
                <div v-if="item.url" class="sc-share-row">
                  <input class="sc-share-url" :value="item.url" readonly />
                  <button class="sc-share-copy" @click="copyExistingShare(item)">
                    <van-icon v-if="copiedKey === item.url" name="success" size="14" />
                    <span v-else>{{ t('复制') }}</span>
                  </button>
                </div>
                <div class="sc-share-row sc-share-row--meta">
                  <span class="sc-share-expiry">{{ formatShareExpiry(item.expiresAt) }}</span>
                  <button
                    class="sc-share-poster"
                    :disabled="posterGenerating"
                    @click="openPosterPopupFor(item)"
                  >
                    <van-icon name="photograph" size="13" />
                    <span>{{ t('分享图片') }}</span>
                  </button>
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

  <!-- 分享图片抽屉（统一 PosterPreviewPopup，与管理页一致）：
       生成/下载/指定区域/版式/底部名称/二维码大小都在抽屉内 -->
  <PosterPreviewPopup
    v-model:show="showPosterPopup"
    :data-url="posterDataUrl"
    :file-name="props.fileName"
    v-model:footer-name="footerName"
    v-model:qr-scale="posterQrScale"
    v-model:layout="posterLayout"
    :generating="posterGenerating"
    :region-active="!!posterRegion"
    @download="downloadPoster"
    @pick-region="onPickRegion"
    @reset="handleResetPoster"
  />
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

/* 分享图片（海报）区块：样式对齐 ShareManagePage C-36 的 poster-preview 面板 */

.sc-poster-generate {
  width: 100%;
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

/* 已有分享行内「分享图片」：打开统一 PosterPreviewPopup 抽屉（用该条分享链接） */
.sc-share-poster {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
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
