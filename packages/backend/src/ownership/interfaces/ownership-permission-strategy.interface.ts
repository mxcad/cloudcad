import { NodeType } from '@cloudcad/db';
import { ProjectPermission } from '../../common/enums/permissions.enum';

export const OWNERSHIP_PERMISSION_STRATEGY = 'OwnershipPermissionStrategy';

/**
 * 归属节点上下文（与 NodeMutationGuard 的 NodeContext 对齐）
 */
export interface OwnershipNode {
  id: string;
  ownerId: string | null;
  nodeType: string;
  projectId: string | null;
  parentId: string | null;
  /**
   * 归属根节点类型：根类型节点（项目/个人空间/资源库根）为自身 nodeType；
   * FILE/FOLDER 由 resolveProjectContext 沿祖先链解析的 projectId 对应根节点填充，
   * 供 OwnershipPermissionFactory 按归属分派（库内节点仍按资源库策略校验）。
   */
  rootNodeType?: string | null;
}

/**
 * 节点变更操作（决定权限分派与配额语义）
 */
export type MutationAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'trash'
  | 'restore'
  | 'move'
  | 'copy'
  | 'upload'
  | 'save'
  | 'save-as'
  | 'external-ref'
  | 'library-upload'
  | 'project-update'
  | 'project-delete';

/**
 * 动作 → 项目权限映射（项目内节点按动作映射对应 ProjectPermission）
 */
export const PROJECT_ACTION_PERMISSION: Record<MutationAction, ProjectPermission> = {
  create: ProjectPermission.FILE_CREATE,
  update: ProjectPermission.FILE_EDIT,
  delete: ProjectPermission.FILE_DELETE,
  trash: ProjectPermission.FILE_TRASH_MANAGE,
  restore: ProjectPermission.FILE_TRASH_MANAGE,
  move: ProjectPermission.FILE_MOVE,
  copy: ProjectPermission.FILE_COPY,
  upload: ProjectPermission.FILE_CREATE,
  save: ProjectPermission.FILE_EDIT,
  'save-as': ProjectPermission.FILE_CREATE,
  'external-ref': ProjectPermission.FILE_EDIT,
  'library-upload': ProjectPermission.FILE_CREATE,
  'project-update': ProjectPermission.PROJECT_UPDATE,
  'project-delete': ProjectPermission.PROJECT_DELETE,
};

/**
 * 归属权限策略：按动作粒度断言用户对节点的变更权限。
 * 允许时正常返回，拒绝时抛 ForbiddenException（错误消息按归属类型本地化）。
 */
export interface OwnershipPermissionStrategy {
  assertCan(userId: string, action: MutationAction, node: OwnershipNode): Promise<void>;
}

export const OWNERSHIP_ROOT_TYPES: string[] = [
  NodeType.PROJECT,
  NodeType.PERSONAL_SPACE,
  NodeType.LIBRARY_DRAWING,
  NodeType.LIBRARY_BLOCK,
];

export function isOwnershipRootType(nodeType: string): boolean {
  return OWNERSHIP_ROOT_TYPES.includes(nodeType);
}
