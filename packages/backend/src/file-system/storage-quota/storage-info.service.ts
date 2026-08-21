///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipService } from '../../vip/membership.service';
import { QUOTA_KEYS } from '../../vip/quota-keys';
import { StorageUsageService } from '../../vip/storage-usage/storage-usage.service';
import { ProjectQuotaDto } from '../../common/dto/project-quota.dto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface StorageQuotaInfo {
  nodeId?: string;
  type: 'PERSONAL';
  used: number;
  total: number;
  remaining: number;
  usagePercent: number;
  isDefault: boolean;
}

interface QuotaCacheItem {
  data: StorageQuotaInfo;
  expiresAt: number;
}

@Injectable()
export class StorageInfoService {
  private readonly logger = new Logger(StorageInfoService.name);
  private readonly quotaCache = new Map<string, QuotaCacheItem>();
  private readonly cacheTTL = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly membershipService: MembershipService,
    private readonly storageUsageService: StorageUsageService,
  ) {}

  async getStorageQuota(userId: string): Promise<StorageQuotaInfo> {
    const cacheKey = `quota:${userId}`;

    const cached = this.quotaCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const totalUsed = await this.storageUsageService.usageSize({
      kind: 'personal',
      userId,
    });

    const limitMB = await this.membershipService.getQuota(userId, QUOTA_KEYS.PERSONAL_STORAGE);

    const totalLimit = limitMB * 1024 * 1024;
    const available = totalLimit - totalUsed;
    const usagePercentage = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;

    const quotaInfo: StorageQuotaInfo = {
      type: 'PERSONAL',
      used: totalUsed,
      total: totalLimit,
      remaining: available,
      usagePercent: usagePercentage,
      isDefault: true,
    };

    this.quotaCache.set(cacheKey, {
      data: quotaInfo,
      expiresAt: Date.now() + this.cacheTTL,
    });

    return quotaInfo;
  }

  async getProjectQuota(projectId: string, userId: string): Promise<ProjectQuotaDto> {
    const used = await this.storageUsageService.usageSize({
      kind: 'project',
      projectId,
    });

    const limitMB = await this.membershipService.getQuota(userId, QUOTA_KEYS.PROJECT_SIZE);
    const limit = limitMB * 1024 * 1024;
    const remaining = Math.max(limit - used, 0);

    return { projectId, used, limit, remaining };
  }

  async invalidateQuotaCache(userId: string, _nodeId?: string): Promise<void> {
    this.quotaCache.delete(`quota:${userId}`);
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
}
