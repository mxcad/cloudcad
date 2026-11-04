import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Undo2,
  Redo2,
} from 'lucide-react';
import { t } from '@/languages';
import { RICHTEXT_CSS } from './richtextStyles';

/**
 * 可复用富文本编辑器（PC 端，contenteditable 实现，无第三方富文本依赖）。
 *
 * 设计要点：
 *  - 非受控：内容由 DOM 持有，`getHTML()` 读取；避免受控 value + innerHTML
 *    重设导致的 caret 跳位。
 *  - 粘贴/拖拽图片文件交给 `onFiles(files)`（父组件负责上传，完成后调用
 *    `insertImage`/`insertAttachmentCard` 插入）；粘贴文本仅插入纯文本，
 *    不导入外部富文本，保证 content 可控。
 *  - 插入统一经 caret 位置（`document.execCommand` 兼容所有现代浏览器）。
 *  - 对外暴露命令式句柄（insertImage/insertCard/insertHTML/getHTML/clear/focus）。
 *
 * 任意页面可复用：反馈、评论、公告等需要「文本 + 行内图片 + 附件卡片」的场景。
 */

export interface RichImageInput {
  /** 图片地址（http(s) 或本地 objectURL 预览） */
  src: string;
  /** 上传成功后的附件 id（水合用），可为空 */
  attachmentId?: string;
  alt?: string;
}

export interface RichCardInput {
  /** 卡片类型（DRAWING=图纸 / FILE=文档） */
  kind: 'DRAWING' | 'FILE';
  /** 卡片展示文案（文件名/图纸名） */
  label: string;
  /** 附件 id */
  attachmentId?: string;
}

export interface RichtextEditorHandle {
  /** 在光标处插入图片 */
  insertImage(input: RichImageInput): void;
  /** 在光标处插入附件卡片（图纸/文档引用） */
  insertAttachmentCard(input: RichCardInput): void;
  /** 在光标处插入任意已净化 HTML */
  insertHTML(html: string): void;
  /** 移除编辑器内所有指向该附件 id 的节点（图片/卡片），用于附件托盘删除 */
  removeAttachment(attachmentId: string): void;
  /** 读取当前 HTML（原始，未净化；提交前请经 toPersistableHtml） */
  getHTML(): string;
  clear(): void;
  focus(): void;
}

export interface RichtextEditorProps {
  /** 空内容占位文案 */
  placeholder?: string;
  /** 禁用编辑 */
  disabled?: boolean;
  /** 最小高度（px） */
  minHeight?: number;
  /** 是否显示格式工具条（加粗/斜体/列表/撤销等） */
  showToolbar?: boolean;
  /** 粘贴/拖拽到文件（图片、文档、图纸）时回调，父组件负责上传 */
  onFiles?: (files: File[]) => void;
  /** 内容变化回调（原始 HTML） */
  onChange?: (html: string) => void;
  className?: string;
  ariaLabel?: string;
}

interface ToolbarAction {
  label: string;
  icon: React.ReactNode;
  command: string;
  state?: string;
  value?: string;
}

