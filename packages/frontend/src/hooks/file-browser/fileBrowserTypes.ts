///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { FileSystemNode } from '@/types/filesystem';
import type { BreadcrumbItem as FileSystemBreadcrumbItem } from '@/types/filesystem';
import type { PaginationMeta } from '@/components/ui/Pagination';
import type { SearchFilterValues } from '@/components/search/SearchFilters';
import type { ProjectFilterType } from '@/api-sdk';

export type { FileSystemBreadcrumbItem };

/** 库类型（与 ProjectDrawingsPanel/types 的 LibraryType 同构，内核独立定义避免反向依赖） */
export type LibraryType = 'drawing' | 'block';

/** 导航模式：url=URL 驱动（全屏页）；controlled=受控（侧边栏，external 传入当前定位） */
export type FileBrowserNavigationMode = 'url' | 'controlled';

/** 选择模式：always=常驻多选（全屏页）；batch-only=批量模式才可多选（侧边栏库管理员）；false=禁用 */
export type FileBrowserSelectionMode = 'always' | 'batch-only' | false;

/** 数据源适配器契约：库模式由外壳 useLibraryLoader 注入，内核只见该契约 */
export interface FileBrowserSource {
  /** 加载节点列表（append：'prepend' | true 由滚动分页场景使用） */
  load(
    nodeId: string,
    page?: number,
    search?: string,
    append?: boolean | 'prepend'
  ): Promise<void> | void;
  /** 强制刷新当前数据 */
  refresh(): void;
  /** 构建面包屑路径（受控导航场景） */
  buildBreadcrumb?(nodeId: string): Promise<FileSystemBreadcrumbItem[]>;
}

export type ShowToastFn = (
  message: string,
  type?: 'success' | 'error' | 'info' | 'warning'
) => void;

export type ShowConfirmFn = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  type?: 'danger' | 'warning' | 'info',
  confirmText?: string
) => void;

/** 节点权限集合（项目级权限位，供动作权限门控） */
export interface FileBrowserPermissions {
  /** FILE_CREATE */
  canCreate?: boolean;
  /** FILE_EDIT */
  canEdit?: boolean;
  /** FILE_DELETE */
  canDelete?: boolean;
  /** FILE_MOVE */
  canMove?: boolean;
  /** FILE_COPY */
  canCopy?: boolean;
  /** FILE_TRASH_MANAGE（回收站恢复/清空/彻底删除门控） */
  canRestore?: boolean;
}

/** useFileBrowserData 选项 */
export interface UseFileBrowserDataOptions {
  navigation: FileBrowserNavigationMode;
  /** url 模式：项目模式 / 私人空间模式 */
  mode?: 'project' | 'personal-space';
  /** url 模式：私人空间 ID（personal-space 模式用） */
  personalSpaceId?: string | null;
  /** controlled 模式：外部项目 ID */
  externalProjectId?: string | null;
  /** controlled 模式：外部节点 ID */
  externalNodeId?: string | null;
  /** 数据源适配器（库模式注入 useLibraryLoader；普通模式也可注入） */
  source: FileBrowserSource;
  /** 初始页大小（默认 30） */
  pageSize?: number;
  /** 项目过滤类型（url 模式根目录项目列表） */
  projectFilter?: ProjectFilterType;
  /** 是否启用（面板不可见时跳过副作用） */
  enabled?: boolean;
}

