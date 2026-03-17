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
import * as crypto from 'crypto';

@Injectable()
export class FileHashService {
  private readonly logger = new Logger(FileHashService.name);

  /**
   * 计算文件的 MD5 哈希值
   * 与 mxcad 系统保持一致
   */
  async calculateHash(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const hash = crypto.createHash('md5');
        hash.update(buffer);
        const hashValue = hash.digest('hex');
        this.logger.debug(
          `计算文件 MD5 哈希值成功: ${hashValue.substring(0, 16)}...`
        );
        resolve(hashValue);
      } catch (error) {
        this.logger.error(
          `计算文件 MD5 哈希值失败: ${error.message}`,
          error.stack
        );
        reject(error);
      }
    });
  }

  /**
   * 计算流的哈希值（用于大文件）
   */
  async calculateHashFromStream(
    stream: NodeJS.ReadableStream
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const hash = crypto.createHash('md5');
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => {
          const hashValue = hash.digest('hex');
          this.logger.debug(
            `计算流 MD5 哈希值成功: ${hashValue.substring(0, 16)}...`
          );
          resolve(hashValue);
        });
        stream.on('error', reject);
      } catch (error) {
        this.logger.error(
          `计算流 MD5 哈希值失败: ${error.message}`,
          error.stack
        );
        reject(error);
      }
    });
  }
}
