///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { IPROJECT_PERMISSION_SERVICE, IProjectPermissionService } from '../../roles/interfaces/project-permission-service.interface';
import { AuditLogService } from '../../audit/audit-log.service';
import { ProjectRole, ProjectPermission } from '../../common/enums/permissions.enum';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';

import { I18nContext } from 'nestjs-i18n';
@Injectable()
export class ProjectMemberService {
  private readonly logger = new Logger(ProjectMemberService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionService: FileSystemPermissionService,
    @Inject(IPROJECT_PERMISSION_SERVICE) private readonly projectPermissionService: IProjectPermissionService,
    private readonly auditLogService: AuditLogService
  ) {}

  async getProjectMembers(projectId: string) {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
      });

      if (!project) {
        throw new NotFoundException(I18nContext.current()?.t('error.project.not_found') ?? '项目不存在');
      }

      const projectMembers = await this.prisma.projectMember.findMany({
        where: { projectId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
              role: true,
              status: true,
            },
          },
          projectRole: {
            include: {
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return projectMembers.map((pm) => ({
        id: pm.user.id,
        email: pm.user.email,
        username: pm.user.username,
        nickname: pm.user.nickname,
        avatar: pm.user.avatar,
        projectRoleId: pm.projectRoleId,
        projectRoleName: pm.projectRole.name,
        joinedAt: pm.createdAt,
      }));
    } catch (error) {
      this.logger.error(`获取项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async addProjectMember(
    projectId: string,
    userId: string,
    projectRoleId: string,
    operatorId: string
  ) {
    try {
      const isOwner = await this.projectPermissionService.isProjectOwner(
        operatorId,
        projectId,
      );

      if (!isOwner) {
        const hasPermission = await this.projectPermissionService.checkPermission(
          operatorId,
          projectId,
          ProjectPermission.PROJECT_MEMBER_MANAGE
        );

        if (!hasPermission) {
          throw new ForbiddenException(I18nContext.current()?.t('error.project_member.no_permission_add') ?? '无权限添加项目成员');
        }
      }

      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
        select: { id: true, nodeType: true, ownerId: true, name: true },
      });

      if (!project) {
        throw new NotFoundException(I18nContext.current()?.t('error.project.not_found') ?? '项目不存在');
      }

      if (project.nodeType === NodeType.PERSONAL_SPACE) {
        throw new BadRequestException(I18nContext.current()?.t('error.project_member.private_space_no_add') ?? '私人空间不支持添加成员操作');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
      });

      if (!user) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }

      const role = await this.prisma.projectRole.findUnique({
        where: { id: projectRoleId },
      });

      if (!role) {
        throw new NotFoundException(I18nContext.current()?.t('error.role.not_found') ?? '角色不存在');
      }

      // ADR-0051 自治语义：成员只能挂项目自己的角色（模板/其他项目副本一律拒绝）
      if (role.projectId !== projectId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.auth.permission_denied') ?? '您没有权限执行此操作');
      }

      // 项目所有者角色不可直接授出（数据驱动，不依赖角色名——项目内可改名）
      const ownerRoleId = await this.findOwnerRoleId(projectId);
      if (role.id === ownerRoleId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.project_member.cannot_assign_owner_role') ?? '不能直接设置为项目所有者，请使用转让功能');
      }

      const existingProjectMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      if (existingProjectMember) {
        throw new ForbiddenException(I18nContext.current()?.t('error.project_member.already_member') ?? '用户已经是项目成员');
      }

      const member = await this.prisma.projectMember.create({
        data: {
          projectId,
          userId,
          projectRoleId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
          projectRole: {
            include: {
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      await this.permissionService.clearNodeCache(projectId);
      await this.projectPermissionService.clearUserCache(userId, projectId);

      await this.auditLogService.log(
        AuditAction.ADD_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        true,
        undefined,
        undefined,
        projectId,
        project.name,
        {
          targetUserName: user.nickname || user.username || user.email,
          targetUserId: user.id,
          roleName: role.name,
        }
      );

      this.logger.log(
        `项目成员添加成功: ${projectId} - ${userId} (${role.name}) by ${operatorId}`
      );

      return member;
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.ADD_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        projectId,
        undefined,
        {
          targetUserName: userId,
          targetUserId: userId,
        }
      );

      this.logger.error(`添加项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateProjectMember(
    projectId: string,
    userId: string,
    projectRoleId: string,
    operatorId: string
  ) {
    try {
      const isOwner = await this.projectPermissionService.isProjectOwner(
        operatorId,
        projectId,
      );

      if (!isOwner) {
        const hasPermission = await this.projectPermissionService.checkPermission(
          operatorId,
          projectId,
          ProjectPermission.PROJECT_MEMBER_ASSIGN
        );

        if (!hasPermission) {
          throw new ForbiddenException(I18nContext.current()?.t('error.project_member.no_permission_update_role') ?? '无权限修改成员角色');
        }

        await this.ensureNotAdmin(projectId, userId, 'cannot_modify_admin_role');
      }

      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
        select: { id: true, ownerId: true, nodeType: true, name: true },
      });

      if (!project) {
        throw new NotFoundException(I18nContext.current()?.t('error.project.not_found') ?? '项目不存在');
      }

      if (project.ownerId === userId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.project_member.cannot_modify_owner_role') ?? '不能修改项目所有者的角色');
      }

      // 成员不得修改自己的角色（统一由项目所有者/管理员分配），防止自我降权后锁死
      if (operatorId === userId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.project_member.cannot_modify_self_role') ?? '不能修改自己的角色');
      }

      const role = await this.prisma.projectRole.findUnique({
        where: { id: projectRoleId },
      });

      if (!role) {
        throw new NotFoundException(I18nContext.current()?.t('error.role.not_found') ?? '角色不存在');
      }

      // ADR-0051 自治语义：成员只能挂项目自己的角色（模板/其他项目副本一律拒绝）
      if (role.projectId !== projectId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.auth.permission_denied') ?? '您没有权限执行此操作');
      }

      // 项目所有者角色不可直接授出（数据驱动，不依赖角色名——项目内可改名；
      // 原按 ProjectRole.OWNER 名字判断，改名后可绕过，review 修复）
      const ownerRoleId = await this.findOwnerRoleId(projectId);
      if (role.id === ownerRoleId) {
        throw new ForbiddenException(
          '不能直接设置为项目所有者，请使用转让功能'
        );
      }

      const existingProjectMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      if (existingProjectMember) {
        // 变更前的旧角色名（UPDATE_MEMBER 审计模板展示 oldRole → newRole）
        const oldRole = existingProjectMember.projectRoleId
          ? await this.prisma.projectRole.findUnique({
              where: { id: existingProjectMember.projectRoleId },
              select: { name: true },
            })
          : null;

        const member = await this.prisma.projectMember.update({
          where: {
            projectId_userId: {
              projectId,
              userId,
            },
          },
          data: { projectRoleId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                nickname: true,
                avatar: true,
              },
            },
            projectRole: {
              include: {
                permissions: {
                  select: {
                    permission: true,
                  },
                },
              },
            },
          },
        });

        await this.permissionService.clearNodeCache(projectId);
        await this.projectPermissionService.clearUserCache(userId, projectId);

        await this.auditLogService.log(
          AuditAction.UPDATE_MEMBER,
          ResourceType.PROJECT,
          projectId,
          operatorId,
          true,
          undefined,
          undefined,
          projectId,
          project.name,
          {
            targetUserName:
              member.user.nickname || member.user.username || member.user.email,
            targetUserId: member.user.id,
            oldRoleName: oldRole?.name ?? undefined,
            newRoleName: role.name,
          }
        );

        this.logger.log(
          `项目成员角色更新成功: ${projectId} - ${userId} -> ${role.name} by ${operatorId}`
        );

        return member;
      } else {
        throw new NotFoundException(I18nContext.current()?.t('error.project_member.member_not_found') ?? '成员不存在');
      }
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.UPDATE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        projectId,
        undefined,
        {
          targetUserName: userId,
          targetUserId: userId,
        }
      );

      this.logger.error(`更新项目成员角色失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async removeProjectMember(
    projectId: string,
    userId: string,
    operatorId: string
  ) {
    try {
      const isOwner = await this.projectPermissionService.isProjectOwner(
        operatorId,
        projectId,
      );

      if (!isOwner) {
        const hasPermission = await this.projectPermissionService.checkPermission(
          operatorId,
          projectId,
          ProjectPermission.PROJECT_MEMBER_MANAGE
        );

        if (!hasPermission) {
          throw new ForbiddenException(I18nContext.current()?.t('error.project_member.no_permission_remove') ?? '无权限移除项目成员');
        }

        await this.ensureNotAdmin(projectId, userId, 'cannot_remove_admin');
      }

      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
        select: { id: true, ownerId: true, nodeType: true, name: true },
      });

      if (!project) {
        throw new NotFoundException(I18nContext.current()?.t('error.project.not_found') ?? '项目不存在');
      }

      if (project.ownerId === userId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.project_member.cannot_remove_owner') ?? '不能移除项目所有者');
      }

      // 成员不得把自己移出项目（统一由项目所有者/管理员管理），防止自我移除后失去访问权
      if (operatorId === userId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.project_member.cannot_remove_self') ?? '不能移除自己');
      }

      // 移除前的目标用户信息（REMOVE_MEMBER 审计模板展示 target 名称）
      const targetUser = await this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: { nickname: true, username: true, email: true },
      });

      try {
        await this.prisma.projectMember.delete({
          where: {
            projectId_userId: {
              projectId,
              userId,
            },
          },
        });
      } catch (error) {
        this.logger.error(
          `删除项目成员失败: projectId=${projectId}, userId=${userId}, error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );
        throw new NotFoundException(I18nContext.current()?.t('error.project_member.member_not_found') ?? '成员不存在');
      }

      await this.permissionService.clearNodeCache(projectId);
      await this.projectPermissionService.clearUserCache(userId, projectId);

      await this.auditLogService.log(
        AuditAction.REMOVE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        true,
        undefined,
        undefined,
        projectId,
        project.name,
        {
          targetUserName:
            targetUser?.nickname || targetUser?.username || targetUser?.email || userId,
          targetUserId: userId,
        }
      );

      this.logger.log(
        `项目成员移除成功: ${projectId} - ${userId} by ${operatorId}`
      );

      return { message: (I18nContext.current()?.t('success.member_removed') ?? '成员移除成功') };
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.REMOVE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        projectId,
        undefined,
        {
          targetUserName: userId,
          targetUserId: userId,
        }
      );

      this.logger.error(`移除项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async transferProjectOwnership(
    projectId: string,
    newOwnerId: string,
    operatorId: string
  ) {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
        select: { id: true, ownerId: true, nodeType: true, name: true },
      });

      if (!project) {
        throw new NotFoundException(I18nContext.current()?.t('error.project.not_found') ?? '项目不存在');
      }

      if (project.ownerId !== operatorId) {
        throw new ForbiddenException(I18nContext.current()?.t('error.project_member.only_owner_can_transfer') ?? '只有项目所有者可以转让项目');
      }

      if (newOwnerId === operatorId) {
        throw new BadRequestException(I18nContext.current()?.t('error.project_member.cannot_transfer_to_self') ?? '不能转让给自己');
      }

      const newOwnerMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: newOwnerId,
          },
        },
      });

      if (!newOwnerMember) {
        throw new BadRequestException(I18nContext.current()?.t('error.project_member.transfer_target_must_be_member') ?? '转让目标必须是项目成员');
      }

      // ADR-0051：owner 角色 = 项目所有者成员当前绑定的角色（数据驱动——
      // 项目内角色可改名，按名字查不可靠；isSystem=true 的模板与各项目副本
      // 并存，也不能无 projectId 过滤查询）
      const ownerMemberRole = await this.prisma.projectMember.findFirst({
        where: { projectId, userId: project.ownerId },
        select: { projectRoleId: true },
      });

      if (!ownerMemberRole) {
        throw new NotFoundException(I18nContext.current()?.t('error.project_member.owner_role_not_found') ?? '项目所有者角色不存在');
      }

      const ownerRole = await this.prisma.projectRole.findUnique({
        where: { id: ownerMemberRole.projectRoleId },
      });

      if (!ownerRole) {
        throw new NotFoundException(I18nContext.current()?.t('error.project_member.owner_role_not_found') ?? '项目所有者角色不存在');
      }

      // 查找原 owner 降级目标角色：优先项目内 PROJECT_ADMIN，缺失则回退
      // PROJECT_MEMBER，再缺失回退任一非 owner 角色（ADR-0051 自治语义）
      let downgradeRole = await this.prisma.projectRole.findFirst({
        where: {
          name: 'PROJECT_ADMIN',
          projectId,
        },
      });

      if (!downgradeRole) {
        downgradeRole = await this.prisma.projectRole.findFirst({
          where: {
            name: 'PROJECT_MEMBER',
            projectId,
          },
        });
      }

      if (!downgradeRole) {
        downgradeRole = await this.prisma.projectRole.findFirst({
          where: {
            projectId,
            NOT: { id: ownerRole.id },
          },
        });
      }

      if (!downgradeRole) {
        throw new NotFoundException(I18nContext.current()?.t('error.project_member.roles_missing') ?? '项目内没有可用的非所有者角色，请检查项目角色配置');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.projectMember.update({
          where: {
            projectId_userId: {
              projectId,
              userId: newOwnerId,
            },
          },
          data: { projectRoleId: ownerRole.id },
        });

        await tx.projectMember.update({
          where: {
            projectId_userId: {
              projectId,
              userId: operatorId,
            },
          },
          data: { projectRoleId: downgradeRole.id },
        });

        await tx.fileSystemNode.update({
          where: { id: projectId },
          data: { ownerId: newOwnerId },
        });
      });

      await this.permissionService.clearNodeCache(projectId);

      // 新 owner 名称快照（TRANSFER_OWNERSHIP 审计模板展示 target）
      const newOwner = await this.prisma.user.findUnique({
        where: { id: newOwnerId, deletedAt: null },
        select: { nickname: true, username: true, email: true },
      });

      await this.auditLogService.log(
        AuditAction.TRANSFER_OWNERSHIP,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        true,
        undefined,
        undefined,
        projectId,
        project.name,
        {
          targetUserName:
            newOwner?.nickname || newOwner?.username || newOwner?.email || newOwnerId,
          targetUserId: newOwnerId,
        }
      );

      this.logger.log(
        `项目所有权转让成功: ${projectId} from ${operatorId} to ${newOwnerId}`
      );

      return { message: (I18nContext.current()?.t('success.project_transferred') ?? '项目所有权转让成功') };
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.TRANSFER_OWNERSHIP,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        projectId,
        undefined,
        {
          targetUserName: newOwnerId,
          targetUserId: newOwnerId,
        }
      );

      this.logger.error(`转让项目所有权失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async batchAddProjectMembers(
    projectId: string,
    members: Array<{ userId: string; projectRoleId: string }>,
    operatorId: string
  ): Promise<{
    message: string;
    addedCount: number;
    failedCount: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
        select: { id: true, nodeType: true, ownerId: true, name: true },
      });

      if (!project) {
        throw new NotFoundException(I18nContext.current()?.t('error.project.not_found') ?? '项目不存在');
      }

      if (project.nodeType === NodeType.PERSONAL_SPACE) {
        throw new BadRequestException(I18nContext.current()?.t('error.project_member.private_space_no_batch_add') ?? '私人空间不支持批量添加成员操作');
      }

      let addedCount = 0;
      let failedCount = 0;
      const errors: Array<{ userId: string; error: string }> = [];

      for (const member of members) {
        try {
          await this.addProjectMember(
            projectId,
            member.userId,
            member.projectRoleId,
            operatorId
          );
          addedCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            userId: member.userId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (failedCount > 0) {
        this.logger.warn(
          `批量添加项目成员部分失败: ${addedCount} 成功, ${failedCount} 失败`
        );
      }

      return {
        message: I18nContext.current()?.t('success.member_batch_add_complete', { args: { added: addedCount, failed: failedCount } }) ?? `批量添加完成: ${addedCount} 成功, ${failedCount} 失败`,
        addedCount,
        failedCount,
        errors,
      };
    } catch (error) {
      this.logger.error(`批量添加项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async batchUpdateProjectMembers(
    projectId: string,
    updates: Array<{ userId: string; projectRoleId: string }>,
    operatorId: string
  ): Promise<{
    message: string;
    updatedCount: number;
    failedCount: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
        select: { id: true, nodeType: true, ownerId: true, name: true },
      });

      if (!project) {
        throw new NotFoundException(I18nContext.current()?.t('error.project.not_found') ?? '项目不存在');
      }

      if (project.nodeType === NodeType.PERSONAL_SPACE) {
        throw new BadRequestException(I18nContext.current()?.t('error.project_member.private_space_no_batch_update') ?? '私人空间不支持批量更新成员操作');
      }

      let updatedCount = 0;
      let failedCount = 0;
      const errors: Array<{ userId: string; error: string }> = [];

      for (const update of updates) {
        try {
          await this.updateProjectMember(
            projectId,
            update.userId,
            update.projectRoleId,
            operatorId
          );
          updatedCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            userId: update.userId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (failedCount > 0) {
        this.logger.warn(
          `批量更新项目成员部分失败: ${updatedCount} 成功, ${failedCount} 失败`
        );
      }

      return {
        message: I18nContext.current()?.t('success.member_batch_update_complete', { args: { updated: updatedCount, failed: failedCount } }) ?? `批量更新完成: ${updatedCount} 成功, ${failedCount} 失败`,
        updatedCount,
        failedCount,
        errors,
      };
    } catch (error) {
      this.logger.error(`批量更新项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 项目所有者成员当前绑定的角色 id（数据驱动，项目内角色可改名仍可靠）。
   * 返回 null 表示该项目无所有者成员（理论上不发生——项目创建即挂 owner）。
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

  private async ensureNotAdmin(projectId: string, userId: string, errorKey: 'cannot_remove_admin' | 'cannot_modify_admin_role') {
    const targetMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { projectRole: { select: { name: true } } },
    });

    if (targetMember && targetMember.projectRole.name === ProjectRole.ADMIN) {
      const messages: Record<string, string> = {
        cannot_remove_admin: '只有项目所有者可以移除管理员',
        cannot_modify_admin_role: '只有项目所有者可以修改管理员的角色',
      };
      throw new ForbiddenException(I18nContext.current()?.t(`error.project_member.${errorKey}`) ?? messages[errorKey]);
    }
  }
}
