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

import { createHash } from 'crypto';

/**
 * 缓存键哈希工具
 * 提供安全的缓存键哈希方法，用于长键或敏感键的处理
 */

/**
 * 哈希算法类型
 */
export enum HashAlgorithm {
  MD5 = 'md5',
  SHA1 = 'sha1',
  SHA256 = 'sha256',
  SHA512 = 'sha512',
}

/**
 * 缓存键哈希工具类
 */
export class CacheHashedKeyUtil {
  /**
   * 生成哈希键
   * @param key 原始键
   * @param algorithm 哈希算法，默认 SHA256
   * @returns 哈希后的键
   */
  static hash(
    key: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hash = createHash(algorithm);
    hash.update(key);
    return hash.digest('hex');
  }

  /**
   * 生成带前缀的哈希键
   * @param prefix 键前缀
   * @param key 原始键
   * @param algorithm 哈希算法
   * @returns 带前缀的哈希键
   */
  static hashWithPrefix(
    prefix: string,
    key: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hashedKey = this.hash(key, algorithm);
    return `${prefix}:${hashedKey}`;
  }

  /**
   * 批量生成哈希键
   * @param keys 原始键数组
   * @param algorithm 哈希算法
   * @returns 哈希键数组
   */
  static hashMany(
    keys: string[],
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string[] {
    return keys.map((key) => this.hash(key, algorithm));
  }

  /**
   * 生成短哈希键（使用前 N 个字符）
   * @param key 原始键
   * @param length 哈希长度，默认 8
   * @param algorithm 哈希算法
   * @returns 短哈希键
   */
  static shortHash(
    key: string,
    length: number = 8,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hashedKey = this.hash(key, algorithm);
    return hashedKey.substring(0, length);
  }

  /**
   * 生成带版本的哈希键
   * @param key 原始键
   * @param version 版本号
   * @param algorithm 哈希算法
   * @returns 带版本的哈希键
   */
  static hashWithVersion(
    key: string,
    version: string | number,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hashedKey = this.hash(key, algorithm);
    return `${hashedKey}:v${version}`;
  }

  /**
   * 生成带命名空间的哈希键
   * @param namespace 命名空间
   * @param key 原始键
   * @param algorithm 哈希算法
   * @returns 带命名空间的哈希键
   */
  static hashWithNamespace(
    namespace: string,
    key: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hashedKey = this.hash(key, algorithm);
    return `${namespace}:${hashedKey}`;
  }

  /**
   * 生成确定性哈希键（相同的输入总是产生相同的输出）
   * @param key 原始键
   * @param algorithm 哈希算法
   * @returns 确定性哈希键
   */
  static deterministicHash(
    key: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    return this.hash(key, algorithm);
  }

  /**
   * 生成带盐的哈希键
   * @param key 原始键
   * @param salt 盐值
   * @param algorithm 哈希算法
   * @returns 带盐的哈希键
   */
  static hashWithSalt(
    key: string,
    salt: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hash = createHash(algorithm);
    hash.update(key);
    hash.update(salt);
    return hash.digest('hex');
  }

  /**
   * 检查键是否需要哈希
   * @param key 原始键
   * @param maxLength 最大长度，默认 250
   * @returns 是否需要哈希
   */
  static needsHashing(key: string, maxLength: number = 250): boolean {
    return key.length > maxLength;
  }

  /**
   * 智能生成缓存键（根据键长度决定是否哈希）
   * @param key 原始键
   * @param prefix 键前缀
   * @param maxLength 最大长度，默认 250
   * @param algorithm 哈希算法
   * @returns 智能生成的缓存键
   */
  static smartHash(
    key: string,
    prefix: string = '',
    maxLength: number = 250,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    if (this.needsHashing(key, maxLength)) {
      const hashedKey = this.hash(key, algorithm);
      return prefix ? `${prefix}:${hashedKey}` : hashedKey;
    }
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * 生成键的指纹（用于比较键是否相同）
   * @param key 原始键
   * @param algorithm 哈希算法
   * @returns 键指纹
   */
  static fingerprint(
    key: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    return this.hash(key, algorithm);
  }

  /**
   * 验证哈希键
   * @param key 原始键
   * @param hashedKey 哈希键
   * @param algorithm 哈希算法
   * @returns 是否匹配
   */
  static verifyHash(
    key: string,
    hashedKey: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): boolean {
    const computedHash = this.hash(key, algorithm);
    return computedHash === hashedKey;
  }

  /**
   * 生成多级哈希键
   * @param parts 键的部分数组
   * @param separator 分隔符，默认 ':'
   * @param algorithm 哈希算法
   * @returns 多级哈希键
   */
  static multiLevelHash(
    parts: string[],
    separator: string = ':',
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const joinedKey = parts.join(separator);
    return this.hash(joinedKey, algorithm);
  }

  /**
   * 生成带时间戳的哈希键
   * @param key 原始键
   * @param timestamp 时间戳
   * @param algorithm 哈希算法
   * @returns 带时间戳的哈希键
   */
  static hashWithTimestamp(
    key: string,
    timestamp: number = Date.now(),
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hash = createHash(algorithm);
    hash.update(key);
    hash.update(timestamp.toString());
    return hash.digest('hex');
  }

  /**
   * 生成唯一哈希键（使用 UUID 或随机数）
   * @param prefix 前缀
   * @param algorithm 哈希算法
   * @returns 唯一哈希键
   */
  static uniqueHash(
    prefix: string = 'unique',
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const randomKey = `${prefix}:${Date.now()}:${Math.random()}`;
    return this.hash(randomKey, algorithm);
  }

  /**
   * 压缩哈希键（使用 Base64 编码）
   * @param key 原始键
   * @param algorithm 哈希算法
   * @returns 压缩后的哈希键
   */
  static compressedHash(
    key: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hashedKey = this.hash(key, algorithm);
    return Buffer.from(hashedKey, 'hex').toString('base64').substring(0, 32);
  }

  /**
   * 生成可读的哈希键（使用 36 进制）
   * @param key 原始键
   * @param algorithm 哈希算法
   * @returns 可读的哈希键
   */
  static readableHash(
    key: string,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ): string {
    const hashedKey = this.hash(key, algorithm);
    return parseInt(hashedKey.substring(0, 16), 16).toString(36);
  }
}
