/**
 * 存储相关常量定义
 */

/**
 * 存储路径相关常量
 */
export class StoragePathConstants {
  /** 存储路径前缀 */
  static readonly STORAGE_PATH_PREFIX = 'filesData';

  /** MXWEB 文件访问路径前缀 */
  static readonly MXWEB_ACCESS_PREFIX = '/mxcad/';

  /** 日期格式 */
  static readonly DATE_FORMAT = 'YYYYMM';

  /** MXWEB 文件扩展名 */
  static readonly MXWEB_EXTENSION = '.mxweb';
}

/**
 * 安全相关常量
 */
export class SecurityConstants {
  /** 路径遍历检测字符 */
  static readonly PATH_TRAVERSAL_CHARS = ['..', '\\', '\0'];

  /** 路径分隔符（用于检测） */
  static readonly PATH_SEPARATORS = ['/', '\\'];
}

/**
 * 验证工具类
 */
export class ValidationHelper {
  /**
   * 验证节点路径格式
   * @param nodePath 节点路径（格式：filesData/YYYYMM/nodeId/file.dwg.mxweb）
   * @returns 是否有效
   */
  static isValidNodePath(nodePath: string): boolean {
    if (!nodePath || nodePath.length === 0) {
      return false;
    }

    // 检查路径前缀
    if (!nodePath.startsWith(StoragePathConstants.STORAGE_PATH_PREFIX)) {
      return false;
    }

    // 检查路径遍历字符
    for (const char of SecurityConstants.PATH_TRAVERSAL_CHARS) {
      if (nodePath.includes(char)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 验证文件扩展名
   * @param fileName 文件名
   * @param allowedExtensions 允许的扩展名列表
   * @returns 是否有效
   */
  static isValidFileExtension(
    fileName: string,
    allowedExtensions: string[]
  ): boolean {
    if (!fileName) {
      return false;
    }

    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    return allowedExtensions.includes(ext);
  }
}
