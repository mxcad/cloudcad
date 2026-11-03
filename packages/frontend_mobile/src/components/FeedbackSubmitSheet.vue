<script setup lang="ts">
/**
 * 提交反馈底部弹窗（移动端唯一入口）。
 *
 * - 登录：以当前账号身份提交，采纳后可直接发放（仍需客服核实）。
 * - 未登录：可匿名提交（受 `feedback.anonymousEnabled` 与每日限额约束），
 *   但奖励不可匿名 —— 被采纳后须联系客服凭查询码注册/绑定账号才能领取。
 * - 提交成功即返回查询码，用户凭码（+联系方式）可随时查询进度与认领奖励。
 *
 * 与 PC FeedbackSubmitModal 同源同语义（富文本内容，ADR-0085）；source 恒为 'MOBILE'。
 * 反馈内容为富文本（RichtextEditor）：文字 + 行内图片 + 附件卡片（图纸/文档）。
 * - 「上传图片」「上传文档」「上传图纸」按钮：上传后插入到编辑器光标处；
 * - 「引用图纸」：选择个人空间/项目图纸（登录态），转真实附件副本后插入图纸卡片；
 *   移动端反馈入口在壳子页、无引擎实例，故无 PC 的「当前图纸」快捷项；
 * - 粘贴图片/文件：图片 → 上传插行内图片；其余 → 上传插卡片（后端按扩展名定类型）；
 * - 提交时 content 为净化 HTML（toPersistableHtml），附件 id 一并绑定。
 */
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { feedbackControllerCreate } from '@cloudcad/api-sdk/sdk.gen'
import type {
  FeedbackAttachmentDto,
  SubmitFeedbackResultDto,
} from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { errMsg, unwrap } from '@/utils/apiError'
import { copyText } from '@/utils/clipboard'
import { toPersistableHtml, stripHtmlTags } from '@/utils/richtext'
import { useUser } from '@/composables/useUser'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'
import {
  FEEDBACK_TYPE_OPTIONS,
  FEEDBACK_REWARD_RULE,
  getFeedbackAnonToken,
} from '@/constants/feedback'
import {
  isDrawingFile,
  uploadDrawingFile,
  uploadFileAttachment,
  registerDrawing,
} from '@/services/feedbackAttachmentService'
import RichtextEditor from '@/components/richtext/RichtextEditor.vue'
import FeedbackDrawingPicker from '@/components/FeedbackDrawingPicker.vue'
import type { PickedDrawing } from '@/components/FeedbackDrawingPicker.vue'
import { saveLocalFeedbackRecord } from '@/utils/feedbackLocalRecords'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'submitted'): void
}>()

const { isAuthenticated } = useUser()
const { config } = useRuntimeConfig()

const type = ref('SUGGESTION')
const title = ref('')
const contact = ref('')
const submitting = ref(false)
const uploading = ref(false)
const result = ref<SubmitFeedbackResultDto | null>(null)
const copied = ref(false)
const attachments = ref<FeedbackAttachmentDto[]>([])
// 引用图纸选择弹窗
const pickerOpen = ref(false)

const editorRef = ref<InstanceType<typeof RichtextEditor> | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const docInputRef = ref<HTMLInputElement | null>(null)
const drawingInputRef = ref<HTMLInputElement | null>(null)
// 图片附件 id → 本地 objectURL（仅图片；表单重置时统一 revoke，防泄漏）
const previewUrls = new Map<string, string>()
// 实时字数（stripHtmlTags 后的纯文本长度），label 旁展示，超 max 变红
const contentLen = ref(0)

const router = useRouter()

const DOC_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.gif,.webp,.bmp'
const DRAWING_ACCEPT = '.dwg,.dxf,.mxweb'

const minLen = () => config.value.feedbackMinContentLength
const maxLen = () => config.value.feedbackMaxContentLength

// 每次打开重置表单
function resetForm() {
  type.value = 'SUGGESTION'
  title.value = ''
  contact.value = ''
  result.value = null
  copied.value = false
  attachments.value = []
  pickerOpen.value = false
  contentLen.value = 0
  for (const url of previewUrls.values()) URL.revokeObjectURL(url)
  previewUrls.clear()
  editorRef.value?.clear()
}

watch(
  () => props.show,
  (open) => {
    if (open) resetForm()
  }
)

