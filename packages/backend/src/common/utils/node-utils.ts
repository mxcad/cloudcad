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

// ---------------------------------------------------------------------------
// NodeUtils
// ---------------------------------------------------------------------------

/**
 * 节点工具类
 * 提供 MIME 类型检测、文件大小格式化等纯逻辑工具方法。
 * 整合自 common/utils/node-utils.ts 和 file-system/utils/node-utils.ts 两处
 * 重复实现，消除代码重复（P2 / code-review 13-code-duplication.md）。
 */
export class NodeUtils {
  // ---- 常量 ---------------------------------------------------------------

  /** MIME 类型映射（key 为不含点的扩展名小写） */
  private static readonly MIME_TYPES: Record<string, string> = {
    // CAD 相关
    dwg: 'application/acad',
    dxf: 'application/dxf',
    mxweb: 'application/octet-stream',
    // 文档
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain; charset=utf-8',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    csv: 'text/csv',
    // 图片
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    // 音频
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    // 视频
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    // 压缩
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    bz2: 'application/x-bzip2',
    // 数据
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
    sql: 'application/sql',
    // 代码
    js: 'application/javascript',
    ts: 'application/typescript',
    html: 'text/html',
    css: 'text/css',
    md: 'text/markdown',
    py: 'text/x-python',
    java: 'text/x-java-source',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    hpp: 'text/x-c++',
  };

  // ---- MIME ---------------------------------------------------------------

  /**
   * 获取文件的 MIME 类型
   * @param extension 文件扩展名（带或不带点均可）
   * @returns MIME 类型字符串
   */
  static getMimeType(extension: string): string {
    if (!extension) {
      return 'application/octet-stream';
    }

    // 确保扩展名不带点
    const normalizedExt = extension.startsWith('.')
      ? extension.slice(1)
      : extension;

    const lowerExt = normalizedExt.toLowerCase();

    return NodeUtils.MIME_TYPES[lowerExt] || 'application/octet-stream';
  }

  // ---- 格式化 -------------------------------------------------------------

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化后的字符串
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);

    return `${size.toFixed(2)} ${units[i]}`;
  }
}
