///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { ProjectRole } from '../../common/enums/permissions.enum';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';

@Injectable()
export class ProjectMemberService {
  private readonly logger = new Logger(ProjectMemberService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly auditLogService: AuditLogService
  ) {}

  async getProjectMembers(projectId: string) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
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
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: { id: true, personalSpaceKey: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      if (project.personalSpaceKey) {
        throw new BadRequestException('私人空间不支持添加成员操作');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      const role = await this.prisma.projectRole.findUnique({
        where: { id: projectRoleId },
      });

      if (!role) {
        throw new NotFoundException('角色不存在');
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
        throw new ForbiddenException('用户已经是项目成员');
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

      await this.auditLogService.log(
        AuditAction.ADD_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        true,
        undefined,
        JSON.stringify({
          userId,
          projectRoleId,
          role: role.name,
        })
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
        JSON.stringify({
          userId,
          projectRoleId,
        })
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
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: { id: true, ownerId: true, personalSpaceKey: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      if (project.personalSpaceKey) {
        throw new BadRequestException('私人空间不支持更新成员操作');
      }

      if (project.ownerId === userId) {
        throw new ForbiddenException('不能修改项目所有者的角色');
      }

      const role = await this.prisma.projectRole.findUnique({
        where: { id: projectRoleId },
      });

      if (!role) {
        throw new NotFoundException('角色不存在');
      }

      if (role.name === ProjectRole.OWNER) {
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

        await this.auditLogService.log(
          AuditAction.UPDATE_MEMBER,
          ResourceType.PROJECT,
          projectId,
          operatorId,
          true,
          undefined,
          JSON.stringify({
            userId,
            projectRoleId,
            role: role.name,
          })
        );

        this.logger.log(
          `项目成员角色更新成功: ${projectId} - ${userId} -> ${role.name} by ${operatorId}`
        );

        return member;
      } else {
        throw new NotFoundException('成员不存在');
      }
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.UPDATE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        JSON.stringify({
          userId,
          projectRoleId,
        })
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
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: { id: true, ownerId: true, personalSpaceKey: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      if (project.personalSpaceKey) {
        throw new BadRequestException('私人空间不支持移除成员操作');
      }

      if (project.ownerId === userId) {
        throw new ForbiddenException('不能移除项目所有者');
      }

      try {
        await this.prisma.projectMember.delete({
          where: {
            projectId_userId: {
              projectId,
              userId,
            },
          },
        });
      } catch {
        throw new NotFoundException('成员不存在');
      }

      await this.permissionService.clearNodeCache(projectId);

      await this.auditLogService.log(
        AuditAction.REMOVE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        true,
        undefined,
        JSON.stringify({
          userId,
        })
      );

      this.logger.log(
        `项目成员移除成功: ${projectId} - ${userId} by ${operatorId}`
      );

      return { message: '成员移除成功' };
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.REMOVE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        JSON.stringify({
          userId,
        })
      );

      this.logger.error(`移除项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async transferProjectOwnership(
    projectId: string,
    newOwnerId: string,
    currentOwnerId: string
  ) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: { id: true, ownerId: true, personalSpaceKey: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      if (project.personalSpaceKey) {
        throw new BadRequestException('私人空间不支持转让操作');
      }

      if (project.ownerId !== currentOwnerId) {
        throw new ForbiddenException('只有项目所有者可以转让项目');
      }

      if (newOwnerId === currentOwnerId) {
        throw new BadRequestException('不能转让给自己');
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
        throw new BadRequestException('转让目标必须是项目成员');
      }

      const ownerRole = await this.prisma.projectRole.findFirst({
        where: {
          name: 'PROJECT_OWNER',
          isSystem: true,
        },
      });

      if (!ownerRole) {
        throw new NotFoundException('项目所有者角色不存在');
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

        const adminRole = await tx.projectRole.findFirst({
          where: {
            name: 'PROJECT_ADMIN',
            isSystem: true,
          },
        });

        if (adminRole) {
          await tx.projectMember.update({
            where: {
              projectId_userId: {
                projectId,
                userId: currentOwnerId,
              },
            },
            data: { projectRoleId: adminRole.id },
          });
        }

        await tx.fileSystemNode.update({
          where: { id: projectId },
          data: { ownerId: newOwnerId },
        });
      });

      await this.permissionService.clearNodeCache(projectId);

      await this.auditLogService.log(
        AuditAction.TRANSFER_OWNERSHIP,
        ResourceType.PROJECT,
        projectId,
        currentOwnerId,
        true,
        undefined,
        JSON.stringify({
          fromOwnerId: currentOwnerId,
          toOwnerId: newOwnerId,
        })
      );

      this.logger.log(
        `项目所有权转让成功: ${projectId} from ${currentOwnerId} to ${newOwnerId}`
      );

      return { message: '项目所有权转让成功' };
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.TRANSFER_OWNERSHIP,
        ResourceType.PROJECT,
        projectId,
        currentOwnerId,
        false,
        error instanceof Error ? error.message : String(error),
        JSON.stringify({
          fromOwnerId: currentOwnerId,
          toOwnerId: newOwnerId,
        })
      );

      this.logger.error(`转让项目所有权失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async batchAddProjectMembers(
    projectId: string,
    members: Array<{ userId: string; projectRoleId: string }>
  ): Promise<{
    message: string;
    addedCount: number;
    failedCount: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: { id: true, personalSpaceKey: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      if (project.personalSpaceKey) {
        throw new BadRequestException('私人空间不支持批量添加成员操作');
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
            'system'
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
        message: `批量添加完成: ${addedCount} 成功, ${failedCount} 失败`,
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
    updates: Array<{ userId: string; projectRoleId: string }>
  ): Promise<{
    message: string;
    updatedCount: number;
    failedCount: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: { id: true, personalSpaceKey: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      if (project.personalSpaceKey) {
        throw new BadRequestException('私人空间不支持批量更新成员操作');
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
            'system'
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
        message: `批量更新完成: ${updatedCount} 成功, ${failedCount} 失败`,
        updatedCount,
        failedCount,
        errors,
      };
    } catch (error) {
      this.logger.error(`批量更新项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
