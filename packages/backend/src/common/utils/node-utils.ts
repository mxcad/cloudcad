import { Logger } from '@nestjs/common';
import { FileStatus } from '@prisma/client';

/**
 * 节点创建选项
 */
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

/**
 * 节点引用上下文
 */
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

/**
 * 节点验证结果
 */
export interface NodeValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 节点工具类
 * 提供节点创建、验证、引用等工具方法
 */
export class NodeUtils {
  private static readonly logger = new Logger(NodeUtils.name);

  /**
   * 验证节点创建选项
   * @param options 创建选项
   * @returns 验证结果
   */
  static validateCreateOptions(options: CreateNodeOptions): NodeValidationResult {
    const requiredFields = ['name', 'fileHash', 'size', 'mimeType', 'extension', 'parentId', 'ownerId'];

    for (const field of requiredFields) {
      if (!options[field]) {
        return {
          isValid: false,
          errorMessage: `缺少必需字段: ${field}`,
        };
      }
    }

    // 验证文件名
    if (!this.isValidFileName(options.name)) {
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
    if (!this.isValidFileHash(options.fileHash)) {
      return {
        isValid: false,
        errorMessage: `无效的文件哈希格式: ${options.fileHash}`,
      };
    }

    return { isValid: true };
  }

  /**
   * 验证文件名是否有效
   * @param fileName 文件名
   * @returns 是否有效
   */
  static isValidFileName(fileName: string): boolean {
    if (!fileName || fileName.trim().length === 0) {
      return false;
    }

    // 检查文件名长度
    if (fileName.length > 255) {
      return false;
    }

    // 检查是否包含非法字符
    const invalidChars = /[<>:"|?*\x00-\x1F]/;
    if (invalidChars.test(fileName)) {
      return false;
    }

    // 检查是否为保留名称（Windows）
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(fileName.split('.')[0])) {
      return false;
    }

    return true;
  }

  /**
   * 验证文件哈希格式
   * @param fileHash 文件哈希
   * @returns 是否有效
   */
  static isValidFileHash(fileHash: string): boolean {
    // SHA-256 哈希应该是 64 位十六进制字符
    const sha256Pattern = /^[a-f0-9]{64}$/i;
    return sha256Pattern.test(fileHash);
  }

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
  static generateLockName(type: 'create' | 'reference' | 'upload', identifier: string): string {
    return `${type}:${identifier}`;
  }

  /**
   * 生成存储目录名称
   * @param nodeId 节点 ID
   * @param fileHash 文件哈希
   * @returns 存储目录名称
   */
  static generateStorageDirectoryName(nodeId: string, fileHash: string): string {
    return `${nodeId}`;
  }

  /**
   * 检查节点状态是否允许操作
   * @param fileStatus 文件状态
   * @param operation 操作类型
   * @returns 是否允许
   */
  static canPerformOperation(
    fileStatus: FileStatus,
    operation: 'read' | 'write' | 'delete'
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

  /**
   * 标准化文件扩展名
   * @param extension 文件扩展名
   * @returns 标准化后的扩展名
   */
  static normalizeExtension(extension: string): string {
    if (!extension) {
      return '';
    }

    // 确保以点开头
    let normalized = extension.startsWith('.') ? extension : `.${extension}`;

    // 转换为小写
    normalized = normalized.toLowerCase();

    return normalized;
  }

  /**
   * 从文件名提取扩展名
   * @param fileName 文件名
   * @returns 扩展名
   */
  static extractExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
      return '';
    }
    return fileName.substring(lastDotIndex);
  }

  /**
   * 从文件名提取主文件名（不含扩展名）
   * @param fileName 文件名
   * @returns 主文件名
   */
  static extractBaseName(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return fileName;
    }
    return fileName.substring(0, lastDotIndex);
  }

  /**
   * 生成唯一的文件名（处理重复）
   * @param baseName 基础文件名
   * @param extension 扩展名
   * @param existingNames 已存在的文件名列表
   * @returns 唯一文件名
   */
  static generateUniqueFileName(
    baseName: string,
    extension: string,
    existingNames: string[]
  ): string {
    let candidate = `${baseName}${extension}`;
    let counter = 1;

    while (existingNames.includes(candidate)) {
      candidate = `${baseName} (${counter})${extension}`;
      counter++;
    }

    return candidate;
  }

  /**
   * 计算文件的相对路径
   * @param directory 目录（YYYYMM[/N]）
   * @param nodeId 节点 ID
   * @param fileName 文件名（可选）
   * @returns 相对路径
   */
  static buildRelativePath(directory: string, nodeId: string, fileName?: string): string {
    let path = `${directory}/${nodeId}`;
    if (fileName) {
      path = `${path}/${fileName}`;
    }
    return path;
  }

  /**
   * 从相对路径提取节点 ID
   * @param relativePath 相对路径
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

  /**
   * 检查是否为支持的 CAD 文件
   * @param extension 文件扩展名
   * @returns 是否支持
   */
  static isSupportedCADFile(extension: string): boolean {
    const supportedExtensions = ['.dwg', '.dxf', '.pdf'];
    return supportedExtensions.includes(extension.toLowerCase());
  }

  /**
   * 检查是否为支持的图片文件
   * @param extension 文件扩展名
   * @returns 是否支持
   */
  static isSupportedImageFile(extension: string): boolean {
    const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    return supportedExtensions.includes(extension.toLowerCase());
  }

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

  /**
   * 记录节点创建日志
   * @param nodeId 节点 ID
   * @param name 文件名
   * @param fileHash 文件哈希
   * @param action 操作类型
   */
  static logNodeOperation(
    nodeId: string,
    name: string,
    fileHash: string,
    action: 'create' | 'reference' | 'delete'
  ): void {
    const message = `[${action.toUpperCase()}] Node ID: ${nodeId}, Name: ${name}, Hash: ${fileHash}`;
    switch (action) {
      case 'create':
        this.logger.log(message);
        break;
      case 'reference':
        this.logger.debug(message);
        break;
      case 'delete':
        this.logger.warn(message);
        break;
    }
  }
}