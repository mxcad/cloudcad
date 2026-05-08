///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { LibraryType } from '../../library/library.service';
import { CreateFolderDto } from '../../file-system/dto/create-folder.dto';

export interface IPublicLibraryProvider {
  getLibraryId(): Promise<string>;

  /**
   * 获取公共资源库根节点（含直接子节点列表）
   * @returns FileSystemNode 节点对象（含 children 数组），未找到时返回 null
   */
  getRootNode(): Promise<unknown>;

  /**
   * 在公共资源库中创建文件夹
   * @returns 新创建的 FileSystemNode 文件夹节点
   */
  createFolder(dto: CreateFolderDto): Promise<unknown>;

  /**
   * 删除公共资源库中的节点（永久删除）
   * @returns 删除操作的执行结果
   */
  deleteNode(nodeId: string): Promise<unknown>;
}

export const PUBLIC_LIBRARY_PROVIDER_DRAWING = 'PUBLIC_LIBRARY_PROVIDER_DRAWING';
export const PUBLIC_LIBRARY_PROVIDER_BLOCK = 'PUBLIC_LIBRARY_PROVIDER_BLOCK';
