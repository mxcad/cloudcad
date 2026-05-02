///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { FileStatus, FileSystemNode } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ConfigService } from '@nestjs/config';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { StorageQuotaService, StorageQuotaType } from './storage-quota.service';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export { StorageQuotaType };

export interface StorageQuotaInfo {
  type: StorageQuotaType;
  used: number;
  total: number;
  remaining: number;
  usagePercent: number;
}

/**
 * 配额缓存项
 */
interface QuotaCacheItem {
  data: StorageQuotaInfo;
  expiresAt: number;
}

@Injectable()
export class StorageInfoService {
  private readonly logger = new Logger(StorageInfoService.name);
  private readonly quotaCache = new Map<string, QuotaCacheItem>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 分钟缓存

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly storageQuotaService: StorageQuotaService
  ) {}

  determineQuotaType(node: Partial<FileSystemNode>): StorageQuotaType {
    return this.storageQuotaService.determineQuotaType(node);
  }

  async getStorageQuotaLimit(node?: Partial<FileSystemNode>): Promise<number> {
    return this.storageQuotaService.getStorageQuotaLimit(node);
  }

  async getStorageQuota(
    userId: string,
    nodeId?: string,
    node?: Partial<FileSystemNode>
  ): Promise<StorageQuotaInfo> {
    // 如果未提供 node 但提供了 nodeId，从数据库获取节点信息
    let resolvedNode = node;
    let resolvedNodeId = nodeId;

    if (!resolvedNode && nodeId) {
      resolvedNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          id: true,
          isRoot: true,
          libraryKey: true,
          projectId: true,
          storageQuota: true,
        },
      });
    } else if (!nodeId) {
      // 如果没有 nodeId，获取用户个人空间节点
      const personalSpace = await this.prisma.fileSystemNode.findUnique({
        where: { personalSpaceKey: userId },
        select: {
          id: true,
          isRoot: true,
          libraryKey: true,
          projectId: true,
          storageQuota: true,
        },
      });
      if (personalSpace) {
        resolvedNode = personalSpace;
        resolvedNodeId = personalSpace.id;
      }
    }

    // 生成缓存键
    const cacheKey = `quota:${userId}:${resolvedNodeId || 'personal'}`;

    // 尝试从缓存获取
    const cached = this.quotaCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(`配额缓存命中: ${cacheKey}`);
      return cached.data;
    }

    // 缓存未命中，计算配额
    this.logger.debug(`配额缓存未命中，计算中: ${cacheKey}`);
    const quotaInfo = await this.calculateStorageQuota(
      userId,
      resolvedNodeId,
      resolvedNode
    );

    // 存入缓存
    this.quotaCache.set(cacheKey, {
      data: quotaInfo,
      expiresAt: Date.now() + this.cacheTTL,
    });

    return quotaInfo;
  }

  /**
   * 计算存储配额（内部方法）
   * 使用数据库聚合查询优化性能，避免传输大量数据到内存
   */
  private async calculateStorageQuota(
    userId: string,
    nodeId?: string,
    node?: Partial<FileSystemNode>
  ): Promise<StorageQuotaInfo> {
    const type = node
      ? this.determineQuotaType(node)
      : StorageQuotaType.PERSONAL;
    const totalLimit = await this.getStorageQuotaLimit(node);

    let totalUsed = 0;

    // 使用数据库聚合查询，性能优化
    if (type === StorageQuotaType.LIBRARY && node?.id) {
      const result = await this.prisma.fileSystemNode.aggregate({
        where: {
          projectId: node.id,
          isFolder: false,
          fileStatus: FileStatus.COMPLETED,
        },
        _sum: { size: true },
      });
      totalUsed = result._sum.size || 0;
    } else if (type === StorageQuotaType.PROJECT && node?.id) {
      const result = await this.prisma.fileSystemNode.aggregate({
        where: {
          isFolder: false,
          fileStatus: FileStatus.COMPLETED,
          OR: [{ id: node.id }, { projectId: node.id }],
        },
        _sum: { size: true },
      });
      totalUsed = result._sum.size || 0;
    } else {
      const result = await this.prisma.fileSystemNode.aggregate({
        where: {
          ownerId: userId,
          isFolder: false,
          fileStatus: FileStatus.COMPLETED,
          projectId: null,
        },
        _sum: { size: true },
      });
      totalUsed = result._sum.size || 0;
    }

    const available = totalLimit - totalUsed;
    const usagePercentage =
      totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;

    return {
      type,
      used: totalUsed,
      total: totalLimit,
      remaining: available,
      usagePercent: usagePercentage,
    };
  }

  /**
   * 清除配额缓存
   */
  async invalidateQuotaCache(userId: string, nodeId?: string): Promise<void> {
    const cacheKey = `quota:${userId}:${nodeId || 'personal'}`;
    this.quotaCache.delete(cacheKey);
    this.logger.debug(`配额缓存已清除: ${cacheKey}`);
  }

  async getUserStorageInfo(userId: string): Promise<StorageQuotaInfo> {
    return this.getStorageQuota(userId);
  }

  async deleteMxCadFilesFromUploads(fileHash: string): Promise<number> {
    if (!fileHash) {
      return 0;
    }

    let totalDeleted = 0;

    try {
      const uploadPath = this.configService.get('mxcadUploadPath', {
        infer: true,
      });

      try {
        await fsPromises.access(uploadPath);
        const files = await fsPromises.readdir(uploadPath);

        const relatedFiles = files.filter((file) => file.startsWith(fileHash));

        for (const fileName of relatedFiles) {
          const filePath = path.join(uploadPath, fileName);
          try {
            await fsPromises.unlink(filePath);
            this.logger.log(`删除 uploads 文件成功: ${filePath}`);
            totalDeleted++;
          } catch (error) {
            this.logger.error(
              `删除 uploads 文件失败: ${filePath}: ${error.message}`
            );
          }
        }

        const hashDir = path.join(uploadPath, fileHash);
        try {
          await fsPromises.access(hashDir);
          const extRefFiles = await fsPromises.readdir(hashDir);

          for (const extRefFile of extRefFiles) {
            const extRefFilePath = path.join(hashDir, extRefFile);
            try {
              await fsPromises.unlink(extRefFilePath);
              this.logger.log(
                `删除 uploads 外部参照文件成功: ${extRefFilePath}`
              );
              totalDeleted++;
            } catch (error) {
              this.logger.error(
                `删除 uploads 外部参照文件失败: ${extRefFilePath}: ${error.message}`
              );
            }
          }

          await fsPromises.rmdir(hashDir);
          this.logger.log(`删除 uploads 外部参照目录成功: ${hashDir}`);
        } catch (error) {
          this.logger.debug(`外部参照子目录不存在: ${hashDir}`);
        }
      } catch (error) {
        this.logger.warn(
          `uploads 目录不存在或读取失败: ${uploadPath}: ${error.message}`
        );
      }

      this.logger.log(
        `共删除 ${totalDeleted} 个临时文件（uploads 目录），哈希值: ${fileHash}`
      );
      return totalDeleted;
    } catch (error) {
      this.logger.error(
        `删除 MxCAD 临时文件失败: ${error.message}`,
        error.stack
      );
      return 0;
    }
  }

  async deleteMxCadFilesFromUploadsBatch(
    fileHashes: string[]
  ): Promise<number> {
    if (!fileHashes || fileHashes.length === 0) {
      return 0;
    }

    let totalDeleted = 0;
    for (const fileHash of fileHashes) {
      const deleted = await this.deleteMxCadFilesFromUploads(fileHash);
      totalDeleted += deleted;
    }

    this.logger.log(
      `批量删除 uploads 文件完成，共删除 ${totalDeleted} 个文件，哈希值数量: ${fileHashes.length}`
    );
    return totalDeleted;
  }
}
