///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 上传错误代码枚举
 */
export enum UploadErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  CHUNK_ALREADY_EXISTS = 'CHUNK_ALREADY_EXISTS',
  CHUNK_NOT_FOUND = 'CHUNK_NOT_FOUND',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  NODE_CREATION_FAILED = 'NODE_CREATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONCURRENT_OPERATION = 'CONCURRENT_OPERATION',
  INVALID_FILE = 'INVALID_FILE',
  STORAGE_ERROR = 'STORAGE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 上传错误类
 */
export class UploadError extends Error {
  /**
   * 错误代码
   */
  public readonly code: UploadErrorCode;

  /**
   * 错误详情
   */
  public readonly details?: Record<string, unknown>;

  constructor(
    code: UploadErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.details = details;

    // 维护正确的原型链
    Object.setPrototypeOf(this, UploadError.prototype);
  }

  /**
   * 创建文件不存在错误
   */
  static fileNotFound(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.FILE_NOT_FOUND,
      '文件不存在',
      details
    );
  }

  /**
   * 创建分片已存在错误
   */
  static chunkAlreadyExists(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.CHUNK_ALREADY_EXISTS,
      '分片已存在',
      details
    );
  }

  /**
   * 创建分片不存在错误
   */
  static chunkNotFound(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.CHUNK_NOT_FOUND,
      '分片不存在',
      details
    );
  }

  /**
   * 创建转换失败错误
   */
  static conversionFailed(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.CONVERSION_FAILED,
      '文件转换失败',
      details
    );
  }

  /**
   * 创建节点创建失败错误
   */
  static nodeCreationFailed(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.NODE_CREATION_FAILED,
      '节点创建失败',
      details
    );
  }

  /**
   * 创建权限拒绝错误
   */
  static permissionDenied(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.PERMISSION_DENIED,
      '权限不足',
      details
    );
  }

  /**
   * 创建并发操作错误
   */
  static concurrentOperation(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.CONCURRENT_OPERATION,
      '并发操作冲突',
      details
    );
  }

  /**
   * 创建无效文件错误
   */
  static invalidFile(details?: Record<string, unknown>): UploadError {
    return new UploadError(UploadErrorCode.INVALID_FILE, '无效的文件', details);
  }

  /**
   * 创建存储错误
   */
  static storageError(details?: Record<string, unknown>): UploadError {
    return new UploadError(
      UploadErrorCode.STORAGE_ERROR,
      '存储操作失败',
      details
    );
  }

  /**
   * 创建未知错误
   */
  static unknown(details?: Record<string, unknown>): UploadError {
    return new UploadError(UploadErrorCode.UNKNOWN_ERROR, '未知错误', details);
  }
}
