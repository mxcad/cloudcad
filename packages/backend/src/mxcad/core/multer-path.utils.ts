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

import { join, basename } from 'path';

/**
 * multer 落盘路径构造（路径遍历防护）。
 *
 * hash / chunk / originalname 均为客户端 multipart 输入；DTO 的 class-validator
 * 校验发生在路由处理器（晚于 multer 的 destination/filename 回调），故回调拿到的是
 * 未校验原始值。此处用 basename 剥离任何路径段（/ 与 \），确保生成的目录/文件名不含
 * 分隔符，multer 不会把文件写到 tempPath / mxcadUploadPath 之外。合法 MD5 哈希与常规
 * 文件名无分隔符，basename 为 no-op。
 */
export function buildMulterChunkDir(tempPath: string, hash: unknown): string {
  return join(tempPath, `chunk_${basename(String(hash ?? ''))}`);
}

export function buildMulterFilename(
  reqBody: Record<string, unknown> | undefined,
  originalname: string
): string {
  const fileMd5 = basename(String(reqBody?.hash ?? ''));
  if (reqBody?.chunk !== undefined) {
    return `${basename(String(reqBody.chunk))}_${fileMd5}`;
  }
  if (fileMd5) {
    return `${fileMd5}.${basename(originalname).split('.').pop()}`;
  }
  return basename(originalname);
}
