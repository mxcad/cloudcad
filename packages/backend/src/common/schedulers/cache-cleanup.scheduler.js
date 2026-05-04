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
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
let CacheCleanupScheduler = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _handleCacheCleanup_decorators;
    let _logCacheStats_decorators;
    let _logHealthStatus_decorators;
    var CacheCleanupScheduler = _classThis = class {
        constructor(cacheService, cacheMonitorService, l3Cache) {
            this.cacheService = (__runInitializers(this, _instanceExtraInitializers), cacheService);
            this.cacheMonitorService = cacheMonitorService;
            this.l3Cache = l3Cache;
            this.logger = new Logger(CacheCleanupScheduler.name);
        }
        /**
         * 每 10 分钟执行一次缓存清理
         */
        async handleCacheCleanup() {
            try {
                // 清理 L3 数据库缓存中的过期缓存
                const cleanedCount = await this.l3Cache.cleanExpired();
                if (cleanedCount > 0) {
                    this.logger.log(`L3 缓存清理完成: 清理了 ${cleanedCount} 个过期缓存`);
                }
                // 检查缓存警告
                const warnings = await this.cacheMonitorService.checkWarnings();
                if (warnings.length > 0) {
                    this.logger.warn(`缓存警告: ${warnings.join('; ')}`);
                }
            }
            catch (error) {
                this.logger.error(`缓存清理失败: ${error.message}`, error.stack);
            }
        }
        /**
         * 每小时记录缓存统计信息
         */
        async logCacheStats() {
            try {
                const stats = await this.cacheService.getStats();
                this.logger.log(`权限缓存统计 - 缓存条目: ${stats.totalEntries}, 容量: ${stats.capacity}, 内存使用: ${stats.memoryUsage}, 命中率: ${stats.hitRate.toFixed(2)}%`);
            }
            catch (error) {
                this.logger.error(`记录缓存统计失败: ${error.message}`, error.stack);
            }
        }
        /**
         * 每天记录健康状态
         */
        async logHealthStatus() {
            try {
                const healthStatus = await this.cacheMonitorService.getHealthStatus();
                this.logger.log(`缓存健康状态 - L1: ${healthStatus.L1.status}, L2: ${healthStatus.L2.status}, L3: ${healthStatus.L3.status}, 整体: ${healthStatus.overall}`);
            }
            catch (error) {
                this.logger.error(`记录健康状态失败: ${error.message}`, error.stack);
            }
        }
    };
    __setFunctionName(_classThis, "CacheCleanupScheduler");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _handleCacheCleanup_decorators = [Cron(CronExpression.EVERY_10_MINUTES)];
        _logCacheStats_decorators = [Cron(CronExpression.EVERY_HOUR)];
        _logHealthStatus_decorators = [Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)];
        __esDecorate(_classThis, null, _handleCacheCleanup_decorators, { kind: "method", name: "handleCacheCleanup", static: false, private: false, access: { has: obj => "handleCacheCleanup" in obj, get: obj => obj.handleCacheCleanup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _logCacheStats_decorators, { kind: "method", name: "logCacheStats", static: false, private: false, access: { has: obj => "logCacheStats" in obj, get: obj => obj.logCacheStats }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _logHealthStatus_decorators, { kind: "method", name: "logHealthStatus", static: false, private: false, access: { has: obj => "logHealthStatus" in obj, get: obj => obj.logHealthStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheCleanupScheduler = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheCleanupScheduler = _classThis;
})();
export { CacheCleanupScheduler };
//# sourceMappingURL=cache-cleanup.scheduler.js.map