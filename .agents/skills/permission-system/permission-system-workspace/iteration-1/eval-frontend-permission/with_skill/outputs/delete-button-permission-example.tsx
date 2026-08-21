/**
 * 前端删除按钮权限控制示例
 * 
 * 场景：根据用户的项目权限控制删除按钮的显示隐藏
 * 项目 ID：projectId
 * 需要检查：FILE_DELETE 权限
 */

import { useState, useEffect } from 'react';
import { useProjectPermission } from '@/hooks/useProjectPermission';
import { ProjectPermission } from '@/constants/permissions';

// ============================================================================
// 方式一：基础用法（适合单个按钮场景）
// ============================================================================

interface DeleteButtonProps {
  projectId: string;
  fileId: string;
  onDelete: (fileId: string) => void;
}

function DeleteButton({ projectId, fileId, onDelete }: DeleteButtonProps) {
  const { checkPermission } = useProjectPermission();
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkDeletePermission = async () => {
      setLoading(true);
      const hasPermission = await checkPermission(
        projectId,
        ProjectPermission.FILE_DELETE
      );
      if (isMounted) {
        setCanDelete(hasPermission);
        setLoading(false);
      }
    };

    checkDeletePermission();

    return () => {
      isMounted = false;
    };
  }, [projectId, checkPermission]);

  // 无权限时不显示按钮
  if (!canDelete && !loading) {
    return null;
  }

  // 加载中显示占位（可选）
  if (loading) {
    return <button disabled>检查权限中...</button>;
  }

  return (
    <button
      onClick={() => onDelete(fileId)}
      className="delete-button"
    >
      删除
    </button>
  );
}

// ============================================================================
// 方式二：封装成可复用的权限包装组件（推荐）
// ============================================================================

interface ProjectPermissionGateProps {
  projectId: string;
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
}

function ProjectPermissionGate({
  projectId,
  permission,
  children,
  fallback = null,
  loading = null,
}: ProjectPermissionGateProps) {
  const { checkPermission } = useProjectPermission();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      const result = await checkPermission(projectId, permission);
      if (isMounted) {
        setHasPermission(result);
      }
    };

    check();

    return () => {
      isMounted = false;
    };
  }, [projectId, permission, checkPermission]);

  // 正在检查权限
  if (hasPermission === null) {
    return <>{loading}</>;
  }

  // 无权限
  if (!hasPermission) {
    return <>{fallback}</>;
  }

  // 有权限
  return <>{children}</>;
}

// 使用示例
function FileItem({ projectId, fileId }: { projectId: string; fileId: string }) {
  const handleDelete = (id: string) => {
    console.log('删除文件:', id);
  };

  return (
    <div className="file-item">
      <span>文件名称</span>
      
      <ProjectPermissionGate
        projectId={projectId}
        permission={ProjectPermission.FILE_DELETE}
        fallback={<span className="text-gray-400">无删除权限</span>}
        loading={<span>...</span>}
      >
        <button onClick={() => handleDelete(fileId)}>删除</button>
      </ProjectPermissionGate>
    </div>
  );
}

// ============================================================================
// 方式三：批量检查多个权限（适合多个按钮场景）
// ============================================================================

function FileToolbar({ projectId }: { projectId: string }) {
  const { checkAnyPermission, checkAllPermissions, checkPermission } = useProjectPermission();
  const [permissions, setPermissions] = useState({
    canEdit: false,
    canDelete: false,
    canDownload: false,
    canMove: false,
  });

  useEffect(() => {
    let isMounted = true;

    const checkAll = async () => {
      // 并行检查所有权限，性能更优
      const [edit, deletePerm, download, move] = await Promise.all([
        checkPermission(projectId, ProjectPermission.FILE_EDIT),
        checkPermission(projectId, ProjectPermission.FILE_DELETE),
        checkPermission(projectId, ProjectPermission.FILE_DOWNLOAD),
        checkPermission(projectId, ProjectPermission.FILE_MOVE),
      ]);

      if (isMounted) {
        setPermissions({
          canEdit: edit,
          canDelete: deletePerm,
          canDownload: download,
          canMove: move,
        });
      }
    };

    checkAll();

    return () => {
      isMounted = false;
    };
  }, [projectId, checkPermission]);

  return (
    <div className="toolbar">
      {permissions.canEdit && <button>编辑</button>}
      {permissions.canDelete && <button>删除</button>}
      {permissions.canDownload && <button>下载</button>}
      {permissions.canMove && <button>移动</button>}
    </div>
  );
}

