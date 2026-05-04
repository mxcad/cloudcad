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
 * 缓存键生成工具
 * 提供统一的缓存键生成和解析方法
 */
/**
 * 缓存键前缀
 */
export var CacheKeyPrefix;
(function (CacheKeyPrefix) {
    // 权限相关
    CacheKeyPrefix["PERMISSION"] = "permission";
    CacheKeyPrefix["ROLE"] = "role";
    CacheKeyPrefix["USER"] = "user";
    CacheKeyPrefix["USER_PERMISSIONS"] = "user:permissions";
    // 项目相关
    CacheKeyPrefix["PROJECT"] = "project";
    CacheKeyPrefix["PROJECT_PERMISSIONS"] = "project:permissions";
    // 文件相关
    CacheKeyPrefix["FILE"] = "file";
    CacheKeyPrefix["FILE_METADATA"] = "file:metadata";
    CacheKeyPrefix["FILE_CONTENT"] = "file:content";
    // 字体相关
    CacheKeyPrefix["FONT"] = "font";
    CacheKeyPrefix["FONT_LIST"] = "font:list";
    // 审计日志
    CacheKeyPrefix["AUDIT_LOG"] = "audit:log";
    // 系统配置
    CacheKeyPrefix["CONFIG"] = "config";
    CacheKeyPrefix["SETTINGS"] = "settings";
})(CacheKeyPrefix || (CacheKeyPrefix = {}));
/**
 * 缓存键生成工具类
 */
export class CacheKeyUtil {
    /**
     * 生成权限缓存键
     */
    static permission(permissionId) {
        return `${CacheKeyPrefix.PERMISSION}:${permissionId}`;
    }
    /**
     * 生成角色缓存键
     */
    static role(roleId) {
        return `${CacheKeyPrefix.ROLE}:${roleId}`;
    }
    /**
     * 生成用户缓存键
     */
    static user(userId) {
        return `${CacheKeyPrefix.USER}:${userId}`;
    }
    /**
     * 生成用户权限缓存键
     */
    static userPermissions(userId) {
        return `${CacheKeyPrefix.USER_PERMISSIONS}:${userId}`;
    }
    /**
     * 生成项目缓存键
     */
    static project(projectId) {
        return `${CacheKeyPrefix.PROJECT}:${projectId}`;
    }
    /**
     * 生成项目权限缓存键
     */
    static projectPermissions(projectId) {
        return `${CacheKeyPrefix.PROJECT_PERMISSIONS}:${projectId}`;
    }
    /**
     * 生成文件缓存键
     */
    static file(fileId) {
        return `${CacheKeyPrefix.FILE}:${fileId}`;
    }
    /**
     * 生成文件元数据缓存键
     */
    static fileMetadata(fileId) {
        return `${CacheKeyPrefix.FILE_METADATA}:${fileId}`;
    }
    /**
     * 生成文件内容缓存键
     */
    static fileContent(fileId) {
        return `${CacheKeyPrefix.FILE_CONTENT}:${fileId}`;
    }
    /**
     * 生成字体缓存键
     */
    static font(fontId) {
        return `${CacheKeyPrefix.FONT}:${fontId}`;
    }
    /**
     * 生成字体列表缓存键
     */
    static fontList() {
        return CacheKeyPrefix.FONT_LIST;
    }
    /**
     * 生成审计日志缓存键
     */
    static auditLog(logId) {
        return `${CacheKeyPrefix.AUDIT_LOG}:${logId}`;
    }
    /**
     * 生成配置缓存键
     */
    static config(configKey) {
        return `${CacheKeyPrefix.CONFIG}:${configKey}`;
    }
    /**
     * 生成设置缓存键
     */
    static settings(userId) {
        return `${CacheKeyPrefix.SETTINGS}:${userId}`;
    }
    /**
     * 生成自定义缓存键
     */
    static custom(prefix, ...parts) {
        return [prefix, ...parts.map(String)].join(':');
    }
    /**
     * 解析缓存键
     */
    static parse(key) {
        const parts = key.split(':');
        return {
            prefix: parts[0],
            parts: parts.slice(1),
        };
    }
    /**
     * 检查缓存键是否匹配前缀
     */
    static matchPrefix(key, prefix) {
        return key.startsWith(`${prefix}:`);
    }
    /**
     * 生成模式匹配的缓存键
     */
    static pattern(prefix, ...parts) {
        return [prefix, ...parts.map(String)].join(':');
    }
    /**
     * 生成带命名空间的缓存键
     */
    static namespaced(namespace, key) {
        return `${namespace}:${key}`;
    }
    /**
     * 生成带版本的缓存键
     */
    static versioned(key, version) {
        return `${key}:v${version}`;
    }
    /**
     * 生成带时间戳的缓存键
     */
    static timestamped(key, timestamp) {
        return `${key}:t${timestamp ?? Date.now()}`;
    }
    /**
     * 生成批量操作缓存键
     */
    static batch(operation, ...keys) {
        return `batch:${operation}:${keys.join(',')}`;
    }
    /**
     * 验证缓存键格式
     */
    static validate(key) {
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
    static normalize(key) {
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
    static hash(key) {
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
//# sourceMappingURL=cache-key.utils.js.map