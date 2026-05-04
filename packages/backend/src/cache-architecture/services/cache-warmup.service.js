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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger, NotFoundException, InternalServerErrorException, } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RolePermissionsMapper } from '../utils/role-permissions.mapper';
import { ProjectRoleMapper } from '../utils/project-role.mapper';
import { ProjectRole } from '../../common/enums/permissions.enum';
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
let CacheWarmupService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _scheduledWarmup_decorators;
    var CacheWarmupService = _classThis = class {
        constructor(configService, schedulerRegistry, prisma, redisCache, 
        // 注入所有策略
        hotDataStrategy, permissionStrategy, roleStrategy) {
            this.configService = (__runInitializers(this, _instanceExtraInitializers), configService);
            this.schedulerRegistry = schedulerRegistry;
            this.prisma = prisma;
            this.redisCache = redisCache;
            this.hotDataStrategy = hotDataStrategy;
            this.permissionStrategy = permissionStrategy;
            this.roleStrategy = roleStrategy;
            this.logger = new Logger(CacheWarmupService.name);
            this.strategies = new Map();
            this._config = null;
            // 注册所有策略
            this.registerStrategies();
        }
        /**
         * 模块初始化时自动执行缓存预热
         * 优化：禁用启动时预热，改为懒加载策略，加快启动速度
         * 缓存将在首次访问时自动加载
         */
        async onModuleInit() {
            // 跳过启动时预热，改为懒加载
            this.logger.log('缓存预热已禁用（启动时），改为懒加载策略');
            this.logger.log('缓存将在首次访问时自动加载');
            // 如果需要手动触发预热，可以通过 API 调用
            // this.triggerWarmup();
        }
        /**
         * 每小时执行缓存预热（定时任务）
         */
        async scheduledWarmup() {
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
                this.logger.log(`定时缓存预热完成: ${successCount}/${results.length} 个策略成功，耗时 ${duration}ms`);
            }
            catch (error) {
                this.logger.error('定时缓存预热失败', error);
            }
        }
        /**
         * 注册所有预热策略
         */
        registerStrategies() {
            this.strategies.set('hot-data', this.hotDataStrategy);
            this.strategies.set('permissions', this.permissionStrategy);
            this.strategies.set('roles', this.roleStrategy);
            this.logger.log(`已注册 ${this.strategies.size} 个预热策略`);
        }
        /**
         * 加载配置
         */
        get config() {
            if (!this._config) {
                const defaultConfig = {
                    enabled: true,
                    schedule: '0 * * * *', // 每小时执行一次
                    hotDataThreshold: 10, // 每分钟访问 10 次以上
                    maxWarmupSize: 1000, // 最多预热 1000 条数据
                    maxUsers: 100,
                    maxProjects: 50,
                    dataTypes: ['hot-data', 'permissions', 'roles'],
                };
                const cacheWarmup = this.configService.get('cacheWarmup', { infer: true });
                this._config = { ...defaultConfig, ...(cacheWarmup || {}) };
                this.logger.log('缓存预热配置已加载', this._config);
            }
            return this._config;
        }
        set config(value) {
            this._config = value;
        }
        /**
         * 统一预热接口
         * @param strategies 要执行的策略名称列表，不传则执行所有启用的策略
         * @returns 所有策略的执行结果
         */
        async warmup(strategies) {
            const targetStrategies = strategies ||
                this.config.dataTypes.filter((type) => this.strategies.has(type));
            const results = [];
            for (const strategyName of targetStrategies) {
                const strategy = this.strategies.get(strategyName);
                if (strategy) {
                    this.logger.log(`执行预热策略: ${strategy.name}`);
                    const result = await strategy.warmup();
                    results.push(result);
                }
                else {
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
        async triggerWarmup() {
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
            }
            catch (error) {
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
        getConfig() {
            return { ...this.config };
        }
        /**
         * 更新预热配置
         */
        updateConfig(config) {
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
        updateScheduler() {
            try {
                // 删除旧的定时任务
                if (this.schedulerRegistry.doesExist('cron', 'cacheWarmupScheduled')) {
                    const job = this.schedulerRegistry.getCronJob('cacheWarmupScheduled');
                    job.stop();
                    this.schedulerRegistry.deleteCronJob('cacheWarmupScheduled');
                }
                this.logger.log(`定时任务已更新: ${this.config.schedule}`);
            }
            catch (error) {
                this.logger.error('更新定时任务失败', error);
            }
        }
        /**
         * 获取预热统计
         */
        getWarmupStats() {
            return {
                config: this.config,
                strategies: Array.from(this.strategies.keys()),
                strategyCount: this.strategies.size,
            };
        }
        /**
         * 手动触发缓存预热（兼容原 common 版本接口）
         */
        async manualWarmup() {
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
            }
            catch (error) {
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
        async warmupUser(userId) {
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
                const permissions = RolePermissionsMapper.getPermissionsByRole(user.role.name);
                await this.redisCache.cacheUserPermissions(user.id, permissions);
            }
            catch (error) {
                if (error instanceof NotFoundException) {
                    throw error;
                }
                throw new InternalServerErrorException(`预热用户 ${userId} 失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }
        /**
         * 预热指定项目的缓存（兼容原 common 版本接口）
         */
        async warmupProject(projectId) {
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
                    const accessRole = ProjectRoleMapper.mapRoleToAccessRole(member.projectRole.name);
                    await this.redisCache.cacheNodeAccessRole(member.user.id, project.id, accessRole);
                }
                // 预热项目所有者的访问角色
                await this.redisCache.cacheNodeAccessRole(project.ownerId, project.id, ProjectRole.OWNER);
            }
            catch (error) {
                if (error instanceof NotFoundException) {
                    throw error;
                }
                throw new InternalServerErrorException(`预热项目 ${projectId} 失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }
        /**
         * 获取预热历史（兼容原 cache-architecture 版本接口）
         * 注意：重构后不再跟踪单个键的预热历史，返回空数组
         */
        getWarmupHistory() {
            // 重构后不再跟踪单个键的预热历史
            return [];
        }
        /**
         * 清除预热历史（兼容原 cache-architecture 版本接口）
         */
        clearWarmupHistory() {
            // 重构后不再跟踪单个键的预热历史
            // 此方法保留为兼容，实际无操作
        }
    };
    __setFunctionName(_classThis, "CacheWarmupService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _scheduledWarmup_decorators = [Cron(CronExpression.EVERY_HOUR)];
        __esDecorate(_classThis, null, _scheduledWarmup_decorators, { kind: "method", name: "scheduledWarmup", static: false, private: false, access: { has: obj => "scheduledWarmup" in obj, get: obj => obj.scheduledWarmup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheWarmupService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheWarmupService = _classThis;
})();
export { CacheWarmupService };
//# sourceMappingURL=cache-warmup.service.js.map