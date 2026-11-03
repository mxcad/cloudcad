/**
 * 富文本共用样式（编辑器与安全渲染器共用，避免双份漂移）。
 * 注入方式：各组件以 <style>{RICHTEXT_CSS}</style> 注入，浏览器按选择器级联。
 */
export const RICHTEXT_CSS = `
.rt-content {
  line-height: 1.6;
  word-break: break-word;
}
.rt-content p { margin: 0.4em 0; }
.rt-content img {
  max-width: 100%;
  max-height: 240px;
  border-radius: 6px;
  margin: 4px 0;
  display: block;
}
.rt-content ul, .rt-content ol { padding-left: 1.4em; margin: 0.4em 0; }
.rt-content blockquote {
  border-left: 3px solid var(--border-default);
  padding-left: 10px;
  color: var(--text-secondary);
  margin: 0.4em 0;
}
.rt-content code, .rt-content pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--bg-tertiary);
  border-radius: 4px;
}
.rt-content pre { padding: 8px 10px; overflow-x: auto; }
.rt-content code { padding: 1px 4px; }
.rt-content a { color: var(--primary-500); text-decoration: underline; }
.rt-content hr { border: none; border-top: 1px solid var(--border-default); margin: 8px 0; }
.rt-content h1, .rt-content h2, .rt-content h3, .rt-content h4 { margin: 0.5em 0 0.3em; }

.fb-att-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin: 2px 0;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-tertiary);
  font-size: 12px;
  color: var(--text-primary);
  user-select: none;
  vertical-align: middle;
  max-width: 100%;
}
.fb-att-card-icon { font-size: 14px; flex-shrink: 0; }
.fb-att-card-label { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-att-card-link {
  font-size: 12px;
  margin-left: 6px;
  color: var(--primary-500);
  text-decoration: underline;
  flex-shrink: 0;
}
/* 引用图纸：仅管理员可查看（提交者无权限时的提示） */
.fb-att-card-hint {
  font-size: 11px;
  margin-left: 6px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* 图纸卡片：有缩略图 → 竖排（缩略图 + 文件名 + 悬浮查看/下载） */
.fb-att-card-with-thumb {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 6px;
  max-width: 168px;
  vertical-align: top;
}
.fb-att-card-with-thumb .fb-att-card-icon { display: none; }
.fb-att-card-with-thumb .fb-att-card-label { max-width: 100%; font-size: 11px; }
.fb-att-card-thumb-wrap {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
}
.fb-att-card-thumb {
  display: block;
  width: 100%;
  height: 84px;
  object-fit: cover;
}
.fb-att-card-actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.fb-att-card-thumb-wrap:hover .fb-att-card-actions { opacity: 1; }
.fb-att-card-action {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary) !important;
  text-decoration: none !important;
  white-space: nowrap;
}
.fb-att-card-action:hover { background: var(--primary-500); color: #fff !important; }

.rt-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rt-editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-secondary);
}
.rt-editor-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.rt-editor-tool:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.rt-editor-tool.is-active { background: var(--primary-500); color: #fff; }
.rt-editor-tool:disabled { opacity: 0.4; cursor: not-allowed; }
.rt-editor-body {
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  overflow-y: auto;
  max-height: 320px;
  outline: none;
  word-break: break-word;
}
.rt-editor-body:focus { border-color: var(--primary-500); }
.rt-editor-body:empty::before {
  content: attr(data-placeholder);
  color: var(--text-tertiary);
  pointer-events: none;
}
.rt-editor-body img {
  max-width: 100%;
  max-height: 240px;
  border-radius: 6px;
  margin: 4px 0;
}
`;
