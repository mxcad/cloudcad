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
 * 缓存键生成工具
 * 提供统一的缓存键生成和解析方法
 */

/**
 * 缓存键前缀
 */
export enum CacheKeyPrefix {
  // 权限相关
  PERMISSION = 'permission',
  ROLE = 'role',
  USER = 'user',
  USER_PERMISSIONS = 'user:permissions',

  // 项目相关
  PROJECT = 'project',
  PROJECT_PERMISSIONS = 'project:permissions',

  // 文件相关
  FILE = 'file',
  FILE_METADATA = 'file:metadata',
  FILE_CONTENT = 'file:content',

  // 图库相关
  GALLERY = 'gallery',
  GALLERY_ITEMS = 'gallery:items',

  // 字体相关
  FONT = 'font',
  FONT_LIST = 'font:list',

  // 审计日志
  AUDIT_LOG = 'audit:log',

  // 系统配置
  CONFIG = 'config',
  SETTINGS = 'settings',
}

/**
 * 缓存键生成工具类
 */
export class CacheKeyUtil {
  /**
   * 生成权限缓存键
   */
  static permission(permissionId: number): string {
    return `${CacheKeyPrefix.PERMISSION}:${permissionId}`;
  }

  /**
   * 生成角色缓存键
   */
  static role(roleId: number): string {
    return `${CacheKeyPrefix.ROLE}:${roleId}`;
  }

  /**
   * 生成用户缓存键
   */
  static user(userId: number): string {
    return `${CacheKeyPrefix.USER}:${userId}`;
  }

  /**
   * 生成用户权限缓存键
   */
  static userPermissions(userId: number): string {
    return `${CacheKeyPrefix.USER_PERMISSIONS}:${userId}`;
  }

  /**
   * 生成项目缓存键
   */
  static project(projectId: number): string {
    return `${CacheKeyPrefix.PROJECT}:${projectId}`;
  }

  /**
   * 生成项目权限缓存键
   */
  static projectPermissions(projectId: number): string {
    return `${CacheKeyPrefix.PROJECT_PERMISSIONS}:${projectId}`;
  }

  /**
   * 生成文件缓存键
   */
  static file(fileId: number): string {
    return `${CacheKeyPrefix.FILE}:${fileId}`;
  }

  /**
   * 生成文件元数据缓存键
   */
  static fileMetadata(fileId: number): string {
    return `${CacheKeyPrefix.FILE_METADATA}:${fileId}`;
  }

  /**
   * 生成文件内容缓存键
   */
  static fileContent(fileId: number): string {
    return `${CacheKeyPrefix.FILE_CONTENT}:${fileId}`;
  }

  /**
   * 生成图库缓存键
   */
  static gallery(galleryId: number): string {
    return `${CacheKeyPrefix.GALLERY}:${galleryId}`;
  }

  /**
   * 生成图库项目缓存键
   */
  static galleryItems(galleryId: number): string {
    return `${CacheKeyPrefix.GALLERY_ITEMS}:${galleryId}`;
  }

  /**
   * 生成字体缓存键
   */
  static font(fontId: number): string {
    return `${CacheKeyPrefix.FONT}:${fontId}`;
  }

  /**
   * 生成字体列表缓存键
   */
  static fontList(): string {
    return CacheKeyPrefix.FONT_LIST;
  }

  /**
   * 生成审计日志缓存键
   */
  static auditLog(logId: number): string {
    return `${CacheKeyPrefix.AUDIT_LOG}:${logId}`;
  }

  /**
   * 生成配置缓存键
   */
  static config(configKey: string): string {
    return `${CacheKeyPrefix.CONFIG}:${configKey}`;
  }

  /**
   * 生成设置缓存键
   */
  static settings(userId: number): string {
    return `${CacheKeyPrefix.SETTINGS}:${userId}`;
  }

  /**
   * 生成自定义缓存键
   */
  static custom(prefix: string, ...parts: Array<string | number>): string {
    return [prefix, ...parts.map(String)].join(':');
  }

  /**
   * 解析缓存键
   */
  static parse(key: string): {
    prefix: string;
    parts: string[];
  } {
    const parts = key.split(':');
    return {
      prefix: parts[0],
      parts: parts.slice(1),
    };
  }

  /**
   * 检查缓存键是否匹配前缀
   */
  static matchPrefix(key: string, prefix: CacheKeyPrefix | string): boolean {
    return key.startsWith(`${prefix}:`);
  }

  /**
   * 生成模式匹配的缓存键
   */
  static pattern(
    prefix: CacheKeyPrefix | string,
    ...parts: Array<string | number | '*'>
  ): string {
    return [prefix, ...parts.map(String)].join(':');
  }

  /**
   * 生成带命名空间的缓存键
   */
  static namespaced(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * 生成带版本的缓存键
   */
  static versioned(key: string, version: string | number): string {
    return `${key}:v${version}`;
  }

  /**
   * 生成带时间戳的缓存键
   */
  static timestamped(key: string, timestamp?: number): string {
    return `${key}:t${timestamp ?? Date.now()}`;
  }

  /**
   * 生成批量操作缓存键
   */
  static batch(operation: string, ...keys: string[]): string {
    return `batch:${operation}:${keys.join(',')}`;
  }

  /**
   * 验证缓存键格式
   */
  static validate(key: string): boolean {
    // 缓存键不能为空
    if (!key || key.length === 0) {
      return false;
    }

    // 缓存键不能包含特殊字符
    const invalidChars = /[^\w\-:.,*]/;
    if (invalidChars.test(key)) {
      return false;
    }

    // 缓存键长度限制（Redis 最大 512MB，建议不超过 1KB）
    if (key.length > 1024) {
      return false;
    }

    return true;
  }

  /**
   * 规范化缓存键
   */
  static normalize(key: string): string {
    // 转换为小写
    key = key.toLowerCase();

    // 替换空格为下划线
    key = key.replace(/\s+/g, '_');

    // 移除特殊字符
    key = key.replace(/[^\w\-:.,*]/g, '');

    return key;
  }

  /**
   * 生成缓存键哈希（用于长键）
   */
  static hash(key: string): string {
    // 简单的哈希函数（实际项目中建议使用 crypto 模块）
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return `hash:${Math.abs(hash).toString(36)}`;
  }
}
