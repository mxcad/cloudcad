///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 文件系统相关 Hooks 索引
 *
 * 包含原有的 useFileSystem 系列 hooks 和新增的通用列表 hooks
 */

// 原有 hooks
export { useFileSystem } from './useFileSystem';
export { useFileSystemCRUD } from './useFileSystemCRUD';
export { useFileSystemData } from './useFileSystemData';
export { useFileSystemDragDrop } from './useFileSystemDragDrop';
export { useFileSystemNavigation } from './useFileSystemNavigation';
export { useFileSystemSearch } from './useFileSystemSearch';
export { useFileSystemSelection } from './useFileSystemSelection';
export { useFileSystemUI } from './useFileSystemUI';

// 新增通用列表 hooks（提取自公共资源库和图纸模块）
export { useBreadcrumbCollapse } from '../useBreadcrumbCollapse';
export type {
  UseBreadcrumbCollapseReturn,
  UseBreadcrumbCollapseOptions,
} from '../useBreadcrumbCollapse';

export { useFileListPagination } from '../useFileListPagination';
export type {
  UseFileListPaginationReturn,
  UseFileListPaginationOptions,
} from '../useFileListPagination';

export { useFileListSearch } from '../useFileListSearch';
export type {
  UseFileListSearchReturn,
  UseFileListSearchOptions,
} from '../useFileListSearch';
