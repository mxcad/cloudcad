import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/**
 * 角色缓存服务
 * 在应用启动时从数据库加载系统角色，避免硬编码
 */
@Injectable()
export class RolesCacheService implements OnModuleInit {
  private readonly logger = new Logger(RolesCacheService.name);
  private systemRoles = new Map<string, string>(); // key: role name, value: role id

  constructor(private readonly prisma: DatabaseService) {}

  async onModuleInit() {
    await this.loadSystemRoles();
  }

  /**
   * 从数据库加载系统角色
   */
  private async loadSystemRoles(): Promise<void> {
    try {
      const roles = await this.prisma.role.findMany({
        where: { isSystem: true },
        select: { id: true, name: true },
      });

      this.systemRoles.clear();
      roles.forEach((role) => {
        this.systemRoles.set(role.name, role.id);
      });

      this.logger.log(
        `已加载 ${this.systemRoles.size} 个系统角色: ${Array.from(this.systemRoles.keys()).join(', ')}`
      );
    } catch (error) {
      this.logger.error('加载系统角色失败:', error);
      throw error;
    }
  }

  /**
   * 根据角色名称获取角色ID
   */
  getRoleId(roleName: string): string | undefined {
    return this.systemRoles.get(roleName);
  }

  /**
   * 获取所有系统角色名称
   */
  getSystemRoleNames(): string[] {
    return Array.from(this.systemRoles.keys());
  }

  /**
   * 检查是否是系统角色
   */
  isSystemRole(roleName: string): boolean {
    return this.systemRoles.has(roleName);
  }

  /**
   * 刷新缓存（用于测试或动态更新）
   */
  async refresh(): Promise<void> {
    await this.loadSystemRoles();
  }
}
