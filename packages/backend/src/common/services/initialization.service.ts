import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { SystemRole } from '../enums/permissions.enum';
import * as bcrypt from 'bcrypt';

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
          permissions: [
            'SYSTEM_USER_READ',
          ],
        },
      ];

      for (const roleConfig of defaultRoles) {
        const existingRole = await this.prisma.role.findFirst({
          where: { name: roleConfig.name },
        });

        if (existingRole) {
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

        this.logger.log(`✅ 系统角色 ${roleConfig.name} 创建成功，分配 ${roleConfig.permissions.length} 个权限`);
      }
    } catch (error) {
      this.logger.error('创建系统默认角色失败', error);
      throw error;
    }
  }

  /**
   * 创建项目默认角色
   */
  private async createProjectDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = [
        {
          name: 'PROJECT_OWNER',
          description: '项目所有者，拥有项目的完整管理权限',
          permissions: [
            'PROJECT_UPDATE', 'PROJECT_DELETE', 'PROJECT_MEMBER_MANAGE',
            'PROJECT_MEMBER_ASSIGN', 'PROJECT_ROLE_MANAGE', 'PROJECT_ROLE_PERMISSION_MANAGE',
            'PROJECT_TRANSFER', 'PROJECT_SETTINGS_MANAGE', 'FILE_CREATE',
            'FILE_UPLOAD', 'FILE_OPEN', 'FILE_EDIT', 'FILE_DELETE',
            'FILE_TRASH_MANAGE', 'FILE_DOWNLOAD', 'FILE_SHARE', 'FILE_COMMENT',
            'FILE_PRINT', 'FILE_COMPARE', 'CAD_SAVE', 'CAD_EXPORT',
            'CAD_EXTERNAL_REFERENCE', 'GALLERY_ADD', 'VERSION_READ',
            'VERSION_CREATE', 'VERSION_DELETE', 'VERSION_RESTORE',
          ],
        },
        {
          name: 'PROJECT_ADMIN',
          description: '项目管理员，管理项目和团队成员',
          permissions: [
            'PROJECT_UPDATE', 'PROJECT_MEMBER_MANAGE', 'PROJECT_MEMBER_ASSIGN',
            'PROJECT_ROLE_MANAGE', 'PROJECT_ROLE_PERMISSION_MANAGE', 'PROJECT_SETTINGS_MANAGE',
            'FILE_CREATE', 'FILE_UPLOAD', 'FILE_OPEN', 'FILE_EDIT',
            'FILE_DELETE', 'FILE_TRASH_MANAGE', 'FILE_DOWNLOAD', 'FILE_SHARE',
            'FILE_COMMENT', 'FILE_PRINT', 'FILE_COMPARE', 'CAD_SAVE',
            'CAD_EXPORT', 'CAD_EXTERNAL_REFERENCE', 'GALLERY_ADD', 'VERSION_READ',
            'VERSION_CREATE', 'VERSION_DELETE', 'VERSION_RESTORE',
          ],
        },
        {
          name: 'PROJECT_EDITOR',
          description: '项目编辑者，可以编辑和管理项目文件',
          permissions: [
            'FILE_CREATE', 'FILE_UPLOAD', 'FILE_OPEN', 'FILE_EDIT',
            'FILE_DELETE', 'FILE_TRASH_MANAGE', 'FILE_DOWNLOAD', 'FILE_SHARE',
            'FILE_COMMENT', 'FILE_PRINT', 'FILE_COMPARE', 'CAD_SAVE',
            'CAD_EXPORT', 'CAD_EXTERNAL_REFERENCE', 'VERSION_READ',
            'VERSION_CREATE', 'VERSION_DELETE', 'VERSION_RESTORE',
          ],
        },
        {
          name: 'PROJECT_MEMBER',
          description: '项目成员，可以查看和编辑项目内容',
          permissions: [
            'FILE_OPEN', 'FILE_EDIT', 'FILE_DOWNLOAD', 'FILE_COMMENT',
            'FILE_PRINT', 'CAD_SAVE', 'VERSION_READ', 'VERSION_CREATE',
          ],
        },
        {
          name: 'PROJECT_VIEWER',
          description: '项目查看者，仅能查看项目内容',
          permissions: [
            'FILE_OPEN', 'FILE_DOWNLOAD', 'VERSION_READ',
          ],
        },
      ];

      for (const roleConfig of defaultRoles) {
        const existingRole = await this.prisma.projectRole.findFirst({
          where: {
            name: roleConfig.name,
            isSystem: true,
          },
          include: {
            permissions: true,
          },
        });

        if (existingRole) {
          // 检查权限是否完整
          const existingPermissionCount = existingRole.permissions.length;
          const expectedPermissionCount = roleConfig.permissions.length;

          if (existingPermissionCount !== expectedPermissionCount) {
            this.logger.warn(
              `项目角色 ${roleConfig.name} 权限不完整（${existingPermissionCount}/${expectedPermissionCount}），正在更新...`
            );

            // 删除所有现有权限
            await this.prisma.projectRolePermission.deleteMany({
              where: { projectRoleId: existingRole.id },
            });

            // 重新分配权限
            await this.prisma.projectRolePermission.createMany({
              data: roleConfig.permissions.map((permission) => ({
                projectRoleId: existingRole.id,
                permission: permission as any,
              })),
              skipDuplicates: true,
            });

            this.logger.log(`✅ 项目角色 ${roleConfig.name} 权限更新成功，分配 ${roleConfig.permissions.length} 个权限`);
          }

          continue;
        }

        this.logger.log(`创建项目角色: ${roleConfig.name}`);

        const role = await this.prisma.projectRole.create({
          data: {
            name: roleConfig.name,
            description: roleConfig.description,
            isSystem: true,
          },
        });

        await this.prisma.projectRolePermission.createMany({
          data: roleConfig.permissions.map((permission) => ({
            projectRoleId: role.id,
            permission: permission as any,
          })),
          skipDuplicates: true,
        });

        this.logger.log(`✅ 项目角色 ${roleConfig.name} 创建成功，分配 ${roleConfig.permissions.length} 个权限`);
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
        throw new Error('ADMIN 角色不存在，请检查系统默认角色创建逻辑');
      }

      // 创建初始管理员账户
      const adminEmail = this.configService.get<string>('INITIAL_ADMIN_EMAIL', 'admin@example.com');
      const adminUsername = this.configService.get<string>('INITIAL_ADMIN_USERNAME', 'admin');
      const adminPassword = this.configService.get<string>('INITIAL_ADMIN_PASSWORD', 'Admin123!');
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
          `   ⚠️  请在首次登录后立即修改密码！`,
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
