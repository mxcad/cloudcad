import { useCallback } from 'react';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import type { FileSystemNode } from '@/types/filesystem';
import type { NodePermissionMap } from './useNodePermissions';

export interface UseFileSystemNodePermissionPropsOptions {
  nodePermissions: Map<string, NodePermissionMap>;
  projectPermissions: Record<string, boolean>;
  permissionsLoading?: boolean;
  isTrashView: boolean;
  /** 个人空间模式：非根节点回退默认值的判据（个人空间用户拥有全部→乐观 true；项目内→悲观 false） */
  isPersonalSpace?: boolean;
  onEdit?: (node: FileSystemNode) => void;
  onDeleteProject?: (nodeId: string, nodeName: string) => void;
  onPermanentlyDeleteProject?: (nodeId: string, nodeName: string) => void;
  onShowMembers?: (node: FileSystemNode) => void;
  onShowRoles?: (node: FileSystemNode) => void;
  onShowOperationHistory?: (node: FileSystemNode) => void;
}

export type FileSystemNodePermissionProps = ReturnType<
  typeof getFileItemPermissionProps
> & {
  onEdit?: (e: React.MouseEvent) => void;
  onDeleteNode?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onShowRoles?: (e: React.MouseEvent) => void;
  onShowOperationHistory?: (e: React.MouseEvent) => void;
};

/**
 * 计算 FileItem/右键菜单所需的节点权限属性（含加载期悲观门控，见 #279）
 */
export function useFileSystemNodePermissionProps({
  nodePermissions,
  projectPermissions,
  permissionsLoading,
  isTrashView,
  isPersonalSpace = false,
  onEdit,
  onDeleteProject,
  onPermanentlyDeleteProject,
  onShowMembers,
  onShowRoles,
  onShowOperationHistory,
}: UseFileSystemNodePermissionPropsOptions) {
  const getNodePermissionProps = useCallback(
    (node: FileSystemNode): FileSystemNodePermissionProps => {
      const cachedPermissions = nodePermissions.get(node.id);
      // 加载期悲观门控：useNodePermissions 尚未就绪（nodePermissions 无缓存）时，
      // 根节点不得使用乐观默认值（canEdit/canDelete: true），防止加载期编辑/删除按钮乐观显示；
      // 加载完成后回退链与现状一致（个人空间/项目根默认 true 保留）
      const defaultPermissions = permissionsLoading
        ? {
            canEdit: false,
            canDelete: false,
            canManageMembers: false,
            canManageRoles: false,
          }
        : {
            canEdit: true,
            canDelete: true,
            canManageMembers: true,
            canManageRoles: true,
          };

      const permissions = node.isRoot
        ? cachedPermissions || defaultPermissions
        : cachedPermissions || {
            // 非根节点永不被 useNodePermissions 缓存（它只加载根节点/urlProjectId），
            // 故该回退对象恒生效：个人空间用户拥有全部（乐观 true 正确）；项目内应由
            // projectPermissions 治理，未就绪位回退须悲观（false）——否则「节点权限已加载
            // 但项目权限未加载」的竞态窗口会乐观显示编辑/删除按钮（后端仍会 403）。
            canEdit: isPersonalSpace,
            canDelete: isPersonalSpace,
            canManageMembers: false,
            canManageRoles: false,
          };

      const fileItemProps = getFileItemPermissionProps(node, {
        projectPermissions,
        nodePermissions: permissions,
        permissionsLoading,
      });

      let onEditHandler: ((e: React.MouseEvent) => void) | undefined;
      let onDeleteHandler: ((e: React.MouseEvent) => void) | undefined;
      let onShowMembersHandler: ((e: React.MouseEvent) => void) | undefined;
      let onShowRolesHandler: ((e: React.MouseEvent) => void) | undefined;
      let onShowOperationHistoryHandler:
        | ((e: React.MouseEvent) => void)
        | undefined;

      if (node.isRoot && permissions.canEdit && onEdit) {
        onEditHandler = () => onEdit(node);
      }
      if (node.isRoot && permissions.canDelete) {
        onDeleteHandler = () => {
          if (isTrashView && onPermanentlyDeleteProject) {
            onPermanentlyDeleteProject(node.id, node.name);
          } else if (onDeleteProject) {
            onDeleteProject(node.id, node.name);
          }
        };
      }
      if (node.isRoot && onShowMembers) {
        onShowMembersHandler = () => onShowMembers(node);
      }
      if (node.isRoot && permissions.canManageRoles && onShowRoles) {
        onShowRolesHandler = () => onShowRoles(node);
      }
      if (node.isRoot && onShowOperationHistory) {
        onShowOperationHistoryHandler = () => onShowOperationHistory(node);
      }

      return {
        ...fileItemProps,
        onEdit: onEditHandler,
        onDeleteNode: onDeleteHandler,
        onShowMembers: onShowMembersHandler,
        onShowRoles: onShowRolesHandler,
        onShowOperationHistory: onShowOperationHistoryHandler,
      };
    },
    [
      nodePermissions,
      projectPermissions,
      permissionsLoading,
      isTrashView,
      isPersonalSpace,
      onEdit,
      onDeleteProject,
      onPermanentlyDeleteProject,
      onShowMembers,
      onShowRoles,
      onShowOperationHistory,
    ]
  );

  return { getNodePermissionProps };
}
