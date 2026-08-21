import { FileSystemNode } from '../../types/filesystem';
import { t } from '@/languages';
import {
  Upload,
  Download,
  History,
  Edit,
  ArrowLeftRight,
  Copy,
  RotateCcw,
  Trash2,
  Share2,
  Users,
  Settings,
  FolderUp,
  FolderPlus,
  Scissors,
} from 'lucide-react';

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
  | 'show_operation_history'
  | 'share'
  | 'open_file_location'
  | 'copy_clipboard'
  | 'cut'
  | 'batch_download_folder'
  | 'copy_path';

/**
 * 菜单变体（替代 ACTION_VARIANT_MAP，随配置内聚）
 */
export type FileActionVariant =
  'default' | 'danger' | 'success' | 'info' | 'warning';

/**
 * 统一动作回调集（动作注册表的执行依赖）
 *
 * 键名与 FileActionCheckProps 的布尔位一一对应（onDeleteNode 除外），
 * 分发端（FileItem / 右键菜单）各自构造一次本对象，即可用 toBooleanMap
 * 自动推导可见性布尔位 + action.run 统一分发——新增动作无需再动分发端。
 */
export interface ActionCallbacks {
  onOpen?: (node: FileSystemNode) => void;
  onOpenInNewTab?: (node: FileSystemNode) => void;
  onOpenFileLocation?: (node: FileSystemNode) => void;
  onDownload?: (node: FileSystemNode) => void;
  onRename?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onCopyClipboard?: (node: FileSystemNode) => void;
  onCut?: (node: FileSystemNode) => void;
  onRestore?: (node: FileSystemNode) => void;
  onDelete?: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onShare?: (node: FileSystemNode) => void;
  onShowVersionHistory?: (node: FileSystemNode) => void;
  onFolderDownload?: (node: FileSystemNode) => void;
  onCopyPath?: (node: FileSystemNode) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onShowRoles?: (e: React.MouseEvent) => void;
  onShowOperationHistory?: (e: React.MouseEvent) => void;
  /** 可见性信号回调：仅门控 delete 动作显示（isRoot/回收站语义），run 不调用 */
  onDeleteNode?: (e: React.MouseEvent) => void;
  /** FileItem 特有：外部参照上传（组件 hook 闭包，其他分发端不提供） */
  onUploadExternalReference?: (e: React.MouseEvent) => void;
}

/**
 * 动作执行上下文
 */
export interface FileActionContext {
  node: FileSystemNode;
  /** 触发事件（按钮真实事件或菜单合成的 MouseEvent）；节点型动作不消费 */
  e?: React.MouseEvent;
  callbacks: ActionCallbacks;
}

/** 节点型回调键（回调签名收 node）：供 nodeAction 工厂与类型推导 */
type NodeCallbackKey = {
  [K in keyof ActionCallbacks]-?: ActionCallbacks[K] extends
    ((node: FileSystemNode) => void) | undefined
    ? K
    : never;
}[keyof ActionCallbacks];

/** 事件型回调键（回调签名收 e）：供 eventAction 工厂与类型推导 */
type EventCallbackKey = Exclude<keyof ActionCallbacks, NodeCallbackKey>;

/** 节点型回调动作工厂：run 只依赖 node + callbacks，不消费事件 */
const nodeAction =
  (key: NodeCallbackKey) =>
  ({ node, callbacks }: FileActionContext) =>
    callbacks[key]?.(node);

