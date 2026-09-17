import type { CurrentFileInfo, SaveMxwebParams } from './mxcadTypes';

/** 节点/资源库节点保存所需的最小信息形状（SDK DTO 结构兼容） */
export interface SaveNodeInfo {
  path?: string | null;
  updatedAt?: string | null;
  fileStatus?: string | null;
  deletedAt?: string | null;
}

/** 保存流所需的 SDK 句柄（默认实现见 createDefaultSaveSdk） */
export interface SaveSdkHandles {
  getNode(nodeId: string): Promise<{ data?: SaveNodeInfo | null; error?: unknown }>;
  getLibraryNode(
    nodeId: string,
    libraryKey: 'drawing' | 'block'
  ): Promise<{ data?: SaveNodeInfo | null; error?: unknown }>;
  getUserProjectPermissions(
    projectId: string
  ): Promise<{ data?: { permissions?: string[] } | null }>;
  saveMxwebToNode(
    nodeId: string,
    body: { hash: string; commitMessage?: string; expectedTimestamp?: string }
  ): Promise<{ error?: unknown }>;
}

/** 保存流权限查询器（默认实现保留现有 localStorage 解析，T2 收编范围外） */
export interface SavePermissionQuerier {
  hasProjectPermission(projectId: string, permission: string): Promise<boolean>;
  hasLibraryPermission(): Promise<boolean>;
}

export interface SaveFileDeps {
  sdk: SaveSdkHandles;
  permissions: SavePermissionQuerier;
}

/** 单次保存的结果判别联合 */
export type SaveFileOutcome =
  | { status: 'saved' }
  | { status: 'saveAs' }
  | { status: 'cancelled' }
  /** 权限拒绝（项目图纸无 CAD_SAVE：禁止原地保存，也禁止另存为） */
  | { status: 'denied'; error: string }
  | { status: 'failed'; error: string };

export type SaveFileFn = (
  fileInfo: CurrentFileInfo
) => Promise<SaveFileOutcome>;

export interface SaveMxwebToNodeParams extends SaveMxwebParams {
  /** 上传/落库失败且服务端无 message 时的兜底文案（默认"保存失败"） */
  errorMessageFallback?: string;
}
