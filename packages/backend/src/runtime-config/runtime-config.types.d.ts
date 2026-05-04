/**
 * 运行时配置值类型
 */
export type RuntimeConfigValueType = 'string' | 'number' | 'boolean';
/**
 * 运行时配置分类
 */
export type RuntimeConfigCategory = 'mail' | 'sms' | 'support' | 'file' | 'user' | 'system' | 'wechat' | 'storage';
/**
 * 运行时配置项定义
 */
export interface RuntimeConfigDefinition {
    key: string;
    type: RuntimeConfigValueType;
    category: RuntimeConfigCategory;
    description: string;
    defaultValue: string | number | boolean;
    isPublic: boolean;
}
/**
 * 运行时配置项（API 返回格式）
 */
export interface RuntimeConfigItem {
    key: string;
    value: string | number | boolean;
    type: RuntimeConfigValueType;
    category: RuntimeConfigCategory;
    description: string | null;
    isPublic: boolean;
    updatedBy: string | null;
    updatedAt: Date;
}
//# sourceMappingURL=runtime-config.types.d.ts.map