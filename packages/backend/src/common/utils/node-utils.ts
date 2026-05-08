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

import { Logger } from '@nestjs/common';
import { FileStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** 节点创建选项 */
export interface CreateNodeOptions {
  /** 文件名 */
  name: string;
  /** 文件哈希值 */
  fileHash: string;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  mimeType: string;
  /** 文件扩展名 */
  extension: string;
  /** 父节点 ID */
  parentId: string;
  /** 所有者 ID */
  ownerId: string;
  /** 源文件路径（可选） */
  sourceFilePath?: string;
  /** 源目录路径（可选） */
  sourceDirectoryPath?: string;
  /** 是否跳过文件拷贝 */
  skipFileCopy?: boolean;
}

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

/** 节点验证结果 */
export interface NodeValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误消息 */
  errorMessage?: string;
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
  private static readonly logger = new Logger(NodeUtils.name);

  // ---- 常量 ---------------------------------------------------------------

  /** 支持的文件扩展名 */
  private static readonly SUPPORTED_EXTENSIONS: readonly string[] = [
    // CAD
    '.dwg',
    '.dxf',
    // 文档
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
    // 图片
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.webp',
    // MxCAD
    '.mxweb',
    '.mxwbe',
  ];

  /** MIME 类型映射（key 为不含点的扩展名小写） */
  private static readonly MIME_TYPES: Record<string, string> = {
    dwg: 'application/acad',
    dxf: 'application/dxf',
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
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    mxweb: 'application/octet-stream',
  };

  /** Windows 保留文件名 */
  private static readonly RESERVED_NAMES =
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

  /** 非法字符（Windows / Linux 均不允许；包含控制字符是故意的，用于安全验证） */
  // eslint-disable-next-line no-control-regex
  private static readonly INVALID_CHARS = /[<>:"|?*\x00-\x1F]/;

  /** 控制字符（用于安全清理） */
  // eslint-disable-next-line no-control-regex
  private static readonly CONTROL_CHARS = /[\x00-\x1F\x7F]/;

  /** 最大文件名长度 */
  private static readonly MAX_FILENAME_LENGTH = 255;

  // ---- 创建 / 验证 --------------------------------------------------------

  /**
   * 验证节点创建选项
   * @param options 创建选项
   * @returns 验证结果
   */
  static validateCreateOptions(options: CreateNodeOptions): NodeValidationResult {
    const requiredFields = [
      'name',
      'fileHash',
      'size',
      'mimeType',
      'extension',
      'parentId',
      'ownerId',
    ] as const;

    for (const field of requiredFields) {
      if (!options[field as keyof CreateNodeOptions]) {
        return {
          isValid: false,
          errorMessage: `缺少必需字段: ${field}`,
        };
      }
    }

    // 验证文件名
    if (!NodeUtils.isValidFileName(options.name)) {
      return {
        isValid: false,
        errorMessage: `无效的文件名: ${options.name}`,
      };
    }

    // 验证文件大小
    if (options.size < 0) {
      return {
        isValid: false,
        errorMessage: `文件大小不能为负数: ${options.size}`,
      };
    }

    // 验证文件哈希格式（SHA-256 应该是 64 位十六进制字符）
    if (!NodeUtils.isValidFileHash(options.fileHash)) {
      return {
        isValid: false,
        errorMessage: `无效的文件哈希格式: ${options.fileHash}`,
      };
    }

    return { isValid: true };
  }

  /**
   * 验证文件名是否有效（合并版：原 isValidFileName + validateFileName 的检查项）
   * @param fileName 文件名
   * @returns 是否有效
   */
  static isValidFileName(fileName: string): boolean {
    if (!fileName || fileName.trim().length === 0) {
      return false;
    }

    // 检查文件名长度
    if (fileName.length > NodeUtils.MAX_FILENAME_LENGTH) {
      return false;
    }

    // 检查是否包含路径遍历字符
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return false;
    }

    // 检查是否包含非法字符
    if (NodeUtils.INVALID_CHARS.test(fileName)) {
      return false;
    }

    // 检查是否包含控制字符
    if (NodeUtils.CONTROL_CHARS.test(fileName)) {
      return false;
    }

    // 检查是否为 Windows 保留名称
    const nameWithoutExt = NodeUtils.extractBaseName(fileName);
    if (NodeUtils.RESERVED_NAMES.test(nameWithoutExt)) {
      return false;
    }

    // 检查是否仅为点（隐藏文件或当前目录的表示）
    if (fileName === '.') {
      return false;
    }

    return true;
  }

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

  /**
   * 标准化文件扩展名（确保以点开头且为小写）
   * @param extension 文件扩展名
   * @returns 标准化后的扩展名
   */
  static normalizeExtension(extension: string): string {
    if (!extension) {
      return '';
    }

    // 确保以点开头
    const normalized = extension.startsWith('.') ? extension : `.${extension}`;
    return normalized.toLowerCase();
  }

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

  // ---- 文件哈希 -----------------------------------------------------------

  /**
   * 从文件名解析文件哈希（SHA-256）
   * 文件名格式：{hash}.{extension}
   * @param filename 文件名
   * @returns 文件哈希或 null
   */
  static parseFileHash(filename: string): string | null {
    const baseName = NodeUtils.extractBaseName(filename);
    const sha256Pattern = /^[a-f0-9]{64}$/i;

    if (sha256Pattern.test(baseName)) {
      return baseName;
    }

    return null;
  }

  /**
   * 从文件名构建安全的存储文件名
   * @param originalName 原始文件名
   * @param fileHash 文件哈希
   * @returns 存储文件名（{fileHash}{extension}）
   */
  static buildStorageFileName(originalName: string, fileHash: string): string {
    const extension = NodeUtils.extractExtension(originalName);
    return `${fileHash}${extension}`;
  }

  // ---- 节点标识 / 锁 ------------------------------------------------------

  /**
   * 生成节点唯一标识符
   * @param fileHash 文件哈希
   * @param ownerId 所有者 ID
   * @returns 唯一标识符
   */
  static generateNodeIdentifier(fileHash: string, ownerId: string): string {
    return `${fileHash}_${ownerId}`;
  }

  /**
   * 生成锁名称
   * @param type 锁类型
   * @param identifier 标识符
   * @returns 锁名称
   */
  static generateLockName(
    type: 'create' | 'reference' | 'upload',
    identifier: string,
  ): string {
    return `${type}:${identifier}`;
  }

  // ---- 路径 ---------------------------------------------------------------

  /**
   * 生成存储目录名称
   * @param nodeId 节点 ID
   * @param _fileHash 文件哈希（保留参数，当前未使用）
   * @returns 存储目录名称
   */
  static generateStorageDirectoryName(
    nodeId: string,
    _fileHash: string,
  ): string {
    return nodeId;
  }

  /**
   * 计算文件的相对路径
   * @param directory 目录（YYYYMM[/N]）
   * @param nodeId 节点 ID
   * @param fileName 文件名（可选）
   * @returns 相对路径
   */
  static buildRelativePath(
    directory: string,
    nodeId: string,
    fileName?: string,
  ): string {
    let path = `${directory}/${nodeId}`;
    if (fileName) {
      path = `${path}/${fileName}`;
    }
    return path;
  }

  /**
   * 从相对路径提取节点 ID
   * @param relativePath 相对路径，格式 YYYYMM[/N]/nodeId[/fileName]
   * @returns 节点 ID 或 null
   */
  static extractNodeIdFromPath(relativePath: string): string | null {
    const parts = relativePath.split('/');
    // 路径格式：YYYYMM[/N]/nodeId[/fileName]
    if (parts.length >= 2) {
      return parts[1];
    }
    return null;
  }

  // ---- 文件状态 -----------------------------------------------------------

  /**
   * 检查节点状态是否允许操作
   * @param fileStatus 文件状态
   * @param operation 操作类型
   * @returns 是否允许
   */
  static canPerformOperation(
    fileStatus: FileStatus,
    operation: 'read' | 'write' | 'delete',
  ): boolean {
    switch (operation) {
      case 'read':
        // 所有非删除状态都可以读取
        return fileStatus !== FileStatus.DELETED;
      case 'write':
        // 只有 COMPLETED 状态可以写入
        return fileStatus === FileStatus.COMPLETED;
      case 'delete':
        // 所有非 DELETED 状态都可以删除
        return fileStatus !== FileStatus.DELETED;
      default:
        return false;
    }
  }

  // ---- 文件类型检测 --------------------------------------------------------

  /**
   * 检查是否为支持的文件类型
   * @param filename 文件名
   * @returns 是否支持
   */
  static isSupportedFileType(filename: string): boolean {
    const extension = NodeUtils.extractExtension(filename).toLowerCase();
    return NodeUtils.SUPPORTED_EXTENSIONS.includes(extension);
  }

  /**
   * 检查是否为支持的 CAD 文件
   * @param extensionOrFilename 文件扩展名或完整文件名
   * @returns 是否支持
   */
  static isSupportedCADFile(extensionOrFilename: string): boolean {
    const ext = extensionOrFilename.includes('.')
      ? NodeUtils.extractExtension(extensionOrFilename).toLowerCase()
      : NodeUtils.normalizeExtension(extensionOrFilename);
    return ['.dwg', '.dxf'].includes(ext);
  }

  /** @deprecated 请使用 isSupportedCADFile */
  static isCADFile = NodeUtils.isSupportedCADFile;

  /**
   * 检查是否为支持的图片文件
   * @param extensionOrFilename 文件扩展名或完整文件名
   * @returns 是否支持
   */
  static isSupportedImageFile(extensionOrFilename: string): boolean {
    const ext = extensionOrFilename.includes('.')
      ? NodeUtils.extractExtension(extensionOrFilename).toLowerCase()
      : NodeUtils.normalizeExtension(extensionOrFilename);
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext);
  }

  /** @deprecated 请使用 isSupportedImageFile */
  static isImageFile = NodeUtils.isSupportedImageFile;

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

  /**
   * 检查是否为 MxCAD 文件
   * @param filename 文件名
   * @returns 是否为 MxCAD 文件
   */
  static isMxCADFile(filename: string): boolean {
    const extension = NodeUtils.extractExtension(filename).toLowerCase();
    return extension === '.mxweb' || extension === '.mxwbe';
  }

  /**
   * 检查两个文件的扩展名是否匹配
   * @param filename1 文件名1
   * @param filename2 文件名2
   * @returns 是否匹配
   */
  static isExtensionMatch(filename1: string, filename2: string): boolean {
    const ext1 = NodeUtils.extractExtension(filename1).toLowerCase();
    const ext2 = NodeUtils.extractExtension(filename2).toLowerCase();
    return ext1 === ext2;
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

  // ---- 日志 ---------------------------------------------------------------

  /**
   * 记录节点操作日志
   * @param nodeId 节点 ID
   * @param name 文件名
   * @param fileHash 文件哈希
   * @param action 操作类型
   */
  static logNodeOperation(
    nodeId: string,
    name: string,
    fileHash: string,
    action: 'create' | 'reference' | 'delete',
  ): void {
    const message = `[${action.toUpperCase()}] Node ID: ${nodeId}, Name: ${name}, Hash: ${fileHash}`;
    switch (action) {
      case 'create':
        NodeUtils.logger.log(message);
        break;
      case 'reference':
        NodeUtils.logger.debug(message);
        break;
      case 'delete':
        NodeUtils.logger.warn(message);
        break;
    }
  }
}
