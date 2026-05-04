/**
 * 缓存键哈希工具
 * 提供安全的缓存键哈希方法，用于长键或敏感键的处理
 */
/**
 * 哈希算法类型
 */
export declare enum HashAlgorithm {
    MD5 = "md5",
    SHA1 = "sha1",
    SHA256 = "sha256",
    SHA512 = "sha512"
}
/**
 * 缓存键哈希工具类
 */
export declare class CacheHashedKeyUtil {
    /**
     * 生成哈希键
     * @param key 原始键
     * @param algorithm 哈希算法，默认 SHA256
     * @returns 哈希后的键
     */
    static hash(key: string, algorithm?: HashAlgorithm): string;
    /**
     * 生成带前缀的哈希键
     * @param prefix 键前缀
     * @param key 原始键
     * @param algorithm 哈希算法
     * @returns 带前缀的哈希键
     */
    static hashWithPrefix(prefix: string, key: string, algorithm?: HashAlgorithm): string;
    /**
     * 批量生成哈希键
     * @param keys 原始键数组
     * @param algorithm 哈希算法
     * @returns 哈希键数组
     */
    static hashMany(keys: string[], algorithm?: HashAlgorithm): string[];
    /**
     * 生成短哈希键（使用前 N 个字符）
     * @param key 原始键
     * @param length 哈希长度，默认 8
     * @param algorithm 哈希算法
     * @returns 短哈希键
     */
    static shortHash(key: string, length?: number, algorithm?: HashAlgorithm): string;
    /**
     * 生成带版本的哈希键
     * @param key 原始键
     * @param version 版本号
     * @param algorithm 哈希算法
     * @returns 带版本的哈希键
     */
    static hashWithVersion(key: string, version: string | number, algorithm?: HashAlgorithm): string;
    /**
     * 生成带命名空间的哈希键
     * @param namespace 命名空间
     * @param key 原始键
     * @param algorithm 哈希算法
     * @returns 带命名空间的哈希键
     */
    static hashWithNamespace(namespace: string, key: string, algorithm?: HashAlgorithm): string;
    /**
     * 生成确定性哈希键（相同的输入总是产生相同的输出）
     * @param key 原始键
     * @param algorithm 哈希算法
     * @returns 确定性哈希键
     */
    static deterministicHash(key: string, algorithm?: HashAlgorithm): string;
    /**
     * 生成带盐的哈希键
     * @param key 原始键
     * @param salt 盐值
     * @param algorithm 哈希算法
     * @returns 带盐的哈希键
     */
    static hashWithSalt(key: string, salt: string, algorithm?: HashAlgorithm): string;
    /**
     * 检查键是否需要哈希
     * @param key 原始键
     * @param maxLength 最大长度，默认 250
     * @returns 是否需要哈希
     */
    static needsHashing(key: string, maxLength?: number): boolean;
    /**
     * 智能生成缓存键（根据键长度决定是否哈希）
     * @param key 原始键
     * @param prefix 键前缀
     * @param maxLength 最大长度，默认 250
     * @param algorithm 哈希算法
     * @returns 智能生成的缓存键
     */
    static smartHash(key: string, prefix?: string, maxLength?: number, algorithm?: HashAlgorithm): string;
    /**
     * 生成键的指纹（用于比较键是否相同）
     * @param key 原始键
     * @param algorithm 哈希算法
     * @returns 键指纹
     */
    static fingerprint(key: string, algorithm?: HashAlgorithm): string;
    /**
     * 验证哈希键
     * @param key 原始键
     * @param hashedKey 哈希键
     * @param algorithm 哈希算法
     * @returns 是否匹配
     */
    static verifyHash(key: string, hashedKey: string, algorithm?: HashAlgorithm): boolean;
    /**
     * 生成多级哈希键
     * @param parts 键的部分数组
     * @param separator 分隔符，默认 ':'
     * @param algorithm 哈希算法
     * @returns 多级哈希键
     */
    static multiLevelHash(parts: string[], separator?: string, algorithm?: HashAlgorithm): string;
    /**
     * 生成带时间戳的哈希键
     * @param key 原始键
     * @param timestamp 时间戳
     * @param algorithm 哈希算法
     * @returns 带时间戳的哈希键
     */
    static hashWithTimestamp(key: string, timestamp?: number, algorithm?: HashAlgorithm): string;
    /**
     * 生成唯一哈希键（使用 UUID 或随机数）
     * @param prefix 前缀
     * @param algorithm 哈希算法
     * @returns 唯一哈希键
     */
    static uniqueHash(prefix?: string, algorithm?: HashAlgorithm): string;
    /**
     * 压缩哈希键（使用 Base64 编码）
     * @param key 原始键
     * @param algorithm 哈希算法
     * @returns 压缩后的哈希键
     */
    static compressedHash(key: string, algorithm?: HashAlgorithm): string;
    /**
     * 生成可读的哈希键（使用 36 进制）
     * @param key 原始键
     * @param algorithm 哈希算法
     * @returns 可读的哈希键
     */
    static readableHash(key: string, algorithm?: HashAlgorithm): string;
}
//# sourceMappingURL=cache-hashed-key.util.d.ts.map