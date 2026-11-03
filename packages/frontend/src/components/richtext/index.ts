/**
 * 富文本模块出口（PC 端）——任意页面可复用。
 *
 * - RichtextEditor：可复用 contenteditable 编辑器（插入图片/附件卡片、粘贴/拖拽文件）。
 * - RichContentView：可复用安全渲染器（白名单净化 + 按附件 id 水合 URL）。
 * - sanitizeRichText / stripHtmlTags / toPersistableHtml / escapeHtml：工具。
 */
export {
  RichtextEditor,
  default as RichtextEditorDefault,
} from './RichtextEditor';
export type {
  RichtextEditorHandle,
  RichtextEditorProps,
  RichImageInput,
  RichCardInput,
} from './RichtextEditor';
export { RichContentView, default as RichContentViewDefault } from './RichContentView';
export type { RichContentViewProps } from './RichContentView';
export {
  sanitizeRichText,
  stripHtmlTags,
  toPersistableHtml,
  decodeEntities,
  escapeHtml,
} from './sanitizeRichText';
