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
import { Cron } from '@nestjs/schedule';
import { CacheLevel } from '../enums/cache-level.enum';
/**
 * 缓存监控服务
 * 实时监控缓存性能和健康状态
 */
let CacheMonitorService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _cleanOldPerformanceData_decorators;
    var CacheMonitorService = _classThis = class {
        constructor(cacheService, l1Cache, l2Cache, l3Cache) {
            this.cacheService = (__runInitializers(this, _instanceExtraInitializers), cacheService);
            this.l1Cache = l1Cache;
            this.l2Cache = l2Cache;
            this.l3Cache = l3Cache;
            this.logger = new Logger(CacheMonitorService.name);
            this.performanceData = new Map();
            this.maxDataPoints = 1000;
        }
        /**
         * 每分钟清理过期的性能数据（使用 @nestjs/schedule）
         */
        cleanOldPerformanceData() {
            const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
            for (const [levelKey, data] of this.performanceData.entries()) {
                const filteredData = data.filter((point) => point.timestamp >= cutoffTime);
                this.performanceData.set(levelKey, filteredData);
            }
            this.logger.debug('已清理过期的性能数据');
        }
        /**
         * 获取缓存统计信息
         */
        async getStats() {
            return this.cacheService.getStats();
        }
        /**
         * 获取缓存健康状态
         */
        async getHealthStatus() {
            const [l1Status, l2Status, l3Status] = await Promise.all([
                this.getLevelHealthStatus(CacheLevel.L1),
                this.getLevelHealthStatus(CacheLevel.L2),
                this.getLevelHealthStatus(CacheLevel.L3),
            ]);
            // 确定整体健康状态
            let overall = 'healthy';
            if (l1Status.status === 'unhealthy' ||
                l2Status.status === 'unhealthy' ||
                l3Status.status === 'unhealthy') {
                overall = 'unhealthy';
            }
            else if (l1Status.status === 'degraded' ||
                l2Status.status === 'degraded' ||
                l3Status.status === 'degraded') {
                overall = 'degraded';
            }
            return {
                L1: l1Status,
                L2: l2Status,
                L3: l3Status,
                overall,
            };
        }
        /**
         * 获取性能指标
         */
        async getPerformanceMetrics() {
            const metrics = new Map();
            for (const level of [CacheLevel.L1, CacheLevel.L2, CacheLevel.L3]) {
                const levelMetrics = this.calculatePerformanceMetrics(level);
                metrics.set(level, levelMetrics);
            }
            return metrics;
        }
        /**
         * 获取热点数据
         */
        async getHotData(limit = 100) {
            const l3HotData = await this.l3Cache.getHotData(limit);
            return l3HotData.map((data) => {
                const minutesSinceLastAccess = (Date.now() - data.lastAccessedAt.getTime()) / 60000;
                const accessFrequency = data.accessCount / Math.max(minutesSinceLastAccess, 1);
                return {
                    key: data.key,
                    accessCount: data.accessCount,
                    lastAccessTime: data.lastAccessedAt,
                    accessFrequency,
                };
            });
        }
        /**
         * 记录性能数据
         */
        recordPerformance(level, responseTime, success) {
            const levelKey = level.toString();
            const data = this.performanceData.get(levelKey) || [];
            data.push({
                timestamp: Date.now(),
                responseTime,
                success,
            });
            // 限制数据点数量
            if (data.length > this.maxDataPoints) {
                data.shift();
            }
            this.performanceData.set(levelKey, data);
        }
        /**
         * 获取性能趋势
         */
        getPerformanceTrend(level, minutes = 60) {
            const levelKey = level.toString();
            const data = this.performanceData.get(levelKey) || [];
            const cutoffTime = Date.now() - minutes * 60000;
            const recentData = data.filter((point) => point.timestamp >= cutoffTime);
            // 按分钟聚合数据
            const aggregated = new Map();
            for (const point of recentData) {
                const minute = Math.floor(point.timestamp / 60000) * 60000;
                const aggregatedPoint = aggregated.get(minute) || {
                    responseTimes: [],
                    errors: 0,
                };
                aggregatedPoint.responseTimes.push(point.responseTime);
                if (!point.success) {
                    aggregatedPoint.errors++;
                }
                aggregated.set(minute, aggregatedPoint);
            }
            const sortedMinutes = Array.from(aggregated.keys()).sort();
            const timestamps = sortedMinutes;
            const avgResponseTimes = sortedMinutes.map((minute) => {
                const point = aggregated.get(minute);
                return (point.responseTimes.reduce((sum, time) => sum + time, 0) /
                    point.responseTimes.length);
            });
            const errorRates = sortedMinutes.map((minute) => {
                const point = aggregated.get(minute);
                return (point.errors / point.responseTimes.length) * 100;
            });
            return {
                timestamps,
                avgResponseTimes,
                errorRates,
            };
        }
        /**
         * 重置性能数据
         */
        resetPerformanceData(level) {
            if (level) {
                this.performanceData.delete(level.toString());
                this.logger.debug(`已重置 ${level} 性能数据`);
            }
            else {
                this.performanceData.clear();
                this.logger.debug('已重置所有性能数据');
            }
        }
        /**
         * 获取缓存大小趋势
         */
        async getSizeTrend(minutes = 60) {
            // 这里应该从持久化存储中读取历史数据
            // 目前返回当前大小
            const stats = await this.cacheService.getStats();
            const trend = new Map();
            for (const level of [CacheLevel.L1, CacheLevel.L2, CacheLevel.L3]) {
                const levelStats = stats.levels[level];
                trend.set(level, [levelStats.size]);
            }
            return trend;
        }
        /**
         * 获取监控摘要
         */
        async getMonitoringSummary() {
            const [stats, healthStatus, performanceMetrics, hotData] = await Promise.all([
                this.getStats(),
                this.getHealthStatus(),
                this.getPerformanceMetrics(),
                this.getHotData(10),
            ]);
            return {
                stats,
                healthStatus,
                performanceMetrics: Object.fromEntries(performanceMetrics),
                hotData: hotData.slice(0, 10),
                timestamp: new Date(),
            };
        }
        /**
         * 检查缓存警告
         */
        async checkWarnings() {
            const warnings = [];
            const stats = await this.getStats();
            // 检查 L1 缓存容量
            const l1Stats = stats.levels.L1;
            if (l1Stats.size > l1Stats.maxCapacity * 0.9) {
                warnings.push(`L1 缓存容量使用率超过 90% (${l1Stats.size}/${l1Stats.maxCapacity})`);
            }
            // 检查命中率
            if (stats.summary.overallHitRate < 70) {
                warnings.push(`整体缓存命中率低于 70% (${stats.summary.overallHitRate.toFixed(2)}%)`);
            }
            // 检查 L2 连接状态
            const l2Stats = stats.levels.L2;
            if (!l2Stats.isConnected) {
                warnings.push('L2 缓存（Redis）连接断开');
            }
            // 检查内存使用
            const memoryUsageMB = stats.summary.totalMemoryUsage / 1024 / 1024;
            if (memoryUsageMB > 500) {
                warnings.push(`缓存内存使用超过 500MB (${memoryUsageMB.toFixed(2)}MB)`);
            }
            return warnings;
        }
        /**
         * 获取级别健康状态
         */
        async getLevelHealthStatus(level) {
            const now = new Date();
            let status = 'healthy';
            let availability = 100;
            let error;
            try {
                switch (level) {
                    case CacheLevel.L1:
                        // L1 总是健康的（内存缓存）
                        status = 'healthy';
                        break;
                    case CacheLevel.L2: {
                        // 检查 Redis 连接
                        const l2Connected = this.l2Cache.isReady();
                        if (!l2Connected) {
                            status = 'unhealthy';
                            availability = 0;
                            error = 'Redis 连接断开';
                        }
                        break;
                    }
                    case CacheLevel.L3: {
                        // 检查数据库连接
                        await this.l3Cache.size();
                        status = 'healthy';
                        break;
                    }
                }
            }
            catch (err) {
                status = 'unhealthy';
                availability = 0;
                error = err instanceof Error ? err.message : '未知错误';
            }
            return {
                level,
                status,
                lastCheckTime: now,
                availability,
                error,
            };
        }
        /**
         * 计算性能指标
         */
        calculatePerformanceMetrics(level) {
            const levelKey = level.toString();
            const data = this.performanceData.get(levelKey) || [];
            if (data.length === 0) {
                return {
                    avgResponseTime: 0,
                    p50ResponseTime: 0,
                    p95ResponseTime: 0,
                    p99ResponseTime: 0,
                    throughput: 0,
                    errorRate: 0,
                };
            }
            const responseTimes = data
                .map((point) => point.responseTime)
                .sort((a, b) => a - b);
            const errors = data.filter((point) => !point.success).length;
            // 计算百分位数
            const p50Index = Math.floor(responseTimes.length * 0.5);
            const p95Index = Math.floor(responseTimes.length * 0.95);
            const p99Index = Math.floor(responseTimes.length * 0.99);
            // 计算吞吐量（请求/秒）
            const firstData = data[0];
            const lastData = data[data.length - 1];
            const timeSpan = firstData && lastData
                ? (lastData.timestamp - firstData.timestamp) / 1000
                : 0;
            const throughput = timeSpan > 0 ? data.length / timeSpan : 0;
            return {
                avgResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) /
                    responseTimes.length,
                p50ResponseTime: responseTimes[p50Index] ?? 0,
                p95ResponseTime: responseTimes[p95Index] ?? 0,
                p99ResponseTime: responseTimes[p99Index] ?? 0,
                throughput,
                errorRate: (errors / data.length) * 100,
            };
        }
    };
    __setFunctionName(_classThis, "CacheMonitorService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _cleanOldPerformanceData_decorators = [Cron('0 * * * * *')];
        __esDecorate(_classThis, null, _cleanOldPerformanceData_decorators, { kind: "method", name: "cleanOldPerformanceData", static: false, private: false, access: { has: obj => "cleanOldPerformanceData" in obj, get: obj => obj.cleanOldPerformanceData }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheMonitorService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheMonitorService = _classThis;
})();
export { CacheMonitorService };
//# sourceMappingURL=cache-monitor.service.js.map