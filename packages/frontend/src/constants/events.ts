export const CAD_EVENTS = {
  EXPORT_FILE: 'mxcad-export-file',
  EXPORT_PDF: 'mxcad-export-pdf',
  EXPORT_DWG: 'mxcad-export-dwg',
  EXPORT_DXF: 'mxcad-export-dxf',
  SAVE_AS: 'mxcad-save-as',
  SAVE_REQUIRED: 'mxcad-save-required',
  SAVE_AS_REQUIRED: 'mxcad-saveas-required',
  FILE_OPENED: 'mxcad-file-opened',
  OPEN_COMPLETE: 'mxcad-file-open-complete',
  /** 文件上下文变更（setFileContext 唯一写入者发布）：协同面板/标题/URL 等消费方的统一刷新信号 */
  FILE_CONTEXT_CHANGED: 'mxcad-file-context-changed',
  DATABASE_MODIFIED: 'mxcad-database-modified',
  NEW_FILE: 'mxcad-new-file',
  UPLOAD_COMPLETED: 'mxcad-upload-completed',
  PUBLIC_FILE_UPLOADED: 'public-file-uploaded',
  SHARE_FILE: 'mxcad-share-file',
} as const;
