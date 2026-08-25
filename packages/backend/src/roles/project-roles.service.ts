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

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  Prisma,
  ProjectPermission as PrismaProjectPermission,
  ProjectRole as PrismaProjectRole,
} from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import {
  ProjectRole,
  ProjectPermission,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../common/enums/permissions.enum';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { completePermissionDependencies } from '../common/constants/permission-dependencies.constants';
import { PermissionCacheService } from '../permission/services/permission-cache.service';

export interface CreateProjectRoleDto {
  projectId?: string; // 项目 ID（系统角色不需要）
  name: string;
  description?: string;
  permissions: string[]; // 接受 string[]，内部转换为 ProjectPermission[]
}

export interface UpdateProjectRoleDto {
  name?: string;
  description?: string;
  permissions?: string[]; // 接受 string[]，内部转换为 ProjectPermission[]
}

// Prisma include 返回类型
type ProjectRoleWithPermissions = Prisma.ProjectRoleGetPayload<{
  include: {
    permissions: true;
    _count: { select: { members: true } };
  };
}>;

type ProjectRoleWithProject = Prisma.ProjectRoleGetPayload<{
  include: {
    project: { select: { id: true; name: true } };
    permissions: true;
    _count: { select: { members: true } };
  };
}>;

/**
 * 项目角色服务
 * 管理项目角色和权限分配
 */
@Injectable()
export class ProjectRolesService {
  private readonly logger = new Logger(ProjectRolesService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogService: AuditLogService,
    private readonly cacheService: PermissionCacheService
  ) {}

  /**
   * 角色或其权限变更后失效相关缓存（修改即生效，不等 TTL）：
   * 项目角色的权限按项目维度缓存（project_permissions:<projectId>，版本化），
   * 清该项目即让所有成员下次权限检查重新查 DB；模板角色（projectId 为空）
   * 已随项目创建复制为各项目副本，模板变更不影响存量项目权限，无需全量失效
   * （项目创建时模板直查 DB，无列表缓存）。
   */
  private async invalidateRoleCache(role: {
    projectId: string | null;
  }): Promise<void> {
    if (role.projectId) {
      await this.cacheService.clearProjectCache(role.projectId);
    }
  }

  /**
   * 创建系统默认角色（仅在系统初始化时调用一次）
   */
  async createSystemDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = [
        { name: ProjectRole.OWNER, isSystem: true },
        { name: ProjectRole.ADMIN, isSystem: true },
        { name: ProjectRole.EDITOR, isSystem: true },
        { name: ProjectRole.MEMBER, isSystem: true },
        { name: ProjectRole.VIEWER, isSystem: true },
      ];

      for (const role of defaultRoles) {
        try {
          await this.create(
            {
              name: role.name,
              description: `系统默认角色: ${role.name}`,
              permissions:
                DEFAULT_PROJECT_ROLE_PERMISSIONS[role.name as ProjectRole] ||
                [],
            },
            undefined,
            true
          );
        } catch (error) {
          // 如果角色已存在，跳过
          if (error instanceof ConflictException) {
            continue;
          }
          throw error;
        }
      }

      this.logger.log('系统默认项目角色创建成功');
    } catch (error) {
      this.logger.error(`创建系统默认角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t(
          'error.role_extra.create_system_default_failed',
          { args: { error: error.message } }
        ) ?? `创建系统默认角色失败: ${error.message}`
      );
    }
  }

  /**
   * 复制当前模板角色到项目（项目创建时调用，事务内）
   *
   * 决策（ADR-00XX 方案 B）：项目创建时把 isSystem=true 的全局模板角色
   * 复制为项目自己的角色（projectId=项目），此后项目内角色完全自治，
   * 模板变更只影响新建项目。副本保留 isSystem=true 作为"默认角色"展示标记，
   * 但所有限制校验一律按 projectId 维度（模板=projectId 为空）生效。
   * 私人空间与公开资源库不复制角色（权限分别按 ownerId / 系统权限判断）。
   *
   * @returns name → 副本 id 映射（调用方用于挂 owner 成员）
   */
  async copyTemplatesToProject(
    projectId: string,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<Map<string, string>> {
    const templates = await tx.projectRole.findMany({
      where: { projectId: null, isSystem: true },
      include: { permissions: { select: { permission: true } } },
    });

    // 防御：模板为空或缺 OWNER（理论上不发生——OWNER 模板保底不可删）
    if (
      templates.length === 0 ||
      !templates.some((t) => t.name === ProjectRole.OWNER)
    ) {
      throw new InternalServerErrorException(
        I18nContext.current()?.t('error.user.project_owner_role_not_found') ??
          'PROJECT_OWNER 角色不存在，请检查系统初始化'
      );
    }

    const nameToId = new Map<string, string>();
    for (const tpl of templates) {
      const copy = await tx.projectRole.create({
        data: {
          projectId,
          name: tpl.name,
          description: tpl.description,
          isSystem: true,
          permissions: {
            create: tpl.permissions.map((p) => ({
              permission: p.permission as PrismaProjectPermission,
            })),
          },
        },
      });
      nameToId.set(tpl.name, copy.id);
    }

    this.logger.log(`项目 ${projectId} 复制模板角色 ${templates.length} 个`);
    return nameToId;
  }

  /**
   * 创建项目角色
   */
  async create(
    dto: CreateProjectRoleDto,
    userId?: string,
    isSystem?: boolean
  ): Promise<PrismaProjectRole> {
    try {
      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 检查角色名称是否已存在（项目内唯一）
      const existingRole = await this.prisma.projectRole.findFirst({
        where: {
          name: dto.name,
          projectId: dto.projectId ?? null,
        },
      });

      if (existingRole) {
        throw new ConflictException(
          dto.projectId
            ? `项目内角色名称 "${dto.name}" 已存在`
            : `全局角色名称 "${dto.name}" 已存在`
        );
      }

      // 创建角色（isSystem 为服务内部语义，仅系统播种透传 true，不进 DTO）
      const role = await this.prisma.projectRole.create({
        data: {
          projectId: dto.projectId || null,
          name: dto.name,
          description: dto.description,
          isSystem: isSystem ?? false,
        },
      });

      // 分配权限（透传 role.projectId：#298 修复，否则自定义角色带 permissions 时
      // 内部 assignPermissions 的 assertRoleInProject 会误判 403）
      if (dto.permissions && dto.permissions.length > 0) {
        await this.assignPermissions(
          role.id,
          dto.permissions,
          undefined,
          role.projectId ?? undefined
        );
      }

      // 新角色可能被立即分配给成员：失效相关缓存，避免成员权限按旧角色集合计算
      await this.invalidateRoleCache(role);

      if (userId) {
        await this.auditLogService.log(
          AuditAction.ROLE_CREATE,
          ResourceType.ROLE,
          role.id,
          userId,
          true,
          undefined,
          undefined,
          role.projectId ?? undefined,
          role.name,
          { roleName: role.name, projectId: role.projectId ?? null }
        );
      }

      return role;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`创建项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t(
          'error.role_extra.create_project_role_failed_detail',
          { args: { error: error.message } }
        ) ?? `创建项目角色失败: ${error.message}`
      );
    }
  }

  /**
   * 更新项目角色
   */
  async update(
    roleId: string,
    dto: UpdateProjectRoleDto,
    userId?: string,
    projectId?: string
  ): Promise<PrismaProjectRole> {
    try {
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.role.project_not_found') ??
            '项目角色不存在'
        );
      }

      // 项目域校验：通过项目端点操作时角色必须归属于该项目（#262）
      this.assertRoleInProject(role, projectId);

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 模板角色（projectId 为空）名称固定不可改（OWNER 模板按名保底等语义依赖名称）；
      // 项目内副本角色名可自由修改（项目自治，决策 ADR-00XX）
      if (!role.projectId && dto.name && dto.name !== role.name) {
        throw new BadRequestException(
          I18nContext.current()?.t(
            'error.role.system_default_cannot_modify_name'
          ) ?? '无法修改系统默认角色的名称'
        );
      }

      // 更新角色信息
      const updatedRole = await this.prisma.projectRole.update({
        where: { id: roleId },
        data: {
          name: dto.name,
          description: dto.description,
        },
      });

      // 更新权限（透传 role.projectId：#298 修复，内部链不再误判自定义角色 403，
      // 避免权限已 deleteMany 清空却报错的数据不一致）
      if (dto.permissions !== undefined) {
        await this.updatePermissions(
          roleId,
          dto.permissions,
          role.projectId ?? undefined
        );
      }

      if (userId) {
        await this.auditLogService.log(
          AuditAction.ROLE_UPDATE,
          ResourceType.ROLE,
          roleId,
          userId,
          true,
          undefined,
          undefined,
          role.projectId ?? undefined,
          updatedRole.name,
          {
            roleName: updatedRole.name,
            projectId: role.projectId ?? null,
            changedFields: Object.keys(dto),
          }
        );
      }

      return updatedRole;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`更新项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t('error.role.update_failed') ??
          '更新项目角色失败'
      );
    }
  }

  /**
   * 删除项目角色
   */
  async delete(
    roleId: string,
    userId?: string,
    projectId?: string
  ): Promise<void> {
    try {
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
        include: {
          members: true,
        },
      });

      if (!role) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.role.project_not_found') ??
            '项目角色不存在'
        );
      }

      // 项目域校验：通过项目端点操作时角色必须归属于该项目（#262）
      this.assertRoleInProject(role, projectId);

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 自动重建的默认成员角色 id（审计附注用）
      let autoCreatedMemberRoleId: string | undefined;

      if (role.projectId) {
        // === 项目内角色（项目自治，ADR-0051；删除自愈修订）===

        // 项目所有者使用的角色不可删除（数据驱动：node.ownerId 对应成员的
        // projectRoleId，不依赖角色名——项目内角色允许改名）
        const ownerRoleId = await this.findOwnerRoleId(role.projectId);
        if (ownerRoleId === roleId) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.role.owner_role_cannot_delete') ??
              '项目所有者使用的角色不可删除'
          );
        }

        // 存活的其他非所有者角色（排除本角色与 owner 角色）
        const projectRoles = await this.prisma.projectRole.findMany({
          where: { projectId: role.projectId },
          select: { id: true, name: true },
        });
        const otherRoles = projectRoles.filter(
          (r) => r.id !== roleId && r.id !== ownerRoleId
        );

        // 在用角色的成员去向：优先 PROJECT_MEMBER 名字 → 任一存活非所有者
        // 角色 → 都没有则先自动重建默认成员角色接住成员（ADR-0051 删除自愈修订：删除
        // 不再因"无降级目标"被拒——否则项目被管理员删到只剩 owner 角色后
        // 将无法再邀请任何成员）
        let demoteTargetId: string | null = null;
        if (role.members.length > 0) {
          demoteTargetId =
            otherRoles.find((r) => r.name === ProjectRole.MEMBER)?.id ??
            otherRoles[0]?.id ??
            null;
          if (!demoteTargetId) {
            demoteTargetId = await this.createDefaultMemberRole(role.projectId);
            autoCreatedMemberRoleId = demoteTargetId;
          }
        }

        await this.prisma.$transaction(async (tx) => {
          if (demoteTargetId) {
            await tx.projectMember.updateMany({
              where: { projectId: role.projectId, projectRoleId: roleId },
              data: { projectRoleId: demoteTargetId },
            });
          }
          await tx.projectRole.delete({
            where: { id: roleId },
          });
        });

        // 删除后兜底：项目必须至少保留一个可分配的非所有者角色，
        // 否则无法再添加成员（ADR-0051 删除自愈修订）
        if (!demoteTargetId && otherRoles.length === 0) {
          autoCreatedMemberRoleId = await this.createDefaultMemberRole(
            role.projectId
          );
        }
      } else {
        // === 模板角色（系统端点，projectId 为空）===
        // 仅 OWNER 模板保底不可删（创建项目必须有所有者角色）；其他模板可删，
        // 只影响新建项目（存量项目已持有副本，不受影响）
        if (role.name === ProjectRole.OWNER) {
          throw new BadRequestException(
            I18nContext.current()?.t(
              'error.role.owner_template_cannot_delete'
            ) ?? '项目所有者模板不可删除'
          );
        }
        // 防御：迁移后理论上无成员引用模板（成员已重挂项目副本），
        // 若有残留引用则拒绝删除（DB 层 Restrict 兜底）
        if (role.members.length > 0) {
          throw new BadRequestException(
            I18nContext.current()?.t(
              'error.role.template_in_use_cannot_delete'
            ) ?? '该模板仍被项目成员引用，无法删除'
          );
        }

        // 删除角色（级联删除权限关联）
        await this.prisma.projectRole.delete({
          where: { id: roleId },
        });
      }

      this.logger.log(`项目角色 ${roleId} 删除成功`);

      // 角色删除影响成员权限计算：失效相关缓存（修改即生效，不等 TTL）
      await this.invalidateRoleCache(role);

      if (userId) {
        await this.auditLogService.log(
          AuditAction.ROLE_DELETE,
          ResourceType.ROLE,
          roleId,
          userId,
          true,
          undefined,
          undefined,
          role.projectId ?? undefined,
          role.name,
          {
            roleName: role.name,
            projectId: role.projectId ?? null,
            autoCreatedMemberRoleId: autoCreatedMemberRoleId,
          }
        );
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`删除项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t('error.role.delete_failed') ??
          '删除项目角色失败'
      );
    }
  }

  /**
   * 获取所有项目角色
   */
  async findAll(): Promise<ProjectRoleWithProject[]> {
    try {
      const roles = await this.prisma.projectRole.findMany({
        include: {
          project: {
            select: { id: true, name: true },
          },
          permissions: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return roles;
    } catch (error) {
      this.logger.error(`获取项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t(
          'error.role_extra.fetch_project_role_failed'
        ) ?? `获取项目角色失败`
      );
    }
  }

  /**
   * 获取项目角色详情
   */
  async findOne(roleId: string): Promise<ProjectRoleWithPermissions> {
    try {
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
        include: {
          permissions: true,
          _count: {
            select: { members: true },
          },
        },
      });

      if (!role) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.role.project_not_found') ??
            '项目角色不存在'
        );
      }

      return role;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`获取项目角色详情失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t('error.role.fetch_detail_failed') ??
          '获取项目角色详情失败'
      );
    }
  }

  /**
   * 项目所有者使用的角色 id（数据驱动：node.ownerId 对应成员的 projectRoleId，
   * 项目内角色改名后仍可靠）。delete 保护与 findByProject 的 isOwnerRole 标记共用。
   * 返回 null 表示项目无所有者成员（理论上不发生——项目创建即挂 owner 副本；
   * 此时 owner 删除保护静默失效，属隐性防御缺口，依赖数据完整性兜底）。
   */
  private async findOwnerRoleId(projectId: string): Promise<string | null> {
    const project = await this.prisma.fileSystemNode.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) return null;
    const ownerMember = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: project.ownerId },
      select: { projectRoleId: true },
    });
    return ownerMember?.projectRoleId ?? null;
  }

  /**
   * 自动重建项目默认成员角色（ADR-0051 删除自愈修订）
   *
   * 触发场景（delete 内）：① 在用角色删除时项目内无任何存活非所有者角色可作
   * 降级目标——先建默认成员角色接住被删角色的成员；② 删除后项目内已无任何
   * 非所有者角色——补建以保证项目仍可邀请成员。
   *
   * 来源：优先复制系统级 MEMBER 模板（含权限，与 copyTemplatesToProject 一致）；
   * 模板缺失（系统管理员已删）则回退内置 DEFAULT_PROJECT_ROLE_PERMISSIONS。
   * 并发竞态下唯一约束 [projectId, name] 冲突时复用已存在的副本（幂等）。
   */
  private async createDefaultMemberRole(projectId: string): Promise<string> {
    const template = await this.prisma.projectRole.findFirst({
      where: { projectId: null, isSystem: true, name: ProjectRole.MEMBER },
      include: { permissions: { select: { permission: true } } },
    });

    const permissionCreates = template
      ? template.permissions.map((p) => ({
          permission: p.permission as PrismaProjectPermission,
        }))
      : (DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER] ?? []).map(
          (permission) => ({ permission })
        );

    try {
      const created = await this.prisma.projectRole.create({
        data: {
          projectId,
          name: ProjectRole.MEMBER,
          description: template?.description ?? '默认项目成员角色',
          isSystem: true,
          permissions: { create: permissionCreates },
        },
        select: { id: true },
      });
      this.logger.log(`项目 ${projectId} 已自动重建默认成员角色 ${created.id}`);
      return created.id;
    } catch (error) {
      // 并发删除同一项目的最后一个角色时，另一请求可能已创建同名副本
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.projectRole.findFirst({
          where: { projectId, name: ProjectRole.MEMBER },
          select: { id: true },
        });
        if (existing) {
          this.logger.log(
            `项目 ${projectId} 默认成员角色已由并发操作创建，复用 ${existing.id}`
          );
          return existing.id;
        }
      }
      throw error;
    }
  }

  /**
   * 获取特定项目的角色列表
   */
  async findByProject(
    projectId: string
  ): Promise<Array<ProjectRoleWithPermissions & { isOwnerRole: boolean }>> {
    try {
      // 项目自治（ADR-00XX）：只返回项目自己的角色。
      // 模板已随项目创建复制为副本，不再用 OR isSystem:true 并入全局模板。
      const roles = await this.prisma.projectRole.findMany({
        where: {
          projectId: projectId,
        },
        include: {
          permissions: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      });

      // 项目所有者使用的角色 id（数据驱动，前端据此禁用"所有者角色"的删除按钮）
      const ownerRoleId = await this.findOwnerRoleId(projectId);

      return roles.map((role) => ({
        ...role,
        isOwnerRole: role.id === ownerRoleId,
      }));
    } catch (error) {
      this.logger.error(`获取项目角色列表失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t(
          'error.role_extra.fetch_project_role_list_failed'
        ) ?? `获取项目角色列表失败`
      );
    }
  }

  /**
   * 获取系统默认项目角色列表（仅返回 isSystem=true 的角色）
   */
  async findSystemRoles(): Promise<ProjectRoleWithPermissions[]> {
    try {
      const roles = await this.prisma.projectRole.findMany({
        where: {
          // 仅全局模板（projectId 为空）：项目副本 isSystem=true 但绑定项目，
          // 不得混入模板列表（ADR-0051，review 修复）
          projectId: null,
          isSystem: true,
        },
        include: {
          permissions: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return roles;
    } catch (error) {
      this.logger.error(`获取系统项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t(
          'error.role_extra.fetch_system_project_roles_failed'
        ) ?? `获取系统项目角色失败`
      );
    }
  }

  /**
   * 获取角色的所有权限
   */
  async getRolePermissions(roleId: string): Promise<ProjectPermission[]> {
    try {
      const rolePermissions = await this.prisma.projectRolePermission.findMany({
        where: { projectRoleId: roleId },
        select: { permission: true },
      });

      // 将 Prisma ProjectPermission 转换为 TypeScript ProjectPermission
      // 两者使用相同的字符串值，所以可以直接使用 as 进行类型断言
      return rolePermissions.map(
        (rp) => rp.permission as unknown as ProjectPermission
      );
    } catch (error) {
      this.logger.error(`获取角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t('error.role.fetch_permissions_failed') ??
          '获取角色权限失败'
      );
    }
  }

  /**
   * 为角色分配权限
   */
  async assignPermissions(
    roleId: string,
    permissions: string[], // 接受 string[]，内部转换
    userId?: string,
    projectId?: string
  ): Promise<void> {
    try {
      // 检查角色是否存在
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.role.project_not_found') ??
            '项目角色不存在'
        );
      }

      // 项目域校验：通过项目端点操作时角色必须归属于该项目（#262）
      this.assertRoleInProject(role, projectId);

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 自动补全缺失的前置权限（与系统角色分配策略一致，避免"能操作但看不到"的无效组合）
      permissions = completePermissionDependencies(permissions);

      // 转换为 ProjectPermission 类型
      const typedPermissions = permissions as ProjectPermission[];

      // 创建权限关联（直接使用枚举值）
      const data = typedPermissions.map((permission) => ({
        projectRoleId: roleId,
        permission: permission as PrismaProjectPermission,
      }));

      await this.prisma.projectRolePermission.createMany({
        data,
        skipDuplicates: true,
      });

      this.logger.log(`角色 ${roleId} 的权限分配成功`);

      // 权限变更立即失效缓存（版本化失效，成员下次权限检查重新查 DB，不等 TTL）
      await this.invalidateRoleCache(role);

      if (userId) {
        await this.auditLogService.log(
          AuditAction.PERMISSION_GRANT,
          ResourceType.ROLE,
          roleId,
          userId,
          true,
          undefined,
          undefined,
          role.projectId ?? undefined,
          role.name,
          {
            roleName: role.name,
            projectId: role.projectId ?? null,
            permissionName: permissions.join(', '),
            permissionCount: permissions.length,
          }
        );
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`分配角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t(
          'error.role_extra.assign_permissions_failed_detail',
          { args: { error: error.message } }
        ) ?? `分配角色权限失败: ${error.message}`
      );
    }
  }

  /**
   * 移除角色权限
   */
  async removePermissions(
    roleId: string,
    permissions: string[], // 接受 string[]，内部转换
    userId?: string,
    projectId?: string
  ): Promise<void> {
    try {
      // 检查角色是否存在
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.role.project_not_found') ??
            '项目角色不存在'
        );
      }

      // 项目域校验：通过项目端点操作时角色必须归属于该项目（#262）
      this.assertRoleInProject(role, projectId);

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 转换为 ProjectPermission 类型
      const typedPermissions = permissions as ProjectPermission[];

      await this.prisma.projectRolePermission.deleteMany({
        where: {
          projectRoleId: roleId,
          permission: {
            in: typedPermissions as PrismaProjectPermission[],
          },
        },
      });

      this.logger.log(`角色 ${roleId} 的权限移除成功`);

      // 权限变更立即失效缓存（版本化失效，成员下次权限检查重新查 DB，不等 TTL）
      await this.invalidateRoleCache(role);

      if (userId) {
        await this.auditLogService.log(
          AuditAction.PERMISSION_REVOKE,
          ResourceType.ROLE,
          roleId,
          userId,
          true,
          undefined,
          undefined,
          role.projectId ?? undefined,
          role.name,
          {
            roleName: role.name,
            projectId: role.projectId ?? null,
            permissionName: permissions.join(', '),
            permissionCount: permissions.length,
          }
        );
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`移除角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t('error.role.remove_permissions_failed') ??
          '移除角色权限失败'
      );
    }
  }

  /**
   * 更新角色权限（替换所有权限）
   */
  async updatePermissions(
    roleId: string,
    permissions: string[], // 接受 string[]，内部转换
    projectId?: string
  ): Promise<void> {
    try {
      // 先删除所有现有权限
      await this.prisma.projectRolePermission.deleteMany({
        where: { projectRoleId: roleId },
      });

      // 然后重新分配权限（透传 projectId：#298 修复，内部链守卫一致）
      await this.assignPermissions(roleId, permissions, undefined, projectId);
    } catch (error) {
      this.logger.error(`更新角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException(
        I18nContext.current()?.t('error.role.update_permissions_failed') ??
          '更新角色权限失败'
      );
    }
  }

  /**
   * 角色域校验（#262 + #298 方案 A）：
   * - 项目端点（提供 projectId）：目标角色必须归属于该项目；系统角色（projectId 为 null）
   *   不可经项目端点修改（#262）；
   * - 系统端点（未提供 projectId，旧 RolesController）：仅允许操作系统角色（projectId 为 null），
   *   自定义角色一律 403，只能走项目端点管理（#298）。
   */
  private assertRoleInProject(
    role: { projectId: string | null },
    projectId?: string
  ): void {
    const deniedMessage =
      I18nContext.current()?.t('error.auth.permission_denied') ??
      '您没有权限执行此操作';
    if (projectId) {
      if (role.projectId !== projectId) {
        throw new ForbiddenException(deniedMessage);
      }
    } else if (role.projectId) {
      throw new ForbiddenException(deniedMessage);
    }
  }
}
