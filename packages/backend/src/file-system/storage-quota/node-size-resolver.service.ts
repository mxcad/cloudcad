///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fsPromises from 'fs/promises';
import { I18nContext } from 'nestjs-i18n';
import { StorageManager } from '../../storage-management/services/storage-manager.service';

interface SizedFileNode {
  size: number | null;
  path: string | null;
}

interface IdentifiedSizedFileNode extends SizedFileNode {
  id: string;
}

/**
 * FILE 节点真实大小解析：DB size 优先，size 为 null 时读取物理文件大小兜底。
 * 防止 null size 被当作 0 参与增量计算从而绕过配额检查（#215）。
 * 物理文件不可读时抛 BadRequestException 阻止操作——无法确定真实大小，宁可拒绝。
 */
@Injectable()
export class NodeSizeResolverService {
  private readonly logger = new Logger(NodeSizeResolverService.name);

  constructor(private readonly storageManager: StorageManager) {}

  /**
   * 解析单个 FILE 节点真实大小；失败抛 BadRequestException。
   */
  async resolveFileSize(
    fileNode: SizedFileNode,
    nodeId: string
  ): Promise<number> {
    if (fileNode.size != null) {
      return fileNode.size;
    }
    if (!fileNode.path) {
      this.logger.warn(`文件节点缺失 path，无法读取真实大小: ${nodeId}`);
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.file_size_unavailable') ??
          '无法读取文件大小，操作已取消'
      );
    }
    try {
      const stats = await fsPromises.stat(
        this.storageManager.getFullPath(fileNode.path)
      );
      return stats.size;
    } catch (error) {
      this.logger.error(
        `文件节点 size 为空且物理文件读取失败: ${nodeId} (${fileNode.path})`,
        error.stack
      );
      this.logger.log(
        {
          action: 'quota-size-resolve',
          resourceType: 'FILE',
          nodeId,
          path: fileNode.path,
        },
        'audit'
      );
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.file_size_unavailable') ??
          '无法读取文件大小，操作已取消'
      );
    }
  }

  /**
   * 批量解析并求和（子树聚合用）：仅 size 为 null 的节点触发物理读取，并行执行。
   */
  async resolveFileSizes(files: IdentifiedSizedFileNode[]): Promise<number> {
    if (files.length === 0) return 0;
    const sizes = await Promise.all(
      files.map((file) => this.resolveFileSize(file, file.id))
    );
    return sizes.reduce((total, size) => total + size, 0);
  }
}
