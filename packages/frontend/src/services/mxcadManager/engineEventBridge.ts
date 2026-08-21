/**
 * 引擎窗口事件 → 类型化 bus 桥接（ADR-0039/0040）
 *
 * mxcad-export-file 由 CAD 引擎（外部黑盒）以 window CustomEvent 派发，
 * 此处桥接进 drawingSession 类型化 bus；UI 侧只经 bus 订阅。
 * 返回解除函数，供测试与 teardown 使用。
 */
import { CAD_EVENTS } from '@/constants/events';
import { emit } from '../drawingSession';

/** 注册引擎导出事件桥接，返回移除监听的解除函数 */
export function bridgeEngineExportFileEvent(): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ fileId: string; fileName: string }>)
      .detail;
    if (!detail) return;
    emit(CAD_EVENTS.EXPORT_FILE, {
      fileId: detail.fileId,
      fileName: detail.fileName,
    });
  };
  window.addEventListener(CAD_EVENTS.EXPORT_FILE, handler);
  return () => window.removeEventListener(CAD_EVENTS.EXPORT_FILE, handler);
}
