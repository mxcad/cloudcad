///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';
import { FileSystemNode } from '@/types/filesystem';
import type { ResourceItem } from '@/components/common';
import { getLibraryThumbnailUrl } from '@/utils/fileUtils';
import styles from '@/components/sidebar/sidebar.module.css';

import type { BreadcrumbItem, LibraryType } from './types';
import { isDrawingFile, API_BASE } from './constants';

export interface BuildResourceItemsOptions {
  nodes: FileSystemNode[];
  currentOpenFileId?: string | null;
  isModified?: boolean;
  searchQuery: string;
  selectedProjectId: string | null;
  breadcrumb: BreadcrumbItem[];
  isLibraryMode: boolean;
  libraryType?: LibraryType;
  libraryRootId: string | null;
  keyPrefix: string;
}

/** 已修改标记 badge（JSX） */
function renderBadge(isActive: boolean, isModified: boolean) {
  if (!isActive || !isModified) return undefined;
  return (
    <span className={styles.modifiedIndicator} title={t('已修改')}>
      ●
    </span>
  );
}

/**
 * 构造 ResourceList 的 items（库模式/项目模式）
 *
 * 从 ProjectDrawingsPanelMain.tsx 提取的纯计算函数，便于数据层瘦身。
 */
export function buildResourceItems({
  nodes,
  currentOpenFileId,
  isModified,
  searchQuery,
  selectedProjectId,
  breadcrumb,
  isLibraryMode,
  libraryType,
  libraryRootId,
  keyPrefix,
}: BuildResourceItemsOptions): ResourceItem[] {
  if (isLibraryMode) {
    const files = nodes.filter((n) => !n.isFolder);
    // isLibraryMode 分支内 libraryType 必有值
    const getThumb = (nodeId: string) =>
      getLibraryThumbnailUrl(nodeId, libraryType ?? 'drawing');
    const items = files.map((node) => ({
      id: node.id,
      name: node.name,
      type: 'file' as const,
      thumbnailUrl: getThumb(node.id),
      updatedAt: node.updatedAt,
      size: node.size,
      isActive: node.id === currentOpenFileId,
      badge: renderBadge(node.id === currentOpenFileId, isModified || false),
      filePath: undefined,
      parentId: node.parentId,
      projectId: libraryRootId ?? undefined,
      isCadFile: true,
      keyPrefix,
    }));
    const query = searchQuery.toLowerCase();
    return searchQuery
      ? items.filter((i) => i.name.toLowerCase().includes(query))
      : items;
  }
  const folders = nodes.filter((n) => n.isFolder);
  const files = nodes.filter((n) => !n.isFolder && isDrawingFile(n.name));
  const rootId = selectedProjectId ?? breadcrumb[0]?.id ?? undefined;
  const getThumb = (nodeId: string) =>
    `${API_BASE}/v1/file-system/nodes/${nodeId}/thumbnail`;
  const folderItems: ResourceItem[] = folders.map((n) => ({
    id: n.id,
    name: n.name,
    type: 'folder',
    updatedAt: n.updatedAt,
    keyPrefix,
  }));
  const fileItems: ResourceItem[] = files.map((n) => ({
    id: n.id,
    name: n.name,
    type: 'file',
    thumbnailUrl: getThumb(n.id),
    updatedAt: n.updatedAt,
    size: n.size,
    isActive: n.id === currentOpenFileId,
    badge: renderBadge(n.id === currentOpenFileId, isModified || false),
    filePath: n.path,
    parentId: n.parentId,
    projectId: rootId,
    isCadFile: true,
    keyPrefix,
  }));
  const query = searchQuery.toLowerCase();
  return [
    ...(searchQuery
      ? folderItems.filter((i) => i.name.toLowerCase().includes(query))
      : folderItems),
    ...(searchQuery
      ? fileItems.filter((i) => i.name.toLowerCase().includes(query))
      : fileItems),
  ];
}
