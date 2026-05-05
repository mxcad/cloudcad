import { useEffect, useState } from 'react';
import { ProjectPermission } from '@/constants/permissions';
import { fileSystemControllerCheckProjectPermission } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';

/**
 * 加载 CAD 相关项目权限
 *
 * 检查当前用户对指定项目是否具有：
 * - CAD_SAVE（保存）
 * - FILE_DOWNLOAD（导出）
 * - CAD_EXTERNAL_REFERENCE（管理外部参照）
 *
 * 从 CADEditorDirect.tsx 提取的独立 hook
 */
export function useCadPermissions(urlProjectId: string) {
  const [canSave, setCanSave] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [canManageExternalRef, setCanManageExternalRef] = useState(false);

  useEffect(() => {
    if (!urlProjectId) {
      setCanSave(false);
      setCanExport(false);
      setCanManageExternalRef(false);
      return;
    }

    let cancelled = false;

    const checkPermissions = async () => {
      try {
        const [saveRes, exportRes, externalRefRes] = await Promise.all([
          fileSystemControllerCheckProjectPermission({
            path: { projectId: urlProjectId },
            query: { permission: ProjectPermission.CAD_SAVE },
          }),
          fileSystemControllerCheckProjectPermission({
            path: { projectId: urlProjectId },
            query: { permission: ProjectPermission.FILE_DOWNLOAD },
          }),
          fileSystemControllerCheckProjectPermission({
            path: { projectId: urlProjectId },
            query: { permission: ProjectPermission.CAD_EXTERNAL_REFERENCE },
          }),
        ]);

        if (cancelled) return;

        setCanSave(saveRes.data?.hasPermission || false);
        setCanExport(exportRes.data?.hasPermission || false);
        setCanManageExternalRef(externalRefRes.data?.hasPermission || false);
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'CADEditorDirect:loadPermissions');
        }
      }
    };

    checkPermissions();

    return () => {
      cancelled = true;
    };
  }, [urlProjectId]);

  return { canSave, canExport, canManageExternalRef };
}
