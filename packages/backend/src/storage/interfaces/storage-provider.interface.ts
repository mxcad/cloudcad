///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { Readable } from 'stream';

/**
 * 存储提供者接口
 *
 * 统一文件存储操作的抽象层，基于 flydrive 的 Disk API。
 * 当前使用 FSDriver（本地文件系统），可替换为 S3/GCS 等远程存储。
 *
 * #273 T1：吞并 storage-provider/storage-provider.interface 的
 * read/write/delete/exists 方法后成为唯一纯存储抽象（'IStorageProvider' token）。
 */
export const IStorageProvider = 'IStorageProvider';

export interface IStorageProvider {
  /** 读取文件内容为流 */
  read(path: string): Promise<Readable>;

  /** 写入文件（字符串、字节或流） */
  write(path: string, contents: string | Uint8Array | Readable): Promise<void>;

  /** 删除文件 */
  delete(path: string): Promise<void>;

  /** 文件是否存在 */
  exists(path: string): Promise<boolean>;

  /** 复制文件 */
  copy(source: string, destination: string): Promise<void>;

  /** 移动文件 */
  move(source: string, destination: string): Promise<void>;

  /** 列出文件 */
  listAll(prefix: string, options?: { recursive?: boolean }): Promise<{ objects: Array<{ name: string; isFile: boolean }> }>;

  /** 删除目录及内容 */
  deleteAll(prefix: string): Promise<void>;

  /** 获取文件元数据 */
  getMetaData(key: string): Promise<{ contentLength: number; contentType: string; lastModified: Date; etag: string }>;

  /** 获取文件公开 URL */
  getUrl(key: string): Promise<string>;

  /** 从外部文件系统路径复制文件到存储 */
  copyFromFs(sourcePath: string, destinationKey: string): Promise<void>;
}
