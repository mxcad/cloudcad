import { Permission } from '../enums/permissions.enum';
/**
 * 权限检查模式
 */
export declare enum PermissionCheckMode {
    /** 所有权限都必须满足（AND 逻辑） */
    ALL = "ALL",
    /** 满足任意一个权限即可（OR 逻辑） */
    ANY = "ANY"
}
/**
 * 权限检查元数据键
 */
export declare const PERMISSIONS_KEY = "permissions";
/**
 * 权限检查模式元数据键
 */
export declare const PERMISSIONS_MODE_KEY = "permissions_mode";
/**
 * 要求特定权限的装饰器
 *
 * 使用 NestJS 官方的 SetMetadata + applyDecorators 组合，
 * 确保元数据能被 Reflector.getAllAndOverride 正确读取。
 *
 * @example
 * // 要求所有权限（AND 逻辑，默认）
 * @RequirePermissions([Permission.FILE_READ, Permission.FILE_WRITE])
 *
 * @example
 * // 要求任意一个权限（OR 逻辑）
 * @RequirePermissions([Permission.FILE_READ, Permission.FILE_WRITE], PermissionCheckMode.ANY)
 *
 * @param permissions 权限列表
 * @param mode 权限检查模式，默认为 ALL
 */
export declare const RequirePermissions: (permissions: Permission[], mode?: PermissionCheckMode) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
//# sourceMappingURL=require-permissions.decorator.d.ts.map