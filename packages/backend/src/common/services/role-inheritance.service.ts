import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SystemRole, SystemPermission, SYSTEM_ROLE_HIERARCHY } from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';

/**
 * 角色基本信息接口
 */
interface RoleBasicInfo {
  id: string;
  name: string;
  description: string | null;
  category: string;
  level: number;
  isSystem: boolean;
}

/**
 * 角色层级节点接口
 */
export interface RoleHierarchyNode {
  id: string;
  name: string;
  description?: string;
  category: string;
  level: number;
  isSystem: boolean;
  children: RoleHierarchyNode[];
}

/**
 * 角色继承服务
 *
 * 功能：
 * 1. 获取角色的所有权限（包括继承的权限）
 * 2. 检查角色是否继承自另一个角色
 * 3. 获取角色层级路径
 * 4. 缓存角色继承关系优化性能
 */
@Injectable()
export class RoleInheritanceService implements OnModuleInit {
  private readonly logger = new Logger(RoleInheritanceService.name);

  // 最大层级深度限制，防止无限递归
  private static readonly MAX_HIERARCHY_DEPTH = 50;

  // 缓存时间配置（毫秒）
  private static readonly CACHE_TTL = {
    PERMISSION: 10 * 60 * 1000,  // 10 分钟 - 角色权限
    INHERITANCE: 10 * 60 * 1000, // 10 分钟 - 继承关系
    PATH: 15 * 60 * 1000,        // 15 分钟 - 层级路径
  };

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService
  ) {}

  /**
   * 获取角色的所有权限（包括继承的权限）
   * 使用 CTE 批量查询优化递归查询
   *
   * @param roleName 角色名称
   * @returns 角色拥有的所有权限（包括从父角色继承的权限）
   */
  async getRolePermissions(
    roleName: SystemRole
  ): Promise<SystemPermission[]> {
    const cacheKey = `role:permissions:${roleName}`;
    const cached = await this.cacheService.get<SystemPermission[] | 'null'>(cacheKey);

    if (cached !== undefined) {
      return cached === 'null' ? [] : (cached as SystemPermission[]);
    }

    try {
      // 使用 CTE 批量查询角色及其所有祖先角色的权限
      const result = await this.prisma.$queryRaw<Array<{ permission: string }>>`
        WITH RECURSIVE role_hierarchy AS (
          SELECT id, name, parent_id, 0 AS depth
          FROM roles
          WHERE name = ${roleName}
          UNION ALL
          SELECT r.id, r.name, r.parent_id, rh.depth + 1
          FROM roles r
          JOIN role_hierarchy rh ON r.id = rh.parent_id
          WHERE r.parent_id IS NOT NULL AND rh.depth < ${RoleInheritanceService.MAX_HIERARCHY_DEPTH}
        )
        SELECT DISTINCT rp.permission
        FROM role_hierarchy rh
        JOIN role_permissions rp ON rh.id = rp.role_id
      `;

      const allPermissions = result.map((r) => r.permission as SystemPermission);

      // 缓存结果（支持空结果）
      if (allPermissions.length === 0) {
        this.cacheService.set(cacheKey, 'null', RoleInheritanceService.CACHE_TTL.PERMISSION);
      } else {
        this.cacheService.set(cacheKey, allPermissions, RoleInheritanceService.CACHE_TTL.PERMISSION);
      }

      return allPermissions;
    } catch (error) {
      this.logger.error(`获取角色权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 检查角色是否继承自另一个角色（使用 CTE 批量查询优化）
   *
   * @param childRoleName 子角色名称
   * @param parentRoleName 父角色名称
   * @returns 是否继承自该父角色
   */
  async isInheritedFrom(
    childRoleName: SystemRole,
    parentRoleName: SystemRole
  ): Promise<boolean> {
    const cacheKey = `role:inherit:${childRoleName}:${parentRoleName}`;
    const cached = await this.cacheService.get<boolean>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    try {
      // 使用 CTE 批量查询获取完整继承路径
      const result = await this.prisma.$queryRaw<Array<{ ancestors: string[] | null }>>`
        WITH RECURSIVE role_path AS (
          SELECT id, name, parent_id, ARRAY[name] AS ancestors, 0 AS depth
          FROM roles WHERE name = ${childRoleName}
          UNION ALL
          SELECT r.id, r.name, r.parent_id, rp.ancestors || r.name, rp.depth + 1
          FROM roles r
          JOIN role_path rp ON r.id = rp.parent_id
          WHERE r.parent_id IS NOT NULL AND rp.depth < ${RoleInheritanceService.MAX_HIERARCHY_DEPTH}
        )
        SELECT ancestors FROM role_path
      `;

      if (result.length === 0 || result[0]?.ancestors === null) {
        this.cacheService.set(cacheKey, false, RoleInheritanceService.CACHE_TTL.INHERITANCE);
        return false;
      }

      // 检查父角色是否在继承路径中
      const hasInheritance = result[0].ancestors.includes(parentRoleName);

      this.cacheService.set(cacheKey, hasInheritance, RoleInheritanceService.CACHE_TTL.INHERITANCE);
      return hasInheritance;
    } catch (error) {
      this.logger.error(
        `检查角色继承关系失败: ${error.message}`,
        error.stack
      );
      // 出错时回退到安全策略
      return false;
    }
  }

  /**
   * 获取角色层级路径（使用 CTE 批量查询优化）
   *
   * @param roleName 角色名称
   * @returns 从根角色到当前角色的路径（数组）
   */
  async getRoleHierarchyPath(roleName: SystemRole): Promise<string[]> {
    const cacheKey = `role:path:${roleName}`;
    const cached = await this.cacheService.get<string[]>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    try {
      // 使用 CTE 批量查询获取完整路径
      const result = await this.prisma.$queryRaw<Array<{ ancestors: string[] | null }>>`
        WITH RECURSIVE role_path AS (
          SELECT id, name, parent_id, ARRAY[name] AS ancestors, 0 AS depth
          FROM roles WHERE name = ${roleName}
          UNION ALL
          SELECT r.id, r.name, r.parent_id, r.name || rp.ancestors, rp.depth + 1
          FROM roles r
          JOIN role_path rp ON r.id = rp.parent_id
          WHERE r.parent_id IS NOT NULL AND rp.depth < ${RoleInheritanceService.MAX_HIERARCHY_DEPTH}
        )
        SELECT ancestors FROM role_path WHERE parent_id IS NULL
      `;

      const path = result[0]?.ancestors || [];
      this.cacheService.set(cacheKey, path, RoleInheritanceService.CACHE_TTL.PATH);
      return path;
    } catch (error) {
      this.logger.error(
        `获取角色层级路径失败: ${error.message}`,
        error.stack
      );
      return [];
    }
  }

  /**
   * 检查用户是否具有指定权限（考虑角色继承）
   *
   * @param userId 用户ID
   * @param permission 系统权限
   * @returns 是否具有权限
   */
  async checkUserPermissionWithInheritance(
    userId: string,
    permission: SystemPermission
  ): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!user?.role) {
        return false;
      }

      const roleName = user.role.name as SystemRole;
      const rolePermissions = await this.getRolePermissions(roleName);

      return rolePermissions.includes(permission);
    } catch (error) {
      this.logger.error(
        `检查用户权限（考虑继承）失败: ${error.message}`,
        error.stack
      );
      return false;
    }
  }

  /**
   * 清除角色权限缓存
   *
   * @param roleName 角色名称
   */
  async clearRoleCache(roleName: SystemRole): Promise<void> {
    const cacheKey = `role:permissions:${roleName}`;
    this.cacheService.delete(cacheKey);

    // 清除层级路径缓存
    const pathKey = `role:path:${roleName}`;
    this.cacheService.delete(pathKey);

    // 同时清除该角色的所有继承关系缓存
    // 由于缓存键包含角色名，这里无法精确匹配，需要在实际使用时清除相关缓存
    this.logger.debug(`清除角色权限缓存: ${roleName}`);
  }

  /**
   * 递归清除角色权限缓存（包括所有子角色）
   *
   * @param roleName 角色名称
   */
  async clearRoleCacheRecursive(roleName: SystemRole): Promise<void> {
    // 清除当前角色缓存
    await this.clearRoleCache(roleName);

    try {
      // 查找所有子角色
      const currentRole = await this.prisma.role.findUnique({
        where: { name: roleName },
        select: { id: true },
      });

      if (!currentRole) {
        return;
      }

      const children = await this.prisma.role.findMany({
        where: { parentId: currentRole.id },
        select: { name: true },
      });

      // 递归清除子角色缓存
      for (const child of children) {
        await this.clearRoleCacheRecursive(child.name as SystemRole);
      }

      this.logger.debug(
        `递归清除角色权限缓存（含子角色）: ${roleName} (${children.length} 个子角色)`
      );
    } catch (error) {
      this.logger.error(
        `递归清除角色缓存失败: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * 获取所有角色的层级关系
   *
   * @returns 角色层级关系树
   */
  async getRoleHierarchyTree(): Promise<RoleHierarchyNode[]> {
    try {
      // 获取所有顶级角色（parentId 为 null）
      const topRoles = await this.prisma.role.findMany({
        where: { parentId: null },
        orderBy: { name: 'asc' },
      });

      const tree: RoleHierarchyNode[] = [];

      for (const role of topRoles) {
        const node = await this.buildHierarchyNode(role);
        tree.push(node);
      }

      return tree;
    } catch (error) {
      this.logger.error(
        `获取角色层级树失败: ${error.message}`,
        error.stack
      );
      return [];
    }
  }

  /**
   * 递归构建层级节点
   */
  private async buildHierarchyNode(
    role: RoleBasicInfo
  ): Promise<RoleHierarchyNode> {
    // 获取子角色
    const children = await this.prisma.role.findMany({
      where: { parentId: role.id },
      orderBy: { name: 'asc' },
    });

    const childNodes: RoleHierarchyNode[] = [];

    for (const child of children) {
      const childNode = await this.buildHierarchyNode(child as RoleBasicInfo);
      childNodes.push(childNode);
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description || undefined,
      category: role.category,
      level: role.level,
      isSystem: role.isSystem,
      children: childNodes,
    };
  }

  /**
   * 初始化系统角色层级关系
   *
   * 根据 SYSTEM_ROLE_HIERARCHY 枚举建立角色层级关系
   * 使用事务确保所有更新原子性
   */
  async initializeRoleHierarchy(): Promise<void> {
    try {
      const roles = await this.prisma.role.findMany({
        where: { isSystem: true },
        select: { id: true, name: true },
      });

      const roleMap = new Map<string, string>();
      roles.forEach((role) => roleMap.set(role.name, role.id));

      // 使用事务确保所有更新原子性
      await this.prisma.$transaction(async (tx) => {
        // 遍历所有系统角色，设置 parentId
        for (const [roleName, parentRoleName] of Object.entries(
          SYSTEM_ROLE_HIERARCHY
        )) {
          if (parentRoleName && typeof parentRoleName === 'string') {
            const roleId = roleMap.get(roleName);
            const parentId = roleMap.get(parentRoleName);

            if (roleId && parentId) {
              // 更新角色的 parentId 和 level
              const parentRole = await tx.role.findUnique({
                where: { id: parentId },
                select: { level: true },
              });

              await tx.role.update({
                where: { id: roleId },
                data: {
                  parentId: parentId,
                  level: (parentRole?.level || 0) + 1,
                },
              });

              this.logger.debug(
                `设置角色层级: ${roleName} -> ${parentRoleName}`
              );
            }
          }
        }
      });

      this.logger.log('系统角色层级关系初始化完成');
    } catch (error) {
      this.logger.error(
        `初始化角色层级关系失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 模块初始化时预热缓存
   */
  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('开始预热角色权限缓存...');

      const systemRoles = await this.prisma.role.findMany({
        where: { isSystem: true },
        select: { name: true },
      });

      let warmedCount = 0;
      for (const role of systemRoles) {
        try {
          await this.getRolePermissions(role.name as SystemRole);
          warmedCount++;
        } catch (error) {
          this.logger.warn(
            `预热角色 ${role.name} 权限缓存失败: ${error.message}`
          );
        }
      }

      this.logger.log(
        `角色权限缓存预热完成: ${warmedCount}/${systemRoles.length} 个角色`
      );
    } catch (error) {
      this.logger.error(
        `预热角色权限缓存失败: ${error.message}`,
        error.stack
      );
      // 不抛出异常，避免影响模块启动
    }
  }
}