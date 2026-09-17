///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use its software, documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { PermissionContext } from '../../common/utils/permission.utils';
import { ClsService } from 'nestjs-cls';
import { DatabaseService } from '../../database/database.service';

export const ICONTEXT_PERMISSION_STRATEGY = 'IContextPermissionStrategy';

export interface IContextPermissionStrategy {
  checkContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean>;
}

@Injectable()
export class ContextPermissionStrategy implements IContextPermissionStrategy {
  private readonly logger = new Logger(ContextPermissionStrategy.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cls: ClsService
  ) {}

  async checkContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean> {
    return this.checkLegacyContextRules(userId, permission, context);
  }

  private async checkLegacyContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean> {
    const sensitivePermissions: SystemPermission[] = [
      SystemPermission.SYSTEM_USER_DELETE,
      SystemPermission.SYSTEM_ROLE_DELETE,
      SystemPermission.SYSTEM_FONT_DELETE
    ];

    if (sensitivePermissions.includes(permission) && context.time) {
      const hour = context.time.getHours();
      if (hour < 9 || hour >= 18) {
        const clientIp = this.cls.get<string>('clientIp') || context.ipAddress || 'unknown';
        this.logger.warn(
          `用户 ${userId} 在非工作时间尝试执行敏感操作 ${permission} (IP: ${clientIp})`
        );
        return false;
      }
    }

    if (context.ipAddress || context.userAgent) {
      const exists = await this.verifyUserExists(userId);
      if (!exists) {
        this.logger.warn(`用户 ${userId} 不存在或查询失败`);
        return false;
      }
    }

    return true;
  }

  private async verifyUserExists(userId: string): Promise<boolean> {
    try {
      // findUnique 查无用户返回 null（不抛异常），须按 null 判不存在——
      // 此前漏判导致「用户不存在」也走 return true 放行
      const user = await this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: { email: true }
      });
      return user !== null;
    } catch (error) {
      this.logger.error(`验证用户存在失败: ${(error as Error).message}`);
      return false;
    }
  }
}
