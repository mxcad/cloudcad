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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, BadRequestException, NotFoundException, Logger, } from '@nestjs/common';
import { RUNTIME_CONFIG_DEFINITIONS, } from './runtime-config.constants';
const CACHE_PREFIX = 'runtime_config:';
const CACHE_TTL = 3600; // 1 小时
let RuntimeConfigService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RuntimeConfigService = _classThis = class {
        constructor(prisma, redis) {
            this.prisma = prisma;
            this.redis = redis;
            this.logger = new Logger(RuntimeConfigService.name);
        }
        /**
         * 模块初始化时同步默认配置到数据库
         * 优化：使用异步并行同步，不阻塞启动
         */
        async onModuleInit() {
            // 异步同步配置，不阻塞启动
            this.syncDefaultConfigs().catch((error) => {
                this.logger.error('运行时配置同步失败:', error);
            });
        }
        /**
         * 同步默认配置到数据库（仅添加不存在的配置项）
         * 优化：使用批量操作减少数据库往返
         */
        async syncDefaultConfigs() {
            const startTime = Date.now();
            // 获取所有已存在的配置
            const existingConfigs = await this.prisma.runtimeConfig.findMany({
                select: { key: true },
            });
            const existingKeys = new Set(existingConfigs.map((c) => c.key));
            // 过滤出不存在的配置
            const newConfigs = RUNTIME_CONFIG_DEFINITIONS.filter((def) => !existingKeys.has(def.key));
            if (newConfigs.length === 0) {
                return;
            }
            // 批量创建新配置
            await this.prisma.runtimeConfig.createMany({
                data: newConfigs.map((def) => ({
                    key: def.key,
                    value: JSON.stringify(def.defaultValue),
                    type: def.type,
                    category: def.category,
                    description: def.description,
                    isPublic: def.isPublic,
                })),
                skipDuplicates: true,
            });
            this.logger.log(`运行时配置同步完成: 创建 ${newConfigs.length} 个配置，耗时 ${Date.now() - startTime}ms`);
        }
        /**
         * 获取单个配置值（用于内部调用）
         */
        async getValue(key, defaultValue) {
            // 1. 查 Redis 缓存
            const cached = await this.redis.get(`${CACHE_PREFIX}${key}`);
            if (cached !== null) {
                return JSON.parse(cached);
            }
            // 2. 查数据库
            const config = await this.prisma.runtimeConfig.findUnique({
                where: { key },
            });
            if (!config) {
                // 3. 使用传入的默认值或配置定义中的默认值
                const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
                const value = defaultValue ?? def?.defaultValue;
                return value;
            }
            // 4. 解析值并写入缓存
            const value = this.parseValue(config.value, config.type);
            await this.redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL, JSON.stringify(value));
            return value;
        }
        /**
         * 获取单个配置项（用于 Controller 返回）
         */
        async get(key) {
            const config = await this.prisma.runtimeConfig.findUnique({
                where: { key },
            });
            if (!config) {
                throw new NotFoundException(`配置项不存在: ${key}`);
            }
            return {
                key: config.key,
                value: this.parseValue(config.value, config.type),
                type: config.type,
                category: config.category,
                description: config.description,
                isPublic: config.isPublic,
                updatedBy: config.updatedBy,
                updatedAt: config.updatedAt,
            };
        }
        /**
         * 设置配置值
         */
        async set(key, value, operatorId, operatorIp) {
            const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
            if (!def) {
                throw new BadRequestException(`未知的配置项: ${key}`);
            }
            // 获取旧值用于日志
            const oldConfig = await this.prisma.runtimeConfig.findUnique({
                where: { key },
            });
            const oldValue = oldConfig?.value;
            // 更新数据库
            await this.prisma.runtimeConfig.upsert({
                where: { key },
                update: {
                    value: JSON.stringify(value),
                    updatedBy: operatorId,
                },
                create: {
                    key,
                    value: JSON.stringify(value),
                    type: def.type,
                    category: def.category,
                    description: def.description,
                    isPublic: def.isPublic,
                    updatedBy: operatorId,
                },
            });
            // 记录日志
            await this.prisma.runtimeConfigLog.create({
                data: {
                    key,
                    oldValue,
                    newValue: JSON.stringify(value),
                    operatorId,
                    operatorIp,
                },
            });
            // 删除缓存
            await this.redis.del(`${CACHE_PREFIX}${key}`);
            await this.redis.del(`${CACHE_PREFIX}all`);
        }
        /**
         * 获取所有公开配置（供前端使用）
         */
        async getPublicConfigs() {
            // 1. 查缓存
            const cached = await this.redis.get(`${CACHE_PREFIX}all`);
            if (cached !== null) {
                return JSON.parse(cached);
            }
            // 2. 查数据库
            const configs = await this.prisma.runtimeConfig.findMany({
                where: { isPublic: true },
            });
            // 3. 构建结果
            const result = {};
            for (const config of configs) {
                result[config.key] = this.parseValue(config.value, config.type);
            }
            // 4. 写入缓存
            await this.redis.setex(`${CACHE_PREFIX}all`, CACHE_TTL, JSON.stringify(result));
            return result;
        }
        /**
         * 获取所有配置项（管理后台使用）
         */
        async getAllConfigs() {
            const configs = await this.prisma.runtimeConfig.findMany({
                orderBy: [{ category: 'asc' }, { key: 'asc' }],
            });
            return configs.map((config) => ({
                key: config.key,
                value: this.parseValue(config.value, config.type),
                type: config.type,
                category: config.category,
                description: config.description,
                isPublic: config.isPublic,
                updatedBy: config.updatedBy,
                updatedAt: config.updatedAt,
            }));
        }
        /**
         * 重置配置为默认值
         */
        async resetToDefault(key, operatorId, operatorIp) {
            const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
            if (!def) {
                throw new BadRequestException(`未知的配置项: ${key}`);
            }
            await this.set(key, def.defaultValue, operatorId, operatorIp);
        }
        /**
         * 解析配置值
         */
        parseValue(value, type) {
            try {
                const parsed = JSON.parse(value);
                switch (type) {
                    case 'boolean':
                        return Boolean(parsed);
                    case 'number':
                        return Number(parsed);
                    default:
                        return String(parsed);
                }
            }
            catch {
                return value;
            }
        }
        /**
         * 获取配置定义列表
         */
        getDefinitions() {
            return RUNTIME_CONFIG_DEFINITIONS;
        }
    };
    __setFunctionName(_classThis, "RuntimeConfigService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RuntimeConfigService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RuntimeConfigService = _classThis;
})();
export { RuntimeConfigService };
//# sourceMappingURL=runtime-config.service.js.map