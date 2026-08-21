///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { Readable } from 'stream';

export const IStorageService = 'IStorageService';

export interface IStorageService {
  fileExists(key: string): Promise<boolean>;
  getFileStream(key: string): Promise<NodeJS.ReadableStream>;
  getFileInfo(key: string): Promise<{ contentType: string; contentLength: number } | null>;
  healthCheck(): Promise<{ status: string; message: string }>;
  listFiles(prefix: string, startsWith?: string): Promise<string[]>;
  deleteFile(key: string): Promise<void>;
  deleteAll(prefix: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  moveFile(source: string, destination: string): Promise<void>;
  writeFile(key: string, contents: string | Uint8Array): Promise<void>;
  writeStream(key: string, contents: Readable): Promise<void>;
  copyFromFs(sourcePath: string, destinationKey: string): Promise<void>;
  getFile(key: string): Promise<string>;
  getFileBytes(key: string): Promise<Uint8Array>;
  getUrl(key: string): Promise<string>;
}