/** 事件型回调动作工厂：run 转发事件（菜单场景为合成 MouseEvent） */
const eventAction =
  (key: EventCallbackKey) =>
  ({ e, callbacks }: FileActionContext) => {
    if (e) callbacks[key]?.(e);
  };

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
  /** 菜单变体（默认 'default'） */
  variant?: FileActionVariant;
  /** 权限检查函数 */
  permissionCheck?: (props: FileActionCheckProps) => boolean;
  /** 可见性检查函数 */
  visibilityCheck?: (props: FileActionCheckProps) => boolean;
  /** 操作是否为危险操作 */
  isDestructive?: boolean;
  props?: Record<string, unknown>; // 其他可能需要的属性
  /** 执行动作：从统一回调集取对应回调分发 */
  run: (ctx: FileActionContext) => void;
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
  onShowOperationHistory?: boolean;
  /** 外部参照上传回调可用性（FileItem 注入；右键菜单等不注入时动作不显示） */
  onUploadExternalReference?: boolean;
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
  onCopyClipboard?: boolean;
  onCut?: boolean;
  onFolderDownload?: boolean;
  onCopyPath?: boolean;
}

/**
 * 文件操作图标组件（使用 lucide-react）
 */
const Icons = {
  Upload: () => <Upload size={14} />,
  Download: () => <Download size={14} />,
  History: () => <History size={14} />,
  Gallery: () => <FolderPlus size={14} />, // unused
  Edit: () => <Edit size={14} />,
  Move: () => <ArrowLeftRight size={14} />,
  Copy: () => <Copy size={14} />,
  Restore: () => <RotateCcw size={14} />,
  Delete: () => <Trash2 size={14} />,
  Users: () => <Users size={14} />,
  Share: () => <Share2 size={14} />,
  Settings: () => <Settings size={14} />,
  FolderUp: () => <FolderUp size={14} />,
  NewFolder: () => <FolderPlus size={14} />,
  Cut: () => <Scissors size={14} />,
};

/**
 * 所有操作项配置
 */
