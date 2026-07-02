import { FileSystemNode } from '../../types/filesystem';
import { t } from '@/languages';

/**
 * 操作类型
 */
export type ActionType =
  | 'upload_external_reference'
  | 'download'
  | 'view_version_history'
  | 'rename'
  | 'move'
  | 'copy'
  | 'restore'
  | 'delete'
  | 'permanently_delete'
  | 'edit'
  | 'show_members'
  | 'show_roles'
  | 'share'
  | 'open'
  | 'open_in_new_tab'
  | 'open_file_location'
  | 'new_folder'
  | 'copy_clipboard'
  | 'cut'
  | 'download_folder'
  | 'copy_path';

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
  props?: Record<string, unknown>; // 其他可能需要的属性
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
  canShare?: boolean;
  canViewVersionHistory?: boolean;
  canManageExternalReference?: boolean;
  canManageTrash?: boolean;
  canMove?: boolean;
  canCopy?: boolean;
  canCreate?: boolean;
  onDownload?: boolean;
  onShowVersionHistory?: boolean;
  onEdit?: boolean;
  onShare?: boolean;
  onShowMembers?: boolean;
  onShowRoles?: boolean;
  onMove?: boolean;
  onCopy?: boolean;
  onRestore?: boolean;
  onPermanentlyDelete?: boolean;
  onDeleteNode?: boolean;
  /** 排除移动和复制操作（用于侧边栏） */
  excludeMoveCopy?: boolean;
  /** 搜索模式：显示「打开所在位置」等搜索相关操作 */
  isSearchResult?: boolean;
  onOpen?: boolean;
  onOpenInNewTab?: boolean;
  onOpenFileLocation?: boolean;
  onNewFolder?: boolean;
  onCopyClipboard?: boolean;
  onCut?: boolean;
  onDownloadFolder?: boolean;
  onCopyPath?: boolean;
}

/**
 * 文件操作图标组件
 */
const Icons = {
  Upload: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Download: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  History: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Gallery: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Edit: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Move: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 9l7-7 7 7M5 15l7 7 7-7" />
    </svg>
  ),
  Copy: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Restore: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  ),
  Delete: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Users: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Share: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  Settings: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  FolderOpen: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  ExternalLink: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  FolderUp: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1" />
      <polyline points="15 15 18 12 21 15" />
      <line x1="18" y1="12" x2="18" y2="21" />
    </svg>
  ),
  NewFolder: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  ),
  Cut: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="8.12" y1="8.12" x2="15.88" y2="15.88" />
      <line x1="15.88" y1="8.12" x2="8.12" y2="15.88" />
    </svg>
  ),
};

/**
 * 所有操作项配置
 */
