/**
 * 更新运行时配置 DTO
 */
export declare class UpdateRuntimeConfigDto {
    value: string | number | boolean;
}
/**
 * 运行时配置项响应 DTO
 */
export declare class RuntimeConfigResponseDto {
    key: string;
    value: string | number | boolean;
    type: string;
    category: string;
    description?: string;
    isPublic: boolean;
    updatedBy?: string;
    updatedAt: Date;
}
/**
 * 运行时配置定义 DTO
 */
export declare class RuntimeConfigDefinitionDto {
    key: string;
    type: string;
    category: string;
    description: string;
    defaultValue: string | number | boolean;
    isPublic: boolean;
}
//# sourceMappingURL=runtime-config.dto.d.ts.map