export function getFileActions(): Record<ActionType, FileAction> {
  return {
    upload_external_reference: {
      type: 'upload_external_reference',
      label: t('外部参照管理'),
      tooltip: t('管理外部参照'),
      icon: <Icons.Upload />,
      colorClass: 'text-amber-600',
      hoverClass: 'hover:bg-amber-50',
      variant: 'warning',
      visibilityCheck: ({
        isCadFile,
        canManageExternalReference,
        onUploadExternalReference,
      }) =>
        isCadFile &&
        canManageExternalReference === true &&
        !!onUploadExternalReference,
      run: eventAction('onUploadExternalReference'),
    },
    download: {
      type: 'download',
      label: t('下载'),
      tooltip: t('下载'),
      icon: <Icons.Download />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isFolder, onDownload }) => !isFolder && !!onDownload,
      permissionCheck: ({ canDownload }) => canDownload !== false,
      run: nodeAction('onDownload'),
    },
    view_version_history: {
      type: 'view_version_history',
      label: t('版本历史'),
      tooltip: t('版本历史'),
      icon: <Icons.History />,
      colorClass: 'text-blue-600',
      hoverClass: 'hover:bg-blue-50',
      variant: 'info',
      visibilityCheck: ({ isCadFile, isFolder, onShowVersionHistory }) =>
        isCadFile && !isFolder && !!onShowVersionHistory,
      permissionCheck: ({ canViewVersionHistory }) =>
        canViewVersionHistory !== false,
      run: nodeAction('onShowVersionHistory'),
    },
    rename: {
      type: 'rename',
      label: t('重命名'),
      tooltip: t('重命名'),
      icon: <Icons.Edit />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot }) => !isRoot,
      permissionCheck: ({ canEdit }) => canEdit !== false,
      run: nodeAction('onRename'),
    },
    move: {
      type: 'move',
      label: t('移动到...'),
      tooltip: t('移动到'),
      icon: <Icons.Move />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ onMove }) => !!onMove,
      permissionCheck: ({ canMove }) => canMove !== false,
      run: nodeAction('onMove'),
    },
    copy: {
      type: 'copy',
      label: t('复制到...'),
      tooltip: t('复制到'),
      icon: <Icons.Copy />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ onCopy }) => !!onCopy,
      permissionCheck: ({ canCopy }) => canCopy !== false,
      run: nodeAction('onCopy'),
    },
    restore: {
      type: 'restore',
      label: t('恢复'),
      tooltip: t('恢复'),
      icon: <Icons.Restore />,
      colorClass: 'text-green-600',
      hoverClass: 'hover:bg-green-50',
      variant: 'success',
      visibilityCheck: ({ isTrash, onRestore }) => {
        // 在回收站视图中显示恢复按钮
        return isTrash && !!onRestore;
      },
      permissionCheck: ({ canManageTrash }) => canManageTrash !== false,
      run: nodeAction('onRestore'),
    },
    delete: {
      type: 'delete',
      label: t('删除'),
      tooltip: t('删除'),
      icon: <Icons.Delete />,
      colorClass: 'text-red-600',
      hoverClass: 'hover:bg-red-50',
      variant: 'danger',
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
      run: nodeAction('onDelete'),
    },
    permanently_delete: {
      type: 'permanently_delete',
      label: t('彻底删除'),
      tooltip: t('彻底删除'),
      icon: <Icons.Delete />,
      colorClass: 'text-red-700',
      hoverClass: 'hover:bg-red-100',
      variant: 'danger',
      isDestructive: true,
      visibilityCheck: ({ isTrash, isRoot, onPermanentlyDelete }) =>
        // 在回收站视图中显示彻底删除按钮
        isTrash && !!onPermanentlyDelete,
      permissionCheck: ({ canManageTrash }) => canManageTrash !== false,
      run: nodeAction('onPermanentlyDelete'),
    },
    edit: {
      type: 'edit',
      label: t('编辑'),
      tooltip: t('编辑'),
      icon: <Icons.Edit />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot, isTrash, onEdit }) =>
        isRoot && !isTrash && !!onEdit,
      permissionCheck: ({ canEdit }) => canEdit !== false,
      run: eventAction('onEdit'),
    },
    share: {
      type: 'share',
      label: t('分享'),
      tooltip: t('分享图纸'),
      icon: <Icons.Share />,
      colorClass: 'text-cyan-600',
      hoverClass: 'hover:bg-cyan-50',
      visibilityCheck: ({ isFolder, onShare, canShare }) =>
        !isFolder && !!onShare,
      permissionCheck: ({ canShare }) => canShare !== false,
      run: nodeAction('onShare'),
    },
    show_members: {
      type: 'show_members',
      label: t('成员'),
      tooltip: t('成员'),
      icon: <Icons.Users />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot, isTrash, onShowMembers }) =>
        isRoot && !isTrash && !!onShowMembers,
      props: {
        'data-tour': 'menu-show-members',
      },
      run: eventAction('onShowMembers'),
    },
    show_roles: {
      type: 'show_roles',
      label: t('角色管理'),
      tooltip: t('角色管理'),
      icon: <Icons.Settings />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot, isTrash, onShowRoles }) =>
        isRoot && !isTrash && !!onShowRoles,
      props: {
        'data-tour': 'menu-show-roles',
      },
      run: eventAction('onShowRoles'),
    },
    show_operation_history: {
      type: 'show_operation_history',
      label: t('操作历史'),
      tooltip: t('操作历史'),
      icon: <Icons.History />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot, isTrash, onShowOperationHistory }) =>
        isRoot && !isTrash && !!onShowOperationHistory,
      props: {
        'data-tour': 'menu-show-operation-history',
      },
      run: eventAction('onShowOperationHistory'),
    },
    open_file_location: {
      type: 'open_file_location',
      label: t('打开所在位置'),
      tooltip: t('在新标签页打开文件所在文件夹'),
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
      run: nodeAction('onOpenFileLocation'),
    },
    copy_clipboard: {
      type: 'copy_clipboard',
      label: t('复制'),
      tooltip: t('复制到剪贴板'),
      icon: <Icons.Copy />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot, isTrash, onCopyClipboard }) =>
        !isRoot && !isTrash && !!onCopyClipboard,
      permissionCheck: ({ canCopy }) => canCopy !== false,
      run: nodeAction('onCopyClipboard'),
    },
    cut: {
      type: 'cut',
      label: t('剪切'),
      tooltip: t('剪切到剪贴板'),
      icon: <Icons.Cut />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot, isTrash, onCut }) =>
        !isRoot && !isTrash && !!onCut,
      permissionCheck: ({ canMove }) => canMove !== false,
      run: nodeAction('onCut'),
    },
    batch_download_folder: {
      type: 'batch_download_folder',
      label: t('下载文件夹'),
      tooltip: t('选择格式后将文件夹打包为 ZIP'),
      icon: <Icons.Download />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isFolder, isRoot, isTrash, onFolderDownload }) =>
        isFolder && !isRoot && !isTrash && !!onFolderDownload,
      permissionCheck: ({ canDownload }) => canDownload !== false,
      run: nodeAction('onFolderDownload'),
    },
    copy_path: {
      type: 'copy_path',
      label: t('复制路径'),
      tooltip: t('复制文件完整路径'),
      icon: <Icons.Copy />,
      colorClass: 'text-slate-700',
      hoverClass: 'hover:bg-slate-50',
      visibilityCheck: ({ isRoot, isTrash, isSearchResult, onCopyPath }) =>
        !!isSearchResult && !isRoot && !isTrash && !!onCopyPath,
      run: nodeAction('onCopyPath'),
    },
  };
}

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
 * ActionCallbacks 中会被 visibilityCheck 消费、写入 FileActionCheckProps 的键。
 * 类型标注 CallbackCheckKey[] 保证每个键都同时在两个接口中——
 * 任一接口增删键导致某键脱离交集时编译报错，杜绝接口漂移。
 */
