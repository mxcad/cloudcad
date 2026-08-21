///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Disk } from 'flydrive';
// @ts-expect-error flydrive 使用 exports 字段，moduleResolution:node 无法解析但运行时正常
import { FSDriver } from 'flydrive/drivers/fs';
import type { Readable } from 'stream';
import * as path from 'path';
import type { IStorageProvider } from './interfaces/storage-provider.interface';

/**
 * Flydrive 存储提供者
 *
 * 使用 flydrive 的 FSDriver 实现本地文件系统存储。
 * 文件根目录由环境变量 FILES_DATA_PATH 决定，默认 data/files。
 */
@Injectable()
export class FlydriveStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(FlydriveStorageProvider.name);
  private readonly disk: Disk;

  constructor(private readonly configService: ConfigService) {
    const location = this.configService.get<string>('filesDataPath') || 'data/files';

    this.logger.log(`初始化 Flydrive 本地存储，根目录: ${location}`);

    const driver = new FSDriver({
      location,
      visibility: 'public',
    });

    this.disk = new Disk(driver);
    this.logger.log('Flydrive 本地存储初始化完成');
  }

  async read(path: string): Promise<Readable> {
    return this.disk.getStream(path);
  }

  async write(path: string, contents: string | Uint8Array | Readable): Promise<void> {
    if (typeof contents === 'string' || contents instanceof Uint8Array) {
      await this.disk.put(path, contents);
    } else {
      await this.disk.putStream(path, contents);
    }
  }

  async delete(path: string): Promise<void> {
    await this.disk.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.disk.exists(path);
  }

  async getMetaData(key: string): Promise<{ contentLength: number; contentType: string; lastModified: Date; etag: string }> {
    const meta = await this.disk.getMetaData(key);
    let contentType = meta.contentType || 'application/octet-stream';

    // Override MIME type for CAD and image files based on extension
    const ext = path.extname(key).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.dwg': 'application/acad',
      '.dxf': 'application/dxf',
      '.mxweb': 'application/x-mxweb',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };

    if (ext in mimeMap) {
      contentType = mimeMap[ext];
    }

    return {
      contentLength: meta.contentLength || 0,
      contentType,
      lastModified: meta.lastModified || new Date(),
      etag: meta.etag || '',
    };
  }

  async copy(source: string, destination: string): Promise<void> {
    await this.disk.copy(source, destination);
  }

  async move(source: string, destination: string): Promise<void> {
    await this.disk.move(source, destination);
  }

  async deleteAll(prefix: string): Promise<void> {
    await this.disk.deleteAll(prefix);
  }

  async getUrl(key: string): Promise<string> {
    return this.disk.getUrl(key);
  }

  async listAll(prefix: string, options?: { recursive?: boolean }): Promise<{ objects: Array<{ name: string; isFile: boolean }> }> {
    const result = await this.disk.listAll(prefix, options);
    const objects: Array<{ name: string; isFile: boolean }> = [];
    for (const obj of result.objects) {
      objects.push({
        name: obj.name,
        isFile: obj.isFile,
      });
    }
    return { objects };
  }

  /**
   * 从根目录外部复制文件到存储（用于上传场景）
   */
  async copyFromFs(sourcePath: string, destinationKey: string): Promise<void> {
    const fs = await import('fs');
    const content = await fs.promises.readFile(sourcePath);
    await this.write(destinationKey, new Uint8Array(content));
  }
}
