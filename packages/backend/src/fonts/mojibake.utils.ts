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

/**
 * 文件名 mojibake（乱码）修复工具
 *
 * busboy（multer 依赖）默认用 latin1 解码 multipart 请求头中的文件名，
 * 浏览器以 UTF-8 字节发送的中文名（如「微软雅黑.ttf」）会被解析成
 * 「å¾®è½¯é›…é»‘.ttf」形式的乱码。未配置 defParamCharset: 'utf8' 的
 * 旧上传路径会把乱码名直接落盘，需在此按字节反向修复。
 */

/**
 * 判断字符串是否为「UTF-8 被 latin1 误解码」的 mojibake。
 *
 * 启发式：UTF-8 多字节序列经 latin1 解码后全部落在 latin-1 补充区
 * （U+0080 ~ U+00FF），因此当非 ASCII 字符绝大部分集中在该区域时，
 * 极大概率是乱码；反之（如 CJK、俄文等）则视为正常文件名。
 */
function isLikelyMojibake(name: string): boolean {
  const nonAscii = name.match(/[^\x00-\x7F]/g);
  if (!nonAscii || nonAscii.length === 0) {
    return false;
  }
  const latin1Count = (name.match(/[\u0080-\u00FF]/g) ?? []).length;
  return latin1Count / nonAscii.length >= 0.7;
}

/**
 * 修复 mojibake 文件名：latin1 逐字节解码回 UTF-8。
 * 修复后若出现替换字符（\uFFFD），说明原字符串本就是合法的
 * latin-1 文本（如法语名 café.ttf 的 é），保持原样不转换。
 */
export function decodeMojibakeFileName(name: string): string {
  if (!isLikelyMojibake(name)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

/**
 * 将合法 UTF-8 文件名编码回 latin1 mojibake 形式。
 * 用于按显示名定位历史遗留的乱码磁盘文件名（删除/下载 fallback）。
 */
export function encodeMojibakeFileName(name: string): string {
  return Buffer.from(name, 'utf8').toString('latin1');
}
