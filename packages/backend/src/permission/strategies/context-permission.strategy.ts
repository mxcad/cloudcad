import { Injectable, Logger, Optional } from '@nestjs/common';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { PermissionContext } from '../../common/utils/permission.utils';
import { PolicyConfigService } from '../../policy-engine/services/policy-config.service';
import { PolicyEngineService } from '../../policy-engine/services/policy-engine.service';
import { IPermissionPolicy } from '../../policy-engine/interfaces/permission-policy.interface';
import { ClsService } from 'nestjs-cls';
import { DatabaseService } from '../../database/database.service';
import { Permission as PrismaPermission } from '@cloudcad/db';

export const ICONTEXT_PERMISSION_STRATEGY = 'IContextPermissionStrategy';

export interface IContextPermissionStrategy {
  checkContextRules(userId: string, permission: SystemPermission, context: PermissionContext): Promise<boolean>;
}

@Injectable()
export class ContextPermissionStrategy implements IContextPermissionStrategy {
  private readonly logger = new Logger(ContextPermissionStrategy.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cls: ClsService,
    @Optional()
    private readonly policyConfigService?: PolicyConfigService,
    @Optional()
    private readonly policyEngineService?: PolicyEngineService,
  ) {}

  async checkContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext,
  ): Promise<boolean> {
    if (!this.policyConfigService || !this.policyEngineService) {
      return this.checkLegacyContextRules(userId, permission, context);
    }

    try {
      const policyConfigs =
        await this.policyConfigService.getEnabledPoliciesForPermission(permission as unknown as PrismaPermission);

      if (policyConfigs.length === 0) return true;

      const policies: IPermissionPolicy[] = [];
      for (const config of policyConfigs) {
        try {
          const policy = this.policyEngineService.createPolicy(
            config.type,
            config.id || 'temp',
            config.config,
          );
          policies.push(policy);
        } catch (error) {
          this.logger.error(`创建策略实例失败: ${config.name} - ${(error as Error).message}`, (error as Error).stack);
        }
      }

      if (policies.length === 0) return true;

      const policyContext = {
        userId,
        permission,
        time: context.time,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: context.metadata,
      };

      const summary = await this.policyEngineService.evaluatePolicies(policies, policyContext);

      if (!summary.allowed) {
        const clientIp = this.cls.get<string>('clientIp') || context.ipAddress || 'unknown';
        const userAgent = this.cls.get<string>('userAgent') || context.userAgent || 'unknown';
        this.logger.warn(`用户 ${userId} 的权限 ${permission} 被策略拒绝: ${summary.denialReason} (IP: ${clientIp}, UA: ${userAgent})`);
      }

      return summary.allowed;
    } catch (error) {
      this.logger.error(`策略引擎评估失败: ${(error as Error).message}`, (error as Error).stack);
      return false;
    }
  }

  private async checkLegacyContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext,
  ): Promise<boolean> {
    const sensitivePermissions: SystemPermission[] = [
      SystemPermission.SYSTEM_USER_DELETE,
      SystemPermission.SYSTEM_ROLE_DELETE,
      SystemPermission.SYSTEM_FONT_DELETE,
    ];

    if (sensitivePermissions.includes(permission) && context.time) {
      const hour = context.time.getHours();
      if (hour < 9 || hour >= 18) {
        const clientIp = this.cls.get<string>('clientIp') || context.ipAddress || 'unknown';
        this.logger.warn(`用户 ${userId} 在非工作时间尝试执行敏感操作 ${permission} (IP: ${clientIp})`);
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
      await this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: { email: true },
      });
      return true;
    } catch (error) {
      this.logger.error(`验证用户存在失败: ${(error as Error).message}`);
      return false;
    }
  }
}