export function getFileActions(): Record<ActionType, FileAction> { return {
  upload_external_reference: {
    type: 'upload_external_reference',
    label: t("外部参照管理"),
    tooltip: t("管理外部参照"),
    icon: <Icons.Upload />,
    colorClass: 'text-amber-600',
    hoverClass: 'hover:bg-amber-50',
    visibilityCheck: ({ isCadFile, canManageExternalReference }) =>
      isCadFile && canManageExternalReference === true,
  },
  download: {
    type: 'download',
    label: t("下载"),
    tooltip: t("下载"),
    icon: <Icons.Download />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isFolder, onDownload }) => !isFolder && !!onDownload,
    permissionCheck: ({ canDownload }) => canDownload !== false,
  },
  view_version_history: {
    type: 'view_version_history',
    label: t("版本历史"),
    tooltip: t("版本历史"),
    icon: <Icons.History />,
    colorClass: 'text-blue-600',
    hoverClass: 'hover:bg-blue-50',
    visibilityCheck: ({ isCadFile, isFolder, onShowVersionHistory }) =>
      isCadFile && !isFolder && !!onShowVersionHistory,
    permissionCheck: ({ canViewVersionHistory }) =>
      canViewVersionHistory !== false,
  },
  rename: {
    type: 'rename',
    label: t("重命名"),
    tooltip: t("重命名"),
    icon: <Icons.Edit />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot }) => !isRoot,
    permissionCheck: ({ canEdit }) => canEdit !== false,
  },
  move: {
    type: 'move',
    label: t("移动到..."),
    tooltip: t("移动到"),
    icon: <Icons.Move />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ onMove }) => !!onMove,
  },
  copy: {
    type: 'copy',
    label: t("复制到..."),
    tooltip: t("复制到"),
    icon: <Icons.Copy />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ onCopy }) => !!onCopy,
  },
  restore: {
    type: 'restore',
    label: t("恢复"),
    tooltip: t("恢复"),
    icon: <Icons.Restore />,
    colorClass: 'text-green-600',
    hoverClass: 'hover:bg-green-50',
    visibilityCheck: ({ isTrash, onRestore }) => {
      // 在回收站视图中显示恢复按钮
      return isTrash && !!onRestore;
    },
    permissionCheck: ({ canManageTrash }) => canManageTrash !== false,
  },
  delete: {
    type: 'delete',
    label: t("删除"),
    tooltip: t("删除"),
    icon: <Icons.Delete />,
    colorClass: 'text-red-600',
    hoverClass: 'hover:bg-red-50',
    isDestructive: true,
    visibilityCheck: ({ isRoot, isTrash, onDeleteNode }) => {
      // 项目根节点：不在回收站时，由权限检查控制显示
      if (isRoot) {
        return !isTrash;
      }
      // 普通节点：有 onDeleteNode 处理函数时显示
      return !!onDeleteNode;
    },
    permissionCheck: ({ canDelete }) => canDelete !== false,
  },
  permanently_delete: {
    type: 'permanently_delete',
    label: t("彻底删除"),
    tooltip: t("彻底删除"),
    icon: <Icons.Delete />,
    colorClass: 'text-red-700',
    hoverClass: 'hover:bg-red-100',
    isDestructive: true,
    visibilityCheck: ({ isTrash, isRoot, onPermanentlyDelete }) =>
      // 在回收站视图中显示彻底删除按钮
      isTrash && !!onPermanentlyDelete,
    permissionCheck: ({ canManageTrash }) => canManageTrash !== false,
  },
  edit: {
    type: 'edit',
    label: t("编辑"),
    tooltip: t("编辑"),
    icon: <Icons.Edit />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onEdit }) =>
      isRoot && !isTrash && !!onEdit,
    permissionCheck: ({ canEdit }) => canEdit !== false,
  },
  share: {
    type: 'share',
    label: t("分享"),
    tooltip: t("分享图纸"),
    icon: <Icons.Share />,
    colorClass: 'text-cyan-600',
    hoverClass: 'hover:bg-cyan-50',
    visibilityCheck: ({ isFolder, onShare, canShare }) =>
      !isFolder && !!onShare,
    permissionCheck: ({ canShare }) => canShare !== false,
  },
  show_members: {
    type: 'show_members',
    label: t("成员"),
    tooltip: t("成员"),
    icon: <Icons.Users />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onShowMembers }) =>
      isRoot && !isTrash && !!onShowMembers,
    props: {
      'data-tour': 'menu-show-members',
    },
  },
  show_roles: {
    type: 'show_roles',
    label: t("角色管理"),
    tooltip: t("角色管理"),
    icon: <Icons.Settings />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onShowRoles }) =>
      isRoot && !isTrash && !!onShowRoles,
    props: {
      'data-tour': 'menu-show-roles',
    },
  },
  open: {
    type: 'open',
    label: t("打开"),
    tooltip: t("打开文件夹"),
    icon: <Icons.FolderOpen />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: () => false,
  },
  open_in_new_tab: {
    type: 'open_in_new_tab',
    label: t("新标签页打开"),
    tooltip: t("在新标签页中打开"),
    icon: <Icons.ExternalLink />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: () => false,
  },
  open_file_location: {
    type: 'open_file_location',
    label: t("打开所在位置"),
    tooltip: t("在新标签页打开文件所在文件夹"),
    icon: <Icons.FolderUp />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({
      isRoot,
      isTrash,
      isSearchResult,
      onOpenFileLocation,
    }) => {
      if (isRoot || isTrash || !isSearchResult || !onOpenFileLocation)
        return false;
      return true;
    },
  },
  new_folder: {
    type: 'new_folder',
    label: t("新建文件夹"),
    tooltip: t("在当前文件夹中新建子文件夹"),
    icon: <Icons.NewFolder />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isFolder, isRoot, isTrash, onNewFolder }) =>
      isFolder && !isRoot && !isTrash && !!onNewFolder,
    permissionCheck: ({ canCreate }) => canCreate !== false,
  },
  copy_clipboard: {
    type: 'copy_clipboard',
    label: t("复制"),
    tooltip: t("复制到剪贴板"),
    icon: <Icons.Copy />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onCopyClipboard }) =>
      !isRoot && !isTrash && !!onCopyClipboard,
    permissionCheck: ({ canCopy }) => canCopy !== false,
  },
  cut: {
    type: 'cut',
    label: t("剪切"),
    tooltip: t("剪切到剪贴板"),
    icon: <Icons.Cut />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, onCut }) =>
      !isRoot && !isTrash && !!onCut,
    permissionCheck: ({ canMove }) => canMove !== false,
  },
  download_folder: {
    type: 'download_folder',
    label: t("下载文件夹"),
    tooltip: t("将文件夹打包为 ZIP 下载"),
    icon: <Icons.Download />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isFolder, isRoot, isTrash, onDownloadFolder }) =>
      isFolder && !isRoot && !isTrash && !!onDownloadFolder,
    permissionCheck: ({ canDownload }) => canDownload !== false,
  },
  copy_path: {
    type: 'copy_path',
    label: t("复制路径"),
    tooltip: t("复制文件完整路径"),
    icon: <Icons.Copy />,
    colorClass: 'text-slate-700',
    hoverClass: 'hover:bg-slate-50',
    visibilityCheck: ({ isRoot, isTrash, isSearchResult, onCopyPath }) =>
      !!isSearchResult && !isRoot && !isTrash && !!onCopyPath,
  },
}; }

