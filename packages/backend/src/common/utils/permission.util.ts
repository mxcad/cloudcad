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
export function isValidPermission(permission: string): boolean {
  return Object.values(PrismaPermission).includes(
    permission as PrismaPermission
  );
}

/**
 * 获取所有有效的权限（返回数据库格式）
 */
export function getAllPermissions(): string[] {
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
export function applyFieldFilter(
  context: FieldFilterContext,
  rules: FieldPermissionRule[],
  userPermissions: PrismaPermission[]
): FieldFilterResult {
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
    .filter(
      (rule) =>
        rule.enabled &&
        rule.resourceType === resourceType &&
        rule.operation === operation &&
        userPermissions.includes(rule.requiredPermission)
    )
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
  const deniedFields = new Set<string>();
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
  const finalDeniedFields = requestedFields.filter(
    (field) => !finalAllowedFields.includes(field)
  );

  return {
    allowed: finalAllowedFields.length > 0,
    filteredFields: finalAllowedFields,
    deniedFields: finalDeniedFields,
    denialReason:
      finalDeniedFields.length > 0
        ? `Fields denied: ${finalDeniedFields.join(', ')}`
        : undefined,
  };
}

/**
 * 创建默认字段权限规则
 *
 * @returns 默认规则列表
 */
export function createDefaultFieldPermissionRules(): FieldPermissionRule[] {
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
export function validateFieldFilterContext(
  context: FieldFilterContext
): boolean {
  if (!context.resourceType) {
    return false;
  }

  if (!['READ', 'UPDATE', 'DELETE'].includes(context.operation)) {
    return false;
  }

  return true;
}
