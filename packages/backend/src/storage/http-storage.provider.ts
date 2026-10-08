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

import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import * as fsPromises from 'fs/promises';
import type { Readable } from 'stream';
import { Readable as ReadableStream } from 'stream';
import { internalServiceSecretHeader } from '../common/utils/internal-service-auth';
import {
  createInternalServiceClient,
  type InternalServiceClient,
} from '../common/utils/internal-service-http';
import type { IStorageProvider } from './interfaces/storage-provider.interface';

/**
 * standalone 模式的存储 HTTP 实现
 *
 * 通过 storage-service 的 /v1/files/* 接口提供纯文件存储能力（#274）。
 * SVN 三件套已迁至 version-control 域的 HttpVersionControlProvider
 * （调 storage-service /v1/svn/*）；storage-service 无文件级
 * copy/move/listAll/deleteAll/getUrl 接口，对应方法显式抛
 * NotImplementedException（#252 地图决策 2）。
 * copyFromFs（本地 FS → 存储的上传路径，file-tree/materializer 依赖）
 * 与 getMetaData（read 兜底，StorageService.getFileInfo 依赖）为核心
 * 能力，均已实现（#274 code-review 回归修复）。
 */
@Injectable()
export class HttpStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(HttpStorageProvider.name);
  /** backend → storage-service 的 HTTP 传输（唯一出口见 internal-service-http） */
  private readonly client: InternalServiceClient;

  constructor(
    private readonly configService: ConfigService,
    cls: ClsService,
  ) {
    const baseUrl =
      this.configService.get<string>('STORAGE_SERVICE_URL') ||
      'http://localhost:3200';
    this.client = createInternalServiceClient({
      baseUrl,
      useHttps: baseUrl.startsWith('https'),
      secretHeaders: internalServiceSecretHeader(
        this.configService.get<string>('INTERNAL_SERVICE_SECRET'),
      ),
      cls,
      serviceName: 'http-storage',
    });
  }

  async read(path: string): Promise<Readable> {
    const data = await this.client.requestBuffer(
      `/v1/files/${encodeURIComponent(path)}`,
      'GET'
    );
    return ReadableStream.from([data]);
  }

  async write(
    path: string,
    contents: string | Uint8Array | Readable
  ): Promise<void> {
    const data =
      typeof contents === 'string'
        ? Buffer.from(contents)
        : contents instanceof Uint8Array
          ? Buffer.from(contents)
          : await this.streamToBuffer(contents);
    const body = JSON.stringify({ contents: data.toString('base64') });
    await this.client.request(`/v1/files/${encodeURIComponent(path)}`, 'PUT', body);
  }

  async delete(path: string): Promise<void> {
    await this.client.request(`/v1/files/${encodeURIComponent(path)}`, 'DELETE');
  }

  /**
   * standalone 已知限制：storage-service 无 HEAD/exists 端点，此实现用 GET 全文
   * 探测并吞掉所有异常——网络错误 / 服务不可用与「文件不存在」都返回 false，
   * 调用方无法区分「真不存在」与「探测失败」。待 storage-service 补 HEAD 端点后
   * 改走 HEAD 并按状态码区分。
   */
  async exists(path: string): Promise<boolean> {
    try {
      await this.client.requestBuffer(
        `/v1/files/${encodeURIComponent(path)}`,
        'GET'
      );
      return true;
    } catch {
      return false;
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    this.logger.warn(`copy 暂不支持: ${source} -> ${destination}`);
    throw new NotImplementedException(
      'standalone 模式暂不支持存储内复制（storage-service 无对应接口）'
    );
  }

  async move(source: string, destination: string): Promise<void> {
    this.logger.warn(`move 暂不支持: ${source} -> ${destination}`);
    throw new NotImplementedException(
      'standalone 模式暂不支持存储内移动（storage-service 无对应接口）'
    );
  }

  async listAll(
    prefix: string,
    options?: { recursive?: boolean }
  ): Promise<{ objects: Array<{ name: string; isFile: boolean }> }> {
    this.logger.warn(`listAll 暂不支持: ${prefix}`);
    throw new NotImplementedException(
      'standalone 模式暂不支持列出文件（storage-service 无对应接口）'
    );
  }

  async deleteAll(prefix: string): Promise<void> {
    this.logger.warn(`deleteAll 暂不支持: ${prefix}`);
    throw new NotImplementedException(
      'standalone 模式暂不支持递归删除目录（storage-service 无对应接口）'
    );
  }

  /**
   * standalone 已知限制：storage-service 无元数据端点，此实现只能 GET 全文后拼出
   * contentLength；contentType 恒 octet-stream、lastModified 恒当前时间、etag 恒空串，
   * 均为占位值而非真实元数据。依赖 lastModified/etag 的调用方（如 getFileInfo 的文件
   * 修改时间）在 standalone 下拿到的是假值。待 storage-service 补元数据响应头后改读真实值。
   */
  async getMetaData(
    key: string
  ): Promise<{
    contentLength: number;
    contentType: string;
    lastModified: Date;
    etag: string;
  }> {
    const data = await this.client.requestBuffer(
      `/v1/files/${encodeURIComponent(key)}`,
      'GET'
    );
    return {
      contentLength: data.length,
      contentType: 'application/octet-stream',
      lastModified: new Date(),
      etag: '',
    };
  }

  async getUrl(key: string): Promise<string> {
    this.logger.warn(`getUrl 暂不支持: ${key}`);
    throw new NotImplementedException(
      'standalone 模式暂不支持获取文件公开 URL（storage-service 无对应接口）'
    );
  }

  /**
   * 从本地文件系统复制文件到存储（上传路径，#274 code-review 回归修复）
   *
   * readFile + PUT /v1/files/{key}，等同旧 isStandalone 分支语义
   * （storage-service 的 PUT /v1/files 无 token 校验，仅 POST /upload 需要）。
   * 这是上传/落盘核心路径（file-tree.createFileNode、FileNodeMaterializer），
   * 不属于 #252 决议 2 的「存储内 copy/move/listAll/getUrl 暂不支持」范畴。
   */
  async copyFromFs(sourcePath: string, destinationKey: string): Promise<void> {
    const data = await fsPromises.readFile(sourcePath);
    await this.write(destinationKey, data);
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