// 登录态变化（登录/登出）时清掉已上传附件：附件归属绑定上传时身份，
// 保留继续提交会被后端拒「附件不属于当前用户」；文本内容保留，用户不必重填
watch(isAuthenticated, () => {
  if (!props.show || !attachments.value.length) return
  for (const att of attachments.value) editorRef.value?.removeAttachment(att.id)
  for (const url of previewUrls.values()) URL.revokeObjectURL(url)
  previewUrls.clear()
  attachments.value = []
  showToast(t('登录状态已变化，已上传的附件已清除，请重新上传'))
})

function close() {
  emit('update:show', false)
}

async function onCopyCode() {
  const code = result.value?.feedbackCode
  if (!code) return
  const r = await copyText(code)
  if (r === 'failed') {
    showToast(t('复制失败'))
    return
  }
  copied.value = true
  showToast(t('查询码已复制'))
}

function addAttachment(att: FeedbackAttachmentDto) {
  attachments.value = [...attachments.value, att]
}

/** 上传前数量上限校验（总数 + 分类型），超限 toast 并返回 false */
function checkAttachmentLimit(type: 'IMAGE' | 'DOCUMENT' | 'DRAWING'): boolean {
  if (attachments.value.length >= config.value.feedbackMaxAttachmentCount) {
    showToast(t('附件总数已达上限，请先删除部分附件'))
    return false
  }
  const count = attachments.value.filter((a) => a.type === type).length
  const max =
    type === 'IMAGE'
      ? config.value.feedbackMaxImageCount
      : type === 'DOCUMENT'
        ? config.value.feedbackMaxDocumentCount
        : config.value.feedbackMaxDrawingCount
  if (count >= max) {
    showToast(
      type === 'IMAGE'
        ? t('图片附件数量已达上限')
        : type === 'DOCUMENT'
          ? t('文档附件数量已达上限')
          : t('图纸附件数量已达上限')
    )
    return false
  }
  return true
}

/** 上传图片 → 在光标处插入行内图片（本地预览 URL + 附件 id 水合标记） */
async function handleUploadImage(file: File) {
  if (file.size > config.value.feedbackMaxImageSize * 1024 * 1024) {
    showToast(
      t('附件大小超过上限（最大 {size}）', {
        size: `${config.value.feedbackMaxImageSize}MB`,
      })
    )
    return
  }
  if (!checkAttachmentLimit('IMAGE')) return
  uploading.value = true
  const previewUrl = URL.createObjectURL(file)
  try {
    const att = await uploadFileAttachment(file, isAuthenticated.value)
    previewUrls.set(att.id, previewUrl)
    editorRef.value?.insertImage({
      src: previewUrl,
      attachmentId: att.id,
      alt: file.name,
    })
    addAttachment(att)
  } catch (e) {
    // 后端文案优先（超限/格式不支持等），网络异常等无后端文案时落回兜底
    showToast(errMsg(e, t('附件上传失败')))
    URL.revokeObjectURL(previewUrl)
  } finally {
    uploading.value = false
  }
}

/** 上传文档 → 在光标处插入文档卡片 */
async function handleUploadDocument(file: File) {
  if (file.size > config.value.feedbackMaxDocumentSize * 1024 * 1024) {
    showToast(
      t('附件大小超过上限（最大 {size}）', {
        size: `${config.value.feedbackMaxDocumentSize}MB`,
      })
    )
    return
  }
  if (!checkAttachmentLimit('DOCUMENT')) return
  uploading.value = true
  try {
    const att = await uploadFileAttachment(file, isAuthenticated.value)
    editorRef.value?.insertAttachmentCard({
      kind: 'FILE',
      label: file.name,
      attachmentId: att.id,
    })
    addAttachment(att)
  } catch (e) {
    showToast(errMsg(e, t('附件上传失败')))
  } finally {
    uploading.value = false
  }
}

/** 上传本地图纸 → 在光标处插入图纸卡片（checkExt=false 时供粘贴路径，后端按扩展名定类型） */
async function handleUploadDrawing(file: File, checkExt = true) {
  if (checkExt && !isDrawingFile(file)) {
    showToast(t('附件类型不支持'))
    return
  }
  if (file.size > config.value.feedbackMaxDrawingSize * 1024 * 1024) {
    showToast(
      t('附件大小超过上限（最大 {size}）', {
        size: `${config.value.feedbackMaxDrawingSize}MB`,
      })
    )
    return
  }
  if (!checkAttachmentLimit('DRAWING')) return
  uploading.value = true
  try {
    const att = await uploadDrawingFile(file, isAuthenticated.value)
    editorRef.value?.insertAttachmentCard({
      kind: 'DRAWING',
      label: file.name,
      attachmentId: att.id,
    })
    addAttachment(att)
  } catch (e) {
    showToast(errMsg(e, t('附件上传失败')))
  } finally {
    uploading.value = false
  }
}

