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
/////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { ProjectStatus } from '@prisma/client';

export interface UserCleanupResult {
  success: boolean;
  processedUsers: number;
  deletedMembers: number;
  deletedProjects: number;
  deletedAuditLogs: number;
  deletedRefreshTokens: number;
  deletedUploadSessions: number;
  deletedConfigLogs: number;
  markedForStorageCleanup: number;
  errors: Array<{ userId: string; message: string }>;
}

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
    private readonly configService: ConfigService
  ) {
    this.cleanupDelayDays = this.configService.get<number>(
      'userCleanup.delayDays',
      30
    );
  }

  /**
   * 清理所有过期的已注销用户数据
   */
  async cleanupExpiredUsers(): Promise<UserCleanupResult> {
    this.logger.log('开始清理过期用户数据');

    const result: UserCleanupResult = {
      success: true,
      processedUsers: 0,
      deletedMembers: 0,
      deletedProjects: 0,
      deletedAuditLogs: 0,
      deletedRefreshTokens: 0,
      deletedUploadSessions: 0,
      deletedConfigLogs: 0,
      markedForStorageCleanup: 0,
      errors: [],
    };

    try {
      const expiredUsers = await this.findExpiredUsers();

      this.logger.log(`找到 ${expiredUsers.length} 个过期用户`);

      for (const user of expiredUsers) {
        try {
          const userResult = await this.cleanupUser(user.id);
          result.processedUsers++;
          result.deletedMembers += userResult.deletedMembers;
          result.deletedProjects += userResult.deletedProjects;
          result.deletedAuditLogs += userResult.deletedAuditLogs;
          result.deletedRefreshTokens += userResult.deletedRefreshTokens;
          result.deletedUploadSessions += userResult.deletedUploadSessions;
          result.deletedConfigLogs += userResult.deletedConfigLogs;
          result.markedForStorageCleanup += userResult.markedForStorageCleanup;
        } catch (error) {
          const errorMsg = `清理用户 ${user.id} 失败: ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          result.errors.push({ userId: user.id, message: error.message });
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

      this.logger.log(
        `清理完成: 处理 ${result.processedUsers} 个用户, 删除 ${result.deletedMembers} 个成员关系, ` +
          `删除 ${result.deletedProjects} 个项目, 删除 ${result.deletedAuditLogs} 条日志, ` +
          `删除Token ${result.deletedRefreshTokens} 个, 删除上传会话 ${result.deletedUploadSessions} 个, ` +
          `删除配置日志 ${result.deletedConfigLogs} 条, 标记 ${result.markedForStorageCleanup} 个存储待清理`
      );

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
   * 清理指定用户的数据（立即执行，不等待冷静期）
   * @param userId 用户 ID
   */
  async cleanupUser(userId: string): Promise<{
    deletedMembers: number;
    deletedProjects: number;
    deletedAuditLogs: number;
    deletedRefreshTokens: number;
    deletedUploadSessions: number;
    deletedConfigLogs: number;
    markedForStorageCleanup: number;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      const result = {
        deletedMembers: 0,
        deletedProjects: 0,
        deletedAuditLogs: 0,
        deletedRefreshTokens: 0,
        deletedUploadSessions: 0,
        deletedConfigLogs: 0,
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
          isRoot: true,
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

      // 8. 标记文件存储待清理
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

      this.logger.log(
        `用户 ${userId} 清理完成: 删除成员关系 ${result.deletedMembers} 个, ` +
          `删除项目 ${result.deletedProjects} 个, 删除日志 ${result.deletedAuditLogs} 条, ` +
          `删除Token ${result.deletedRefreshTokens} 个, 删除上传会话 ${result.deletedUploadSessions} 个, ` +
          `删除配置日志 ${result.deletedConfigLogs} 条, 标记存储 ${result.markedForStorageCleanup} 个`
      );

      return result;
    });
  }

  /**
   * 查询过期的已注销用户
   */
  private async findExpiredUsers() {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - this.cleanupDelayDays);

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
        deletedAt: {
          not: null,
          lt: expiryDate,
        },
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
    const originalDelayDays = this.cleanupDelayDays;

    if (delayDays !== undefined) {
      this.logger.log(`使用自定义延迟天数: ${delayDays}`);
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - actualDelayDays);

    const result: UserCleanupResult = {
      success: true,
      processedUsers: 0,
      deletedMembers: 0,
      deletedProjects: 0,
      deletedAuditLogs: 0,
      deletedRefreshTokens: 0,
      deletedUploadSessions: 0,
      deletedConfigLogs: 0,
      markedForStorageCleanup: 0,
      errors: [],
    };

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
          const userResult = await this.cleanupUser(user.id);
          result.processedUsers++;
          result.deletedMembers += userResult.deletedMembers;
          result.deletedProjects += userResult.deletedProjects;
          result.deletedAuditLogs += userResult.deletedAuditLogs;
          result.deletedRefreshTokens += userResult.deletedRefreshTokens;
          result.deletedUploadSessions += userResult.deletedUploadSessions;
          result.deletedConfigLogs += userResult.deletedConfigLogs;
          result.markedForStorageCleanup += userResult.markedForStorageCleanup;
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
}
