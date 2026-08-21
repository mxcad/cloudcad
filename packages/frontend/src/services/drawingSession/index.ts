/**
 * 图纸会话（Drawing Session）深模块入口（ADR-0029 / ADR-0039）
 *
 * 「编辑器里正开着一张图纸」状态与引擎→UI 信号的唯一通道：
 *  - openSession / closeSession：打开/关闭图纸的唯一 writer
 *  - patchSession：会话信息合并更新
 *  - setModified / getModified：脏标记单一写点与读取
 *  - subscribe / emitFileOpened / emitOpenComplete：类型化事件 bus
 *  - useDrawingSession：React 薄读 hook
 *
 * 外部消费者禁止深路径导入本目录子模块（depcruise 门禁）。
 */
export {
  openSession,
  closeSession,
  patchSession,
  patchSessionFlags,
  setModified,
  getModified,
  clearCurrentFileDeleted,
  setCurrentFileUrl,
  getCurrentFileUrl,
  setCacheTimestamp,
  getCacheTimestamp,
  resetSessionRuntime,
  emitFileOpened,
  emitOpenComplete,
  emit,
  subscribe,
} from './session';
export { clearDrawingSessionListeners } from './sessionBus';
export type {
  OpenFileInfo,
  OpenFileInfoPatch,
  SessionFlagsPatch,
} from './session';
export { useDrawingSession } from './useDrawingSession';
export type { SessionState } from './useDrawingSession';
export type {
  FileOpenedDetail,
  OpenCompleteDetail,
  ExportFileDetail,
  ExportPdfDetail,
  ExportDwgDetail,
  SaveAsDetail,
  SaveRequiredDetail,
  NewFileDetail,
  PublicFileUploadedDetail,
  DrawingEvent,
  DrawingEventPayload,
  DrawingEventHandler,
  DrawingEventPayloads,
} from './sessionEvents';
