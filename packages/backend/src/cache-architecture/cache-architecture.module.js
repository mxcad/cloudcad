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
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../database/database.module';
import { RedisCacheService } from '../common/services/redis-cache.service';
// Providers
import { L1CacheProvider } from './providers/l1-cache.provider';
import { L2CacheProvider } from './providers/l2-cache.provider';
import { L3CacheProvider } from './providers/l3-cache.provider';
// Strategies
import { HotDataStrategy } from './strategies/hot-data.strategy';
import { PermissionStrategy } from './strategies/permission.strategy';
import { RoleStrategy } from './strategies/role.strategy';
// Services
import { MultiLevelCacheService } from './services/multi-level-cache.service';
import { CacheWarmupService } from './services/cache-warmup.service';
import { CacheMonitorService } from './services/cache-monitor.service';
import { CacheVersionService } from './services/cache-version.service';
// Controllers
import { CacheMonitorController } from './controllers/cache-monitor.controller';
/**
 * 缓存架构模块
 * 提供三级缓存架构（L1 内存、L2 Redis、L3 数据库）
 *
 * 功能：
 * - 三级缓存管理
 * - 智能缓存预热
 * - 实时性能监控
 * - 缓存健康检查
 * - 热点数据识别
 */
let CacheArchitectureModule = (() => {
    let _classDecorators = [Global(), Module({
            imports: [
                ConfigModule,
                ScheduleModule.forRoot(),
                DatabaseModule,
            ], controllers: [CacheMonitorController],
            providers: [
                // 缓存提供者
                L1CacheProvider,
                L2CacheProvider,
                L3CacheProvider,
                // 预热策略
                HotDataStrategy,
                PermissionStrategy,
                RoleStrategy,
                // 缓存服务
                MultiLevelCacheService,
                CacheWarmupService,
                CacheMonitorService,
                CacheVersionService,
                RedisCacheService,
            ],
            exports: [
                // 导出缓存提供者
                L1CacheProvider,
                L2CacheProvider,
                L3CacheProvider,
                // 导出预热策略
                HotDataStrategy,
                PermissionStrategy,
                RoleStrategy,
                // 导出缓存服务
                MultiLevelCacheService,
                CacheWarmupService,
                CacheMonitorService,
                CacheVersionService,
                RedisCacheService,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var CacheArchitectureModule = _classThis = class {
        /**
         * 模块初始化
         */
        onModuleInit() {
            // 可以在这里执行模块初始化逻辑
            console.log('CacheArchitectureModule 已初始化');
        }
    };
    __setFunctionName(_classThis, "CacheArchitectureModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheArchitectureModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheArchitectureModule = _classThis;
})();
export { CacheArchitectureModule };
//# sourceMappingURL=cache-architecture.module.js.map