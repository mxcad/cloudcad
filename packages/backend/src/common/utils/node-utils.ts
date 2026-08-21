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
// Interfaces
// ---------------------------------------------------------------------------

/** 节点引用上下文 */
export interface NodeReferenceContext {
  /** 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 文件哈希值 */
  fileHash: string;
  /** 所有者 ID */
  ownerId: string;
  /** 父节点 ID */
  parentId: string;
}

// ---------------------------------------------------------------------------
// NodeUtils
// ---------------------------------------------------------------------------

/**
 * 节点工具类
 * 提供节点创建、验证、文件名处理、MIME 类型检测、文件验证等纯逻辑工具方法。
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

  /** 非法字符（Windows / Linux 均不允许；包含控制字符是故意的，用于安全验证） */
  private static readonly INVALID_CHARS = /[<>:"|?*\x00-\x1F]/;

  /** 控制字符（用于安全清理） */
  private static readonly CONTROL_CHARS = /[\x00-\x1F\x7F]/;

  /** 最大文件名长度 */
  private static readonly MAX_FILENAME_LENGTH = 255;

  // ---- 创建 / 验证 --------------------------------------------------------

  /**
   * 验证文件哈希格式（SHA-256，64 位十六进制）
   * @param fileHash 文件哈希
   * @returns 是否有效
   */
  static isValidFileHash(fileHash: string): boolean {
    const sha256Pattern = /^[a-f0-9]{64}$/i;
    return sha256Pattern.test(fileHash);
  }

  // ---- 文件名/扩展名处理 ---------------------------------------------------

  /**
   * 获取文件扩展名（含点）
   * @param fileName 文件名
   * @returns 扩展名，如 ".dwg"；无扩展名返回空串
   */
  static extractExtension(fileName: string): string {
    if (!fileName) {
      return '';
    }

    const lastDotIndex = fileName.lastIndexOf('.');

    // 没有点，或者点是最后一个字符（如 "foo."），或者点是第一个字符（隐藏文件）
    if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
      return '';
    }

    return fileName.substring(lastDotIndex);
  }

  /**
   * 获取文件主名（不含扩展名）
   * @param fileName 文件名
   * @returns 主文件名
   */
  static extractBaseName(fileName: string): string {
    if (!fileName) {
      return '';
    }

    const lastDotIndex = fileName.lastIndexOf('.');

    // 没有点，或者点是第一个字符（隐藏文件 .foo）
    if (lastDotIndex <= 0) {
      return fileName;
    }

    return fileName.substring(0, lastDotIndex);
  }

  /** @deprecated 请使用 extractBaseName */
  static getBaseName = NodeUtils.extractBaseName;

  /** @deprecated 请使用 extractExtension */
  static getExtension = NodeUtils.extractExtension;

  // ---- 唯一文件名 ---------------------------------------------------------

  /**
   * 生成唯一的文件名（处理重复）
   * @param baseName 基础文件名（不含扩展名）
   * @param extension 扩展名
   * @param existingNames 已存在的文件名列表
   * @returns 唯一文件名
   */
  static generateUniqueFileName(
    baseName: string,
    extension: string,
    existingNames: string[],
  ): string {
    let candidate = `${baseName}${extension}`;
    let counter = 1;

    while (existingNames.includes(candidate)) {
      candidate = `${baseName} (${counter})${extension}`;
      counter++;
    }

    return candidate;
  }

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

  // ---- 文件类型检测 --------------------------------------------------------

  /**
   * 检查是否为文档文件
   * @param filename 文件名
   * @returns 是否为文档文件
   */
  static isDocumentFile(filename: string): boolean {
    const extension = NodeUtils.extractExtension(filename).toLowerCase();
    return [
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.txt',
      '.rtf',
      '.odt',
      '.ods',
      '.odp',
    ].includes(extension);
  }

  // ---- 文件名清理 ---------------------------------------------------------

  /**
   * 清理文件名，移除非法字符
   * @param filename 原始文件名
   * @returns 清理后的文件名
   */
  static sanitizeFileName(filename: string): string {
    // 移除路径遍历字符
    let sanitized = filename.replace(/[/\\]/g, '_');

    // 移除控制字符
    sanitized = sanitized.replace(NodeUtils.CONTROL_CHARS, '_');

    // 移除非法字符
    sanitized = sanitized.replace(NodeUtils.INVALID_CHARS, '_');

    // 限制文件名长度
    if (sanitized.length > NodeUtils.MAX_FILENAME_LENGTH) {
      const ext = NodeUtils.extractExtension(sanitized);
      const nameWithoutExt = NodeUtils.extractBaseName(sanitized);
      const maxNameLength = NodeUtils.MAX_FILENAME_LENGTH - ext.length;
      sanitized = nameWithoutExt.substring(0, maxNameLength) + ext;
    }

    // 确保文件名不为空
    if (sanitized.trim() === '' || sanitized === '.') {
      sanitized = 'unnamed';
    }

    return sanitized;
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
