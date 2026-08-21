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
import { IStorageProvider } from './interfaces/storage-provider.interface';
import { IStorageService } from './interfaces/storage-service.interface';
import type { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from '../config/app.config';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class StorageService implements IStorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly filesDataPath: string;

  constructor(
    @Inject(IStorageProvider)
    private readonly storageProvider: IStorageProvider,
    private configService: ConfigService<AppConfig>,
  ) {
    this.filesDataPath = this.configService.get('filesDataPath', {
      infer: true,
    });
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(key: string): Promise<boolean> {
    return this.storageProvider.exists(key);
  }

  /**
   * 获取文件流
   */
  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    return this.storageProvider.read(key) as Promise<NodeJS.ReadableStream>;
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(
    key: string
  ): Promise<{ contentType: string; contentLength: number } | null> {
    try {
      const meta = await this.storageProvider.getMetaData(key);
      return {
        contentType: meta.contentType || 'application/octet-stream',
        contentLength: meta.contentLength || 0,
      };
    } catch (error) {
      this.logger.error(`获取文件信息失败: ${key}`, error);
      return null;
    }
  }

  async healthCheck() {
    try {
      const resolvedPath = path.resolve(this.filesDataPath);

      const exists = fs.existsSync(resolvedPath);

      if (!exists) {
        return {
          status: 'unhealthy',
          message: I18nContext.current()?.t('error.storage_extra.directory_not_exist_param', { args: { path: resolvedPath } }) ?? `存储目录不存在: ${resolvedPath}`,
        };
      }

      try {
        fs.accessSync(resolvedPath, fs.constants.W_OK);
      } catch (error) {
        return {
          status: 'unhealthy',
          message: I18nContext.current()?.t('error.storage_extra.directory_not_writable', { args: { path: resolvedPath } }) ?? `存储目录不可写: ${resolvedPath}`,
        };
      }

      return {
        status: 'healthy',
        message: I18nContext.current()?.t('success.health_storage_healthy') ?? '本地存储服务正常',
      };
    } catch (error) {
      this.logger.error('存储服务健康检查失败:', error);
      return {
        status: 'unhealthy',
        message: I18nContext.current()?.t('error.storage_extra.unavailable', { args: { error: error.message } }) ?? `存储服务不可用: ${error.message}`,
      };
    }
  }

  /**
   * 列出指定路径下的文件
   */
  async listFiles(prefix: string, startsWith?: string): Promise<string[]> {
    const result = await this.storageProvider.listAll(prefix);
    let files = result.objects.filter((o) => o.isFile).map((o) => o.name);
    if (startsWith) {
      files = files.filter((f) => f.startsWith(startsWith));
    }
    return files;
  }

  /**
   * 删除文件
   */
  async deleteFile(key: string): Promise<void> {
    return this.storageProvider.delete(key);
  }

  /**
   * 递归删除目录及内容
   */
  async deleteAll(prefix: string): Promise<void> {
    return this.storageProvider.deleteAll(prefix);
  }

  /**
   * 复制文件（存储内）
   */
  async copyFile(source: string, destination: string): Promise<void> {
    return this.storageProvider.copy(source, destination);
  }

  /**
   * 移动文件（存储内）
   */
  async moveFile(source: string, destination: string): Promise<void> {
    return this.storageProvider.move(source, destination);
  }

  /**
   * 写入文件（字符串或字节）
   */
  async writeFile(key: string, contents: string | Uint8Array): Promise<void> {
    return this.storageProvider.write(key, contents);
  }

  /**
   * 写入文件（流）
   */
  async writeStream(key: string, contents: Readable): Promise<void> {
    return this.storageProvider.write(key, contents);
  }

  /**
   * 从外部文件系统复制文件到存储
   */
  async copyFromFs(sourcePath: string, destinationKey: string): Promise<void> {
    return this.storageProvider.copyFromFs(sourcePath, destinationKey);
  }

  /**
   * 获取文件内容（字符串）
   */
  async getFile(key: string): Promise<string> {
    const data = await this.streamToBuffer(
      await this.storageProvider.read(key)
    );
    return data.toString('utf-8');
  }

  /**
   * 获取文件内容（字节数组）
   */
  async getFileBytes(key: string): Promise<Uint8Array> {
    const data = await this.streamToBuffer(
      await this.storageProvider.read(key)
    );
    return new Uint8Array(data);
  }

  /**
   * 获取文件公开 URL
   */
  async getUrl(key: string): Promise<string> {
    return this.storageProvider.getUrl(key);
  }

  private async streamToBuffer(
    stream: Readable | NodeJS.ReadableStream
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
