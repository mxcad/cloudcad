///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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
