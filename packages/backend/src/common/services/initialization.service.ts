import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import {
  SystemRole,
  ProjectRole,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../enums/permissions.enum';
import * as bcrypt from 'bcryptjs';

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
    private readonly configService: ConfigService
  ) {}

  /**
   * 模块初始化时执行
   */
  async onModuleInit() {
    await this.createSystemDefaultRoles();
    await this.createProjectDefaultRoles();
    await this.checkAndCreateInitialAdmin();
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
          // 检查权限是否完整
          const existingPermissionCount = existingRole.permissions.length;
          const expectedPermissionCount = roleConfig.permissions.length;

          if (existingPermissionCount !== expectedPermissionCount) {
            this.logger.warn(
              `系统角色 ${roleConfig.name} 权限不完整（${existingPermissionCount}/${expectedPermissionCount}），正在更新...`
            );

            // 删除所有现有权限
            await this.prisma.rolePermission.deleteMany({
              where: { roleId: existingRole.id },
            });

            // 重新分配权限
            await this.prisma.rolePermission.createMany({
              data: roleConfig.permissions.map((permission) => ({
                roleId: existingRole.id,
                permission: permission as any,
              })),
              skipDuplicates: true,
            });

            this.logger.log(
              `✅ 系统角色 ${roleConfig.name} 权限更新成功，分配 ${roleConfig.permissions.length} 个权限`
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
          // 检查权限是否完整
          const existingPermissionCount = existingRole.permissions.length;
          const expectedPermissionCount = permissions.length;

          if (existingPermissionCount !== expectedPermissionCount) {
            this.logger.warn(
              `项目角色 ${roleName} 权限不完整（${existingPermissionCount}/${expectedPermissionCount}），正在更新...`,
            );

            // 删除所有现有权限
            await this.prisma.projectRolePermission.deleteMany({
              where: { projectRoleId: existingRole.id },
            });

            // 重新分配权限
            await this.prisma.projectRolePermission.createMany({
              data: permissionStrings.map((permission) => ({
                projectRoleId: existingRole.id,
                permission: permission as any,
              })),
              skipDuplicates: true,
            });

            this.logger.log(
              `✅ 项目角色 ${roleName} 权限更新成功，分配 ${permissions.length} 个权限`,
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
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      const adminUser = await this.prisma.user.create({
        data: {
          email: adminEmail,
          username: adminUsername,
          password: hashedPassword,
          nickname: '系统管理员',
          roleId: adminRole.id,
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

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
