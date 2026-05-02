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
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { IWarmupStrategy, WarmupResult } from '../strategies/warmup.strategy';
import { HotDataStrategy } from '../strategies/hot-data.strategy';
import { PermissionStrategy } from '../strategies/permission.strategy';
import { RoleStrategy } from '../strategies/role.strategy';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { RolePermissionsMapper } from '../utils/role-permissions.mapper';
import { ProjectRoleMapper } from '../utils/project-role.mapper';
import { ProjectRole } from '../../common/enums/permissions.enum';

/**
 * 缓存预热配置接口
 */
export interface ICacheWarmupConfig {
  /** 是否启用预热 */
  enabled: boolean;
  /** 定时任务表达式 */
  schedule: string;
  /** 热点数据阈值（次/分钟） */
  hotDataThreshold: number;
  /** 最大预热数据量 */
  maxWarmupSize: number;
  /** 最大用户数 */
  maxUsers: number;
  /** 最大项目数 */
  maxProjects: number;
  /** 启用的数据类型 */
  dataTypes: string[];
}

/**
 * 统一的缓存预热服务
 *
 * 功能：
 * 1. 使用策略模式管理多种预热策略
 * 2. 支持定时预热（Cron）
 * 3. 支持启动时预热（OnModuleInit）
 * 4. 支持手动触发预热
 * 5. 提供配置管理和统计信息
 *
 * 架构设计：
 * - 策略层：5 个独立策略类（热点数据、权限、角色、用户、项目）
 * - 执行层：统一调度，支持策略组合
 * - 调度层：Cron 定时 + 启动时 + 手动触发
 */