/** 粘贴/拖拽到编辑器的文件：图片 MIME → 图片；图纸扩展名 → 图纸；其余 → 文档（对齐 PC 拖拽语义） */
async function handleEditorFiles(files: File[]) {
  if (uploading.value) return
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await handleUploadImage(file)
    } else if (isDrawingFile(file)) {
      await handleUploadDrawing(file, false)
    } else {
      await handleUploadDocument(file)
    }
  }
}

/** 托盘 chip 预览图：图片=本地 objectURL 优先，图纸=缩略图，文档无预览 */
function attPreviewUrl(att: FeedbackAttachmentDto): string | undefined {
  if (att.type === 'IMAGE') {
    return previewUrls.get(att.id) || att.thumbnailUrl || att.viewUrl || att.downloadUrl || undefined
  }
  return att.thumbnailUrl || undefined
}

/** 托盘 chip 点击主体 → 把已有附件重新插入编辑器（无需重新上传） */
function reinsertAttachment(att: FeedbackAttachmentDto) {
  const name = att.fileName ?? (att.type === 'IMAGE' ? t('图片') : t('附件'))
  if (att.type === 'IMAGE') {
    const src =
      previewUrls.get(att.id) || att.thumbnailUrl || att.viewUrl || att.downloadUrl
    if (src) {
      editorRef.value?.insertImage({ src, attachmentId: att.id, alt: name })
    } else {
      // 无任何可用预览地址时降级为卡片，仍保留附件引用
      editorRef.value?.insertAttachmentCard({
        kind: 'FILE',
        label: name,
        attachmentId: att.id,
      })
    }
    return
  }
  editorRef.value?.insertAttachmentCard({
    kind: att.type === 'DRAWING' ? 'DRAWING' : 'FILE',
    label: name,
    attachmentId: att.id,
  })
}

/** 托盘 chip × → 从编辑器移除该附件全部节点 + 从托盘移除 + 释放 objectURL */
function removeAttachmentFromTray(att: FeedbackAttachmentDto) {
  editorRef.value?.removeAttachment(att.id)
  attachments.value = attachments.value.filter((a) => a.id !== att.id)
  const url = previewUrls.get(att.id)
  if (url) {
    URL.revokeObjectURL(url)
    previewUrls.delete(att.id)
  }
}

/** 编辑器内容变化 → 实时字数（纯文本长度） */
function onEditorChange(html: string) {
  contentLen.value = stripHtmlTags(toPersistableHtml(html)).length
}

/** 引用图纸：未登录提示登录（移动端壳子页无「当前图纸」可引用）；登录态打开选择弹窗 */
function handleReferenceDrawing() {
  if (uploading.value) return
  if (!isAuthenticated.value) {
    showToast(t('请先登录后引用空间图纸'))
    return
  }
  pickerOpen.value = true
}

/** blob → base64 dataURL */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** 节点缩略图 URL → dataURL（失败返回 undefined，卡片降级为仅下载） */
async function resolveThumbnailData(thumbnailUrl: string): Promise<string | undefined> {
  try {
    const resp = await fetch(thumbnailUrl, { credentials: 'include' })
    if (!resp.ok) return undefined
    const blob = await resp.blob()
    return await blobToDataURL(blob)
  } catch {
    return undefined
  }
}

/** 弹窗选中图纸 → 引用（统一转真实附件副本）→ 插入图纸卡片 */
async function handleConfirmPickDrawing(picked: PickedDrawing) {
  pickerOpen.value = false
  if (uploading.value) return
  uploading.value = true
  try {
    const thumbnailData = await resolveThumbnailData(picked.thumbnailUrl)
    const att = await registerDrawing({
      nodeId: picked.nodeId,
      fileName: picked.fileName,
      thumbnailData,
    })
    editorRef.value?.insertAttachmentCard({
      kind: 'DRAWING',
      label: picked.fileName,
      attachmentId: att.id,
    })
    addAttachment(att)
  } catch (e) {
    showToast(errMsg(e, t('引用图纸失败')))
  } finally {
    uploading.value = false
  }
}

