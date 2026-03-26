/**
 * 删除按钮权限控制示例
 * 
 * 需求：根据用户的项目权限来控制删除按钮的显示隐藏
 * - 项目 ID：projectId
 * - 检查权限：FILE_DELETE
 */

import { useState, useEffect } from 'react';
import { useProjectPermission } from '../hooks/useProjectPermission';
import { ProjectPermission } from '../constants/permissions';

// ============================================
// 方案一：基本实现（推荐）
// ============================================

interface DeleteButtonProps {
  projectId: string;
  onDelete: () => void;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({
  projectId,
  onDelete,
}) => {
  const { checkPermission } = useProjectPermission();
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkDeletePermission = async () => {
      setLoading(true);
      const hasPermission = await checkPermission(
        projectId,
        ProjectPermission.FILE_DELETE
      );
      setCanDelete(hasPermission);
      setLoading(false);
    };

    checkDeletePermission();
  }, [projectId, checkPermission]);

  // 加载中不显示按钮，避免闪烁
  if (loading) {
    return null;
  }

  // 无权限则不显示按钮
  if (!canDelete) {
    return null;
  }

  return (
    <button
      onClick={onDelete}
      className="delete-button"
      style={{ color: 'var(--text-danger)' }}
    >
      删除
    </button>
  );
};

// ============================================
// 方案二：带禁用状态的实现
// ============================================

interface DeleteButtonWithDisabledProps {
  projectId: string;
  onDelete: () => void;
  /** 是否在无权限时显示禁用状态而不是隐藏 */
  showDisabled?: boolean;
}

export const DeleteButtonWithDisabled: React.FC<DeleteButtonWithDisabledProps> = ({
  projectId,
  onDelete,
  showDisabled = false,
}) => {
  const { checkPermission } = useProjectPermission();
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkDeletePermission = async () => {
      setLoading(true);
      const hasPermission = await checkPermission(
        projectId,
        ProjectPermission.FILE_DELETE
      );
      setCanDelete(hasPermission);
      setLoading(false);
    };

    checkDeletePermission();
  }, [projectId, checkPermission]);

  // 如果不需要显示禁用状态，无权限时隐藏
  if (!showDisabled && !loading && !canDelete) {
    return null;
  }

  return (
    <button
      onClick={canDelete ? onDelete : undefined}
      disabled={!canDelete || loading}
      className="delete-button"
      style={{
        color: canDelete ? 'var(--text-danger)' : 'var(--text-muted)',
        cursor: canDelete ? 'pointer' : 'not-allowed',
        opacity: canDelete ? 1 : 0.5,
      }}
    >
      {loading ? '加载中...' : '删除'}
    </button>
  );
};

// ============================================
// 方案三：封装可复用的权限按钮组件
// ============================================

interface PermissionButtonProps {
  projectId: string;
  permission: string;
  onClick: () => void;
  children: React.ReactNode;
  /** 无权限时的行为：'hide' 隐藏 | 'disable' 禁用 */
  noPermissionBehavior?: 'hide' | 'disable';
  className?: string;
  style?: React.CSSProperties;
}

export const PermissionButton: React.FC<PermissionButtonProps> = ({
  projectId,
  permission,
  onClick,
  children,
  noPermissionBehavior = 'hide',
  className,
  style,
}) => {
  const { checkPermission } = useProjectPermission();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      setLoading(true);
      const result = await checkPermission(projectId, permission);
      setHasPermission(result);
      setLoading(false);
    };

    check();
  }, [projectId, permission, checkPermission]);

  if (loading) {
    return null;
  }

  if (!hasPermission && noPermissionBehavior === 'hide') {
    return null;
  }

  return (
    <button
      onClick={hasPermission ? onClick : undefined}
      disabled={!hasPermission}
      className={className}
      style={{
        ...style,
        cursor: hasPermission ? 'pointer' : 'not-allowed',
        opacity: hasPermission ? 1 : 0.5,
      }}
    >
      {children}
    </button>
  );
};

// 使用示例
export const ExampleUsage = () => {
  const projectId = 'project-123';

  const handleDelete = () => {
    console.log('删除操作');
  };

  return (
    <div>
      {/* 方案一：基本使用 */}
      <DeleteButton projectId={projectId} onDelete={handleDelete} />

      {/* 方案二：显示禁用状态 */}
      <DeleteButtonWithDisabled
        projectId={projectId}
        onDelete={handleDelete}
        showDisabled={true}
      />

      {/* 方案三：通用权限按钮 */}
      <PermissionButton
        projectId={projectId}
        permission={ProjectPermission.FILE_DELETE}
        onClick={handleDelete}
        noPermissionBehavior="hide"
      >
        删除文件
      </PermissionButton>
    </div>
  );
};

// ============================================
// 方案四：批量权限检查（多个按钮场景）
// ============================================

interface FileToolbarProps {
  projectId: string;
  selectedFileId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

export const FileToolbar: React.FC<FileToolbarProps> = ({
  projectId,
  selectedFileId,
  onEdit,
  onDelete,
  onDownload,
}) => {
  const { checkPermission, checkAllPermissions } = useProjectPermission();
  const [permissions, setPermissions] = useState({
    canEdit: false,
    canDelete: false,
    canDownload: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      setLoading(true);

      // 并行检查多个权限
      const [editResult, deleteResult, downloadResult] = await Promise.all([
        checkPermission(projectId, ProjectPermission.FILE_EDIT),
        checkPermission(projectId, ProjectPermission.FILE_DELETE),
        checkPermission(projectId, ProjectPermission.FILE_DOWNLOAD),
      ]);

      setPermissions({
        canEdit: editResult,
        canDelete: deleteResult,
        canDownload: downloadResult,
      });
      setLoading(false);
    };

    loadPermissions();
  }, [projectId, checkPermission]);

  if (loading || !selectedFileId) {
    return null;
  }

  return (
    <div className="toolbar">
      {permissions.canEdit && (
        <button onClick={onEdit}>编辑</button>
      )}
      {permissions.canDelete && (
        <button onClick={onDelete} style={{ color: 'var(--text-danger)' }}>
          删除
        </button>
      )}
      {permissions.canDownload && (
        <button onClick={onDownload}>下载</button>
      )}
    </div>
  );
};
