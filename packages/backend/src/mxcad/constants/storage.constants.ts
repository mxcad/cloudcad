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