///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FileSystemNode } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';

/**
 * 存储配额类型枚举
 */
export enum StorageQuotaType {
  PERSONAL = 'PERSONAL',
  PROJECT = 'PROJECT',
  LIBRARY = 'LIBRARY',
}

/**
 * 存储配额信息接口
 */
export interface StorageQuotaInfo {
  type: StorageQuotaType;
  used: number;
  total: number;
  remaining: number;
  usagePercent: number;
}

/**
 * 存储配额服务
 * 负责统一管理三种类型的存储配额逻辑（个人空间、项目、公共资源库）
 */
@Injectable()
export class StorageQuotaService {
  private readonly logger = new Logger(StorageQuotaService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly runtimeConfigService: RuntimeConfigService
  ) {}

  /**
   * 判断节点的存储配额类型
   * @param node 文件系统节点
   * @returns 存储配额类型
   */
  determineQuotaType(node: Partial<FileSystemNode>): StorageQuotaType {
    // libraryKey !== null → LIBRARY
    if (node.libraryKey) {
      return StorageQuotaType.LIBRARY;
    }

    // isRoot === true → PROJECT
    if (node.isRoot === true) {
      return StorageQuotaType.PROJECT;
    }

    // 其他 → PERSONAL
    return StorageQuotaType.PERSONAL;
  }

  /**
   * 获取存储配额上限
   * @param node 文件系统节点（可选）
   * @returns 配额上限（字节）
   */
  async getStorageQuotaLimit(node?: Partial<FileSystemNode>): Promise<number> {
    const type = node
      ? this.determineQuotaType(node)
      : StorageQuotaType.PERSONAL;

    // 节点 storageQuota（单位：GB）> RuntimeConfig 默认值
    if (node?.storageQuota && node.storageQuota > 0) {
      // storageQuota 存储 GB 值，转换为字节
      return node.storageQuota * 1024 * 1024 * 1024;
    }

    // 从 RuntimeConfig 获取默认值（单位：GB）
    const configMap: Record<StorageQuotaType, string> = {
      [StorageQuotaType.PERSONAL]: 'userStorageQuota',
      [StorageQuotaType.PROJECT]: 'projectStorageQuota',
      [StorageQuotaType.LIBRARY]: 'libraryStorageQuota',
    };

    // 默认值（单位：GB）
    const defaultValuesGB: Record<StorageQuotaType, number> = {
      [StorageQuotaType.PERSONAL]: 10, // 10GB
      [StorageQuotaType.PROJECT]: 50, // 50GB
      [StorageQuotaType.LIBRARY]: 100, // 100GB
    };

    const configKey = configMap[type];
    const quotaGB = await this.runtimeConfigService.getValue<number>(
      configKey,
      defaultValuesGB[type]
    );

    // GB 转换为字节
    return quotaGB * 1024 * 1024 * 1024;
  }

  /**
   * 更新节点的存储配额
   * @param nodeId 节点 ID
   * @param quotaGB 新配额值（GB），0 表示使用系统默认配额
   * @returns 更新后的节点
   */
  async updateNodeStorageQuota(
    nodeId: string,
    quotaGB: number
  ): Promise<FileSystemNode> {
    this.logger.log(`更新节点 ${nodeId} 的存储配额为 ${quotaGB} GB`);

    // 验证配额值
    if (quotaGB < 0) {
      throw new BadRequestException('存储配额不能为负数');
    }

    try {
      const updatedNode = await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: { storageQuota: quotaGB },
      });

      this.logger.log(`节点 ${nodeId} 的存储配额已更新为 ${quotaGB} GB`);
      return updatedNode;
    } catch (error) {
      this.logger.error(
        `更新节点 ${nodeId} 的存储配额失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}
