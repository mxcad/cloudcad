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

import * as fs from 'fs';
import * as path from 'path';

/**
 * 上传目录中「CAD 源文件 → 转换产物」的文件命名与就位判定唯一出口。
 *
 * 引擎按 src_file_md5 自定产物名，命名约定是 `<fileHash>.<源扩展名>.<产物扩展名>`。
 * 全仓读取该产物的地方（秒传存在性检查、秒传落盘复制、转换前产物就位短路）必须共用
 * 这一处，任一处拼法漂移都会让缓存命中判定失效——表现为产物已在磁盘上却仍重新转换。
 */

/**
 * 源文件扩展名（不含点）。
 *
 * 用 `substring(lastIndexOf('.') + 1)` 而非 `path.extname(...).substring(1)`：
 * 无扩展名文件取整名（`hash.nodot`）而非空串（`hash.`）。产出产物的摄入路径
 * （upload-utility 的 getConvertedFileName）用的是这一种，此处必须同源。
 */
export function sourceExtension(sourceFilename: string): string {
  return sourceFilename.substring(sourceFilename.lastIndexOf('.') + 1);
}

/**
 * 转换产物文件名。
 *
 * `convertedExt` 是产物方向的扩展名（含点）：dwg/dxf 方向为 `.mxweb`（默认），
 * pdf/图片方向为自身扩展名。与 `FileConversionService.getConvertedExtension` 配对使用。
 */
export function cachedArtifactFileName(
  fileHash: string,
  sourceFilename: string,
  convertedExt: string = '.mxweb'
): string {
  return `${fileHash}.${sourceExtension(sourceFilename)}${convertedExt}`;
}

/** 转换产物在上传目录中的路径（保持调用方给定的目录形态，不额外解析）。 */
export function cachedArtifactPath(
  uploadDir: string,
  fileHash: string,
  sourceFilename: string,
  convertedExt: string = '.mxweb'
): string {
  return path.join(
    uploadDir,
    cachedArtifactFileName(fileHash, sourceFilename, convertedExt)
  );
}

/**
 * 单一就位判据：路径指向一个普通文件且非空。
 *
 * 空文件视为未完成（引擎可能刚建句柄就失败），任何 fs 异常一律视为未就位
 * （调用方回落到真实转换 / 报「不存在」，fail-closed）。全仓判定「转换产物是否
 * 就位」必须走这一处——此前 4 处只查存在、4 处连存在都不查大小，0 字节产物会被
 * 误判为已就位。
 */
export function isArtifactReady(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

/** 转换产物是否已就位（精确命名形态：已知源文件名）。 */
export function cachedArtifactReady(
  uploadDir: string,
  fileHash: string,
  sourceFilename: string,
  convertedExt: string = '.mxweb'
): boolean {
  return isArtifactReady(
    cachedArtifactPath(uploadDir, fileHash, sourceFilename, convertedExt)
  );
}

/**
 * 按 hash 前缀在上传目录中查找产物文件名（源文件名未知时的降级形态）。
 *
 * 匹配约定与精确命名同源：产物名为 `<hash>.<源扩展名><产物扩展名>`，故只认
 * `<hash>` 前缀 + `<产物扩展名>` 后缀。目录不存在或无匹配返回 null。
 *
 * **注意：只认「有这个名字」，不保证产物非空**——引擎可能刚建句柄就失败留下
 * 0 字节文件。需要就位判据的调用方用 `findReadyArtifactByHash`。
 */
export function findArtifactByHash(
  uploadDir: string,
  fileHash: string,
  convertedExt: string = '.mxweb'
): string | null {
  let files: string[];
  try {
    files = fs.readdirSync(uploadDir);
  } catch {
    return null;
  }
  return (
    files.find((f) => f.startsWith(fileHash) && f.endsWith(convertedExt)) ?? null
  );
}

/**
 * 按 hash 前缀查找**已就位**的产物文件名；未就位（无匹配或 0 字节）返回 null。
 *
 * 「扫描形态且调用方还需要文件名」的组合此前在 3 处手写为
 * `findArtifactByHash(...) + isArtifactReady(...)`，就位判据被复制进了调用方。
 */
export function findReadyArtifactByHash(
  uploadDir: string,
  fileHash: string,
  convertedExt: string = '.mxweb'
): string | null {
  const name = findArtifactByHash(uploadDir, fileHash, convertedExt);
  return name && isArtifactReady(path.join(uploadDir, name)) ? name : null;
}

/** 按 hash 前缀判定产物是否就位（扫描 + 非空判据）。 */
export function isArtifactReadyByHash(
  uploadDir: string,
  fileHash: string,
  convertedExt: string = '.mxweb'
): boolean {
  return findReadyArtifactByHash(uploadDir, fileHash, convertedExt) !== null;
}