/** useFileBrowserData 返回 */
export interface UseFileBrowserDataReturn {
  /** 当前节点列表 */
  nodes: FileSystemNode[];
  /** 加载中 */
  loading: boolean;
  /** 后台刷新中 */
  isFetching: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前节点（面包屑末端对应的节点信息） */
  currentNode: FileSystemNode | null;
  /** 面包屑 */
  breadcrumbs: FileSystemBreadcrumbItem[];
  /** 分页元信息 */
  paginationMeta: PaginationMeta | null;
  /** 搜索词 */
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSearchSubmit: () => void;
  searchFilters: SearchFilterValues;
  handleFiltersChange: (filters: SearchFilterValues) => void;
  handleSearchQueryChange: (query: string) => void;
  /** 分页状态 */
  pagination: { page: number; limit: number };
  setPagination: React.Dispatch<
    React.SetStateAction<{ page: number; limit: number }>
  >;
  handlePageChange: (page: number) => void;
  handlePageSizeChange: (size: number) => void;
  /** 加载节点（委托 source.load） */
  load: (
    nodeId: string,
    page?: number,
    search?: string,
    append?: boolean | 'prepend'
  ) => void | Promise<void>;
  /** 刷新（委托 source.refresh） */
  refresh: () => void;
  /** 返回上级 */
  goBack: () => void;
  /** 进入节点（push 面包屑 + 加载） */
  navigateTo: (node: FileSystemNode) => void;
  /** 面包屑点击导航 */
  navigateToBreadcrumb: (index: number) => void;
  /** 当前定位：受控来源 id（externalNodeId ?? externalProjectId）或面包屑末端 */
  currentLocationId: string | null;
  /** url 模式派生 */
  isProjectRootMode: boolean;
  isPersonalSpaceMode: boolean;
  urlProjectId: string;
  urlNodeId: string | undefined;
  /** source 透传（乐观操作等） */
  libraryRootId: string | null;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  totalPages: number;
  hasMore: boolean;
  reset: () => void;
  removeLocalNode?: (nodeId: string) => void;
  updateLocalNode?: (
    nodeId: string,
    updates: Partial<Pick<FileSystemNode, 'name'>>
  ) => void;
  checkSkipVisibilityReload: () => boolean;
  loadNodesRef: React.RefObject<
    (
      nodeId: string,
      page?: number,
      search?: string,
      append?: boolean | 'prepend'
    ) => Promise<void>
  >;
  buildBreadcrumbPathRef: React.RefObject<
    (nodeId: string) => Promise<FileSystemBreadcrumbItem[]>
  >;
}

/** useFileBrowserSelection 选项（T 仅要求含 id：文件节点/分享记录等均可复用） */
export interface UseFileBrowserSelectionOptions<
  T extends { id: string } = { id: string },
> {
  nodes: T[];
  /** always：常驻多选（全屏）；batch-only：批量模式开启才多选；false：禁选 */
  multiple: FileBrowserSelectionMode;
  /** batch-only 时由外壳注入（侧边栏 canManageLibrary） */
  batchEnabled?: boolean;
}

/** useFileBrowserSelection 返回 */
export interface UseFileBrowserSelectionReturn<
  T extends { id: string } = { id: string },
> {
  selectedNodes: Set<string>;
  handleNodeSelect: (nodeId: string, ctrlKey?: boolean, shiftKey?: boolean) => void;
  handleSelectAll: () => void;
  clearSelection: () => void;
  selectMany: (nodeIds: string[]) => void;
  /** 从选中集移除单个节点（保留其余选中；锚点为该节点时同步清锚点） */
  deselectNode: (nodeId: string) => void;
  /** 批量模式开关（batch-only 生效；always 恒 true，false 恒 false） */
  isBatchMode: boolean;
  setBatchMode: (v: boolean) => void;
  /** 批量模式可用性（batch-only：batchEnabled；always：true；false：false） */
  canBatch: boolean;
  /** 多选是否对外可见（batch-only 时仅批量模式中） */
  selectionVisible: boolean;
  selectedNodesArray: T[];
}

/** useFileBrowserModals 弹窗身份 */
export type FileBrowserModalId =
  | 'create-folder'
  | 'create-drawing'
  | 'rename'
  | 'download-format'
  | 'select-folder'
  | 'batch-select-folder'
  | 'project'
  | 'members'
  | 'roles'
  | 'version-history'
  | 'share'
  | 'batch-download';

/** 弹窗状态机状态（单态 activeId + payload 泛型 + 表单值） */
export interface FileBrowserModalState {
  activeId: FileBrowserModalId | null;
  payload: unknown;
  forms: Record<string, unknown>;
}

/** 选择文件夹弹窗来源节点 */
export type FolderPickSourceNode = FileSystemNode | { id: 'batch' } | null;
