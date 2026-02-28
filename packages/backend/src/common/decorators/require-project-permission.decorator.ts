import 'reflect-metadata';
import { ProjectPermission } from '../enums/permissions.enum';

/**
 * 项目权限检查模式
 */
export enum ProjectPermissionCheckMode {
  /** 所有权限都必须满足（AND 逻辑） */
  ALL = 'ALL',
  /** 满足任意一个权限即可（OR 逻辑） */
  ANY = 'ANY',
}

/**
 * 项目权限检查元数据键
 */
export const REQUIRE_PROJECT_PERMISSION_KEY = 'require_project_permissions';

/**
 * 项目权限检查模式元数据键
 */
export const REQUIRE_PROJECT_PERMISSION_MODE_KEY =
  'require_project_permissions_mode';

/**
 * 要求特定项目权限的装饰器
 *
 * @example
 * // 要求单个权限
 * @RequireProjectPermission(ProjectPermission.FILE_READ)
 *
 * @example
 * // 要求所有权限（AND 逻辑，默认）
 * @RequireProjectPermission(ProjectPermission.FILE_READ, ProjectPermission.FILE_WRITE)
 *
 * @example
 * // 要求任意一个权限（OR 逻辑）
 * @RequireProjectPermission(
 *   ProjectPermission.FILE_READ,
 *   ProjectPermission.FILE_WRITE,
 *   { mode: ProjectPermissionCheckMode.ANY }
 * )
 *
 * @param permissions 项目权限列表
 * @param options 可选配置，包含 mode 检查模式
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RequireProjectPermission(
  ...permissions: (ProjectPermission | { mode: ProjectPermissionCheckMode })[]
): MethodDecorator & ClassDecorator {
  // 提取选项（最后一个参数如果是对象则认为是选项）
  const lastArg = permissions[permissions.length - 1];
  const options =
    typeof lastArg === 'object' && 'mode' in lastArg
      ? (lastArg as { mode: ProjectPermissionCheckMode })
      : { mode: ProjectPermissionCheckMode.ALL };

  // 提取实际的权限列表
  const actualPermissions = permissions.filter(
    (p): p is ProjectPermission => typeof p === 'string'
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any, propertyKey?: any, descriptor?: any): any => {
    // 支持类装饰器和方法装饰器
    if (propertyKey === undefined || descriptor === undefined) {
      // 类装饰器
      Reflect.defineMetadata(
        REQUIRE_PROJECT_PERMISSION_KEY,
        actualPermissions,
        target
      );
      Reflect.defineMetadata(
        REQUIRE_PROJECT_PERMISSION_MODE_KEY,
        options.mode,
        target
      );
      return target;
    }

    // 方法装饰器
    Reflect.defineMetadata(
      REQUIRE_PROJECT_PERMISSION_KEY,
      actualPermissions,
      target,
      propertyKey
    );
    Reflect.defineMetadata(
      REQUIRE_PROJECT_PERMISSION_MODE_KEY,
      options.mode,
      target,
      propertyKey
    );
    return descriptor;
  };
}
