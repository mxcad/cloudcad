///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { StorageCheckService } from '../../storage/storage-check.service';
import { ConcurrencyManager } from '../../common/concurrency/concurrency-manager';

/**
 * 文件检查服务
 * 负责检查文件是否存在、是否已存储等操作
 */
@Injectable()
export class FileCheckService {
  private readonly logger = new Logger(FileCheckService.name);

  constructor(
    private readonly storageCheckService: StorageCheckService,
    private readonly concurrencyManager: ConcurrencyManager
  ) {}

  /**
   * 检查文件是否存在（带并发控制）
   * @param hash 文件哈希值
   * @param filename 文件名
   * @returns 文件是否存在
   */
  async checkFileExists(hash: string, filename: string): Promise<boolean> {
    return this.concurrencyManager.acquireLock(`file-check:${hash}`, () =>
      this.performFileExistenceCheck(hash, filename)
    ) as Promise<boolean>;
  }

  /**
   * 检查文件是否已存储
   * @param hash 文件哈希值
   * @param filename 文件名
   * @returns 文件是否已存储
   */
  async checkFileInStorage(hash: string, filename: string): Promise<boolean> {
    try {
      const convertedExt = this.getConvertedExtension(filename);
      const convertedFilename = `${hash}${convertedExt}`;
      return await this.storageCheckService.checkInAny(convertedFilename);
    } catch (error) {
      this.logger.error(`检查文件存储失败: ${hash}`, error);
      return false;
    }
  }

  /**
   * 执行文件存在性检查（内部方法）
   * @param hash 文件哈希值
   * @param filename 文件名
   * @returns 文件是否存在
   */
  private async performFileExistenceCheck(
    hash: string,
    filename: string
  ): Promise<boolean> {
    try {
      const exists = await this.checkFileInStorage(hash, filename);
      if (exists) {
        this.logger.log(`文件已存在: ${hash} (${filename})`);
      }
      return exists;
    } catch (error) {
      this.logger.error(`文件存在性检查失败: ${hash}`, error);
      return false;
    }
  }

  /**
   * 获取转换后的文件扩展名
   * @param filename 原始文件名
   * @returns 转换后的扩展名
   */
  getConvertedExtension(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    // 根据 MxCAD 转换规则返回对应的扩展名
    const conversionMap: Record<string, string> = {
      '.dwg': '.dwg',
      '.dxf': '.dxf',
      '.pdf': '.pdf',
      // 可以根据需要添加更多转换规则
    };
    return conversionMap[ext] || ext;
  }
}
