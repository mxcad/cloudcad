///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FileSystemService } from '../file-system/file-system.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { PermissionService } from '../common/services/permission.service';
import { SystemPermission } from '../common/enums/permissions.enum';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 公共资源库类型
 */
export type LibraryType = 'drawing' | 'block';

/**
 * 保存结果类型
 */
export interface SaveResult {
  nodeId: string;
  path: string;
}

/**
 * 另存为结果类型
 */
export interface SaveAsResult {
  nodeId: string;
  fileName: string;
  path: string;
  parentId: string;
}

/**
 * 公共资源库服务
 *
 * 提供图纸库和图块库的管理功能
 * 复用文件系统的实现，通过 libraryKey 区分不同类型的库
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileSystemService: FileSystemService,
    private readonly fileTreeService: FileTreeService,
    private readonly permissionService: PermissionService
  ) {}

  /**
   * 获取公共资源库项目 ID
   * @param libraryType 库类型：'drawing' | 'block'
   * @returns 库项目 ID
   */
  async getLibraryId(libraryType: LibraryType): Promise<string> {
    const library = await this.prisma.fileSystemNode.findFirst({
      where: {
        libraryKey: libraryType,
        isRoot: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!library) {
      throw new NotFoundException(
        `公共资源库 (${libraryType}) 不存在，请先初始化`
      );
    }

    return library.id;
  }

  /**
   * 获取公共资源库项目信息
   * @param libraryType 库类型
   * @returns 库项目信息
   */
  async getLibrary(libraryType: LibraryType) {
    const libraryId = await this.getLibraryId(libraryType);

    return this.prisma.fileSystemNode.findUnique({
      where: { id: libraryId },
      include: {
        children: {
          where: {
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * 检查是否是公共资源库
   * @param nodeId 节点 ID
   * @returns 是否是公共资源库
   */
  async isLibrary(nodeId: string): Promise<boolean> {
    const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
    return libraryKey !== null;
  }

  /**
   * 获取库类型
   * @param nodeId 节点 ID
   * @returns 库类型或 null
   */
  async getLibraryType(nodeId: string): Promise<LibraryType | null> {
    return this.fileTreeService.getLibraryKey(nodeId);
  }

  /**
   * 检查用户是否有库管理权限
   * @param userId 用户 ID
   * @param libraryType 库类型
   * @returns 是否有管理权限
   */
  async hasLibraryManagePermission(
    userId: string,
    libraryType: LibraryType
  ): Promise<boolean> {
    const requiredPermission =
      libraryType === 'drawing'
        ? SystemPermission.LIBRARY_DRAWING_MANAGE
        : SystemPermission.LIBRARY_BLOCK_MANAGE;

    return this.permissionService.checkSystemPermission(
      userId,
      requiredPermission
    );
  }
}
