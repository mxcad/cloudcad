///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PolicyEngineService } from './policy-engine.service';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 权限策略配置
 */
export interface PermissionPolicyConfig {
  id?: string;
  type: PolicyType;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  permissions: PrismaPermission[];
  enabled: boolean;
  priority?: number;
}

/**
 * 策略配置服务
 *
 * 负责管理权限策略的配置（创建、更新、删除、查询）
 */
@Injectable()
export class PolicyConfigService {
  private readonly logger = new Logger(PolicyConfigService.name);
  private readonly cachePrefix = 'policy_config:';
  private readonly cacheTTL: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService,
    private readonly policyEngine: PolicyEngineService
  ) {
    const cacheTTLConfig = this.configService.get('cacheTTL', { infer: true });
    this.cacheTTL = cacheTTLConfig.policy * 1000; // 转为毫秒
  }

  /**
   * 创建策略配置
   */
  async createPolicyConfig(
    config: PermissionPolicyConfig,
    createdBy: string
  ): Promise<PermissionPolicyConfig> {
    try {
      // 验证策略配置
      const policy = this.policyEngine.createPolicyUnsafe(
        config.type,
        `temp_${Date.now()}`,
        config.config
      );

      // 创建策略记录
      const policyRecord = await this.prisma.permissionPolicy.create({
        data: {
          type: config.type,
          name: config.name,
          description: config.description,
          config: config.config as never,
          enabled: config.enabled,
          priority: config.priority || 0,
        },
      });

      // 创建策略-权限关联
      for (const permission of config.permissions) {
        await this.prisma.policyPermission.create({
          data: {
            policyId: policyRecord.id,
            permission,
          },
        });
      }

      // 清除缓存
      this.clearCache();

      this.logger.log(
        `策略配置创建成功: ${config.name} (${config.type}) by ${createdBy}`
      );

      return this.formatPolicyConfig(policyRecord, config.permissions);
    } catch (error) {
      this.logger.error(`创建策略配置失败: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `创建策略配置失败: ${error.message}`
      );
    }
  }

  /**
   * 更新策略配置
   */
  async updatePolicyConfig(
    policyId: string,
    updates: Partial<PermissionPolicyConfig>,
    updatedBy: string
  ): Promise<PermissionPolicyConfig> {
    try {
      // 查找现有策略
      const existing = await this.prisma.permissionPolicy.findUnique({
        where: { id: policyId },
        include: {
          permissions: true,
        },
      });

      if (!existing) {
        throw new NotFoundException(`策略配置不存在: ${policyId}`);
      }

      // 如果更新了 config，验证新配置
      if (updates.config && updates.type) {
        const policy = this.policyEngine.createPolicyUnsafe(
          updates.type,
          `temp_${Date.now()}`,
          updates.config
        );
      }

      // 更新策略记录
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined)
        updateData.description = updates.description;
      if (updates.config !== undefined)
        updateData.config = updates.config as never;
      if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
      if (updates.priority !== undefined)
        updateData.priority = updates.priority;

      const updatedPolicy = await this.prisma.permissionPolicy.update({
        where: { id: policyId },
        data: updateData,
      });

      // 更新策略-权限关联
      if (updates.permissions !== undefined) {
        // 删除旧的关联
        await this.prisma.policyPermission.deleteMany({
          where: { policyId },
        });

        // 创建新的关联
        for (const permission of updates.permissions) {
          await this.prisma.policyPermission.create({
            data: {
              policyId,
              permission,
            },
          });
        }
      }

      // 清除缓存
      this.clearCache();

      this.logger.log(`策略配置更新成功: ${policyId} by ${updatedBy}`);

      return this.formatPolicyConfig(
        updatedPolicy,
        updates.permissions || existing.permissions.map((p) => p.permission)
      );
    } catch (error) {
      this.logger.error(`更新策略配置失败: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `更新策略配置失败: ${error.message}`
      );
    }
  }

  /**
   * 删除策略配置
   */
  async deletePolicyConfig(policyId: string, deletedBy: string): Promise<void> {
    try {
      // 删除策略-权限关联
      await this.prisma.policyPermission.deleteMany({
        where: { policyId },
      });

      // 删除策略记录
      await this.prisma.permissionPolicy.delete({
        where: { id: policyId },
      });

      // 清除缓存
      this.clearCache();

      this.logger.log(`策略配置删除成功: ${policyId} by ${deletedBy}`);
    } catch (error) {
      this.logger.error(`删除策略配置失败: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `删除策略配置失败: ${error.message}`
      );
    }
  }

  /**
   * 获取策略配置
   */
  async getPolicyConfig(
    policyId: string
  ): Promise<PermissionPolicyConfig | null> {
    try {
      const cacheKey = `${this.cachePrefix}${policyId}`;
      const cached = this.cacheService.get<PermissionPolicyConfig>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const policy = await this.prisma.permissionPolicy.findUnique({
        where: { id: policyId },
        include: {
          permissions: true,
        },
      });

      if (!policy) {
        return null;
      }

      const formatted = this.formatPolicyConfig(
        policy,
        policy.permissions.map((p) => p.permission)
      );

      // 缓存结果
      this.cacheService.set(cacheKey, formatted, this.cacheTTL);

      return formatted;
    } catch (error) {
      this.logger.error(`获取策略配置失败: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `获取策略配置失败: ${error.message}`
      );
    }
  }

  /**
   * 获取所有策略配置
   */
  async getAllPolicyConfigs(): Promise<PermissionPolicyConfig[]> {
    try {
      const cacheKey = `${this.cachePrefix}all`;
      const cached =
        await this.cacheService.get<PermissionPolicyConfig[]>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const policies = await this.prisma.permissionPolicy.findMany({
        include: {
          permissions: true,
        },
        orderBy: {
          priority: 'desc',
        },
      });

      const formatted = policies.map((policy) =>
        this.formatPolicyConfig(
          policy,
          policy.permissions.map((p) => p.permission)
        )
      );

      // 缓存结果
      this.cacheService.set(cacheKey, formatted, this.cacheTTL);

      return formatted;
    } catch (error) {
      this.logger.error(`获取所有策略配置失败: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `获取所有策略配置失败: ${error.message}`
      );
    }
  }

  /**
   * 根据权限获取启用的策略配置
   */
  async getEnabledPoliciesForPermission(
    permission: PrismaPermission
  ): Promise<PermissionPolicyConfig[]> {
    try {
      const cacheKey = `${this.cachePrefix}permission:${permission}`;
      const cached =
        await this.cacheService.get<PermissionPolicyConfig[]>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const policyPermissions = await this.prisma.policyPermission.findMany({
        where: {
          permission,
          policy: {
            enabled: true,
          },
        },
        include: {
          policy: {
            include: {
              permissions: true,
            },
          },
        },
        orderBy: {
          policy: {
            priority: 'desc',
          },
        },
      });

      const formatted = policyPermissions.map((pp) =>
        this.formatPolicyConfig(
          pp.policy,
          pp.policy.permissions.map((p) => p.permission)
        )
      );

      // 缓存结果
      this.cacheService.set(cacheKey, formatted, this.cacheTTL);

      return formatted;
    } catch (error) {
      this.logger.error(
        `获取权限的策略配置失败: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        `获取权限的策略配置失败: ${error.message}`
      );
    }
  }

  /**
   * 启用/禁用策略配置
   */
  async togglePolicyConfig(
    policyId: string,
    enabled: boolean,
    updatedBy: string
  ): Promise<PermissionPolicyConfig> {
    return this.updatePolicyConfig(policyId, { enabled }, updatedBy);
  }

  /**
   * 格式化策略配置
   */
  private formatPolicyConfig(
    policy: any,
    permissions: PrismaPermission[]
  ): PermissionPolicyConfig {
    return {
      id: policy.id,
      type: policy.type as PolicyType,
      name: policy.name,
      description: policy.description,
      config: policy.config as Record<string, unknown>,
      permissions,
      enabled: policy.enabled,
      priority: policy.priority,
    };
  }

  /**
   * 清除缓存
   */
  private clearCache(): void {
    // TODO: 实现 clearPattern 方法或使用其他方式清除缓存
    // 清除所有策略配置缓存
    // this.cacheService.clearPattern(`${this.cachePrefix}*`);
  }
}
