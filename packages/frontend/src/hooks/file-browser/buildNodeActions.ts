///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { FileSystemNode } from '@/types/filesystem';
import {
  getAvailableActions,
  getActionGroups,
  toBooleanMap,
  type ActionCallbacks,
  type FileAction,
  type FileActionCheckProps,
} from '@/components/file-item/fileActionConfig';
import { CAD_EXTENSIONS } from '@/utils/fileUtils';

/** 节点动作可用性权限位（由外壳权限派生注入） */
export interface BuildNodeActionsPermissions {
  canDownload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  canViewVersionHistory?: boolean;
  canManageExternalReference?: boolean;
  canMove?: boolean;
  canCopy?: boolean;
  canCreate?: boolean;
  /** 回收站管理权限（恢复/彻底删除/清空门控） */
  canManageTrash?: boolean;
}

/** 节点动作回调可用性（外壳按需注入，undefined = 不提供该动作） */
export type BuildNodeActionsCallbacks = ActionCallbacks;

export interface BuildNodeActionsOptions {
  node: FileSystemNode;
  isTrash: boolean;
  isSearchResult?: boolean;
  permissions: BuildNodeActionsPermissions;
  callbacks: BuildNodeActionsCallbacks;
  /** 排除移动/复制动作（侧边栏场景） */
  excludeMoveCopy?: boolean;
  /** 覆盖 toBooleanMap 自动推导的布尔位（onDeleteNode 等环境信号位） */
  overrides?: Partial<FileActionCheckProps>;
}

export interface BuildNodeActionsResult {
  main: FileAction[];
  destructive: FileAction[];
}

/**
 * buildNodeActions - 右键菜单动作构建纯函数（内核）
 *
 * 收敛 FileSystemContent 内联的 actionProps 组装：节点属性 + 权限位 + 回调可用性
 * → getAvailableActions 过滤 → 主/危险动作分组。
 * 纯函数（无 hook、无 DOM），两外壳共用，测试可全枚举覆盖。
 */
export function buildNodeActions({
  node,
  isTrash,
  isSearchResult = false,
  permissions,
  callbacks,
  excludeMoveCopy = false,
  overrides,
}: BuildNodeActionsOptions): BuildNodeActionsResult {
  const isFolder = node.isFolder;
  const isRoot = node.isRoot;
  const isCadFile =
    !isFolder &&
    !isRoot &&
    CAD_EXTENSIONS.includes(node.extension?.toLowerCase() || '');

  const availableActions = getAvailableActions({
    node,
    isTrash,
    isRoot,
    isCadFile,
    isFolder,
    canDownload: permissions.canDownload,
    canEdit: permissions.canEdit,
    canDelete: permissions.canDelete,
    canShare: permissions.canShare,
    canViewVersionHistory: permissions.canViewVersionHistory,
    canManageExternalReference: permissions.canManageExternalReference,
    canManageTrash: permissions.canManageTrash,
    canMove: permissions.canMove,
    canCopy: permissions.canCopy,
    canCreate: permissions.canCreate,
    // 回调存在性 → 可见性布尔位（自动推导）；onDeleteNode 等环境信号位
    // 经 overrides 传入，根节点 move/copy 短路在此兜底且可被 overrides 覆盖
    ...toBooleanMap(callbacks, {
      ...overrides,
      onMove: overrides?.onMove ?? (!isRoot && !!callbacks.onMove),
      onCopy: overrides?.onCopy ?? (!isRoot && !!callbacks.onCopy),
    }),
    excludeMoveCopy,
    isSearchResult,
  });

  return getActionGroups(availableActions);
}