function onImageInput() {
  const files = Array.from(imageInputRef.value?.files ?? [])
  for (const file of files) void handleUploadImage(file)
  if (imageInputRef.value) imageInputRef.value.value = ''
}

function onDocInput() {
  const files = Array.from(docInputRef.value?.files ?? [])
  for (const file of files) void handleUploadDocument(file)
  if (docInputRef.value) docInputRef.value.value = ''
}

function onDrawingInput() {
  const file = drawingInputRef.value?.files?.[0]
  if (file) void handleUploadDrawing(file)
  if (drawingInputRef.value) drawingInputRef.value.value = ''
}

async function onSubmit() {
  const trimmedTitle = title.value.trim()
  // content 统一为富文本 HTML：提交前净化 + 剥离本地预览 URL（水合时按附件 id 回填）
  const html = toPersistableHtml(editorRef.value?.getHTML() ?? '')
  const textContent = stripHtmlTags(html)
  // 表单长且可滚动，错误一律 toast（屏幕中央可见），不再放表单底部内联
  if (!trimmedTitle) {
    showToast(t('请填写反馈标题'))
    return
  }
  if (textContent.length < minLen()) {
    showToast(t('反馈内容至少 {n} 个字', { n: minLen() }))
    return
  }
  if (textContent.length > maxLen()) {
    showToast(t('反馈内容不能超过 {n} 个字', { n: maxLen() }))
    return
  }
  if (!isAuthenticated.value && !config.value.feedbackAnonymousEnabled) {
    showToast(t('当前未开启匿名反馈，请登录后提交'))
    return
  }

  submitting.value = true
  try {
    const res = await feedbackControllerCreate({
      throwOnError: true,
      body: {
        type: type.value as 'BUG' | 'SUGGESTION' | 'COMPLAINT' | 'OTHER',
        title: trimmedTitle,
        content: html,
        source: 'MOBILE',
        contact: contact.value.trim() || undefined,
        anonToken: isAuthenticated.value ? undefined : getFeedbackAnonToken(),
        attachmentIds: attachments.value.length
          ? attachments.value.map((a) => a.id)
          : undefined,
        pageUrl:
          typeof window !== 'undefined' ? window.location.href : undefined,
      },
    })
    result.value = res.data as SubmitFeedbackResultDto
    emit('submitted')
    // 本地记录：无论登录与否都写入（未登录用户在本设备查看自己反馈的入口）
    saveLocalFeedbackRecord({
      code: result.value.feedbackCode,
      title: trimmedTitle,
      type: type.value,
      contentHtml: html,
      contact: contact.value.trim() || undefined,
      createdAt: result.value.createdAt,
      source: 'MOBILE',
      anonymous: !isAuthenticated.value,
    })
  } catch (e) {
    // 后端错误文案（如匿名限流）可能较长，顶部 toast 停留 3s 保证可读
    showToast({ message: errMsg(e, t('提交失败')), position: 'top', duration: 3000 })
  } finally {
    submitting.value = false
  }
}

/** 成功视图「查询进度」→ 关抽屉跳查询页并预填查询码 */
function goQueryProgress() {
  const code = result.value?.feedbackCode
  if (!code) return
  close()
  router.push({ path: '/shell/feedback/query', query: { code } })
}
</script>

