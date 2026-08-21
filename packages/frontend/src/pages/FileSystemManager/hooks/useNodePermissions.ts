import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import type { FileSystemNode } from '@/types/filesystem';

export interface NodePermissionMap {
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
}

interface UseNodePermissionsOptions {
  isAtRoot: boolean;
  urlProjectId: string | undefined;
  displayNodes: FileSystemNode[];
}

export function useNodePermissions({
  isAtRoot,
  urlProjectId,
  displayNodes,
}: UseNodePermissionsOptions) {
  const { user } = useAuth();

  const [nodePermissions, setNodePermissions] = useState<
    Map<string, NodePermissionMap>
  >(new Map());

  const [permissionsLoading, setPermissionsLoading] = useState(false);

  // 根级节点 id 的稳定签名：仅当根节点集合发生变化时才重拉权限，
  // 避免 displayNodes 中非根节点的增删/排序/分页变化触发无意义请求。
  const rootIdsKey = useMemo(
    () =>
      isAtRoot
        ? displayNodes
            .filter((node) => node.isRoot)
            .map((node) => node.id)
            .sort()
            .join('|')
        : '',
    [isAtRoot, displayNodes]
  );

  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    let nodesToLoad: string[] = [];

    if (isAtRoot) {
      nodesToLoad = rootIdsKey ? rootIdsKey.split('|') : [];
    } else if (urlProjectId) {
      nodesToLoad = [urlProjectId];
    }

    if (nodesToLoad.length === 0) return;

    const requestSeq = ++requestSeqRef.current;

    const loadPermissions = async () => {
      setPermissionsLoading(true);

      try {
        const {
          canEditNode,
          canDeleteNode,
          canManageNodeMembers,
          canManageNodeRoles,
        } = await import('@/utils/permissionUtils');

        const permissionsPromises = nodesToLoad.map(async (nodeId) => {
          const [canEdit, canDelete, canManageMembers, canManageRoles] =
            await Promise.all([
              canEditNode(user, nodeId),
              canDeleteNode(user, nodeId),
              canManageNodeMembers(user, nodeId),
              canManageNodeRoles(user, nodeId),
            ]);

          return {
            nodeId,
            canEdit,
            canDelete,
            canManageMembers,
            canManageRoles,
          };
        });

        const permissionsResults = await Promise.all(permissionsPromises);

        // 过期请求忽略：依赖变化后旧请求的结果不得覆盖新状态
        if (requestSeqRef.current !== requestSeq) return;

        setNodePermissions((prev) => {
          const newMap = new Map(prev);
          permissionsResults.forEach((result) => {
            newMap.set(result.nodeId, {
              canEdit: result.canEdit,
              canDelete: result.canDelete,
              canManageMembers: result.canManageMembers,
              canManageRoles: result.canManageRoles,
            });
          });
          return newMap;
        });
      } catch (error) {
        if (requestSeqRef.current !== requestSeq) return;
        handleError(error, t('加载权限信息失败'));
      } finally {
        if (requestSeqRef.current === requestSeq) {
          setPermissionsLoading(false);
        }
      }
    };

    loadPermissions();
  }, [user, isAtRoot, urlProjectId, rootIdsKey]);

  return {
    nodePermissions,
    permissionsLoading,
  };
}