/**
 * 获取节点的可用操作列表
 */
export const getAvailableActions = (
  props: FileActionCheckProps
): FileAction[] => {
  // 回收站视图中只显示恢复和彻底删除操作
  if (props.isTrash) {
    return Object.values(getFileActions()).filter(
      (action) =>
        (action.type === 'restore' || action.type === 'permanently_delete') &&
        action.visibilityCheck?.(props) !== false &&
        action.permissionCheck?.(props) !== false
    );
  }

  return Object.values(getFileActions()).filter((action) => {
    // 排除移动和复制操作（用于侧边栏）
    if (
      props.excludeMoveCopy &&
      (action.type === 'move' || action.type === 'copy')
    ) {
      return false;
    }

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
  return getFileActions()[type];
};

/**
 * 操作变体映射（共享给右键菜单和三点菜单）
 */
export const ACTION_VARIANT_MAP: Record<
  string,
  'default' | 'danger' | 'success' | 'info' | 'warning'
> = {
  upload_external_reference: 'warning',
  download: 'default',
  view_version_history: 'info',
  rename: 'default',
  move: 'default',
  copy: 'default',
  open: 'default',
  open_in_new_tab: 'default',
  restore: 'success',
  delete: 'danger',
  permanently_delete: 'danger',
  edit: 'default',
  show_members: 'default',
  show_roles: 'default',
  share: 'default',

  open_file_location: 'default',
  new_folder: 'default',
  copy_clipboard: 'default',
  cut: 'default',
  download_folder: 'default',
  copy_path: 'default',
};

/**
 * 将操作列表分组为主操作和危险操作
 */
export function getActionGroups(actions: FileAction[]) {
  return {
    main: actions.filter((a) => !a.isDestructive),
    destructive: actions.filter((a) => a.isDestructive),
  };
}
