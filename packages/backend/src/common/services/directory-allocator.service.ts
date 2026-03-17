///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import { FileLockService } from './file-lock.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';

export interface AllocationResult {
  targetDirectory: string; // 目标目录（相对路径，如：202602 或 202602_1）
  fullPath: string; // 完整路径
  nodeCount: number; // 当前节点数量
}

@Injectable()
export class DirectoryAllocator {
  private readonly logger = new Logger(DirectoryAllocator.name);
  private readonly nodeLimit: number;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileLockService: FileLockService,
    private readonly localStorageProvider: LocalStorageProvider
  ) {
    this.nodeLimit = this.configService.get('storage', { infer: true })!.nodeLimit;
  }

  /**
   * 分配目标目录
   * @returns 分配结果
   */
  async allocateDirectory(): Promise<AllocationResult> {
    const currentDate = new Date();
    const yearMonth = this.formatYearMonth(currentDate); // YYYYMM

    this.logger.log(`开始分配目录，当前月份: ${yearMonth}`);

    // 尝试分配主目录
    const mainResult = await this.tryAllocateDirectory(yearMonth);
    if (mainResult) {
      this.logger.log(`分配主目录成功: ${mainResult.targetDirectory}`);
      return mainResult;
    }

    // 主目录已满，尝试分配子目录
    let suffix = 1;
    while (suffix <= 100) {
      // 最多支持 100 个子目录
      const subDirectoryName = `${yearMonth}_${suffix}`;
      const subResult = await this.tryAllocateDirectory(subDirectoryName);
      if (subResult) {
        this.logger.log(`分配子目录成功: ${subResult.targetDirectory}`);
        return subResult;
      }
      suffix++;
    }

    throw new InternalServerErrorException(
      `无法分配目录：所有 ${yearMonth} 相关目录都已满`
    );
  }

  /**
   * 尝试分配指定目录
   * @param directoryName 目录名称（如：202602 或 202602_1）
   * @returns 分配结果或 null（如果目录已满）
   */
  private async tryAllocateDirectory(
    directoryName: string
  ): Promise<AllocationResult | null> {
    const lockName = `allocate-${directoryName}`;

    try {
      return await this.fileLockService.withLock(lockName, async () => {
        // 检查目录是否存在
        const exists =
          await this.localStorageProvider.directoryExists(directoryName);

        if (!exists) {
          // 目录不存在，创建它
          await this.localStorageProvider.createDirectory(directoryName);
          this.logger.log(`创建新目录: ${directoryName}`);
          return {
            targetDirectory: directoryName,
            fullPath:
              this.localStorageProvider['getAbsolutePath'](directoryName),
            nodeCount: 0,
          };
        }

        // 目录存在，检查节点数量
        const nodeCount =
          await this.localStorageProvider.getSubdirectoryCount(directoryName);

        if (nodeCount >= this.nodeLimit) {
          this.logger.log(
            `目录已满: ${directoryName} (${nodeCount}/${this.nodeLimit})`
          );
          return null;
        }

        // 目录可用
        return {
          targetDirectory: directoryName,
          fullPath: this.localStorageProvider['getAbsolutePath'](directoryName),
          nodeCount,
        };
      });
    } catch (error) {
      this.logger.error(`分配目录失败: ${directoryName}`, error.stack);
      throw error;
    }
  }

  /**
   * 格式化年月
   * @param date 日期
   * @returns YYYYMM 格式的字符串
   */
  private formatYearMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }

  /**
   * 获取目录信息
   * @param directoryName 目录名称
   * @returns 目录信息
   */
  async getDirectoryInfo(directoryName: string): Promise<{
    exists: boolean;
    nodeCount: number;
    fullPath: string;
  }> {
    const exists =
      await this.localStorageProvider.directoryExists(directoryName);
    const nodeCount = exists
      ? await this.localStorageProvider.getSubdirectoryCount(directoryName)
      : 0;
    const fullPath =
      this.localStorageProvider['getAbsolutePath'](directoryName);

    return {
      exists,
      nodeCount,
      fullPath,
    };
  }

  /**
   * 获取所有目录列表
   * @returns 目录列表
   */
  async listDirectories(): Promise<
    Array<{
      name: string;
      nodeCount: number;
      isFull: boolean;
    }>
  > {
    try {
      const files = await this.localStorageProvider.listFiles('', '');
      const directories: Array<{
        name: string;
        nodeCount: number;
        isFull: boolean;
      }> = [];

      for (const file of files) {
        const dirName = file.replace(/\/$/, ''); // 移除末尾斜杠
        const info = await this.getDirectoryInfo(dirName);
        if (info.exists) {
          directories.push({
            name: dirName,
            nodeCount: info.nodeCount,
            isFull: info.nodeCount >= this.nodeLimit,
          });
        }
      }

      // 按名称排序
      directories.sort((a, b) => a.name.localeCompare(b.name));

      return directories;
    } catch (error) {
      this.logger.error(`获取目录列表失败`, error.stack);
      return [];
    }
  }
}
