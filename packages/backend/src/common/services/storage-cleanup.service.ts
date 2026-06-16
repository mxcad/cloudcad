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
import { DirectoryAllocator } from './directory-allocator.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';
import { ConfigService } from '@nestjs/config';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import type { AppConfig } from '../../config/app.config';
import { ProjectStatus } from '@prisma/client';

export interface CleanupResult {
  success: boolean;
  deletedNodes: number;
  deletedDirectories: number;
  freedSpace: number;
  errors: string[];
}

export interface LocalOrphanInfo {
  nodeId: string;
  directory: string;
  fullPath: string;
  sizeBytes: number;
}

export interface DBOrphanInfo {
  nodeId: string;
  path: string;
  name: string;
  ownerId: string;
  projectId: string;
}

export interface OrphanStats {
  localOrphans: LocalOrphanInfo[];
  dbOrphans: DBOrphanInfo[];
  localOrphanCount: number;
  dbOrphanCount: number;
  localOrphanTotalSize: number;
}

export interface DeletedFileStats {
  /** 回收站中文件数量 (deletedAt != null) */
  trashCount: number;
  /** 已标记物理存储待清理的文件数量 (deletedFromStorage != null) */
  storageMarkedCount: number;
  /** 已删除的项目数量 (projectStatus = DELETED) */
  deletedProjectCount: number;
  /** 本地孤立文件数量 */
  localOrphanCount: number;
  /** 本地孤立文件总大小 (字节) */
  localOrphanTotalSize: number;
  /** DB 孤立记录数量 */
  dbOrphanCount: number;
}

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly directoryAllocator: DirectoryAllocator,
    private readonly localStorageProvider: LocalStorageProvider,
    private readonly configService: ConfigService<AppConfig>,
    private readonly runtimeConfigService: RuntimeConfigService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // 配置读取 —— 优先运行时配置 → 环境变量配置 → 默认值
  // ────────────────────────────────────────────────────────────

  private async getStorageCleanupDelayDays(): Promise<number> {
    const runtimeVal = await this.runtimeConfigService.getValue<number>(
      'storageCleanupDelayDays',
    );
    if (runtimeVal !== undefined && runtimeVal !== null) return runtimeVal;
    const envConfig = this.configService.get('storageCleanup', { infer: true });
    return envConfig?.delayDays ?? 30;
  }

  private async isStorageCleanupEnabled(): Promise<boolean> {
    const runtimeVal = await this.runtimeConfigService.getValue<boolean>(
      'storageCleanupEnabled',
    );
    if (runtimeVal !== undefined && runtimeVal !== null) return runtimeVal;
    const envConfig = this.configService.get('storageCleanup', { infer: true });
    return envConfig?.enabled ?? true;
  }

  private async getTrashCleanupDelayDays(): Promise<number> {
    const runtimeVal = await this.runtimeConfigService.getValue<number>(
      'trashCleanupDelayDays',
    );
    if (runtimeVal !== undefined && runtimeVal !== null) return runtimeVal;
    const envConfig = this.configService.get('trashCleanup', { infer: true });
    return envConfig?.delayDays ?? 30;
  }

  private async isTrashCleanupEnabled(): Promise<boolean> {
    const runtimeVal = await this.runtimeConfigService.getValue<boolean>(
      'trashCleanupEnabled',
    );
    if (runtimeVal !== undefined && runtimeVal !== null) return runtimeVal;
    const envConfig = this.configService.get('trashCleanup', { infer: true });
    return envConfig?.enabled ?? true;
  }

  private async getOrphanCleanupDelayDays(): Promise<number> {
    const runtimeVal = await this.runtimeConfigService.getValue<number>(
      'orphanCleanupDelayDays',
    );
    if (runtimeVal !== undefined && runtimeVal !== null) return runtimeVal;
    const envConfig = this.configService.get('orphanCleanup', { infer: true });
    return envConfig?.delayDays ?? 7;
  }

  private async isOrphanCleanupEnabled(): Promise<boolean> {
    const runtimeVal = await this.runtimeConfigService.getValue<boolean>(
      'orphanCleanupEnabled',
    );
    if (runtimeVal !== undefined && runtimeVal !== null) return runtimeVal;
    const envConfig = this.configService.get('orphanCleanup', { infer: true });
    return envConfig?.enabled ?? true;
  }

  // ────────────────────────────────────────────────────────────
  // 过期存储清理（已有方法，配置读取更新）
  // ────────────────────────────────────────────────────────────

  async cleanupExpiredStorage(): Promise<CleanupResult> {
    const enabled = await this.isStorageCleanupEnabled();
    if (!enabled) {
      this.logger.log('存储清理未启用，跳过');
      return { success: true, deletedNodes: 0, deletedDirectories: 0, freedSpace: 0, errors: [] };
    }

    const delayDays = await this.getStorageCleanupDelayDays();
    this.logger.log(`开始清理过期存储文件 (延迟 ${delayDays} 天)`);

    const result: CleanupResult = {
      success: true,
      deletedNodes: 0,
      deletedDirectories: 0,
      freedSpace: 0,
      errors: [],
    };

    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - delayDays);

      const nodesToDelete = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedFromStorage: { not: null, lt: expiryDate },
          isFolder: false,
        },
        select: { id: true, path: true, deletedFromStorage: true },
      });

      this.logger.log(`找到 ${nodesToDelete.length} 个需要清理的节点`);

      for (const node of nodesToDelete) {
        try {
          const pathParts = node.path?.split('/') || [];
          if (pathParts.length < 2) {
            this.logger.warn(`节点路径格式错误: ${node.path}`);
            continue;
          }

          const directory = pathParts[0];
          const nodeId = pathParts[1];

          await this.storageManager.deleteNodeStorage(nodeId, directory);
          result.deletedNodes++;

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

      const cleanedDirs = await this.storageManager.cleanupEmptyDirectories();
      result.deletedDirectories = cleanedDirs;

      this.logger.log(
        `清理完成: 删除节点 ${result.deletedNodes} 个, 清理空目录 ${result.deletedDirectories} 个`,
      );

      if (result.errors.length > 0) result.success = false;
      return result;
    } catch (error) {
      this.logger.error('清理过期存储失败', error.stack);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  async cleanupNodeStorage(nodeId: string, path: string): Promise<boolean> {
    try {
      const pathParts = path.split('/');
      if (pathParts.length < 2) {
        this.logger.warn(`节点路径格式错误: ${path}`);
        return false;
      }

      const directory = pathParts[0];

      await this.storageManager.deleteNodeStorage(nodeId, directory);

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

  async getPendingCleanupStats(): Promise<{
    total: number;
    expiryDate: Date;
    delayDays: number;
  }> {
    const delayDays = await this.getStorageCleanupDelayDays();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - delayDays);

    const total = await this.prisma.fileSystemNode.count({
      where: {
        deletedFromStorage: { not: null, lt: expiryDate },
        isFolder: false,
      },
    });

    return { total, expiryDate, delayDays };
  }

  // ────────────────────────────────────────────────────────────
  // 回收站清理（已有方法，配置读取更新）
  // ────────────────────────────────────────────────────────────

  async cleanupExpiredTrash(): Promise<CleanupResult> {
    const enabled = await this.isTrashCleanupEnabled();
    if (!enabled) {
      this.logger.log('回收站清理未启用，跳过');
      return { success: true, deletedNodes: 0, deletedDirectories: 0, freedSpace: 0, errors: [] };
    }

    const delayDays = await this.getTrashCleanupDelayDays();
    this.logger.log(`开始清理回收站过期文件 (延迟 ${delayDays} 天)`);

    const result: CleanupResult = {
      success: true,
      deletedNodes: 0,
      deletedDirectories: 0,
      freedSpace: 0,
      errors: [],
    };

    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - delayDays);

      const trashItems = await this.prisma.fileSystemNode.findMany({
        where: { deletedAt: { not: null, lt: expiryDate } },
        select: { id: true, isRoot: true, isFolder: true, path: true, fileHash: true, ownerId: true, projectId: true },
      });

      this.logger.log(`找到 ${trashItems.length} 个需要清理的回收站项目`);

      for (const item of trashItems) {
        try {
          if (item.isRoot) {
            await this.prisma.fileSystemNode.delete({ where: { id: item.id } });
            result.deletedNodes++;
          } else if (!item.isFolder && item.path) {
            const pathParts = item.path?.split('/') || [];
            if (pathParts.length >= 2) {
              const directory = pathParts[0];
              const nodeId = pathParts[1];
              await this.storageManager.deleteNodeStorage(nodeId, directory);
              result.deletedNodes++;
              await this.prisma.fileSystemNode.delete({ where: { id: item.id } });
            }
          } else if (item.isFolder) {
            await this.cleanupFolderRecursive(item.id, result);
          }
          this.logger.log(`清理回收站项目成功: ${item.id}`);
        } catch (error) {
          const errorMsg = `清理回收站项目失败: ${item.id}, ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push(errorMsg);
        }
      }

      const cleanedDirs = await this.storageManager.cleanupEmptyDirectories();
      result.deletedDirectories = cleanedDirs;

      this.logger.log(
        `回收站清理完成: 删除项目 ${result.deletedNodes} 个, 清理空目录 ${result.deletedDirectories} 个`,
      );

      if (result.errors.length > 0) result.success = false;
      return result;
    } catch (error) {
      this.logger.error('清理回收站失败', error.stack);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  private async cleanupFolderRecursive(folderId: string, result: CleanupResult): Promise<void> {
    const children = await this.prisma.fileSystemNode.findMany({
      where: { parentId: folderId },
      select: { id: true, isFolder: true, path: true },
    });

    for (const child of children) {
      if (child.isFolder) {
        await this.cleanupFolderRecursive(child.id, result);
      } else if (child.path) {
        const pathParts = child.path?.split('/') || [];
        if (pathParts.length >= 2) {
          const directory = pathParts[0];
          const nodeId = pathParts[1];
          try {
            await this.storageManager.deleteNodeStorage(nodeId, directory);
            result.deletedNodes++;
          } catch (error) {
            result.errors.push(`清理文件失败: ${child.id}, ${error.message}`);
          }
        }
        await this.prisma.fileSystemNode.delete({ where: { id: child.id } });
      }
    }

    await this.prisma.fileSystemNode.delete({ where: { id: folderId } });
  }

  // ────────────────────────────────────────────────────────────
  // 手动清理（已有方法）
  // ────────────────────────────────────────────────────────────

  async manualCleanup(delayDays?: number): Promise<CleanupResult> {
    const actualDelayDays = delayDays !== undefined ? delayDays : await this.getStorageCleanupDelayDays();
    if (delayDays !== undefined) {
      this.logger.log(`使用自定义延迟天数: ${delayDays}`);
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - actualDelayDays);

    const nodesToDelete = await this.prisma.fileSystemNode.findMany({
      where: { deletedFromStorage: { not: null, lt: expiryDate }, isFolder: false },
      select: { id: true, path: true, deletedFromStorage: true },
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
      for (const node of nodesToDelete) {
        try {
          const pathParts = node.path?.split('/') || [];
          if (pathParts.length < 2) {
            this.logger.warn(`节点路径格式错误: ${node.path}`);
            continue;
          }

          const directory = pathParts[0];
          const nodeId = pathParts[1];

          await this.storageManager.deleteNodeStorage(nodeId, directory);
          result.deletedNodes++;

          await this.prisma.fileSystemNode.update({
            where: { id: node.id },
            data: { deletedFromStorage: null },
          });

          this.logger.log(`清理节点成功: ${node.id}`);
        } catch (error) {
          result.errors.push(`清理节点失败: ${node.id}, ${error.message}`);
        }
      }

      const cleanedDirs = await this.storageManager.cleanupEmptyDirectories();
      result.deletedDirectories = cleanedDirs;

      this.logger.log(
        `清理完成: 删除节点 ${result.deletedNodes} 个, 清理空目录 ${result.deletedDirectories} 个`,
      );

      if (result.errors.length > 0) result.success = false;
      return result;
    } catch (error) {
      this.logger.error('清理过期存储失败', error.stack);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 本地孤立文件检测（磁盘有但数据库无）
  // ────────────────────────────────────────────────────────────

  async detectLocalOrphans(): Promise<LocalOrphanInfo[]> {
    this.logger.log('开始检测本地孤立文件');

    const orphans: LocalOrphanInfo[] = [];

    try {
      const directories = await this.directoryAllocator.listDirectories();
      this.logger.log(`存储目录数量: ${directories.length}`);

      const allLocalNodeIds: { nodeId: string; directory: string }[] = [];
      const BATCH_SIZE = 500;

      // 遍历所有 YYYYMM 目录，收集 nodeId
      for (const dir of directories) {
        try {
          const subdirs = await this.localStorageProvider.listSubdirectories(dir.name);
          for (const nodeId of subdirs) {
            allLocalNodeIds.push({ nodeId, directory: dir.name });
          }
        } catch (error) {
          this.logger.warn(`扫描目录 ${dir.name} 失败: ${error.message}`);
        }
      }

      this.logger.log(`磁盘上共找到 ${allLocalNodeIds.length} 个节点目录`);

      // 分批查询数据库
      for (let i = 0; i < allLocalNodeIds.length; i += BATCH_SIZE) {
        const batch = allLocalNodeIds.slice(i, i + BATCH_SIZE);
        const ids = batch.map((n) => n.nodeId);

        const existingNodes = await this.prisma.fileSystemNode.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        });
        const existingIds = new Set(existingNodes.map((n) => n.id));

        for (const { nodeId, directory } of batch) {
          if (!existingIds.has(nodeId)) {
            try {
              const dirKey = `${directory}/${nodeId}`;
              const sizeBytes = await this.localStorageProvider.getDirectorySize(dirKey);
              const fullPath = this.storageManager.getFullPath(dirKey);

              orphans.push({ nodeId, directory, fullPath, sizeBytes });
            } catch (error) {
              orphans.push({ nodeId, directory, fullPath: '', sizeBytes: 0 });
            }
          }
        }
      }

      this.logger.log(
        `本地孤立文件检测完成: 共 ${orphans.length} 个, 总大小 ${orphans.reduce((s, o) => s + o.sizeBytes, 0)} 字节`,
      );

      return orphans;
    } catch (error) {
      this.logger.error('检测本地孤立文件失败', error.stack);
      return orphans;
    }
  }

  // ────────────────────────────────────────────────────────────
  // DB 孤立记录检测（数据库有但磁盘无）
  // ────────────────────────────────────────────────────────────

  async detectDBOrphans(): Promise<DBOrphanInfo[]> {
    this.logger.log('开始检测 DB 孤立记录');

    const orphans: DBOrphanInfo[] = [];

    try {
      const nodes = await this.prisma.fileSystemNode.findMany({
        where: {
          isFolder: false,
          isRoot: false,
          path: { not: null },
          deletedAt: null,
        },
        select: {
          id: true,
          path: true,
          name: true,
          ownerId: true,
          projectId: true,
        },
        take: 10000,
      });

      this.logger.log(`数据库中查询到 ${nodes.length} 个文件记录`);

      for (const node of nodes) {
        try {
          const pathParts = node.path?.split('/') || [];
          if (pathParts.length < 2) continue;

          const directory = pathParts[0];
          const nodeId = pathParts[1];

          const exists = await this.storageManager.nodeStorageExists(nodeId, directory);
          if (!exists) {
            orphans.push({
              nodeId: node.id,
              path: node.path,
              name: node.name,
              ownerId: node.ownerId,
              projectId: node.projectId,
            });
          }
        } catch (error) {
          this.logger.warn(`检查节点 ${node.id} 存储失败: ${error.message}`);
        }
      }

      this.logger.log(
        `DB 孤立记录检测完成: 共 ${orphans.length} 个`,
      );

      return orphans;
    } catch (error) {
      this.logger.error('检测 DB 孤立记录失败', error.stack);
      return orphans;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 获取孤儿统计
  // ────────────────────────────────────────────────────────────

  async getOrphanStats(): Promise<OrphanStats> {
    const [localOrphans, dbOrphans] = await Promise.all([
      this.detectLocalOrphans(),
      this.detectDBOrphans(),
    ]);

    return {
      localOrphans,
      dbOrphans,
      localOrphanCount: localOrphans.length,
      dbOrphanCount: dbOrphans.length,
      localOrphanTotalSize: localOrphans.reduce((s, o) => s + o.sizeBytes, 0),
    };
  }

  // ────────────────────────────────────────────────────────────
  // 获取标记删除文件统计
  // ────────────────────────────────────────────────────────────

  async getDeletedFileStats(): Promise<DeletedFileStats> {
    this.logger.log('开始统计标记删除文件');

    try {
      const [trashCount, storageMarkedCount, deletedProjectCount, orphanStats] =
        await Promise.all([
          this.prisma.fileSystemNode.count({
            where: { deletedAt: { not: null } },
          }),
          this.prisma.fileSystemNode.count({
            where: { deletedFromStorage: { not: null } },
          }),
          this.prisma.fileSystemNode.count({
            where: { projectStatus: ProjectStatus.DELETED },
          }),
          this.getOrphanStats(),
        ]);

      return {
        trashCount,
        storageMarkedCount,
        deletedProjectCount,
        localOrphanCount: orphanStats.localOrphanCount,
        localOrphanTotalSize: orphanStats.localOrphanTotalSize,
        dbOrphanCount: orphanStats.dbOrphanCount,
      };
    } catch (error) {
      this.logger.error('统计标记删除文件失败', error.stack);
      return {
        trashCount: 0,
        storageMarkedCount: 0,
        deletedProjectCount: 0,
        localOrphanCount: 0,
        localOrphanTotalSize: 0,
        dbOrphanCount: 0,
      };
    }
  }

  // ────────────────────────────────────────────────────────────
  // 清理孤儿文件
  // ────────────────────────────────────────────────────────────

  async cleanupOrphans(options?: { localOrphans?: LocalOrphanInfo[]; dbOrphans?: DBOrphanInfo[] }): Promise<CleanupResult> {
    const enabled = await this.isOrphanCleanupEnabled();
    if (!enabled) {
      this.logger.log('孤儿文件清理未启用，跳过');
      return { success: true, deletedNodes: 0, deletedDirectories: 0, freedSpace: 0, errors: [] };
    }

    this.logger.log('开始清理孤儿文件');

    const result: CleanupResult = {
      success: true,
      deletedNodes: 0,
      deletedDirectories: 0,
      freedSpace: 0,
      errors: [],
    };

    try {
      // 获取孤儿列表
      const localOrphans = options?.localOrphans ?? (await this.detectLocalOrphans());
      const dbOrphans = options?.dbOrphans ?? (await this.detectDBOrphans());

      // 清理本地孤立文件
      for (const orphan of localOrphans) {
        try {
          await this.storageManager.deleteNodeStorage(orphan.nodeId, orphan.directory);
          result.deletedNodes++;
          result.freedSpace += orphan.sizeBytes;
          this.logger.log(`清理本地孤立文件: ${orphan.nodeId} (${orphan.directory})`);
        } catch (error) {
          const errorMsg = `清理本地孤立文件失败: ${orphan.nodeId}, ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push(errorMsg);
        }
      }

      // 清理 DB 孤立记录（标记为删除，移到回收站）
      for (const orphan of dbOrphans) {
        try {
          await this.prisma.fileSystemNode.update({
            where: { id: orphan.nodeId },
            data: { deletedAt: new Date() },
          });
          result.deletedNodes++;
          this.logger.log(`标记 DB 孤立记录为删除: ${orphan.nodeId} (${orphan.name})`);
        } catch (error) {
          const errorMsg = `标记 DB 孤立记录失败: ${orphan.nodeId}, ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push(errorMsg);
        }
      }

      // 清理空目录
      const cleanedDirs = await this.storageManager.cleanupEmptyDirectories();
      result.deletedDirectories = cleanedDirs;

      this.logger.log(
        `孤儿文件清理完成: 本地 ${localOrphans.length} 个, DB ${dbOrphans.length} 个, 空目录 ${cleanedDirs} 个`,
      );

      if (result.errors.length > 0) result.success = false;
      return result;
    } catch (error) {
      this.logger.error('清理孤儿文件失败', error.stack);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }
}