<template>
  <van-popup :show="show" position="bottom" round :style="{ height: '82%' }" @update:show="close" @close="close">
    <div class="fb-panel">
      <div class="panel-header">
        <button class="panel-cancel" :disabled="submitting" @click="close">{{ t('取消') }}</button>
        <span class="panel-title">{{ result ? t('提交成功') : t('提交反馈') }}</span>
        <button
          v-if="!result"
          class="panel-confirm"
          :disabled="submitting"
          @click="onSubmit"
        >
          {{ submitting ? t('提交中...') : t('提交反馈') }}
        </button>
        <span v-else class="panel-confirm"></span>
      </div>

      <!-- 提交成功态：展示查询码 + 认领提示 -->
      <div v-if="result" class="fb-success">
        <van-icon name="checked" size="48" color="var(--accent)" />
        <span class="fb-success-text">{{ t('反馈提交成功') }}</span>
        <div class="fb-code-box">
          <p class="fb-code-hint">{{ t('请保存以下查询码，用于查询处理进度与认领奖励：') }}</p>
          <div class="fb-code-row">
            <code class="fb-code">{{ result.feedbackCode }}</code>
            <button class="fb-copy-btn" @click="onCopyCode">
              <van-icon v-if="copied" name="success" size="14" />
              <span v-else>{{ t('复制') }}</span>
            </button>
          </div>
        </div>
        <p v-if="result.claimRequired" class="fb-claim-warning">
          {{ t('你的反馈已被采纳为待发放奖励：奖励不能匿名领取，请凭查询码联系客服注册或绑定账号后发放。') }}
        </p>
        <div class="fb-success-actions">
          <button class="fb-query-btn" @click="goQueryProgress">{{ t('查询进度') }}</button>
          <button class="fb-done-btn" @click="close">{{ t('完成') }}</button>
        </div>
      </div>

      <!-- 表单态 -->
      <div v-else class="fb-form">
        <!-- 匿名提交提示：放表单顶部，不滚动即可见（匿名有每日限额，易触发） -->
        <p v-if="!isAuthenticated" class="fb-anon-hint">
          {{ config.feedbackAnonymousEnabled
            ? t('当前未登录，将以匿名方式提交（每日限额内）；奖励需联系客服认领。')
            : t('当前未开启匿名反馈，请登录后提交。') }}
        </p>
        <!-- 奖励规则披露 -->
        <div class="fb-rule">
          <p class="fb-rule-title">{{ t('如何获得奖励') }}</p>
          <p v-for="(rule, i) in FEEDBACK_REWARD_RULE" :key="i" class="fb-rule-line">
            · {{ t(rule) }}
          </p>
        </div>

        <div class="fb-field">
          <label class="fb-label">{{ t('反馈类型') }}</label>
          <div class="fb-chips">
            <button
              v-for="opt in FEEDBACK_TYPE_OPTIONS"
              :key="opt.value"
              :class="['fb-chip', { active: type === opt.value }]"
              :disabled="submitting"
              @click="type = opt.value"
            >
              {{ t(opt.labelKey) }}
            </button>
          </div>
        </div>

        <div class="fb-field">
          <label class="fb-label">{{ t('标题') }}</label>
          <input
            v-model="title"
            class="fb-input"
            :placeholder="t('用一句话概括你的问题或建议')"
            maxlength="100"
            :disabled="submitting"
          />
        </div>

        <div class="fb-field">
          <label class="fb-label">
            {{ t('反馈内容') }}
            <span class="fb-label-hint">{{ t('（{min}~{max} 字，可插入图片/文档/图纸）', { min: minLen(), max: maxLen() }) }}</span>
            <span :class="['fb-label-count', { over: contentLen > maxLen() }]">{{ contentLen }}/{{ maxLen() }}</span>
          </label>
          <RichtextEditor
            ref="editorRef"
            :disabled="submitting || uploading"
            :min-height="140"
            :placeholder="t('请详细描述问题现象、操作步骤或建议方案；可点击下方按钮插入图片、文档或图纸')"
            @files="handleEditorFiles"
            @change="onEditorChange"
          />
          <!-- 插入工具条：图片/文档/图纸/引用，全部插入到编辑器光标处 -->
          <div class="fb-insert-actions">
            <button class="fba-btn" :disabled="submitting || uploading" @click="imageInputRef?.click()">
              <van-icon name="photograph" />
              {{ t('上传图片') }}
            </button>
            <button class="fba-btn" :disabled="submitting || uploading" @click="docInputRef?.click()">
              <van-icon name="description" />
              {{ t('上传文档') }}
            </button>
            <button class="fba-btn" :disabled="submitting || uploading" @click="drawingInputRef?.click()">
              <van-icon name="records-o" />
              {{ t('上传图纸') }}
            </button>
            <button class="fba-btn" :disabled="submitting || uploading" @click="handleReferenceDrawing">
              <van-icon name="link-o" />
              {{ t('引用图纸') }}
            </button>
          </div>
          <p v-if="uploading" class="fb-uploading">
            <van-loading size="14" />
            {{ t('正在上传附件…') }}
          </p>
          <!-- 附件托盘：已上传附件可反复插入（点 chip 主体）或删除（×），无需重新上传 -->
          <div v-if="attachments.length" class="fb-att-tray">
            <div
              v-for="att in attachments"
              :key="att.id"
              class="fb-att-chip"
              :title="`${att.fileName ?? ''}（${t('重新插入')}）`"
              @click="reinsertAttachment(att)"
            >
              <img
                v-if="attPreviewUrl(att)"
                :src="attPreviewUrl(att)"
                class="fb-att-chip-thumb"
                alt=""
              />
              <span v-else class="fb-att-chip-icon">
                {{ att.type === 'DRAWING' ? '📄' : '📎' }}
              </span>
              <span class="fb-att-chip-name">{{ att.fileName ?? (att.type === 'IMAGE' ? t('图片') : t('附件')) }}</span>
              <button
                type="button"
                class="fb-att-chip-remove"
                :aria-label="t('删除附件')"
                @click.stop="removeAttachmentFromTray(att)"
              >
                ×
              </button>
            </div>
          </div>
          <input
            ref="imageInputRef"
            type="file"
            accept="image/*"
            multiple
            class="fb-hidden"
            @change="onImageInput"
          />
          <input
            ref="docInputRef"
            type="file"
            :accept="DOC_ACCEPT"
            multiple
            class="fb-hidden"
            @change="onDocInput"
          />
          <input
            ref="drawingInputRef"
            type="file"
            :accept="DRAWING_ACCEPT"
            class="fb-hidden"
            @change="onDrawingInput"
          />
        </div>

        <div class="fb-field">
          <label class="fb-label">{{ t('联系方式（选填）') }}</label>
          <input
            v-model="contact"
            class="fb-input"
            :placeholder="t('邮箱或手机号，便于回访与查询校验')"
            maxlength="100"
            :disabled="submitting"
          />
        </div>

      </div>
    </div>

    <!-- 引用图纸选择弹窗（与提交弹窗同层，仅登录态可打开） -->
    <FeedbackDrawingPicker v-model:show="pickerOpen" @select="handleConfirmPickDrawing" />
  </van-popup>