type CallbackCheckKey = Extract<
  keyof ActionCallbacks,
  keyof FileActionCheckProps
>;

const CHECK_KEYS: CallbackCheckKey[] = [
  'onOpen',
  'onOpenInNewTab',
  'onOpenFileLocation',
  'onDownload',
  'onMove',
  'onCopy',
  'onCopyClipboard',
  'onCut',
  'onRestore',
  'onPermanentlyDelete',
  'onShare',
  'onShowVersionHistory',
  'onFolderDownload',
  'onCopyPath',
  'onEdit',
  'onShowMembers',
  'onShowRoles',
  'onShowOperationHistory',
  'onDeleteNode',
  'onUploadExternalReference',
];

/**
 * 由统一回调集自动推导可见性布尔位：只写入 CHECK_KEYS 交集键，
 * onDelete/onRename/onUploadExternalReference 等信号键不进入 check props；
 * onDeleteNode 等环境信号位用 overrides 覆盖。
 */
export function toBooleanMap(
  callbacks: ActionCallbacks,
  overrides?: Partial<FileActionCheckProps>
): Partial<FileActionCheckProps> {
  // 先由 callbacks 自动推导，overrides 最后展开并覆盖同名键。
  // 顺序必须如此：若先展开 overrides 再被 CHECK_KEYS 循环覆盖，则调用方传入的信号位
  // 兜底（如 onDeleteNode: !!onDeleteNode || !!onDelete）会被 !!callbacks.onDeleteNode
  // （侧边栏未传 → undefined → false）抹掉，导致「有删除回调却没有删除菜单项」的回归（b1d6cb75）。
  const result: Partial<FileActionCheckProps> = {};
  for (const key of CHECK_KEYS) {
    result[key] = !!callbacks[key];
  }
  return { ...result, ...overrides };
}

/**
 * 将操作列表分组为主操作和危险操作
 */
export function getActionGroups(actions: FileAction[]) {
  return {
    main: actions.filter((a) => !a.isDestructive),
    destructive: actions.filter((a) => a.isDestructive),
  };
}
