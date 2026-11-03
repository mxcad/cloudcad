import type { FeedbackAttachmentDto } from '@/api-sdk';

/**
 * 反馈图纸「查看」链接：打开 CAD 编辑器并（有框选区域时）自动定位到该区域。
 *
 * 与分享图纸同款交互：仅引用图纸（REFERENCE，注册时带 nodeId/fileHash）可打开编辑器；
 * 本地上传副本（FILE，无源节点）返回 null，调用方回落下载/viewUrl。
 *
 * 链接形态：/cad-editor?nodeId=<id>&region=x1,y1,x2,y2，或未登录来源 ?hash=<hash>&region=...
 * （region 为 CAD 世界坐标，编辑器 OPEN_COMPLETE 时据此 zoom，见 CADEditorDirect.tsx）。
 */
export function buildDrawingEditorUrl(att: FeedbackAttachmentDto): string | null {
  if (att.type !== 'DRAWING' || att.kind !== 'REFERENCE') return null;
  if (!att.nodeId && !att.fileHash) return null;
  const params = new URLSearchParams();
  if (att.nodeId) {
    params.set('nodeId', att.nodeId);
  } else {
    params.set('hash', att.fileHash as string);
  }
  if (att.region) params.set('region', att.region);
  return `/cad-editor?${params.toString()}`;
}
