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
 * 2. 首次启动时自动创建管理员账户
 * 3. 后续访问禁止注册
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
    await this.checkAndCreateInitialAdmin();
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
      let adminRole = await this.prisma.role.findUnique({
        where: { name: SystemRole.ADMIN },
      });

      // 如果没有 ADMIN 角色，创建它
      if (!adminRole) {
        this.logger.warn('未找到 ADMIN 角色，正在创建...');
        adminRole = await this.prisma.role.create({
          data: {
            name: SystemRole.ADMIN,
            description: '系统管理员，拥有所有权限',
            category: 'SYSTEM',
            isSystem: true,
          },
        });

        // 为 ADMIN 角色分配所有系统权限
        // Permission 是枚举，直接使用所有系统权限
        const systemPermissions = [
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
        ];

        if (systemPermissions.length > 0) {
          await this.prisma.rolePermission.createMany({
            data: systemPermissions.map((permission) => ({
              roleId: adminRole!.id,
              permission: permission as any,
            })),
            skipDuplicates: true,
          });

          this.logger.log(`为 ADMIN 角色分配了 ${systemPermissions.length} 个系统权限`);
        }
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
