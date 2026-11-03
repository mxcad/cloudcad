<script setup lang="ts">
/**
 * 可复用富文本编辑器（移动端，contenteditable 实现，无第三方富文本依赖）。
 *
 * 与 PC RichtextEditor（frontend/src/components/richtext/RichtextEditor.tsx）同源同语义：
 *  - 非受控：内容由 DOM 持有，`getHTML()` 读取；避免受控 value + innerHTML
 *    重设导致的 caret 跳位。
 *  - 粘贴图片文件交给 `emit('files')`（父组件负责上传，完成后调用
 *    `insertImage`/`insertAttachmentCard` 插入）；粘贴文本仅插入纯文本，
 *    不导入外部富文本，保证 content 可控。
 *  - 插入统一经 caret 位置（`document.execCommand` 兼容所有现代移动浏览器）。
 *  - 对外暴露命令式句柄（insertImage/insertAttachmentCard/insertHTML/getHTML/clear/focus）。
 *
 * 移动端适配：工具条按钮 pointerdown preventDefault 防失焦（保住选区），
 * pointerup 执行命令（触摸隐式指针捕获保证 pointerup 落在按钮上）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '@/languages'
import './richtext-styles.scss'

export interface RichImageInput {
  /** 图片地址（http(s) 或本地 objectURL 预览） */
  src: string
  /** 上传成功后的附件 id（水合用），可为空 */
  attachmentId?: string
  alt?: string
}

export interface RichCardInput {
  /** 卡片类型（DRAWING=图纸 / FILE=文档） */
  kind: 'DRAWING' | 'FILE'
  /** 卡片展示文案（文件名/图纸名） */
  label: string
  /** 附件 id */
  attachmentId?: string
}

const props = withDefaults(
  defineProps<{
    /** 空内容占位文案 */
    placeholder?: string
    /** 禁用编辑 */
    disabled?: boolean
    /** 最小高度（px） */
    minHeight?: number
    /** 是否显示格式工具条（加粗/斜体/列表/撤销等） */
    showToolbar?: boolean
    ariaLabel?: string
  }>(),
  { minHeight: 120, showToolbar: true }
)

