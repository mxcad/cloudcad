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
import * as http from 'http';
import * as https from 'https';
import type { Readable } from 'stream';
import { Readable as ReadableStream } from 'stream';
import { buildOutboundTraceHeaders } from '../common/utils/outbound-trace';
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
  private readonly baseUrl: string;
  private readonly useHttps: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.baseUrl =
      this.configService.get<string>('STORAGE_SERVICE_URL') ||
      'http://localhost:3200';
    this.useHttps = this.baseUrl.startsWith('https');
  }

  async read(path: string): Promise<Readable> {
    const data = await this.requestBuffer(
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
    await this.request(`/v1/files/${encodeURIComponent(path)}`, 'PUT', body);
  }

  async delete(path: string): Promise<void> {
    await this.request(`/v1/files/${encodeURIComponent(path)}`, 'DELETE');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.requestBuffer(`/v1/files/${encodeURIComponent(path)}`, 'GET');
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

  async getMetaData(
    key: string
  ): Promise<{
    contentLength: number;
    contentType: string;
    lastModified: Date;
    etag: string;
  }> {
    const data = await this.requestBuffer(
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

  private request(
    path: string,
    method: string,
    body?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = this.useHttps ? https : http;
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (this.useHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          // X-Request-Id/X-Trace-Id 透传（#309）：storage-service 侧日志据此串联
          ...buildOutboundTraceHeaders(
            {
              requestId: this.cls?.get<string>('requestId'),
              traceId: this.cls?.get<string>('traceId'),
            },
            'http-storage',
          ),
        },
        timeout: 60000,
      };
      if (body) options.headers!['Content-Length'] = Buffer.byteLength(body);
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(
                `HTTP ${res.statusCode} for ${method} ${path}: ${data.substring(0, 200)}`
              )
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout: ${method} ${path}`));
      });
      if (body) req.write(body);
      req.end();
    });
  }

  private requestBuffer(path: string, method: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = this.useHttps ? https : http;
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (this.useHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...buildOutboundTraceHeaders(
            {
              requestId: this.cls?.get<string>('requestId'),
              traceId: this.cls?.get<string>('traceId'),
            },
            'http-storage',
          ),
        },
        timeout: 60000,
      };
      const req = mod.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const body = Buffer.concat(chunks).toString('utf-8');
            return reject(
              new Error(
                `HTTP ${res.statusCode} for ${method} ${path}: ${body.substring(0, 200)}`
              )
            );
          }
          resolve(Buffer.concat(chunks));
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout: ${method} ${path}`));
      });
      req.end();
    });
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
