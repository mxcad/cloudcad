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

  /** 支持的 CAD 文件扩展名 */
  static readonly ALLOWED_CAD_EXTENSIONS = ['.dwg', '.dxf'] as const;

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

  /** 禁止的文件扩展名 */
  static readonly FORBIDDEN_EXTENSIONS = [
    '.exe',
    '.bat',
    '.sh',
    '.cmd',
    '.ps1',
    '.scr',
    '.vbs',
  ] as const;
}
