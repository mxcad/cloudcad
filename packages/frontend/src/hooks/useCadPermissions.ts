import { useEffect } from 'react';
import { ProjectPermission } from '@/constants/permissions';
import { useProjectPermissions } from './useProjectPermissions';

/**
 * CAD 编辑器项目权限 Hook
 *
 * 并入主模块：内部消费 useProjectPermissions（数据经 globalPermissionCache
 * 共享缓存），消除每次进 CAD 页的重复权限请求。
 *
 * 语义（悲观）：权限加载完成前 canSave/canExport/canManageExternalRef 均为
 * false（按钮隐藏），加载完成后按真实权限渲染；`loading` 供消费点做门控/骨架。
 */
interface UseCadPermissionsResult {
  canSave: boolean;
  canExport: boolean;
  canManageExternalRef: boolean;
  /** 权限是否加载中（首帧即 true，供 loading 门控） */
  loading: boolean;
}

const CAD_PERMISSIONS = [
  ProjectPermission.CAD_SAVE,
  ProjectPermission.FILE_DOWNLOAD,
  ProjectPermission.CAD_EXTERNAL_REFERENCE,
] as const;

export function useCadPermissions(
  urlProjectId: string | null,
  onPermissionsChange?: (perms: {
    canSave?: boolean;
    canExport?: boolean;
    canManageExternalRef?: boolean;
  }) => void
): UseCadPermissionsResult {
  const { loading, check } = useProjectPermissions(urlProjectId, {
    permissions: CAD_PERMISSIONS,
  });

  const canSave = check(ProjectPermission.CAD_SAVE);
  const canExport = check(ProjectPermission.FILE_DOWNLOAD);
  const canManageExternalRef = check(ProjectPermission.CAD_EXTERNAL_REFERENCE);

  // 加载完成后通知（store 权限同步），加载期间不发，保持既有回调时机
  useEffect(() => {
    if (loading) return;
    onPermissionsChange?.({ canSave, canExport, canManageExternalRef });
  }, [loading, canSave, canExport, canManageExternalRef, onPermissionsChange]);

  return { canSave, canExport, canManageExternalRef, loading };
}
