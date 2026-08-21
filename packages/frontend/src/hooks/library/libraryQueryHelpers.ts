///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingChildren,
  libraryControllerGetDrawingAllFiles,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockChildren,
  libraryControllerGetBlockAllFiles,
  libraryControllerGetBlockNode,
} from '@/api-sdk';
import type { NodeListResponseDto } from '@/api-sdk';
import type { QueryKey } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';

export type LibraryType = 'drawing' | 'block';

export interface LibraryData {
  libraryId: string;
  libraryName: string;
}

export type ChildrenData = Pick<
  NodeListResponseDto,
  'nodes' | 'total' | 'totalPages'
>;

export interface BreadcrumbItem {
  id: string;
  name: string;
}

// ---- queryKey helpers ----

export function getLibraryQueryKey(type: LibraryType): QueryKey {
  return type === 'drawing'
    ? queryKeys.library.drawing.library
    : queryKeys.library.block.library;
}

export function getChildrenQueryKey(
  type: LibraryType,
  nodeId: string
): QueryKey {
  return type === 'drawing'
    ? queryKeys.library.drawing.children(nodeId)
    : queryKeys.library.block.children(nodeId);
}

export function getAllFilesQueryKey(
  type: LibraryType,
  nodeId: string,
  search: string
): QueryKey {
  const base =
    type === 'drawing'
      ? queryKeys.library.drawing.allFiles(nodeId)
      : queryKeys.library.block.allFiles(nodeId);
  return [...base, { search }] as const;
}

export function getNodeQueryKey(type: LibraryType, nodeId: string): QueryKey {
  return type === 'drawing'
    ? queryKeys.library.drawing.node(nodeId)
    : queryKeys.library.block.node(nodeId);
}

/** 构建 children 或 allFiles 的 queryKey（消除条件类型断言） */
export function buildChildrenOrAllFilesKey(
  libraryType: LibraryType,
  useAllFiles: boolean,
  effectiveNodeId: string
): QueryKey {
  if (useAllFiles) {
    return getAllFilesQueryKey(libraryType, effectiveNodeId, '');
  }
  return getChildrenQueryKey(libraryType, effectiveNodeId);
}

// ---- API method resolvers ----

export function getLibraryApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingLibrary
    : libraryControllerGetBlockLibrary;
}

export function getChildrenApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingChildren
    : libraryControllerGetBlockChildren;
}

export function getAllFilesApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingAllFiles
    : libraryControllerGetBlockAllFiles;
}

export function getNodeApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingNode
    : libraryControllerGetBlockNode;
}
