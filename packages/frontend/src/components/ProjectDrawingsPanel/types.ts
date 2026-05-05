///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import type { FileSystemNode } from '@/types/filesystem';

/** 库类型 */
export type LibraryType = 'drawing' | 'block';

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface ProjectDrawingsPanelProps {
  /** 项目 ID（编辑器当前打开的项目，用于"我的项目"Tab 的初始选择） */
  projectId?: string;
  /** 打开图纸回调 */
  onDrawingOpen: (node: FileSystemNode, libraryType?: LibraryType) => void;
  /** 是否为私人空间模式 */
  isPersonalSpace?: boolean;
  /** 当前打开的文件 ID */
  currentOpenFileId?: string | null;
  /** 当前文档是否已修改 */
  isModified?: boolean;
  /** 要显示的父目录 ID（如果提供，则直接显示该目录内容） */
  parentId?: string | null;
  /** 私人空间 ID（用于判断 parentId 是否属于私人空间） */
  personalSpaceId?: string | null;
  /** 库类型：图纸库或图块库（设置后进入图书馆模式） */
  libraryType?: LibraryType;
  /** 是否需要双击打开图纸（默认 false，单击打开） */
  doubleClickToOpen?: boolean;
}