@Injectable()
export class CacheWarmupService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmupService.name);
  private readonly strategies: Map<string, IWarmupStrategy> = new Map();
  private config: ICacheWarmupConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: DatabaseService,
    private readonly redisCache: RedisCacheService,
    // 注入所有策略
    private readonly hotDataStrategy: HotDataStrategy,
    private readonly permissionStrategy: PermissionStrategy,
    private readonly roleStrategy: RoleStrategy
  ) {
    // 注册所有策略
    this.registerStrategies();
    // 加载配置
    this.config = this.loadConfig();
  }

  /**
   * 模块初始化时自动执行缓存预热
   * 优化：禁用启动时预热，改为懒加载策略，加快启动速度
   * 缓存将在首次访问时自动加载
   */
  async onModuleInit(): Promise<void> {
    // 跳过启动时预热，改为懒加载
    this.logger.log('缓存预热已禁用（启动时），改为懒加载策略');
    this.logger.log('缓存将在首次访问时自动加载');

    // 如果需要手动触发预热，可以通过 API 调用
    // this.triggerWarmup();
  }

  /**
   * 每小时执行缓存预热（定时任务）
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledWarmup(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('缓存预热已禁用，跳过定时任务');
      return;
    }

    this.logger.log('开始执行定时缓存预热...');
    const startTime = Date.now();

    try {
      // 定时任务只预热热点数据
      const results = await this.warmup(['hot-data']);
      const duration = Date.now() - startTime;

      const successCount = results.filter((r) => r.success).length;
      this.logger.log(
        `定时缓存预热完成: ${successCount}/${results.length} 个策略成功，耗时 ${duration}ms`
      );
    } catch (error) {
      this.logger.error('定时缓存预热失败', error);
    }
  }

  /**
   * 注册所有预热策略
   */
  private registerStrategies(): void {
    this.strategies.set('hot-data', this.hotDataStrategy);
    this.strategies.set('permissions', this.permissionStrategy);
    this.strategies.set('roles', this.roleStrategy);

    this.logger.log(`已注册 ${this.strategies.size} 个预热策略`);
  }

  /**
   * 加载配置
   */
  private loadConfig(): ICacheWarmupConfig {
    const defaultConfig: ICacheWarmupConfig = {
      enabled: true,
      schedule: '0 * * * *', // 每小时执行一次
      hotDataThreshold: 10, // 每分钟访问 10 次以上
      maxWarmupSize: 1000, // 最多预热 1000 条数据
      maxUsers: 100,
      maxProjects: 50,
      dataTypes: ['hot-data', 'permissions', 'roles'],
    };

    const cacheWarmup = this.configService.get('cacheWarmup', { infer: true });
    const config = { ...defaultConfig, ...(cacheWarmup || {}) };

    this.logger.log('缓存预热配置已加载', config);
    return config;
  }

  /**
   * 统一预热接口
   * @param strategies 要执行的策略名称列表，不传则执行所有启用的策略
   * @returns 所有策略的执行结果
   */
  async warmup(strategies?: string[]): Promise<WarmupResult[]> {
    const targetStrategies =
      strategies ||
      this.config.dataTypes.filter((type) => this.strategies.has(type));

    const results: WarmupResult[] = [];

    for (const strategyName of targetStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (strategy) {
        this.logger.log(`执行预热策略: ${strategy.name}`);
        const result = await strategy.warmup();
        results.push(result);
      } else {
        this.logger.warn(`未找到预热策略: ${strategyName}`);
        results.push({
          success: false,
          count: 0,
          duration: 0,
          error: `策略不存在: ${strategyName}`,
        });
      }
    }

    return results;
  }

  /**
   * 手动触发预热
   */
  async triggerWarmup(): Promise<{
    success: boolean;
    count: number;
    duration: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const results = await this.warmup();
      const duration = Date.now() - startTime;
      const totalCount = results.reduce((sum, r) => sum + r.count, 0);
      const allSuccess = results.every((r) => r.success);

      return {
        success: allSuccess,
        count: totalCount,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        count: 0,
        duration,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 获取预热配置
   */
  getConfig(): ICacheWarmupConfig {
    return { ...this.config };
  }

  /**
   * 更新预热配置
   */
  updateConfig(config: Partial<ICacheWarmupConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('预热配置已更新', this.config);

    // 如果更新了定时任务表达式，需要更新调度器
    if (config.schedule) {
      this.updateScheduler();
    }
  }

  /**
   * 更新定时任务
   */
  private updateScheduler(): void {
    try {
      // 删除旧的定时任务
      if (this.schedulerRegistry.doesExist('cron', 'cacheWarmupScheduled')) {
        const job = this.schedulerRegistry.getCronJob('cacheWarmupScheduled');
        job.stop();
        this.schedulerRegistry.deleteCronJob('cacheWarmupScheduled');
      }

      this.logger.log(`定时任务已更新: ${this.config.schedule}`);
    } catch (error) {
      this.logger.error('更新定时任务失败', error);
    }
  }

  /**
   * 获取预热统计
   */
  getWarmupStats(): {
    config: ICacheWarmupConfig;
    strategies: string[];
    strategyCount: number;
  } {
    return {
      config: this.config,
      strategies: Array.from(this.strategies.keys()),
      strategyCount: this.strategies.size,
    };
  }

  /**
   * 手动触发缓存预热（兼容原 common 版本接口）
   */
  async manualWarmup(): Promise<{
    success: boolean;
    message: string;
    duration: number;
  }> {
    const startTime = Date.now();

    try {
      const results = await this.warmup();
      const duration = Date.now() - startTime;
      const successCount = results.filter((r) => r.success).length;

      return {
        success: true,
        message: `缓存预热完成: ${successCount}/${results.length} 个策略成功`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        message: `缓存预热失败: ${error instanceof Error ? error.message : '未知错误'}`,
        duration,
      };
    }
  }

  /**
   * 预热指定用户的缓存（兼容原 common 版本接口）
   */
  async warmupUser(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
        },
      });

      if (!user) {
        throw new NotFoundException(`用户 ${userId} 不存在`);
      }

      // 缓存用户角色
      await this.redisCache.cacheUserRole(user.id, user.role);

      // 缓存用户权限
      const permissions = RolePermissionsMapper.getPermissionsByRole(
        user.role.name
      );
      await this.redisCache.cacheUserPermissions(user.id, permissions);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(
        `预热用户 ${userId} 失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 预热指定项目的缓存（兼容原 common 版本接口）
   */
  async warmupProject(projectId: string): Promise<void> {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: {
          id: true,
          ownerId: true,
        },
      });

      if (!project) {
        throw new NotFoundException(`项目 ${projectId} 不存在`);
      }

      // 获取项目的所有成员
      const members = await this.prisma.projectMember.findMany({
        where: {
          projectId: project.id,
        },
        include: {
          projectRole: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      // 预热每个成员的访问角色
      for (const member of members) {
        const accessRole = ProjectRoleMapper.mapRoleToAccessRole(
          member.projectRole.name
        );
        await this.redisCache.cacheNodeAccessRole(
          member.user.id,
          project.id,
          accessRole
        );
      }

      // 预热项目所有者的访问角色
      await this.redisCache.cacheNodeAccessRole(
        project.ownerId,
        project.id,
        ProjectRole.OWNER
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(
        `预热项目 ${projectId} 失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 获取预热历史（兼容原 cache-architecture 版本接口）
   * 注意：重构后不再跟踪单个键的预热历史，返回空数组
   */
  getWarmupHistory(): Array<{ key: string; lastWarmup: Date }> {
    // 重构后不再跟踪单个键的预热历史
    return [];
  }

  /**
   * 清除预热历史（兼容原 cache-architecture 版本接口）
   */
  clearWarmupHistory(): void {
    // 重构后不再跟踪单个键的预热历史
    // 此方法保留为兼容，实际无操作
  }
}