// ============================================================================
// 方式四：使用 checkAnyPermission 检查任意权限
// ============================================================================

function AdvancedFileToolbar({ projectId }: { projectId: string }) {
  const { checkAnyPermission, checkAllPermissions } = useProjectPermission();
  const [canOperate, setCanOperate] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      // 检查是否有任意一个操作权限（编辑或删除）
      const hasAny = await checkAnyPermission(projectId, [
        ProjectPermission.FILE_EDIT,
        ProjectPermission.FILE_DELETE,
      ]);

      if (isMounted) {
        setCanOperate(hasAny);
      }
    };

    check();

    return () => {
      isMounted = false;
    };
  }, [projectId, checkAnyPermission]);

  if (!canOperate) {
    return null;
  }

  return (
    <div className="toolbar">
      {/* 工具栏内容 */}
    </div>
  );
}

// ============================================================================
// 方式五：自定义 Hook 封装（最佳实践）
// ============================================================================

import { useCallback, useRef } from 'react';

/**
 * 封装项目文件权限检查的自定义 Hook
 * 提供更语义化的 API
 */
function useFilePermissions(projectId: string) {
  const { checkPermission, checkAnyPermission } = useProjectPermission();
  const cacheRef = useRef<Map<string, boolean>>(new Map());

  const checkWithCache = useCallback(
    async (permission: string): Promise<boolean> => {
      const key = `${projectId}:${permission}`;
      
      // 使用本地缓存避免重复请求
      if (cacheRef.current.has(key)) {
        return cacheRef.current.get(key)!;
      }

      const result = await checkPermission(projectId, permission);
      cacheRef.current.set(key, result);
      return result;
    },
    [projectId, checkPermission]
  );

  const canCreate = useCallback(
    () => checkWithCache(ProjectPermission.FILE_CREATE),
    [checkWithCache]
  );

  const canEdit = useCallback(
    () => checkWithCache(ProjectPermission.FILE_EDIT),
    [checkWithCache]
  );

  const canDelete = useCallback(
    () => checkWithCache(ProjectPermission.FILE_DELETE),
    [checkWithCache]
  );

  const canDownload = useCallback(
    () => checkWithCache(ProjectPermission.FILE_DOWNLOAD),
    [checkWithCache]
  );

  const canMove = useCallback(
    () => checkWithCache(ProjectPermission.FILE_MOVE),
    [checkWithCache]
  );

  const canManageTrash = useCallback(
    () => checkWithCache(ProjectPermission.FILE_TRASH_MANAGE),
    [checkWithCache]
  );

  // 清除缓存（权限变更后调用）
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    canCreate,
    canEdit,
    canDelete,
    canDownload,
    canMove,
    canManageTrash,
    clearCache,
  };
}

// 使用自定义 Hook 的组件
function FileActions({ projectId, fileId }: { projectId: string; fileId: string }) {
  const filePermissions = useFilePermissions(projectId);
  const [canDelete, setCanDelete] = useState(false);

  useEffect(() => {
    let isMounted = true;

    filePermissions.canDelete().then((result) => {
      if (isMounted) setCanDelete(result);
    });

    return () => {
      isMounted = false;
    };
  }, [filePermissions]);

  return (
    <div>
      {canDelete && <button>删除</button>}
    </div>
  );
}

export {
  DeleteButton,
  ProjectPermissionGate,
  FileToolbar,
  AdvancedFileToolbar,
  useFilePermissions,
};