</template>

<style scoped lang="scss">
.fb-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 16px;
  border-bottom: 0.5px solid var(--divider);
  flex-shrink: 0;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-cancel {
  border: none;
  background: none;
  font-size: 14px;
  padding: 4px 8px;
  color: var(--text-tertiary);
}

.panel-confirm {
  border: none;
  background: none;
  font-size: 14px;
  padding: 4px 8px;
  color: var(--accent);
  font-weight: 600;
  opacity: 0.5;
  cursor: default;

  &:not(:disabled) {
    opacity: 1;
    cursor: pointer;
  }

  &:disabled {
    pointer-events: none;
  }
}

.fb-form {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 14px;
}

.fb-rule {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-secondary);
  font-size: 12px;
  color: var(--text-secondary);
}

.fb-rule-title {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.fb-rule-line {
  line-height: 1.6;
}

.fb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fb-label {
  font-size: 13px;
  color: var(--text-primary);
}

.fb-label-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 4px;
}

.fb-label-count {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 8px;
  font-variant-numeric: tabular-nums;

  &.over {
    color: #ff4444;
  }
}

.fb-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fb-chip {
  padding: 7px 14px;
  border: 1px solid var(--divider);
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  &:active {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.fb-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--divider);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;

  &:disabled {
    opacity: 0.6;
  }
}

.fb-insert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fba-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border: 1px solid var(--divider);
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.fb-hidden {
  display: none;
}

.fb-uploading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ═══ 附件托盘 ═══ */
.fb-att-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fb-att-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 160px;
  padding: 4px 4px 4px 6px;
  border: 1px solid var(--divider);
  border-radius: 8px;
  background: var(--bg-secondary);
  cursor: pointer;
  user-select: none;

  &:active {
    opacity: 0.8;
  }
}

.fb-att-chip-thumb {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.fb-att-chip-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.fb-att-chip-name {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80px;
}

.fb-att-chip-remove {
  border: none;
  background: none;
  color: var(--text-tertiary);
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  flex-shrink: 0;

  &:active {
    color: #ff4444;
  }
}

.fb-anon-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

/* ═══ 提交成功态 ═══ */
.fb-success {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 0;
}

.fb-success-text {
  font-size: 14px;
  color: var(--text-primary);
}

.fb-code-box {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);
}

.fb-code-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.fb-code-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.fb-code {
  flex: 1;
  font-family: monospace;
  font-size: 16px;
  letter-spacing: 1px;
  color: var(--accent);
  word-break: break-all;
}

.fb-copy-btn {
  flex-shrink: 0;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

.fb-claim-warning {
  font-size: 12px;
  color: #b45309;
  line-height: 1.6;
  padding: 0 8px;
  text-align: center;
}

.fb-success-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.fb-query-btn {
  padding: 10px 24px;
  border: 1px solid var(--divider);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

.fb-done-btn {
  padding: 10px 32px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}
</style>
