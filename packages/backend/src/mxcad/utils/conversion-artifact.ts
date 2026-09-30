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
 * 转换产物是否已就位：是普通文件且非空。
 *
 * 空文件视为未完成（引擎可能刚建句柄就失败），与秒传存在性检查同一判据。
 * 任何 fs 异常一律视为未就位——调用方回落到真实转换，fail-closed。
 */
export function cachedArtifactReady(
  uploadDir: string,
  fileHash: string,
  sourceFilename: string,
  convertedExt: string = '.mxweb'
): boolean {
  try {
    const stats = fs.statSync(
      cachedArtifactPath(uploadDir, fileHash, sourceFilename, convertedExt)
    );
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}
