///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import {
  SystemRole,
  ProjectRole,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../enums/permissions.enum';
import { UsersService } from '../../users/users.service';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/**
 * 系统初始化服务
 *
 * 功能：
 * 1. 检查是否为首次启动（无任何用户）
 * 2. 首次启动时自动创建所有系统默认角色和项目默认角色
 * 3. 首次启动时自动创建管理员账户
 * 4. 后续访问禁止注册
 */
@Injectable()
export class InitializationService implements OnModuleInit {
  private readonly logger = new Logger(InitializationService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService
  ) {}

  /**
   * 模块初始化时执行
   */
  async onModuleInit() {
    await this.createSystemDefaultRoles();
    await this.createProjectDefaultRoles();
    await this.checkAndCreateInitialAdmin();
    await this.ensureAllUsersHavePersonalSpace();
  }

  /**
   * 创建系统默认角色
   */
  private async createSystemDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = [
        {
          name: SystemRole.ADMIN,
          description: '系统管理员，拥有所有权限',
          permissions: [
            'SYSTEM_USER_READ',
            'SYSTEM_USER_CREATE',
            'SYSTEM_USER_UPDATE',
            'SYSTEM_USER_DELETE',
            'SYSTEM_ROLE_READ',
            'SYSTEM_ROLE_CREATE',
            'SYSTEM_ROLE_UPDATE',
            'SYSTEM_ROLE_DELETE',
            'SYSTEM_ROLE_PERMISSION_MANAGE',
            'SYSTEM_FONT_READ',
            'SYSTEM_FONT_UPLOAD',
            'SYSTEM_FONT_DELETE',
            'SYSTEM_FONT_DOWNLOAD',
            'SYSTEM_ADMIN',
            'SYSTEM_MONITOR',
            'SYSTEM_CONFIG_READ',
            'SYSTEM_CONFIG_WRITE',
          ],
        },
        {
          name: SystemRole.USER_MANAGER,
          description: '用户管理员，管理系统用户和角色',
          permissions: [
            'SYSTEM_USER_READ',
            'SYSTEM_USER_CREATE',
            'SYSTEM_USER_UPDATE',
            'SYSTEM_USER_DELETE',
            'SYSTEM_ROLE_READ',
            'SYSTEM_ROLE_CREATE',
            'SYSTEM_ROLE_UPDATE',
            'SYSTEM_ROLE_DELETE',
            'SYSTEM_ROLE_PERMISSION_MANAGE',
          ],
        },
        {
          name: SystemRole.FONT_MANAGER,
          description: '字体管理员，管理系统字体库',
          permissions: [
            'SYSTEM_FONT_READ',
            'SYSTEM_FONT_UPLOAD',
            'SYSTEM_FONT_DELETE',
            'SYSTEM_FONT_DOWNLOAD',
          ],
        },
        {
          name: SystemRole.USER,
          description: '普通用户，基本访问权限',
          permissions: [], // 普通用户无系统权限，仅用于登录
        },
      ];

