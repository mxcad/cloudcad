import { SetMetadata } from '@nestjs/common';
import { Permission } from '../enums/permissions.enum';

/**
 * 权限检查模式
 */
export enum PermissionCheckMode {
  /** 所有权限都必须满足（AND 逻辑） */
  ALL = 'ALL',
  /** 满足任意一个权限即可（OR 逻辑） */
  ANY = 'ANY',
}

/**
 * 权限检查元数据键
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * 权限检查模式元数据键
 */
export const PERMISSIONS_MODE_KEY = 'permissions_mode';

/**
 * 要求特定权限的装饰器
 *
 * @example
 * // 要求所有权限（AND 逻辑）
 * @RequirePermissions(Permission.FILE_READ, Permission.FILE_WRITE)
 *
 * @example
 * // 要求任意一个权限（OR 逻辑）
 * @RequirePermissions([Permission.FILE_READ, Permission.FILE_WRITE], PermissionCheckMode.ANY)
 *
 * @param permissions 权限列表
 * @param mode 权限检查模式，默认为 ALL
 */
export const RequirePermissions = (
  permissions: Permission[],
  mode: PermissionCheckMode = PermissionCheckMode.ALL
) => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor
  ) => {
    // 支持类装饰器（propertyKey 和 descriptor 为 undefined）
    if (propertyKey === undefined || descriptor === undefined) {
      // 使用 Reflect.defineMetadata 将元数据附加到类构造函数
      Reflect.defineMetadata(PERMISSIONS_KEY, permissions, target);
      Reflect.defineMetadata(PERMISSIONS_MODE_KEY, mode, target);
      return target;
    }

    // 支持方法装饰器
    SetMetadata(PERMISSIONS_KEY, permissions);
    SetMetadata(PERMISSIONS_MODE_KEY, mode);
    return descriptor;
  };
};
