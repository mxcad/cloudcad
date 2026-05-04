/**
 * 缓存键生成工具
 * 提供统一的缓存键生成和解析方法
 */
/**
 * 缓存键前缀
 */
export declare enum CacheKeyPrefix {
    PERMISSION = "permission",
    ROLE = "role",
    USER = "user",
    USER_PERMISSIONS = "user:permissions",
    PROJECT = "project",
    PROJECT_PERMISSIONS = "project:permissions",
    FILE = "file",
    FILE_METADATA = "file:metadata",
    FILE_CONTENT = "file:content",
    FONT = "font",
    FONT_LIST = "font:list",
    AUDIT_LOG = "audit:log",
    CONFIG = "config",
    SETTINGS = "settings"
}
/**
 * 缓存键生成工具类
 */
export declare class CacheKeyUtil {
    /**
     * 生成权限缓存键
     */
    static permission(permissionId: number): string;
    /**
     * 生成角色缓存键
     */
    static role(roleId: number): string;
    /**
     * 生成用户缓存键
     */
    static user(userId: number): string;
    /**
     * 生成用户权限缓存键
     */
    static userPermissions(userId: number): string;
    /**
     * 生成项目缓存键
     */
    static project(projectId: number): string;
    /**
     * 生成项目权限缓存键
     */
    static projectPermissions(projectId: number): string;
    /**
     * 生成文件缓存键
     */
    static file(fileId: number): string;
    /**
     * 生成文件元数据缓存键
     */
    static fileMetadata(fileId: number): string;
    /**
     * 生成文件内容缓存键
     */
    static fileContent(fileId: number): string;
    /**
     * 生成字体缓存键
     */
    static font(fontId: number): string;
    /**
     * 生成字体列表缓存键
     */
    static fontList(): string;
    /**
     * 生成审计日志缓存键
     */
    static auditLog(logId: number): string;
    /**
     * 生成配置缓存键
     */
    static config(configKey: string): string;
    /**
     * 生成设置缓存键
     */
    static settings(userId: number): string;
    /**
     * 生成自定义缓存键
     */
    static custom(prefix: string, ...parts: Array<string | number>): string;
    /**
     * 解析缓存键
     */
    static parse(key: string): {
        prefix: string;
        parts: string[];
    };
    /**
     * 检查缓存键是否匹配前缀
     */
    static matchPrefix(key: string, prefix: CacheKeyPrefix | string): boolean;
    /**
     * 生成模式匹配的缓存键
     */
    static pattern(prefix: CacheKeyPrefix | string, ...parts: Array<string | number | '*'>): string;
    /**
     * 生成带命名空间的缓存键
     */
    static namespaced(namespace: string, key: string): string;
    /**
     * 生成带版本的缓存键
     */
    static versioned(key: string, version: string | number): string;
    /**
     * 生成带时间戳的缓存键
     */
    static timestamped(key: string, timestamp?: number): string;
    /**
     * 生成批量操作缓存键
     */
    static batch(operation: string, ...keys: string[]): string;
    /**
     * 验证缓存键格式
     */
    static validate(key: string): boolean;
    /**
     * 规范化缓存键
     */
    static normalize(key: string): string;
    /**
     * 生成缓存键哈希（用于长键）
     */
    static hash(key: string): string;
}
//# sourceMappingURL=cache-key.util.d.ts.map