const emit = defineEmits<{
  /** 粘贴到文件（图片、文档、图纸）时回调，父组件负责上传 */
  (e: 'files', files: File[]): void
  /** 内容变化回调（原始 HTML） */
  (e: 'change', html: string): void
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const activeCmds = ref<Record<string, boolean>>({})

interface ToolbarAction {
  command: string
  label: string
  /** lucide 图标路径（与 PC lucide-react 同形） */
  paths: string[]
}

const toolbarActions: ToolbarAction[] = [
  {
    command: 'bold',
    label: '加粗',
    paths: ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'],
  },
  { command: 'italic', label: '斜体', paths: ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'] },
  { command: 'underline', label: '下划线', paths: ['M6 4v7a6 6 0 0 0 12 0V4', 'M4 20h16'] },
  {
    command: 'strikeThrough',
    label: '删除线',
    paths: ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'],
  },
  {
    command: 'insertUnorderedList',
    label: '无序列表',
    paths: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  },
  {
    command: 'insertOrderedList',
    label: '有序列表',
    paths: ['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 6h1v4', 'M4 10h2', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
  },
  {
    command: 'undo',
    label: '撤销',
    paths: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11'],
  },
  {
    command: 'redo',
    label: '重做',
    paths: ['m15 14 5-5-5-5', 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13'],
  },
]

/** 在光标处执行命令（focus 保住/恢复选区） */
function exec(command: string, value?: string) {
  const el = editorRef.value
  if (!el || props.disabled) return
  el.focus()
  document.execCommand(command, false, value)
}

/** 插入 HTML 到光标处 */
function insertHTML(html: string) {
  const el = editorRef.value
  if (!el) return
  // 上传中 disabled → contentEditable=false，execCommand('insertHTML') 会返回
  // false 且不插入（PC 实测）。上传回调在恢复可编辑态之前触发，故此处
  // 临时恢复可编辑态以完成插入；同步执行完毕，框架下次渲染按 disabled 重置。
  const wasEditable = el.contentEditable === 'true'
  if (!wasEditable) el.contentEditable = 'true'
  el.focus()
  // caret 兜底：插入按钮（上传图片/图纸/引用）点击后焦点已离开编辑器，
  // 无有效选区时 execCommand 会插入到文档当前选区（可能在编辑器外）或失败，
  // 故把 caret 移到内容末尾再插入。
  const sel = window.getSelection()
  const rangeInEditor =
    sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)
  if (!rangeInEditor) {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  document.execCommand('insertHTML', false, html)
  emit('change', el.innerHTML)
}

/** 在光标处插入图片 */
function insertImage(input: RichImageInput) {
  const attrs = [
    `src="${input.src}"`,
    input.attachmentId ? `data-att-id="${input.attachmentId}"` : '',
    input.alt ? `alt="${escapeAttr(input.alt)}"` : `alt="${escapeAttr(t('反馈图片'))}"`,
    'contenteditable="false"',
  ]
    .filter(Boolean)
    .join(' ')
  insertHTML(`<img ${attrs}>`)
}

/** 在光标处插入附件卡片（图纸/文档引用） */
function insertAttachmentCard(input: RichCardInput) {
  const icon = input.kind === 'DRAWING' ? '📄' : '📎'
  const label = escapeAttr(input.label)
  const attrs = [
    'contenteditable="false"',
    `data-kind="${input.kind}"`,
    `data-label="${label}"`,
    input.attachmentId ? `data-att-id="${input.attachmentId}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const html =
    `<span class="fb-att-card" ${attrs} data-att-card="1">` +
    `<span class="fb-att-card-icon">${icon}</span>` +
    `<span class="fb-att-card-label">${label}</span>` +
    `</span>`
  insertHTML(html)
}

/** 移除指定附件 id 的所有节点（图片/卡片），触发 change 让父组件同步 HTML */
function removeAttachment(attachmentId: string) {
  const el = editorRef.value
  if (!el) return
  // 按属性值精确匹配（避免 CSS 选择器转义边界，id 可含任意字符）
  for (const node of Array.from(el.querySelectorAll('[data-att-id]'))) {
    if (node.getAttribute('data-att-id') === attachmentId) {
      node.remove()
    }
  }
  emit('change', el.innerHTML)
}

/** 读取当前 HTML（原始，未净化；提交前请经 toPersistableHtml） */
function getHTML(): string {
  return editorRef.value?.innerHTML ?? ''
}

function clear() {
  if (editorRef.value) {
    editorRef.value.innerHTML = ''
    emit('change', '')
  }
}

function focus() {
  editorRef.value?.focus()
}

defineExpose({
  insertImage,
  insertAttachmentCard,
  insertHTML,
  removeAttachment,
  getHTML,
  clear,
  focus,
})

/** 收集剪贴板文件：files 优先；iOS Safari 图片粘贴 files 为空时从 items 取 */
function collectClipboardFiles(cd: DataTransfer | null): File[] {
  if (!cd) return []
  if (cd.files && cd.files.length > 0) return Array.from(cd.files)
  const out: File[] = []
  for (const item of Array.from(cd.items ?? [])) {
    if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f) out.push(f)
    }
  }
  return out
}

/** 处理粘贴：图片/文件 → files 事件；文本 → 仅纯文本 */
function onPaste(e: ClipboardEvent) {
  if (props.disabled) return
  const files = collectClipboardFiles(e.clipboardData)
  if (files.length > 0) {
    e.preventDefault()
    emit('files', files)
    return
  }
  // 仅纯文本：避免外部富文本（含脚本/样式）污染
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') ?? ''
  exec('insertText', text)
}

function onInput() {
  emit('change', editorRef.value?.innerHTML ?? '')
}

/** 同步工具条按钮激活态（selectionchange 全局监听，卸载时移除） */
function syncToolbarStates() {
  const el = editorRef.value
  if (!el || !props.showToolbar) return
  for (const action of toolbarActions) {
    if (action.command === 'undo' || action.command === 'redo') {
      activeCmds.value[action.command] = false
      continue
    }
    try {
      activeCmds.value[action.command] = document.queryCommandState(action.command)
    } catch {
      /* queryCommandState 可能抛错（未聚焦），忽略 */
    }
  }
}

onMounted(() => {
  document.addEventListener('selectionchange', syncToolbarStates)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', syncToolbarStates)
})

/** 反转义属性值 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>

<template>
  <div class="rt-editor" :class="{ 'rt-editor--toolbar': showToolbar }">
    <div
      v-if="showToolbar"
      class="rt-editor-toolbar"
      role="toolbar"
      :aria-label="t('格式工具条')"
    >
      <button
        v-for="action in toolbarActions"
        :key="action.command"
        type="button"
        class="rt-tool"
        :class="{ 'is-active': activeCmds[action.command] }"
        :title="t(action.label)"
        :aria-label="t(action.label)"
        :disabled="disabled"
        @pointerdown.prevent
        @pointerup="exec(action.command)"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-for="(d, i) in action.paths" :key="i" :d="d" />
        </svg>
      </button>
    </div>
    <div
      ref="editorRef"
      class="rt-editor-body"
      role="textbox"
      aria-multiline="true"
      :contenteditable="!disabled"
      :aria-label="ariaLabel ?? t('反馈内容')"
      :data-placeholder="placeholder"
      :style="{ minHeight: `${minHeight}px` }"
      @paste="onPaste"
      @input="onInput"
    />
  </div>
</template>
