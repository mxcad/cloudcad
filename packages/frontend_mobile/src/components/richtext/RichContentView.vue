<script setup lang="ts">
/**
 * 富文本安全渲染（移动端唯一出口，对齐 PC RichContentView）。
 *
 * 输入为受控编辑器产物 HTML（见 RichtextEditor），渲染前经白名单净化；
 * 之后按 `data-att-id` 从附件映射水合真实资源：
 *  - `<img data-att-id>`：回填缩略图/下载 URL；
 *  - `.fb-att-card` 附件卡片：图纸有缩略图 → 竖排卡片（缩略图 + 文件名 + 查看/下载）；
 *    否则回填「打开附件」下载入口。
 *
 * 移动端适配：无 hover 态，卡片操作按钮常显；查看走 Vant ImagePreview，
 * 下载走唯一出口 triggerUrlDownload（对齐 FeedbackAttachmentDisplay 交互）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { showImagePreview } from 'vant'
import { t } from '@/languages'
import { sanitizeRichText } from '@/utils/richtext'
import { attachmentUrl } from '@/services/feedbackAttachmentService'
import { triggerUrlDownload } from '@/utils/download'
import type { FeedbackAttachmentDto } from '@cloudcad/api-sdk/types.gen'
import './richtext-styles.scss'

const props = withDefaults(
  defineProps<{
    html: string
    /** 附件 id → 附件投影（水合 URL 用） */
    attachmentsById?: Record<string, FeedbackAttachmentDto>
  }>(),
  { attachmentsById: () => ({}) }
)

const rootRef = ref<HTMLElement | null>(null)
const sanitized = computed(() => sanitizeRichText(props.html))

/** 水合真实资源：图片回填 src；附件卡片补缩略图/查看/下载 */
async function hydrate() {
  await nextTick()
  const root = rootRef.value
  if (!root) return
  const map = props.attachmentsById ?? {}
  // 图片：回填 src（缩略图优先 → 查看 URL → 下载 URL）
  for (const img of Array.from(root.querySelectorAll('img[data-att-id]'))) {
    if (img.getAttribute('src')) continue
    const att = map[img.getAttribute('data-att-id') as string]
    const url = attachmentUrl(att?.thumbnailUrl || att?.viewUrl || att?.downloadUrl)
    if (url) (img as HTMLImageElement).src = url
  }
  // 附件卡片：
  //  - REFERENCE（引用图纸）：只读卡片，仅「查看」（打开附件文件 viewUrl），无缩略图无下载；
  //    提交者无 viewUrl → 显示「仅管理员可查看」不可点。
  //  - DRAWING 有缩略图：缩略图卡片（缩略图 + 文件名 + 查看/下载，下载仅管理员有 downloadUrl）。
  //  - 其余（无缩略图图纸/文档/图片）：回填「打开附件」（viewUrl 优先 → downloadUrl）。
  for (const card of Array.from(root.querySelectorAll('.fb-att-card[data-att-id]'))) {
    const att = map[card.getAttribute('data-att-id') as string]
    if (!att) continue
    if (att.type === 'DRAWING' && att.kind === 'REFERENCE') {
      if (att.viewUrl && !card.querySelector('a,button')) {
        const viewUrl = attachmentUrl(att.viewUrl)
        if (viewUrl) {
          const link = document.createElement('button')
          link.type = 'button'
          link.textContent = t('查看')
          link.className = 'fb-att-card-link'
          link.addEventListener('click', () =>
            triggerUrlDownload(viewUrl, att.fileName ?? undefined)
          )
          card.appendChild(link)
        }
      } else if (!att.viewUrl) {
        const hint = document.createElement('span')
        hint.textContent = t('仅管理员可查看')
        hint.className = 'fb-att-card-hint'
        card.appendChild(hint)
      }
      continue
    }
    if (
      att.type === 'DRAWING' &&
      att.thumbnailUrl &&
      !card.querySelector('.fb-att-card-thumb')
    ) {
      card.classList.add('fb-att-card-with-thumb')
      const thumbUrl = attachmentUrl(att.thumbnailUrl)
      const wrap = document.createElement('span')
      wrap.className = 'fb-att-card-thumb-wrap'
      const img = document.createElement('img')
      if (thumbUrl) img.src = thumbUrl
      img.alt = att.fileName || t('图纸')
      img.className = 'fb-att-card-thumb'
      img.loading = 'lazy'
      const actions = document.createElement('span')
      actions.className = 'fb-att-card-actions'
      const view = document.createElement('button')
      view.type = 'button'
      view.textContent = t('查看')
      view.className = 'fb-att-card-action'
      if (thumbUrl) {
        view.addEventListener('click', () => showImagePreview([thumbUrl]))
      } else {
        view.disabled = true
      }
      actions.appendChild(view)
      if (att.downloadUrl) {
        const dl = document.createElement('button')
        dl.type = 'button'
        dl.textContent = t('下载')
        dl.className = 'fb-att-card-action'
        const downloadUrl = attachmentUrl(att.downloadUrl)
        if (downloadUrl) {
          dl.addEventListener('click', () =>
            triggerUrlDownload(downloadUrl, att.fileName ?? undefined)
          )
        }
        actions.appendChild(dl)
      }
      wrap.appendChild(img)
      wrap.appendChild(actions)
      card.insertBefore(wrap, card.firstChild)
      continue
    }
    // 无缩略图图纸：查看(viewUrl) + 下载(downloadUrl，仅管理员) 双按钮
    if (att.type === 'DRAWING') {
      if (att.viewUrl && !card.querySelector('.fb-att-card-link[data-kind="view"]')) {
        const viewUrl = attachmentUrl(att.viewUrl)
        if (viewUrl) {
          const link = document.createElement('button')
          link.type = 'button'
          link.textContent = t('查看')
          link.className = 'fb-att-card-link'
          link.setAttribute('data-kind', 'view')
          link.addEventListener('click', () =>
            triggerUrlDownload(viewUrl, att.fileName ?? undefined)
          )
          card.appendChild(link)
        }
      }
      if (att.downloadUrl && !card.querySelector('.fb-att-card-link[data-kind="download"]')) {
        const downloadUrl = attachmentUrl(att.downloadUrl)
        if (downloadUrl) {
          const link = document.createElement('button')
          link.type = 'button'
          link.textContent = t('下载')
          link.className = 'fb-att-card-link'
          link.setAttribute('data-kind', 'download')
          link.addEventListener('click', () =>
            triggerUrlDownload(downloadUrl, att.fileName ?? undefined)
          )
          card.appendChild(link)
        }
      }
      continue
    }
    // 图片/文档：打开附件（viewUrl 优先 → downloadUrl）
    const openUrl = attachmentUrl(att.viewUrl || att.downloadUrl)
    if (openUrl && !card.querySelector('a,button')) {
      const link = document.createElement('button')
      link.type = 'button'
      link.textContent = t('打开附件')
      link.className = 'fb-att-card-link'
      link.addEventListener('click', () =>
        triggerUrlDownload(openUrl, att.fileName ?? undefined)
      )
      card.appendChild(link)
    }
  }
}

watch([sanitized, () => props.attachmentsById], () => { void hydrate() }, { immediate: true })
</script>

<template>
  <div ref="rootRef" class="rt-content" v-html="sanitized"></div>
</template>