export const RichtextEditor = forwardRef<RichtextEditorHandle, RichtextEditorProps>(
  function RichtextEditor(
  {
    placeholder,
    disabled = false,
    minHeight = 120,
    showToolbar = true,
    onFiles,
    onChange,
    className,
    ariaLabel,
  },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  /** 编辑器内最后一次有效选区：弹层/文件对话框夺走焦点后，insertHTML 据此
   *  恢复原光标位置（否则 focus() 会把 caret 放到编辑器开头） */
  const savedRangeRef = useRef<Range | null>(null);

  /** 恢复/保存 caret 并在光标处执行命令 */
  const exec = useCallback((command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
  }, []);

  /** 插入 HTML 到光标处 */
  const insertHTML = useCallback(
    (html: string) => {
      const el = editorRef.current;
      if (!el) return;
      // 上传中 disabled → contentEditable=false，execCommand('insertHTML') 会返回
      // false 且不插入（实测）。上传回调在 setUploading(false) 之前触发，故此处
      // 临时恢复可编辑态以完成插入；同步执行完毕，React 下次渲染按 disabled 重置。
      const wasEditable = el.contentEditable === 'true';
      if (!wasEditable) el.contentEditable = 'true';
      // caret 兜底：插入按钮（上传图片/图纸/引用）点击后焦点已离开编辑器，
      // 无有效选区时 execCommand 会插入到文档当前选区（可能在编辑器外）或失败。
      // 必须在 focus() 之前检查当前选区（focus 会把 caret 放到编辑器开头，
      // 使检查恒为 true、插入落到开头）：优先恢复最后一次编辑器内选区
      // （即点击按钮前的光标位置）；保存选区节点已被移除（如 clear 后）
      // 则退到内容末尾。
      const sel = window.getSelection();
      const rangeInEditor =
        sel &&
        sel.rangeCount > 0 &&
        el.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (!rangeInEditor) {
        const saved = savedRangeRef.current;
        const savedValid =
          saved !== null &&
          el.contains(saved.startContainer) &&
          el.contains(saved.endContainer);
        const range = savedValid
          ? saved
          : (() => {
              const r = document.createRange();
              r.selectNodeContents(el);
              r.collapse(false);
              return r;
            })();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      el.focus();
      document.execCommand('insertHTML', false, html);
      onChange?.(el.innerHTML);
    },
    [onChange]
  );

  const insertImage = useCallback(
    (input: RichImageInput) => {
      const attrs = [
        `src="${input.src}"`,
        input.attachmentId ? `data-att-id="${input.attachmentId}"` : '',
        input.alt ? `alt="${input.alt}"` : 'alt="反馈图片"',
        'contenteditable="false"',
      ]
        .filter(Boolean)
        .join(' ');
      insertHTML(`<img ${attrs}>`);
    },
    [insertHTML]
  );

  const insertAttachmentCard = useCallback(
    (input: RichCardInput) => {
      const icon = input.kind === 'DRAWING' ? '📄' : '📎';
      const label = escapeAttr(input.label);
      const attrs = [
        'contenteditable="false"',
        `data-kind="${input.kind}"`,
        `data-label="${label}"`,
        input.attachmentId ? `data-att-id="${input.attachmentId}"` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const html =
        `<span class="fb-att-card" ${attrs} data-att-card="1">` +
        `<span class="fb-att-card-icon">${icon}</span>` +
        `<span class="fb-att-card-label">${label}</span>` +
        `</span>`;
      insertHTML(html);
    },
    [insertHTML]
  );

  /** 移除指定附件 id 的所有节点（图片/卡片），触发 change 让父组件同步 HTML */
  const removeAttachment = useCallback(
    (attachmentId: string) => {
      const el = editorRef.current;
      if (!el) return;
      // 按属性值精确匹配（避免 CSS 选择器转义边界，id 可含任意字符）
      for (const node of Array.from(el.querySelectorAll('[data-att-id]'))) {
        if (node.getAttribute('data-att-id') === attachmentId) {
          node.remove();
        }
      }
      onChange?.(el.innerHTML);
    },
    [onChange]
  );

  const getHTML = useCallback(() => editorRef.current?.innerHTML ?? '', []);

  const clear = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
      onChange?.('');
    }
  }, [onChange]);

  const focus = useCallback(() => editorRef.current?.focus(), []);

  useImperativeHandle(ref, () => ({
    insertImage,
    insertAttachmentCard,
    insertHTML,
    removeAttachment,
    getHTML,
    clear,
    focus,
  }));

  /** 处理粘贴：图片/文件 → onFiles；文本 → 仅纯文本 */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) {
        e.preventDefault();
        onFiles?.(files);
        return;
      }
      // 仅纯文本：避免外部富文本（含脚本/样式）污染
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      exec('insertText', text);
    },
    [disabled, onFiles, exec]
  );

  /** 处理拖拽文件 */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles?.(files);
    },
    [disabled, onFiles]
  );

  const handleInput = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML ?? '');
  }, [onChange]);

  // 记录编辑器内最后一次有效选区：焦点被弹层/文件对话框夺走后，
  // insertHTML 据此恢复到原光标位置（见 savedRangeRef 注释）
  useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // 同步 tool 按钮激活态
  useEffect(() => {
    if (!showToolbar) return;
    const syncStates = () => {
      const el = editorRef.current;
      if (!el) return;
      for (const btn of Array.from(
        el.parentElement?.querySelectorAll<HTMLButtonElement>('[data-cmd]') ?? []
      )) {
        const cmd = btn.getAttribute('data-cmd') as string;
        try {
          const active =
            cmd === 'undo' || cmd === 'redo'
              ? false
              : document.queryCommandState(cmd);
          btn.classList.toggle('is-active', active);
        } catch {
          /* queryCommandState 可能抛错（未聚焦），忽略 */
        }
      }
    };
    document.addEventListener('selectionchange', syncStates);
    return () => document.removeEventListener('selectionchange', syncStates);
  }, [showToolbar]);

  const toolbarActions: ToolbarAction[] = [
    { label: t('加粗'), icon: <Bold size={14} />, command: 'bold' },
    { label: t('斜体'), icon: <Italic size={14} />, command: 'italic' },
    { label: t('下划线'), icon: <Underline size={14} />, command: 'underline' },
    { label: t('删除线'), icon: <Strikethrough size={14} />, command: 'strikeThrough' },
    { label: t('无序列表'), icon: <List size={14} />, command: 'insertUnorderedList' },
    { label: t('有序列表'), icon: <ListOrdered size={14} />, command: 'insertOrderedList' },
    { label: t('撤销'), icon: <Undo2 size={14} />, command: 'undo' },
    { label: t('重做'), icon: <Redo2 size={14} />, command: 'redo' },
  ];

  return (
    <div className={`rt-editor ${showToolbar ? 'rt-editor--toolbar' : ''} ${className ?? ''}`}>
      {showToolbar && (
        <div className="rt-editor-toolbar" role="toolbar" aria-label={t('格式工具条')}>
          {toolbarActions.map((action) => (
            <button
              key={action.command}
              type="button"
              data-cmd={action.command}
              className="rt-editor-tool"
              title={action.label}
              aria-label={action.label}
              disabled={disabled}
              onMouseDown={(e) => {
                // 阻止失焦导致选区丢失
                e.preventDefault();
              }}
              onClick={() => exec(action.command)}
            >
              {action.icon}
            </button>
          ))}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel ?? t('反馈内容')}
        data-placeholder={placeholder}
        className="rt-editor-body"
        style={{ minHeight }}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onInput={handleInput}
      />
      {/* 富文本共用样式（编辑器 + 渲染器共用） */}
      <style>{RICHTEXT_CSS}</style>
    </div>
  );
});

/** 反转义属性值 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default RichtextEditor;
