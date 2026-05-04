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
import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 验证权限是否有效
 */
export function isValidPermission(permission) {
    return Object.values(PrismaPermission).includes(permission);
}
/**
 * 获取所有有效的权限（返回数据库格式）
 */
export function getAllPermissions() {
    return Object.values(PrismaPermission);
}
/**
 * 应用字段级过滤
 *
 * @param context 字段过滤上下文
 * @param rules 字段权限规则列表
 * @param userPermissions 用户拥有的权限列表
 * @returns 字段过滤结果
 */
export function applyFieldFilter(context, rules, userPermissions) {
    const { resourceType, operation, requestedFields, allowAll } = context;
    // 如果允许所有字段，直接返回
    if (allowAll) {
        return {
            allowed: true,
            filteredFields: requestedFields,
        };
    }
    // 如果没有请求字段，默认允许
    if (!requestedFields || requestedFields.length === 0) {
        return {
            allowed: true,
            filteredFields: [],
        };
    }
    // 获取匹配的规则（按优先级排序）
    const matchingRules = rules
        .filter((rule) => rule.enabled &&
        rule.resourceType === resourceType &&
        rule.operation === operation &&
        userPermissions.includes(rule.requiredPermission))
        .sort((a, b) => b.priority - a.priority);
    // 如果没有匹配的规则，默认拒绝所有字段
    if (matchingRules.length === 0) {
        return {
            allowed: false,
            filteredFields: [],
            deniedFields: requestedFields,
            denialReason: 'No matching permission rule found',
        };
    }
    // 获取最高优先级的规则
    const primaryRule = matchingRules[0];
    // 收集所有拒绝的字段（从所有匹配的规则）
    const deniedFields = new Set();
    matchingRules.forEach((rule) => {
        rule.deniedFields.forEach((field) => deniedFields.add(field));
    });
    // 收集所有允许的字段（从最高优先级的规则）
    const allowedFields = new Set(primaryRule.allowedFields);
    // 计算最终允许的字段列表
    const finalAllowedFields = requestedFields.filter((field) => {
        // 如果在拒绝列表中，不允许
        if (deniedFields.has(field)) {
            return false;
        }
        // 如果规则明确允许，允许
        if (allowedFields.has(field)) {
            return true;
        }
        // 否则，如果规则没有指定允许列表，默认拒绝
        return primaryRule.allowedFields.length === 0;
    });
    // 计算最终拒绝的字段列表
    const finalDeniedFields = requestedFields.filter((field) => !finalAllowedFields.includes(field));
    return {
        allowed: finalAllowedFields.length > 0,
        filteredFields: finalAllowedFields,
        deniedFields: finalDeniedFields,
        denialReason: finalDeniedFields.length > 0
            ? `Fields denied: ${finalDeniedFields.join(', ')}`
            : undefined,
    };
}
/**
 * 创建默认字段权限规则
 *
 * @returns 默认规则列表
 */
export function createDefaultFieldPermissionRules() {
    return [
        {
            id: 'user-read-all',
            resourceType: 'User',
            requiredPermission: PrismaPermission.SYSTEM_USER_READ,
            operation: 'READ',
            allowedFields: [
                'id',
                'email',
                'username',
                'nickname',
                'avatar',
                'status',
            ],
            deniedFields: ['password', 'deletedAt'],
            priority: 100,
            description: '用户读取权限 - 允许读取基本字段，拒绝敏感字段',
            enabled: true,
        },
        {
            id: 'user-update-basic',
            resourceType: 'User',
            requiredPermission: PrismaPermission.SYSTEM_USER_UPDATE,
            operation: 'UPDATE',
            allowedFields: ['username', 'nickname', 'avatar'],
            deniedFields: ['id', 'email', 'password', 'status', 'deletedAt'],
            priority: 100,
            description: '用户更新权限 - 允许更新基本字段，拒绝敏感字段',
            enabled: true,
        },
        {
            id: 'user-delete-none',
            resourceType: 'User',
            requiredPermission: PrismaPermission.SYSTEM_USER_DELETE,
            operation: 'DELETE',
            allowedFields: [],
            deniedFields: ['*'],
            priority: 100,
            description: '用户删除权限 - 允许删除整个用户记录',
            enabled: true,
        },
    ];
}
/**
 * 验证字段过滤上下文
 */
export function validateFieldFilterContext(context) {
    if (!context.resourceType) {
        return false;
    }
    if (!['READ', 'UPDATE', 'DELETE'].includes(context.operation)) {
        return false;
    }
    return true;
}
//# sourceMappingURL=permission.utils.js.map