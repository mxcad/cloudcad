<script setup lang="ts">
/**
 * 反馈附件展示（移动端只读）——我的反馈 / 匿名查询结果共用。
 * 缩略图（图片）优先，文档/图纸显示类型徽标。
 * 点按：图片（有 viewUrl）→ Vant 图片预览（可缩放/长按保存）；
 * 其余有 URL → 触发下载；图纸引用（REFERENCE）无 URL → 只展示徽标不可点。
 */
import { computed } from 'vue'
import { showToast, showImagePreview } from 'vant'
import type { FeedbackAttachmentDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { attachmentUrl } from '@/services/feedbackAttachmentService'
import { triggerUrlDownload } from '@/utils/download'

const props = defineProps<{
  attachments?: FeedbackAttachmentDto[] | null
}>()

const TYPE_LABEL: Record<string, string> = {
  IMAGE: '图片',
  DOCUMENT: '文档',
  DRAWING: '图纸',
}
const KIND_LABEL: Record<string, string> = {
  FILE: '副本',
  REFERENCE: '引用',
}

const list = computed(() => props.attachments ?? [])

function formatSize(size: number | null): string {
  if (!size) return ''
  const mb = size / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(1)}MB`
  const kb = size / 1024
  return `${kb.toFixed(0)}KB`
}

function labelOf(att: FeedbackAttachmentDto): string {
  if (att.fileName) return att.fileName
  const typeLabel = t(TYPE_LABEL[att.type] ?? '附件')
  return KIND_LABEL[att.kind]
    ? `${typeLabel}（${t(KIND_LABEL[att.kind])}）`
    : typeLabel
}

function thumbOf(att: FeedbackAttachmentDto): string | null {
  if (att.type !== 'IMAGE') return null
  return attachmentUrl(att.thumbnailUrl || att.viewUrl || att.downloadUrl)
}

function iconText(att: FeedbackAttachmentDto): string {
  if (att.type === 'DRAWING') return 'DWG'
  if (att.type === 'DOCUMENT') return 'DOC'
  return 'IMG'
}

function onOpen(att: FeedbackAttachmentDto) {
  // 图片有 viewUrl → 图片预览（与富文本内联图/库缩略图同模式）
  if (att.type === 'IMAGE' && att.viewUrl) {
    const url = attachmentUrl(att.viewUrl)
    if (url) showImagePreview([url])
    return
  }
  const url = attachmentUrl(att.viewUrl || att.downloadUrl)
  if (!url) return
  triggerUrlDownload(url, att.fileName || undefined)
}
</script>

<template>
  <div v-if="list.length" class="fba-wrap">
    <div
      v-for="att in list"
      :key="att.id"
      class="fba-item"
      :class="{ clickable: !!(att.viewUrl || att.downloadUrl) }"
      @click="onOpen(att)"
    >
      <img v-if="thumbOf(att)" :src="thumbOf(att)!" class="fba-thumb" :alt="labelOf(att)" />
      <span v-else class="fba-badge">{{ iconText(att) }}</span>
      <span class="fba-info">
        <span class="fba-name">{{ labelOf(att) }}</span>
        <span class="fba-size">{{ formatSize(att.size) }}</span>
      </span>
      <van-icon v-if="att.viewUrl || att.downloadUrl" name="arrow" class="fba-arrow" />
    </div>
  </div>
  <div v-else class="fba-empty">{{ t('无附件') }}</div>
</template>

<style scoped lang="scss">
.fba-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fba-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--divider);
  border-radius: 8px;
  background: var(--bg-secondary);
  max-width: 100%;

  &.clickable {
    cursor: pointer;
  }
}

.fba-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.fba-badge {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--bg-tertiary, var(--bg-secondary));
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.fba-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.fba-name {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.fba-size {
  font-size: 11px;
  color: var(--text-tertiary);
}

.fba-arrow {
  font-size: 12px;
  color: var(--text-tertiary);
}

.fba-empty {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
