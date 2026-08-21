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

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { NodeType, ProjectStatus, Prisma } from '@cloudcad/db';
import { IRuntimeConfigService } from '@cloudcad/contracts';

export interface UserCleanupResult {
  success: boolean;
  processedUsers: number;
  deletedMembers: number;
  deletedProjects: number;
  deletedAuditLogs: number;
  deletedRefreshTokens: number;
  deletedUploadSessions: number;
  deletedConfigLogs: number;
  deletedPaymentOrders: number;
  deletedMemberships: number;
  deletedFileShares: number;
  deletedBatchJobs: number;
  markedForStorageCleanup: number;
  errors: Array<{ userId: string; message: string }>;
}

export interface CleanupUserCounts {
  deletedMembers: number;
  deletedProjects: number;
  deletedAuditLogs: number;
  deletedRefreshTokens: number;
  deletedUploadSessions: number;
  deletedConfigLogs: number;
  deletedPaymentOrders: number;
  deletedMemberships: number;
  deletedFileShares: number;
  deletedBatchJobs: number;
  markedForStorageCleanup: number;
}

/** 单用户清理事务结果（删除账号场景附带待物理删除的存储路径） */
export type CleanupUserTxResult = CleanupUserCounts & {
  storagePaths: string[];
};

export interface PendingCleanupStats {
  pendingCleanup: number;
  expiryDate: Date;
  delayDays: number;
}

