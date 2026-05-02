///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { StorageInfoService, StorageQuotaInfo } from './storage-info.service';

/**
 * 配额超额异常数据结构
 */
export interface QuotaExceededError {
  code: 'QUOTA_EXCEEDED';
  message: string;
  quotaInfo: {
    used: number;
    total: number;
    remaining: number;
    usagePercent: number;
  };
}

/**
 * 配额检查结果
 */
export interface QuotaCheckResult {
  allowed: boolean;
  quotaInfo: StorageQuotaInfo;
}

/**
 * 配额强制执行服务
 * 负责在上传前检查配额是否充足
 */
@Injectable()
export class QuotaEnforcementService {
  private readonly logger = new Logger(QuotaEnforcementService.name);

  constructor(
    private readonly storageInfoService: StorageInfoService,
  ) {}

  /**
   * 检查上传是否超出配额
   * @param userId 用户 ID
   * @param nodeId 目标节点 ID（用于判断配额类型）
   * @param fileSize 文件大小（字节）
   * @throws BadRequestException 如果超出配额
   */
  async checkUploadQuota(
    userId: string,
    nodeId: string,
    fileSize: number,
  ): Promise<QuotaCheckResult> {
    // 获取节点的配额信息
    const quotaInfo = await this.storageInfoService.getStorageQuota(
      userId,
      nodeId,
    );

    // 检查剩余空间是否足够
    if (quotaInfo.remaining < fileSize) {
      this.logger.warn(
        `用户 ${userId} 上传文件超出配额: ` +
        `需要 ${fileSize} 字节, 剩余 ${quotaInfo.remaining} 字节`,
      );

      const error: QuotaExceededError = {
        code: 'QUOTA_EXCEEDED',
        message: `存储空间不足。当前已使用 ${this.formatSize(quotaInfo.used)} / ${this.formatSize(quotaInfo.total)}，` +
                 `还需 ${this.formatSize(fileSize - quotaInfo.remaining)} 空间。`,
        quotaInfo: {
          used: quotaInfo.used,
          total: quotaInfo.total,
          remaining: quotaInfo.remaining,
          usagePercent: quotaInfo.usagePercent,
        },
      };

      throw new BadRequestException(error);
    }

    return { allowed: true, quotaInfo };
  }

  /**
   * 检查用户是否已超额使用配额
   * @param userId 用户 ID
   * @param nodeId 目标节点 ID
   */
  async isQuotaExceeded(userId: string, nodeId: string): Promise<boolean> {
    const quotaInfo = await this.storageInfoService.getStorageQuota(
      userId,
      nodeId,
    );
    return quotaInfo.used > quotaInfo.total;
  }

  /**
   * 获取配额超额详情
   * @param userId 用户 ID
   * @param nodeId 目标节点 ID
   */
  async getQuotaExceededDetails(
    userId: string,
    nodeId: string,
  ): Promise<{
    isExceeded: boolean;
    exceededBy: number;
    quotaInfo: StorageQuotaInfo;
    suggestions: string[];
  }> {
    const quotaInfo = await this.storageInfoService.getStorageQuota(
      userId,
      nodeId,
    );
    const isExceeded = quotaInfo.used > quotaInfo.total;
    const exceededBy = isExceeded ? quotaInfo.used - quotaInfo.total : 0;

    const suggestions: string[] = [];
    if (isExceeded) {
      suggestions.push('删除不需要的文件');
      suggestions.push('联系管理员增加配额');
      suggestions.push('清理回收站中的文件');
    }

    return {
      isExceeded,
      exceededBy,
      quotaInfo,
      suggestions,
    };
  }

  /**
   * 格式化文件大小显示
   */
  private formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
}
