import { FileSystemNode } from '../../types/filesystem';

/**
 * 操作类型
 */
export type ActionType =
  | 'upload_external_reference'
  | 'download'
  | 'view_version_history'
  | 'add_to_gallery'
  | 'rename'
  | 'move'
  | 'copy'
  | 'restore'
  | 'delete'
  | 'permanently_delete'
  | 'edit'
  | 'show_members'
  | 'show_roles';

/**
 * 操作项配置
 */
export interface FileAction {
  /** 操作类型 */
  type: ActionType;
  /** 显示标签 */
  label: string;
  /** 提示文本 */
  tooltip: string;
  /** 图标组件 */
  icon: React.ReactNode;
  /** 颜色类名 */
  colorClass?: string;
  /** Hover 背景类名 */
  hoverClass?: string;
  /** 权限检查函数 */
  permissionCheck?: (props: FileActionCheckProps) => boolean;
  /** 可见性检查函数 */
  visibilityCheck?: (props: FileActionCheckProps) => boolean;
  /** 操作是否为危险操作 */
  isDestructive?: boolean;
}

/**
 * 操作检查属性
 */
export interface FileActionCheckProps {
  node: FileSystemNode;
  isTrash: boolean;
  isRoot: boolean;
  isCadFile: boolean;
  isFolder: boolean;
  hasMissingExternalReferences: boolean;
  canDownload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canAddToGallery?: boolean;
  canViewVersionHistory?: boolean;
  canManageTrash?: boolean;
  onDownload?: boolean;
  onAddToGallery?: boolean;
  onShowVersionHistory?: boolean;
  onEdit?: boolean;
  onShowMembers?: boolean;
  onShowRoles?: boolean;
  onMove?: boolean;
  onCopy?: boolean;
  onRestore?: boolean;
  onPermanentlyDelete?: boolean;
  onDeleteNode?: boolean;
}

/**
 * 文件操作图标组件
 */
const Icons = {
  Upload: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  History: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Gallery: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Edit: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Move: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 9l7-7 7 7M5 15l7 7 7-7" />
    </svg>
  ),
  Copy: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Restore: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  ),
  Delete: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Users: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

/**
 * 所有操作项配置
 */
export const FILE_ACTIONS: Record<ActionType, FileAction> = {
  upload_external_reference: {
    type: 'upload_external_reference',
    label: '上传外部参照',
    tooltip: '上传外部参照',
    icon: <Icons.Upload />,
    colorClass: 'text-amber-600',
    hoverClass: 'hover:bg-amber-50',
    visibilityCheck: ({ isCadFile, hasMissingExternalReferences }) =>
      isCadFile && hasMissingExternalReferences,
  },
  download: {
    type: 'download',
    label: '下载',
    tooltip: '下载',
    icon: <Icons.Download />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isFolder, onDownload }) => !isFolder && !!onDownload,
    permissionCheck: ({ canDownload }) => canDownload !== false,
  },
  view_version_history: {
    type: 'view_version_history',
    label: '版本历史',
    tooltip: '版本历史',
    icon: <Icons.History />,
    colorClass: 'text-blue-600',
    hoverClass: 'hover:bg-blue-50',
    visibilityCheck: ({ isCadFile, isFolder, onShowVersionHistory }) =>
      isCadFile && !isFolder && !!onShowVersionHistory,
    permissionCheck: ({ canViewVersionHistory }) => canViewVersionHistory !== false,
  },
  add_to_gallery: {
    type: 'add_to_gallery',
    label: '添加到图库',
    tooltip: '添加到图库',
    icon: <Icons.Gallery />,
    colorClass: 'text-indigo-600',
    hoverClass: 'hover:bg-indigo-50',
    visibilityCheck: ({ isFolder, onAddToGallery }) => !isFolder && !!onAddToGallery,
    permissionCheck: ({ canAddToGallery }) => canAddToGallery !== false,
  },
  rename: {
    type: 'rename',
    label: '重命名',
    tooltip: '重命名',
    icon: <Icons.Edit />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot }) => !isRoot,
    permissionCheck: ({ canEdit }) => canEdit !== false,
  },
  move: {
    type: 'move',
    label: '移动到...',
    tooltip: '移动到',
    icon: <Icons.Move />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ onMove }) => !!onMove,
  },
  copy: {
    type: 'copy',
    label: '复制到...',
    tooltip: '复制到',
    icon: <Icons.Copy />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ onCopy }) => !!onCopy,
  },
  restore: {
    type: 'restore',
    label: '恢复',
    tooltip: '恢复',
    icon: <Icons.Restore />,
    colorClass: 'text-green-600',
    hoverClass: 'hover:bg-green-50',
    visibilityCheck: ({ isTrash, onRestore }) => {
      // 在回收站视图中显示恢复按钮
      return isTrash && !!onRestore;
    },
  },
  delete: {
    type: 'delete',
    label: '删除',
    tooltip: '删除',
    icon: <Icons.Delete />,
    colorClass: 'text-red-600',
    hoverClass: 'hover:bg-red-50',
    isDestructive: true,
    visibilityCheck: ({ isRoot, isTrash, onDeleteNode }) => {
      // 项目根节点：不在回收站时显示删除按钮
      if (isRoot) {
        return !isTrash && !!onDeleteNode;
      }
      // 普通节点：有 onDeleteNode 处理函数时显示
      return !!onDeleteNode;
    },
    permissionCheck: ({ canDelete }) => canDelete !== false,
  },
  permanently_delete: {
    type: 'permanently_delete',
    label: '彻底删除',
    tooltip: '彻底删除',
    icon: <Icons.Delete />,
    colorClass: 'text-red-700',
    hoverClass: 'hover:bg-red-100',
    isDestructive: true,
    visibilityCheck: ({ isTrash, isRoot, onPermanentlyDelete }) =>
      // 在回收站视图中显示彻底删除按钮
      isTrash && !!onPermanentlyDelete,
  },
  edit: {
    type: 'edit',
    label: '编辑',
    tooltip: '编辑',
    icon: <Icons.Edit />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onEdit }) => isRoot && !isTrash && !!onEdit,
    permissionCheck: ({ canEdit }) => canEdit !== false,
  },
  show_members: {
    type: 'show_members',
    label: '成员',
    tooltip: '成员',
    icon: <Icons.Users />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onShowMembers }) => isRoot && !isTrash && !!onShowMembers,
  },
  show_roles: {
    type: 'show_roles',
    label: '角色管理',
    tooltip: '角色管理',
    icon: <Icons.Settings />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onShowRoles }) => isRoot && !isTrash && !!onShowRoles,
  },
};

/**
 * 获取节点的可用操作列表
 */
export const getAvailableActions = (props: FileActionCheckProps): FileAction[] => {
  return Object.values(FILE_ACTIONS).filter((action) => {
    // 检查可见性
    if (action.visibilityCheck && !action.visibilityCheck(props)) {
      return false;
    }

    // 检查权限
    if (action.permissionCheck && !action.permissionCheck(props)) {
      return false;
    }

    return true;
  });
};

/**
 * 获取操作项配置
 */
export const getAction = (type: ActionType): FileAction => {
  return FILE_ACTIONS[type];
};