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
 * 存储相关常量定义
 */

/**
 * 存储路径相关常量
 */
export class StoragePathConstants {
  /** 存储路径前缀 */
  static readonly STORAGE_PATH_PREFIX = 'filesData';

  /** 日期格式 */
  static readonly DATE_FORMAT = 'YYYYMM';

  /** MXWEB 文件扩展名 */
  static readonly MXWEB_EXTENSION = '.mxweb';

  // CAD 扩展名校验走 env UPLOAD_ALLOWED_EXTENSIONS（configuration.ts →
  // file-validation.service）。此处刻意不声明常量：曾经的 ALLOWED_CAD_EXTENSIONS
  // 零读取方，一旦被引用就分叉出第二套与 env 不同步的安全边界。

  /** 文件哈希长度 */
  static readonly FILE_HASH_LENGTH = 32;
}

/**
 * 文件系统相关常量
 */
export class FileSystemConstants {
  /** 最大目录深度 */
  static readonly MAX_DIRECTORY_DEPTH = 10;

  /** 最大文件名长度 */
  static readonly MAX_FILENAME_LENGTH = 255;

  /** 目录名称模式 */
  static readonly DIRECTORY_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
}

/**
 * 安全相关常量
 */
export class SecurityConstants {
  /** 路径遍历检测字符 */
  static readonly PATH_TRAVERSAL_CHARS = ['..', '\\', '\0'] as const;

  // 禁止上传的扩展名走 env UPLOAD_BLOCKED_EXTENSIONS（configuration.ts →
  // file-validation.service）。曾经的 FORBIDDEN_EXTENSIONS 常量零读取方，
  // 且与 env 清单不一致（多了 .scr/.vbs），删掉以免两套黑名单各改一半。
}
