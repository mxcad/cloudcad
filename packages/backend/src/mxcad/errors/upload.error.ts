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

import { HttpException, HttpStatus } from '@nestjs/common';

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

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * UploadErrorCode 到 HTTP 状态码的映射
 */
const UPLOAD_ERROR_HTTP_STATUS: Record<UploadErrorCode, HttpStatus> = {
  [UploadErrorCode.FILE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [UploadErrorCode.CHUNK_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [UploadErrorCode.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [UploadErrorCode.CHUNK_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [UploadErrorCode.CONCURRENT_OPERATION]: HttpStatus.CONFLICT,
  [UploadErrorCode.INVALID_FILE]: HttpStatus.BAD_REQUEST,
  [UploadErrorCode.CONVERSION_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [UploadErrorCode.NODE_CREATION_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [UploadErrorCode.STORAGE_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [UploadErrorCode.UNKNOWN_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * 上传错误类
 * 继承 HttpException，确保被 NestJS 全局异常过滤器正确处理
 */
export class UploadError extends HttpException {
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
    const status =
      UPLOAD_ERROR_HTTP_STATUS[code] || HttpStatus.INTERNAL_SERVER_ERROR;
    super({ code, message, details }, status);
    this.name = 'UploadError';
    this.code = code;
    this.details = details;
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
