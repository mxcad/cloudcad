/**
 * 图纸会话（Drawing Session）— 类型化事件定义
 *
 * 引擎→UI 的信号经类型化 bus 传播（ADR-0039），事件名统一引用 CAD_EVENTS 常量，
 * payload 类型在此单一来源定义，禁止新增 window 裸字符串事件。
 */
import { CAD_EVENTS } from '@/constants/events';

/** 文件打开信号 payload（对应原 mxcad-file-opened window 事件） */
export interface FileOpenedDetail {
  fileId: string;
  parentId: string | null;
  projectId: string | null;
  fileUrl?: string;
  fileName?: string;
  libraryKey?: 'drawing' | 'block';
}

/** 引擎 openFileComplete 信号 payload（对应原 mxcad-file-open-complete window 事件） */
export interface OpenCompleteDetail {
  fileId: string | null;
  fileName: string | null;
}

/** 导出文件信号 payload（引擎窗口事件桥接而来，原 mxcad-export-file） */
export interface ExportFileDetail {
  fileId: string;
  fileName: string;
}

/** PDF 导出信号 payload（对应原 mxcad-export-pdf window 事件） */
export interface ExportPdfDetail {
  fileName: string;
  blob: Blob;
}

/** DWG/DXF 导出信号 payload（对应原 mxcad-export-dwg / mxcad-export-dxf window 事件） */
export interface ExportDwgDetail {
  fileName: string;
  blob: Blob;
  format: 'dwg' | 'dxf';
}

/** 另存为信号 payload（对应原 mxcad-save-as window 事件） */
export interface SaveAsDetail {
  currentFileName: string;
  mxwebBlob: Blob;
  personalSpaceId: string | null;
  sourceNodeId?: string | null;
  sourceFileHash?: string | null;
}

/** 需要保存信号 payload（对应原 mxcad-save-required window 事件） */
export interface SaveRequiredDetail {
  action: string;
}

/** 新建文件信号 payload（对应原 mxcad-new-file window 事件） */
export interface NewFileDetail {
  fileId: string | null;
  parentId: string | null;
  projectId: string | null;
}

/** 公共文件上传完成信号 payload（对应原 public-file-uploaded window 事件） */
export interface PublicFileUploadedDetail {
  fileHash: string;
  fileName: string;
  noCache: boolean;
  /** 上传/打开完成回调（唯一 emit 方 mxcadOpenFile 恒传 async 函数） */
  callback: () => Promise<void>;
}

/** 事件 → payload 类型映射（单一来源） */
export interface DrawingEventPayloads {
  [CAD_EVENTS.FILE_OPENED]: FileOpenedDetail;
  [CAD_EVENTS.OPEN_COMPLETE]: OpenCompleteDetail;
  [CAD_EVENTS.DATABASE_MODIFIED]: void;
  [CAD_EVENTS.EXPORT_FILE]: ExportFileDetail;
  [CAD_EVENTS.EXPORT_PDF]: ExportPdfDetail;
  [CAD_EVENTS.EXPORT_DWG]: ExportDwgDetail;
  [CAD_EVENTS.EXPORT_DXF]: ExportDwgDetail;
  [CAD_EVENTS.SAVE_AS]: SaveAsDetail;
  [CAD_EVENTS.SAVE_REQUIRED]: SaveRequiredDetail;
  // 引擎黑盒可能派发的另存为触发信号（原 mxcad-saveas-required window 事件），
  // 与 SAVE_REQUIRED 同 payload；useFileOpenGuard 防御性订阅
  [CAD_EVENTS.SAVE_AS_REQUIRED]: SaveRequiredDetail;
  [CAD_EVENTS.NEW_FILE]: NewFileDetail;
  [CAD_EVENTS.PUBLIC_FILE_UPLOADED]: PublicFileUploadedDetail;
}

export type DrawingEvent = keyof DrawingEventPayloads;
export type DrawingEventPayload<E extends DrawingEvent> =
  DrawingEventPayloads[E];
export type DrawingEventHandler<E extends DrawingEvent> = (
  payload: DrawingEventPayloads[E]
) => void;
