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

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from './storage-manager.service';
import { ConfigService } from '@nestjs/config';

export interface CleanupResult {
  success: boolean;
  deletedNodes: number;
  deletedDirectories: number;
  freedSpace: number;
  errors: string[];
}

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);
  private readonly cleanupDelayDays: number;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly configService: ConfigService
  ) {
    this.cleanupDelayDays = this.configService.get(
      'STORAGE_CLEANUP_DELAY_DAYS',
      30
    );
  }

  private get trashCleanupDelayDays(): number {
    return this.configService.get('TRASH_CLEANUP_DELAY_DAYS', 30);
  }

  /**
   * 清理过期的存储文件
   * @returns 清理结果
   */
  async cleanupExpiredStorage(): Promise<CleanupResult> {
    this.logger.log('开始清理过期存储文件');

    const result: CleanupResult = {
      success: true,
      deletedNodes: 0,
      deletedDirectories: 0,
      freedSpace: 0,
      errors: [],
    };

    try {
      // 计算过期时间点
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - this.cleanupDelayDays);

      // 查询所有需要清理的节点
      const nodesToDelete = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedFromStorage: {
            not: null,
            lt: expiryDate,
          },
          isFolder: false, // 只清理文件节点
        },
        select: {
          id: true,
          path: true,
          deletedFromStorage: true,
        },
      });

      this.logger.log(`找到 ${nodesToDelete.length} 个需要清理的节点`);

      // 清理每个节点的存储
      for (const node of nodesToDelete) {
        try {
          // 解析路径
          const pathParts = node.path?.split('/') || [];
          if (pathParts.length < 2) {
            this.logger.warn(`节点路径格式错误: ${node.path}`);
            continue;
          }

          const directory = pathParts[0]; // YYYYMM[/N]
          const nodeId = pathParts[1]; // nodeId

          // 删除节点存储
          await this.storageManager.deleteNodeStorage(nodeId, directory);
          result.deletedNodes++;

          // 清空 deletedFromStorage 字段
          await this.prisma.fileSystemNode.update({
            where: { id: node.id },
            data: { deletedFromStorage: null },
          });

          this.logger.log(`清理节点成功: ${node.id}`);
        } catch (error) {
          const errorMsg = `清理节点失败: ${node.id}, ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push(errorMsg);
        }
      }

      // 清理空目录
      const cleanedDirs = await this.storageManager.cleanupEmptyDirectories();
      result.deletedDirectories = cleanedDirs;

      this.logger.log(
        `清理完成: 删除节点 ${result.deletedNodes} 个, 清理空目录 ${result.deletedDirectories} 个`
      );

      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      this.logger.error('清理过期存储失败', error.stack);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * 清理指定节点的存储（立即删除）
   * @param nodeId 节点 ID
   * @param path 节点路径
   * @returns 是否成功
   */
  async cleanupNodeStorage(nodeId: string, path: string): Promise<boolean> {
    try {
      // 解析路径
      const pathParts = path.split('/');
      if (pathParts.length < 2) {
        this.logger.warn(`节点路径格式错误: ${path}`);
        return false;
      }

      const directory = pathParts[0]; // YYYYMM[/N]

      // 删除节点存储
      await this.storageManager.deleteNodeStorage(nodeId, directory);

      // 清空 deletedFromStorage 字段
      await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: { deletedFromStorage: null },
      });

      this.logger.log(`清理节点存储成功: ${nodeId}`);
      return true;
    } catch (error) {
      this.logger.error(`清理节点存储失败: ${nodeId}`, error.stack);
      return false;
    }
  }

  /**
   * 获取待清理节点统计
   * @returns 统计信息
   */
  async getPendingCleanupStats(): Promise<{
    total: number;
    expiryDate: Date;
    delayDays: number;
  }> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - this.cleanupDelayDays);

    const total = await this.prisma.fileSystemNode.count({
      where: {
        deletedFromStorage: {
          not: null,
          lt: expiryDate,
        },
        isFolder: false,
      },
    });

    return {
      total,
      expiryDate,
      delayDays: this.cleanupDelayDays,
    };
  }

  /**
   * 清理回收站过期文件
   * @returns 清理结果
   */
  async cleanupExpiredTrash(): Promise<CleanupResult> {
    this.logger.log('开始清理回收站过期文件');

    const result: CleanupResult = {
      success: true,
      deletedNodes: 0,
      deletedDirectories: 0,
      freedSpace: 0,
      errors: [],
    };

    try {
      // 计算过期时间点
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - this.trashCleanupDelayDays);

      // 查询所有需要清理的回收站项目
      const trashItems = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedAt: {
            not: null,
            lt: expiryDate,
          },
        },
        select: {
          id: true,
          isRoot: true,
          isFolder: true,
          path: true,
          fileHash: true,
          ownerId: true,
          projectId: true,
        },
      });

      this.logger.log(`找到 ${trashItems.length} 个需要清理的回收站项目`);

      // 清理每个回收站项目
      for (const item of trashItems) {
        try {
          if (item.isRoot) {
            // 清理整个项目
            await this.prisma.fileSystemNode.delete({
              where: { id: item.id },
            });
            result.deletedNodes++;
          } else if (!item.isFolder && item.path) {
            // 清理单个文件
            // 解析路径
            const pathParts = item.path?.split('/') || [];
            if (pathParts.length >= 2) {
              const directory = pathParts[0]; // YYYYMM[/N]
              const nodeId = pathParts[1]; // nodeId

              // 删除节点存储
              await this.storageManager.deleteNodeStorage(nodeId, directory);
              result.deletedNodes++;

              // 删除数据库记录
              await this.prisma.fileSystemNode.delete({
                where: { id: item.id },
              });
            }
          } else if (item.isFolder) {
            // 清理文件夹（递归删除其中的文件）
            await this.cleanupFolderRecursive(item.id, result);
          }

          this.logger.log(`清理回收站项目成功: ${item.id}`);
        } catch (error) {
          const errorMsg = `清理回收站项目失败: ${item.id}, ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push(errorMsg);
        }
      }

      // 清理空目录
      const cleanedDirs = await this.storageManager.cleanupEmptyDirectories();
      result.deletedDirectories = cleanedDirs;

      this.logger.log(
        `回收站清理完成: 删除项目 ${result.deletedNodes} 个, 清理空目录 ${result.deletedDirectories} 个`
      );

      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      this.logger.error('清理回收站失败', error.stack);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * 递归清理文件夹
   */
  private async cleanupFolderRecursive(
    folderId: string,
    result: CleanupResult
  ): Promise<void> {
    const children = await this.prisma.fileSystemNode.findMany({
      where: { parentId: folderId },
      select: {
        id: true,
        isFolder: true,
        path: true,
      },
    });

    for (const child of children) {
      if (child.isFolder) {
        await this.cleanupFolderRecursive(child.id, result);
      } else if (child.path) {
        // 清理文件
        const pathParts = child.path?.split('/') || [];
        if (pathParts.length >= 2) {
          const directory = pathParts[0]; // YYYYMM[/N]
          const nodeId = pathParts[1]; // nodeId

          try {
            await this.storageManager.deleteNodeStorage(nodeId, directory);
            result.deletedNodes++;
          } catch (error) {
            const errorMsg = `清理文件失败: ${child.id}, ${error.message}`;
            this.logger.error(errorMsg, error.stack);
            result.errors.push(errorMsg);
          }
        }

        // 删除数据库记录
        await this.prisma.fileSystemNode.delete({
          where: { id: child.id },
        });
      }
    }

    // 删除文件夹本身
    await this.prisma.fileSystemNode.delete({
      where: { id: folderId },
    });
  }

  /**
   * 手动触发清理（管理员功能）
   * @param delayDays 延迟天数（覆盖默认值）
   * @returns 清理结果
   */
  async manualCleanup(delayDays?: number): Promise<CleanupResult> {
    const actualDelayDays =
      delayDays !== undefined ? delayDays : this.cleanupDelayDays;
    if (delayDays !== undefined) {
      this.logger.log(`使用自定义延迟天数: ${delayDays}`);
    }

    // 计算过期时间点
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - actualDelayDays);

    // 查询所有需要清理的节点
    const nodesToDelete = await this.prisma.fileSystemNode.findMany({
      where: {
        deletedFromStorage: {
          not: null,
          lt: expiryDate,
        },
        isFolder: false, // 只清理文件节点
      },
      select: {
        id: true,
        path: true,
        deletedFromStorage: true,
      },
    });

    this.logger.log(`找到 ${nodesToDelete.length} 个需要清理的节点`);

    const result: CleanupResult = {
      success: true,
      deletedNodes: 0,
      deletedDirectories: 0,
      freedSpace: 0,
      errors: [],
    };

    try {
      // 清理每个节点的存储
      for (const node of nodesToDelete) {
        try {
          // 解析路径
          const pathParts = node.path?.split('/') || [];
          if (pathParts.length < 2) {
            this.logger.warn(`节点路径格式错误: ${node.path}`);
            continue;
          }

          const directory = pathParts[0]; // YYYYMM[/N]
          const nodeId = pathParts[1]; // nodeId

          // 删除节点存储
          await this.storageManager.deleteNodeStorage(nodeId, directory);
          result.deletedNodes++;

          // 清空 deletedFromStorage 字段
          await this.prisma.fileSystemNode.update({
            where: { id: node.id },
            data: { deletedFromStorage: null },
          });

          this.logger.log(`清理节点成功: ${node.id}`);
        } catch (error) {
          const errorMsg = `清理节点失败: ${node.id}, ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push(errorMsg);
        }
      }

      // 清理空目录
      const cleanedDirs = await this.storageManager.cleanupEmptyDirectories();
      result.deletedDirectories = cleanedDirs;

      this.logger.log(
        `清理完成: 删除节点 ${result.deletedNodes} 个, 清理空目录 ${result.deletedDirectories} 个`
      );

      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      this.logger.error('清理过期存储失败', error.stack);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }
}
