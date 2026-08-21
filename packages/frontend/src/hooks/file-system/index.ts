///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 文件系统相关 Hooks 索引
 *
 * 包含原有的 useFileSystem 系列 hooks 和新增的通用列表 hooks
 */

export { useFileSystem } from './useFileSystem';
export { useFileSystemCRUD } from './useFileSystemCRUD';
export type { UseFileSystemCrudReturn } from './useFileSystemCRUD';
export {
  buildMoveAction,
  buildCopyAction,
  getCreatedNodeId,
} from './moveCopyActions';
export { useFileSystemData } from './useFileSystemData';
export { useFileSystemNavigation } from './useFileSystemNavigation';
export { useFileSystemSearch } from './useFileSystemSearch';
export { useFileSystemUI } from './useFileSystemUI';
export { useBatchDownload } from './useBatchDownload';
export { useTrashView } from './useTrashView';
export { useMoveCopyOrchestrator } from './useMoveCopyOrchestrator';
export type {
  MoveCopyMode,
  MoveCopyCallOptions,
  UseMoveCopyOrchestratorReturn,
} from './useMoveCopyOrchestrator';