      for (const roleConfig of defaultRoles) {
        const existingRole = await this.prisma.role.findFirst({
          where: { name: roleConfig.name },
          include: { permissions: true },
        });

        if (existingRole) {
          // 只添加缺失的权限，不删除已有权限
          const existingPerms = new Set(
            existingRole.permissions.map((p) => p.permission),
          );
          const missingPerms = roleConfig.permissions.filter(
            (p) => !existingPerms.has(p as any),
          );

          if (missingPerms.length > 0) {
            this.logger.warn(
              `系统角色 ${roleConfig.name} 缺少 ${missingPerms.length} 个权限，正在补充...`,
            );

            await this.prisma.rolePermission.createMany({
              data: missingPerms.map((permission) => ({
                roleId: existingRole.id,
                permission: permission as any,
              })),
              skipDuplicates: true,
            });

            this.logger.log(
              `✅ 系统角色 ${roleConfig.name} 已补充 ${missingPerms.length} 个权限`,
            );
          }
          continue;
        }

        this.logger.log(`创建系统角色: ${roleConfig.name}`);

        const role = await this.prisma.role.create({
          data: {
            name: roleConfig.name,
            description: roleConfig.description,
            category: 'SYSTEM',
            isSystem: true,
            level: roleConfig.name === SystemRole.ADMIN ? 100 : 0,
          },
        });

        await this.prisma.rolePermission.createMany({
          data: roleConfig.permissions.map((permission) => ({
            roleId: role.id,
            permission: permission as any,
          })),
          skipDuplicates: true,
        });

        this.logger.log(
          `✅ 系统角色 ${roleConfig.name} 创建成功，分配 ${roleConfig.permissions.length} 个权限`
        );
      }
    } catch (error) {
      this.logger.error('创建系统默认角色失败', error);
      throw error;
    }
  }

  /**
   * 创建项目默认角色
   * 权限定义来源于 DEFAULT_PROJECT_ROLE_PERMISSIONS（唯一来源）
   */
  private async createProjectDefaultRoles(): Promise<void> {
    try {
      // 角色描述映射
      const roleDescriptions: Record<ProjectRole, string> = {
        [ProjectRole.OWNER]: '项目所有者，拥有项目的完整管理权限',
        [ProjectRole.ADMIN]: '项目管理员，管理项目和团队成员',
        [ProjectRole.MEMBER]: '项目成员，可以查看和编辑项目内容',
        [ProjectRole.EDITOR]: '项目编辑者，可以编辑项目文件',
        [ProjectRole.VIEWER]: '项目查看者，仅能查看项目内容',
      };

      // 遍历所有项目角色，使用 DEFAULT_PROJECT_ROLE_PERMISSIONS 作为唯一来源
      for (const [roleKey, permissions] of Object.entries(
        DEFAULT_PROJECT_ROLE_PERMISSIONS,
      )) {
        const roleName = roleKey as ProjectRole;
        const description = roleDescriptions[roleName];
        const permissionStrings = permissions.map((p) => p as string);

        const existingRole = await this.prisma.projectRole.findFirst({
          where: {
            name: roleName,
            isSystem: true,
          },
          include: {
            permissions: true,
          },
        });

        if (existingRole) {
          // 只添加缺失的权限，不删除已有权限
          const existingPerms = new Set(
            existingRole.permissions.map((p) => p.permission),
          );
          const missingPerms = permissionStrings.filter(
            (p) => !existingPerms.has(p as any),
          );

          if (missingPerms.length > 0) {
            this.logger.warn(
              `项目角色 ${roleName} 缺少 ${missingPerms.length} 个权限，正在补充...`,
            );

            await this.prisma.projectRolePermission.createMany({
              data: missingPerms.map((permission) => ({
                projectRoleId: existingRole.id,
                permission: permission as any,
              })),
              skipDuplicates: true,
            });

            this.logger.log(
              `✅ 项目角色 ${roleName} 权限补充成功，添加 ${missingPerms.length} 个权限`,
            );
          }

          continue;
        }

        this.logger.log(`创建项目角色: ${roleName}`);

        const role = await this.prisma.projectRole.create({
          data: {
            name: roleName,
            description,
            isSystem: true,
          },
        });

        await this.prisma.projectRolePermission.createMany({
          data: permissionStrings.map((permission) => ({
            projectRoleId: role.id,
            permission: permission as any,
          })),
          skipDuplicates: true,
        });

        this.logger.log(
          `✅ 项目角色 ${roleName} 创建成功，分配 ${permissions.length} 个权限`,
        );
      }
    } catch (error) {
      this.logger.error('创建项目默认角色失败', error);
      throw error;
    }
  }

  /**
   * 检查并创建初始管理员账户
   */
  private async checkAndCreateInitialAdmin(): Promise<void> {
    try {
      // 检查是否已有用户
      const userCount = await this.prisma.user.count();

      if (userCount > 0) {
        this.logger.log(`系统已初始化，当前有 ${userCount} 个用户`);
        return;
      }

      this.logger.log('首次启动系统，开始创建初始管理员账户...');

      // 检查是否有 ADMIN 角色
      const adminRole = await this.prisma.role.findFirst({
        where: { name: SystemRole.ADMIN },
      });

      if (!adminRole) {
        throw new InternalServerErrorException(
          'ADMIN 角色不存在，请检查系统默认角色创建逻辑'
        );
      }

      // 创建初始管理员账户
      const adminEmail = this.configService.get<string>(
        'INITIAL_ADMIN_EMAIL',
        'admin@example.com'
      );
      const adminUsername = this.configService.get<string>(
        'INITIAL_ADMIN_USERNAME',
        'admin'
      );
      const adminPassword = this.configService.get<string>(
        'INITIAL_ADMIN_PASSWORD',
        'Admin123!'
      );

      // 使用 UsersService.create() 创建用户（会自动创建私人空间）
      const createUserDto: CreateUserDto = {
        email: adminEmail,
        username: adminUsername,
        password: adminPassword,
        nickname: '系统管理员',
        roleId: adminRole.id,
      };

      await this.usersService.create(createUserDto);

      this.logger.log(
        `✅ 初始管理员账户创建成功！\n` +
          `   邮箱: ${adminEmail}\n` +
          `   用户名: ${adminUsername}\n` +
          `   密码: ${adminPassword}\n` +
          `   ⚠️  请在首次登录后立即修改密码！`
      );
    } catch (error) {
      this.logger.error('创建初始管理员账户失败', error);
      throw error;
    }
  }

  /**
   * 确保所有用户都有私人空间
   * 用于处理历史数据迁移场景
   */
  private async ensureAllUsersHavePersonalSpace(): Promise<void> {
    try {
      // 查找所有已有私人空间的用户 ID
      const personalSpaces = await this.prisma.fileSystemNode.findMany({
        where: {
          personalSpaceKey: { not: null },
        },
        select: {
          personalSpaceKey: true,
        },
      });

      const userIdsWithPersonalSpace = new Set(
        personalSpaces.map((ps) => ps.personalSpaceKey)
      );

      // 查找所有用户
      const allUsers = await this.prisma.user.findMany({
        select: {
          id: true,
          username: true,
        },
      });

      // 过滤出没有私人空间的用户
      const usersWithoutPersonalSpace = allUsers.filter(
        (user) => !userIdsWithPersonalSpace.has(user.id)
      );

      if (usersWithoutPersonalSpace.length === 0) {
        this.logger.log('所有用户都已有私人空间');
        return;
      }

      this.logger.log(
        `发现 ${usersWithoutPersonalSpace.length} 个用户没有私人空间，开始批量创建...`
      );

      // 获取 PROJECT_OWNER 角色
      const ownerRole = await this.prisma.projectRole.findFirst({
        where: { name: 'PROJECT_OWNER', isSystem: true },
      });

      if (!ownerRole) {
        throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
      }

      // 批量创建私人空间
      let createdCount = 0;
      for (const user of usersWithoutPersonalSpace) {
        try {
          await this.prisma.fileSystemNode.create({
            data: {
              name: '我的图纸',
              isFolder: true,
              isRoot: true,
              personalSpaceKey: user.id,
              projectStatus: 'ACTIVE',
              ownerId: user.id,
              projectMembers: {
                create: {
                  userId: user.id,
                  projectRoleId: ownerRole.id,
                },
              },
            },
          });
          createdCount++;
        } catch (error) {
          this.logger.warn(
            `为用户 ${user.username} 创建私人空间失败: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      this.logger.log(
        `✅ 私人空间批量创建完成: ${createdCount}/${usersWithoutPersonalSpace.length}`
      );
    } catch (error) {
      this.logger.error('批量创建私人空间失败', error);
      throw error;
    }
  }

  /**
   * 检查是否允许注册
   *
   * @returns 如果允许注册返回 true，否则返回 false
   */
  async isRegistrationAllowed(): Promise<boolean> {
    const userCount = await this.prisma.user.count();
    return userCount === 0;
  }

  /**
   * 检查是否为首次启动
   *
   * @returns 如果为首次启动返回 true，否则返回 false
   */
  async isFirstStartup(): Promise<boolean> {
    const userCount = await this.prisma.user.count();
    return userCount === 0;
  }
}