@Injectable()
export class UserCleanupService {
  private readonly logger = new Logger(UserCleanupService.name);
  private readonly cleanupDelayDays: number;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly storageManager: StorageManager,
    @Inject('CONFIG')
    private readonly runtimeConfigService: IRuntimeConfigService
  ) {
    this.cleanupDelayDays = this.configService.get<number>(
      'userCleanup.delayDays',
      30
    );
  }

  /**
   * 清理所有过期的已注销用户数据（30 天冷静期到期，彻底删除账号及数据）
   */
  async cleanupExpiredUsers(): Promise<UserCleanupResult> {
    this.logger.log('开始清理过期用户数据');

    const result: UserCleanupResult = this.emptyResult();

    try {
      const expiredUsers = await this.findExpiredUsers();

      this.logger.log(`找到 ${expiredUsers.length} 个过期用户`);

      for (const user of expiredUsers) {
        try {
          const userResult = await this.deleteUserCompletely(user.id);
          result.processedUsers++;
          this.accumulate(result, userResult);
        } catch (error) {
          const errorMsg = `清理用户 ${user.id} 失败: ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push({ userId: user.id, message: error.message });
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

      this.logger.log(this.formatSummary(result));
      return result;
    } catch (error) {
      this.logger.error('清理过期用户数据失败', error.stack);
      result.success = false;
      result.errors.push({
        userId: 'SYSTEM',
        message: error.message,
      });
      return result;
    }
  }

  /**
   * 清理指定用户的关联数据（不删除账号，事务内执行）
   * @param userId 用户 ID
   */
  async cleanupUser(userId: string): Promise<CleanupUserTxResult> {
    return await this.prisma.$transaction((tx) =>
      this.cleanupUserTx(tx, userId, false)
    );
  }

  /**
   * 彻底删除用户：清理关联数据 + 同一事务内删除账号 + 事务外物理删除存储文件
   * @param userId 用户 ID
   */
  async deleteUserCompletely(userId: string): Promise<CleanupUserTxResult> {
    const result = await this.prisma.$transaction((tx) =>
      this.cleanupUserTx(tx, userId, true)
    );
    await this.deleteOwnedStorage(userId, result.storagePaths);
    return result;
  }

  /**
   * 查询过期的已注销用户
   */
  private async findExpiredUsers() {
    // 防御：注销冷静期（运行时配置，可能大于清理延迟）内不得删除——
    // 清理延迟取 max(cleanupDelayDays, graceDays)，保证「冷静期内登录可自动恢复」承诺不被破坏
    const graceDays = await this.runtimeConfigService.getValue<number>(
      'userCancelGraceDays',
      7
    );
    const effectiveDelayDays = Math.max(this.cleanupDelayDays, graceDays);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - effectiveDelayDays);

    return await this.prisma.user.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: expiryDate,
        },
      },
      select: {
        id: true,
        email: true,
        deletedAt: true,
      },
    });
  }

  /**
   * 获取待清理用户统计
   */
  async getPendingCleanupStats(): Promise<PendingCleanupStats> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - this.cleanupDelayDays);

    const pendingCleanup = await this.prisma.user.count({
      where: {
        deletedAt: { not: null },
      },
    });

    return {
      pendingCleanup,
      expiryDate,
      delayDays: this.cleanupDelayDays,
    };
  }

  /**
   * 手动触发清理（管理员功能）
   * @param delayDays 延迟天数（覆盖默认值）
   */
  async manualCleanup(delayDays?: number): Promise<UserCleanupResult> {
    const actualDelayDays = delayDays ?? this.cleanupDelayDays;

    if (delayDays !== undefined) {
      this.logger.log(`使用自定义延迟天数: ${delayDays}`);
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - actualDelayDays);

    const result: UserCleanupResult = this.emptyResult();

    try {
      const expiredUsers = await this.prisma.user.findMany({
        where: {
          deletedAt: {
            not: null,
            lt: expiryDate,
          },
        },
        select: { id: true },
      });

      this.logger.log(
        `手动清理: 找到 ${expiredUsers.length} 个过期用户 (延迟 ${actualDelayDays} 天)`
      );

      for (const user of expiredUsers) {
        try {
          const userResult = await this.deleteUserCompletely(user.id);
          result.processedUsers++;
          this.accumulate(result, userResult);
        } catch (error) {
          result.errors.push({ userId: user.id, message: error.message });
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      this.logger.error('手动清理失败', error.stack);
      result.success = false;
      result.errors.push({ userId: 'SYSTEM', message: error.message });
      return result;
    }
  }

  /**
   * 单用户清理事务（所有数据变更同事务，保证原子性）
   * @param deleteUser 为 true 时在同一事务内删除用户账号
   * @returns 计数结果（deleteUser 时附带待物理删除的存储路径）
   */
  private async cleanupUserTx(
    tx: Prisma.TransactionClient,
    userId: string,
    deleteUser: boolean
  ): Promise<CleanupUserTxResult> {
    const result = {
      deletedMembers: 0,
      deletedProjects: 0,
      deletedAuditLogs: 0,
      deletedRefreshTokens: 0,
      deletedUploadSessions: 0,
      deletedConfigLogs: 0,
      deletedPaymentOrders: 0,
      deletedMemberships: 0,
      deletedFileShares: 0,
      deletedBatchJobs: 0,
      markedForStorageCleanup: 0,
    };

    // 1. 清理项目成员关系
    const memberDelete = await tx.projectMember.deleteMany({
      where: { userId },
    });
    result.deletedMembers = memberDelete.count;

    // 2. 获取用户拥有的根节点（项目/个人空间）
    const ownedRootNodes = await tx.fileSystemNode.findMany({
      where: {
        ownerId: userId,
        nodeType: NodeType.PROJECT,
      },
      select: { id: true },
    });

    // 3. 软删除用户拥有的项目（设置 deletedAt 和 projectStatus）
    for (const node of ownedRootNodes) {
      await tx.fileSystemNode.update({
        where: { id: node.id },
        data: {
          deletedAt: new Date(),
          projectStatus: ProjectStatus.DELETED,
        },
      });
      result.deletedProjects++;
    }

    // 4. 删除审计日志
    const auditLogDelete = await tx.auditLog.deleteMany({
      where: { userId },
    });
    result.deletedAuditLogs = auditLogDelete.count;

    // 5. 删除 RefreshToken
    const refreshTokenDelete = await tx.refreshToken.deleteMany({
      where: { userId },
    });
    result.deletedRefreshTokens = refreshTokenDelete.count;

    // 6. 删除 UploadSession
    const uploadSessionDelete = await tx.uploadSession.deleteMany({
      where: { ownerId: userId },
    });
    result.deletedUploadSessions = uploadSessionDelete.count;

    // 7. 删除配置操作日志
    const configLogDelete = await tx.runtimeConfigLog.deleteMany({
      where: { operatorId: userId },
    });
    result.deletedConfigLogs = configLogDelete.count;

    // 8. 删除支付订单 / 会员记录 / 文件分享 / 批量下载任务（无级联外键，必须显式删除）
    const paymentOrderDelete = await tx.paymentOrder.deleteMany({
      where: { userId },
    });
    result.deletedPaymentOrders = paymentOrderDelete.count;

    const membershipDelete = await tx.userMembership.deleteMany({
      where: { userId },
    });
    result.deletedMemberships = membershipDelete.count;

    const fileShareDelete = await tx.fileShare.deleteMany({
      where: { createdBy: userId },
    });
    result.deletedFileShares = fileShareDelete.count;

    const batchJobDelete = await tx.batchDownloadJob.deleteMany({
      where: { userId },
    });
    result.deletedBatchJobs = batchJobDelete.count;

    // 9. 收集用户拥有的文件节点存储路径（directory/nodeId）
    //    行随后会被级联删除，必须先取 path，否则物理文件永久残留
    const ownedFileNodes = await tx.fileSystemNode.findMany({
      where: { ownerId: userId, nodeType: NodeType.FILE },
      select: { path: true },
    });

    // 10. 标记文件存储待清理（保留行场景：标记后由 storage-cleanup 定时物理删除）
    const storageNodes = await tx.fileSystemNode.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (storageNodes.length > 0) {
      await tx.fileSystemNode.updateMany({
        where: { ownerId: userId },
        data: { deletedFromStorage: new Date() },
      });
      result.markedForStorageCleanup = storageNodes.length;
    }

    // 11. 彻底删除用户账号（与清理同事务，保证原子性）
    if (deleteUser) {
      await tx.user.delete({ where: { id: userId } });
    }

    this.logger.log(this.formatUserSummary(userId, result, deleteUser));

    return Object.assign(result, {
      storagePaths: ownedFileNodes
        .map((n) => n.path)
        .filter((p): p is string => !!p),
    });
  }

  /**
   * 物理删除用户拥有的文件存储（用户行已级联删除，必须显式删除物理文件）
   */
  private async deleteOwnedStorage(
    userId: string,
    paths: string[]
  ): Promise<void> {
    for (const filePath of paths) {
      const pathParts = filePath.split('/');
      if (pathParts.length < 2) {
        this.logger.warn(`节点路径格式错误: ${filePath}`);
        continue;
      }
      const directory = pathParts[0];
      const nodeId = pathParts[1];
      try {
        await this.storageManager.deleteNodeStorage(nodeId, directory);
      } catch (error) {
        this.logger.error(
          `用户 ${userId} 物理删除存储失败: ${nodeId} (${directory})`,
          error.stack
        );
      }
    }
  }

  private emptyResult(): UserCleanupResult {
    return {
      success: true,
      processedUsers: 0,
      deletedMembers: 0,
      deletedProjects: 0,
      deletedAuditLogs: 0,
      deletedRefreshTokens: 0,
      deletedUploadSessions: 0,
      deletedConfigLogs: 0,
      deletedPaymentOrders: 0,
      deletedMemberships: 0,
      deletedFileShares: 0,
      deletedBatchJobs: 0,
      markedForStorageCleanup: 0,
      errors: [],
    };
  }

  private accumulate(
    result: UserCleanupResult,
    counts: CleanupUserCounts
  ): void {
    result.deletedMembers += counts.deletedMembers;
    result.deletedProjects += counts.deletedProjects;
    result.deletedAuditLogs += counts.deletedAuditLogs;
    result.deletedRefreshTokens += counts.deletedRefreshTokens;
    result.deletedUploadSessions += counts.deletedUploadSessions;
    result.deletedConfigLogs += counts.deletedConfigLogs;
    result.deletedPaymentOrders += counts.deletedPaymentOrders;
    result.deletedMemberships += counts.deletedMemberships;
    result.deletedFileShares += counts.deletedFileShares;
    result.deletedBatchJobs += counts.deletedBatchJobs;
    result.markedForStorageCleanup += counts.markedForStorageCleanup;
  }

  private formatUserSummary(
    userId: string,
    result: CleanupUserCounts,
    deleteUser: boolean
  ): string {
    return (
      `用户 ${userId} 清理完成: 删除成员关系 ${result.deletedMembers} 个, ` +
      `删除项目 ${result.deletedProjects} 个, 删除日志 ${result.deletedAuditLogs} 条, ` +
      `删除Token ${result.deletedRefreshTokens} 个, 删除上传会话 ${result.deletedUploadSessions} 个, ` +
      `删除配置日志 ${result.deletedConfigLogs} 条, 删除支付订单 ${result.deletedPaymentOrders} 个, ` +
      `删除会员记录 ${result.deletedMemberships} 条, 删除文件分享 ${result.deletedFileShares} 条, ` +
      `删除批量下载任务 ${result.deletedBatchJobs} 个, 标记存储 ${result.markedForStorageCleanup} 个` +
      (deleteUser ? ', 删除用户账号' : '')
    );
  }

  private formatSummary(result: UserCleanupResult): string {
    return (
      `清理完成: 处理 ${result.processedUsers} 个用户, 删除 ${result.deletedMembers} 个成员关系, ` +
      `删除 ${result.deletedProjects} 个项目, 删除 ${result.deletedAuditLogs} 条日志, ` +
      `删除Token ${result.deletedRefreshTokens} 个, 删除上传会话 ${result.deletedUploadSessions} 个, ` +
      `删除配置日志 ${result.deletedConfigLogs} 条, 删除支付订单 ${result.deletedPaymentOrders} 个, ` +
      `删除会员记录 ${result.deletedMemberships} 条, 删除文件分享 ${result.deletedFileShares} 条, ` +
      `删除批量下载任务 ${result.deletedBatchJobs} 个, ` +
      `标记 ${result.markedForStorageCleanup} 个存储待清理`
    );
  }
}
