import { useFileLoader } from '../composables/useFileLoader';

/**
 * 打开图纸深模块 —— 移动端「打开一张图纸」的唯一对外 interface
 *
 * 调用方（壳子页、home 打开流、分享落地）只描述「打开什么」（判别联合），
 * 不再各自编排节点信息获取、deletedAt/fileHash 校验、projectId 解析、
 * 权限加载、IndexedDB 缓存、URL 构造与错误分类——这些全部是
 * useFileLoader（implementation 载体）内部实现。
 *
 * interface 契约（写进返回值）：
 *  - 成功（返回 true）：editorState 完整——fileId / fileInfo / fileName /
 *    updatedAt / projectId / permissions / libraryKey / personalSpaceId 已就绪，
 *    isActive=true、loading=false（保存、缩略图上传、侧边栏上下文均可用）；
 *  - 失败（返回 false）：error / errorType 已按 typed error kind 归类设置，
 *    loading=false，调用方不得再自行 message 字符串反推。
 *
 * 旧 useShareFileLoad（分享源的整份重复实现，直连 Pinia store 第二写入通道）
 * 已删除：share 源统一走 loadByNodeId(shareToken)——节点信息经
 * shareControllerResolveShareNode、URL 带 shareToken、openMxWeb 附加
 * x-share-token 头，deletedAt/fileHash 校验与项目源完全一致。
 *
 * 命令层（command/**）仍可直用 openMxWeb（引擎已就绪的画布内打开），
 * 不属于「打开一张图纸」编排。
 */
export type DrawingOpenRequest =
  /** 云端节点（项目 / 个人空间） */
  | { source: 'node'; nodeId: string }
  /** 资源库节点（图纸库 / 图块库） */
  | { source: 'library'; libraryKey: 'drawing' | 'block'; nodeId: string }
  /** 分享链接（token + 节点 id，nodeId 由分享链接页提供） */
  | { source: 'share'; token: string; nodeId: string }
  /** 公开文件（游客按内容 hash 直开） */
  | { source: 'hash'; hash: string };

export async function openDrawing(req: DrawingOpenRequest): Promise<boolean> {
  const { loadByNodeId, loadByHash } = useFileLoader();
  switch (req.source) {
    case 'node':
      return loadByNodeId(req.nodeId);
    case 'library':
      return loadByNodeId(req.nodeId, { libraryKey: req.libraryKey });
    case 'share':
      return loadByNodeId(req.nodeId, { shareToken: req.token });
    case 'hash':
      return loadByHash(req.hash);
  }
}
