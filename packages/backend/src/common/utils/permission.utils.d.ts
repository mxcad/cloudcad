import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 权限检查上下文
 * 支持基于时间、位置、设备等上下文因素的权限控制
 */
export interface PermissionContext {
    /** 用户 IP 地址 */
    ipAddress?: string;
    /** 用户设备信息 */
    userAgent?: string;
    /** 检查时间（默认为当前时间） */
    time?: Date;
    /** 地理位置信息 */
    location?: string;
    /** 自定义上下文数据 */
    custom?: Record<string, unknown>;
    /** 元数据（策略引擎使用） */
    metadata?: Record<string, unknown>;
    /** 字段级过滤配置 */
    fieldFilter?: FieldFilterContext;
    /** 资源 ID（用于资源级权限检查） */
    resourceId?: string;
    /** 资源类型（用于资源级权限检查） */
    resourceType?: string;
}
/**
 * 字段级过滤上下文
 * 用于控制用户可以访问哪些字段
 */
export interface FieldFilterContext {
    /** 请求的资源类型 */
    resourceType: string;
    /** 请求的操作类型（READ, UPDATE, DELETE） */
    operation: 'READ' | 'UPDATE' | 'DELETE';
    /** 请求的字段列表 */
    requestedFields?: string[];
    /** 是否允许所有字段 */
    allowAll?: boolean;
    /** 显式允许的字段列表 */
    allowedFields?: string[];
    /** 显式拒绝的字段列表 */
    deniedFields?: string[];
}
/**
 * 字段级权限规则
 */
export interface FieldPermissionRule {
    /** 规则 ID */
    id: string;
    /** 资源类型 */
    resourceType: string;
    /** 权限要求 */
    requiredPermission: PrismaPermission;
    /** 操作类型 */
    operation: 'READ' | 'UPDATE' | 'DELETE';
    /** 允许的字段 */
    allowedFields: string[];
    /** 拒绝的字段 */
    deniedFields: string[];
    /** 规则优先级（数字越大优先级越高） */
    priority: number;
    /** 规则描述 */
    description?: string;
    /** 是否启用 */
    enabled: boolean;
}
/**
 * 字段过滤结果
 */
export interface FieldFilterResult {
    /** 是否允许访问 */
    allowed: boolean;
    /** 过滤后的字段列表 */
    filteredFields?: string[];
    /** 拒绝的字段列表 */
    deniedFields?: string[];
    /** 拒绝原因 */
    denialReason?: string;
}
/**
 * 上下文规则配置
 */
export interface ContextRule {
    /** 规则名称 */
    name: string;
    /** 适用的权限列表（空数组表示适用于所有权限） */
    permissions: string[];
    /** 规则是否启用 */
    enabled: boolean;
    /** 规则描述 */
    description: string;
}
/**
 * 验证权限是否有效
 */
export declare function isValidPermission(permission: string): boolean;
/**
 * 获取所有有效的权限（返回数据库格式）
 */
export declare function getAllPermissions(): string[];
/**
 * 应用字段级过滤
 *
 * @param context 字段过滤上下文
 * @param rules 字段权限规则列表
 * @param userPermissions 用户拥有的权限列表
 * @returns 字段过滤结果
 */
export declare function applyFieldFilter(context: FieldFilterContext, rules: FieldPermissionRule[], userPermissions: PrismaPermission[]): FieldFilterResult;
/**
 * 创建默认字段权限规则
 *
 * @returns 默认规则列表
 */
export declare function createDefaultFieldPermissionRules(): FieldPermissionRule[];
/**
 * 验证字段过滤上下文
 */
export declare function validateFieldFilterContext(context: FieldFilterContext): boolean;
//# sourceMappingURL=permission.utils.d.ts.map