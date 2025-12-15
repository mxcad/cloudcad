import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProjectMemberRole } from '../common/enums/permissions.enum';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseService } from '../database/database.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionCacheService: PermissionCacheService
  ) {}

  /**
   * 创建项目
   */
  async create(userId: string, createProjectDto: CreateProjectDto) {
    try {
      const project = await this.prisma.project.create({
        data: {
          ...createProjectDto,
          ownerId: userId,
          members: {
            create: {
              userId,
              role: ProjectMemberRole.OWNER,
            },
          },
        },
        include: {
          members: {
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
            },
          },
        },
      });

      this.logger.log(`项目创建成功: ${project.name} by user ${userId}`);
      return project;
    } catch (error) {
      this.logger.error(`项目创建失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取用户的项目列表
   */
  async findAll(userId: string) {
    try {
      const projects = await this.prisma.project.findMany({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
        include: {
          members: {
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
            },
          },
          _count: {
            select: {
              files: true,
              members: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return projects;
    } catch (error) {
      this.logger.error(`查询项目列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据ID查询项目
   */
  async findOne(projectId: string) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                  avatar: true,
                  role: true,
                },
              },
            },
          },
          files: {
            select: {
              id: true,
              name: true,
              originalName: true,
              mimeType: true,
              size: true,
              status: true,
              createdAt: true,
              owner: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      return project;
    } catch (error) {
      this.logger.error(`查询项目失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新项目
   */
  async update(projectId: string, updateProjectDto: any) {
    try {
      const project = await this.prisma.project.update({
        where: { id: projectId },
        data: updateProjectDto,
        include: {
          members: {
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
            },
          },
        },
      });

      this.logger.log(`项目更新成功: ${project.name}`);
      return project;
    } catch (error) {
      this.logger.error(`项目更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 删除项目
   */
  async remove(projectId: string) {
    try {
      await this.prisma.project.delete({
        where: { id: projectId },
      });

      this.logger.log(`项目删除成功: ${projectId}`);
      return { message: '项目删除成功' };
    } catch (error) {
      this.logger.error(`项目删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 添加项目成员
   */
  async addMember(
    projectId: string,
    memberData: { userId: string; role: string }
  ) {
    try {
      // 检查用户是否存在
      const user = await this.prisma.user.findUnique({
        where: { id: memberData.userId },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      // 检查是否已经是成员
      const existingMember = await this.prisma.projectMember.findUnique({
        where: {
          userId_projectId: {
            userId: memberData.userId,
            projectId,
          },
        },
      });

      if (existingMember) {
        throw new ForbiddenException('用户已经是项目成员');
      }

      const member = await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: memberData.userId,
          role: memberData.role as ProjectMemberRole,
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
        },
      });

      this.logger.log(`项目成员添加成功: ${projectId} - ${memberData.userId}`);

      // 清除相关缓存
      this.permissionCacheService.clearUserCache(memberData.userId);
      this.permissionCacheService.clearProjectCache(projectId);

      return member;
    } catch (error) {
      this.logger.error(`添加项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取项目成员列表
   */
  async getMembers(projectId: string) {
    try {
      const members = await this.prisma.projectMember.findMany({
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
        },
        orderBy: {
          joinedAt: 'asc',
        },
      });

      return members;
    } catch (error) {
      this.logger.error(`获取项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新项目成员角色
   */
  async updateMember(projectId: string, userId: string, role: string) {
    try {
      const member = await this.prisma.projectMember.update({
        where: {
          userId_projectId: {
            userId,
            projectId,
          },
        },
        data: { role: role as ProjectMemberRole },
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
        },
      });

      this.logger.log(
        `项目成员角色更新成功: ${projectId} - ${userId} -> ${role}`
      );

      // 清除相关缓存
      this.permissionCacheService.clearUserCache(userId);
      this.permissionCacheService.clearProjectCache(projectId);

      return member;
    } catch (error) {
      this.logger.error(`更新项目成员角色失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 移除项目成员
   */
  async removeMember(projectId: string, userId: string) {
    try {
      await this.prisma.projectMember.delete({
        where: {
          userId_projectId: {
            userId,
            projectId,
          },
        },
      });

      this.logger.log(`项目成员移除成功: ${projectId} - ${userId}`);

      // 清除相关缓存
      this.permissionCacheService.clearUserCache(userId);
      this.permissionCacheService.clearProjectCache(projectId);

      return { message: '成员移除成功' };
    } catch (error) {
      this.logger.error(`移除项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
