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
import { ApiProperty } from '@nestjs/swagger';
/**
 * 缓存统计 DTO
 */
let CacheStatsDto = (() => {
    var _a;
    let _level_decorators;
    let _level_initializers = [];
    let _level_extraInitializers = [];
    let _size_decorators;
    let _size_initializers = [];
    let _size_extraInitializers = [];
    let _hits_decorators;
    let _hits_initializers = [];
    let _hits_extraInitializers = [];
    let _misses_decorators;
    let _misses_initializers = [];
    let _misses_extraInitializers = [];
    let _hitRate_decorators;
    let _hitRate_initializers = [];
    let _hitRate_extraInitializers = [];
    let _totalRequests_decorators;
    let _totalRequests_initializers = [];
    let _totalRequests_extraInitializers = [];
    let _memoryUsage_decorators;
    let _memoryUsage_initializers = [];
    let _memoryUsage_extraInitializers = [];
    return _a = class CacheStatsDto {
            constructor() {
                this.level = __runInitializers(this, _level_initializers, void 0);
                this.size = (__runInitializers(this, _level_extraInitializers), __runInitializers(this, _size_initializers, void 0));
                this.hits = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _hits_initializers, void 0));
                this.misses = (__runInitializers(this, _hits_extraInitializers), __runInitializers(this, _misses_initializers, void 0));
                this.hitRate = (__runInitializers(this, _misses_extraInitializers), __runInitializers(this, _hitRate_initializers, void 0));
                this.totalRequests = (__runInitializers(this, _hitRate_extraInitializers), __runInitializers(this, _totalRequests_initializers, void 0));
                this.memoryUsage = (__runInitializers(this, _totalRequests_extraInitializers), __runInitializers(this, _memoryUsage_initializers, void 0));
                __runInitializers(this, _memoryUsage_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _level_decorators = [ApiProperty({ description: '缓存级别' })];
            _size_decorators = [ApiProperty({ description: '缓存大小' })];
            _hits_decorators = [ApiProperty({ description: '命中次数' })];
            _misses_decorators = [ApiProperty({ description: '未命中次数' })];
            _hitRate_decorators = [ApiProperty({ description: '命中率' })];
            _totalRequests_decorators = [ApiProperty({ description: '总请求数' })];
            _memoryUsage_decorators = [ApiProperty({ description: '内存使用量（字节）' })];
            __esDecorate(null, null, _level_decorators, { kind: "field", name: "level", static: false, private: false, access: { has: obj => "level" in obj, get: obj => obj.level, set: (obj, value) => { obj.level = value; } }, metadata: _metadata }, _level_initializers, _level_extraInitializers);
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _hits_decorators, { kind: "field", name: "hits", static: false, private: false, access: { has: obj => "hits" in obj, get: obj => obj.hits, set: (obj, value) => { obj.hits = value; } }, metadata: _metadata }, _hits_initializers, _hits_extraInitializers);
            __esDecorate(null, null, _misses_decorators, { kind: "field", name: "misses", static: false, private: false, access: { has: obj => "misses" in obj, get: obj => obj.misses, set: (obj, value) => { obj.misses = value; } }, metadata: _metadata }, _misses_initializers, _misses_extraInitializers);
            __esDecorate(null, null, _hitRate_decorators, { kind: "field", name: "hitRate", static: false, private: false, access: { has: obj => "hitRate" in obj, get: obj => obj.hitRate, set: (obj, value) => { obj.hitRate = value; } }, metadata: _metadata }, _hitRate_initializers, _hitRate_extraInitializers);
            __esDecorate(null, null, _totalRequests_decorators, { kind: "field", name: "totalRequests", static: false, private: false, access: { has: obj => "totalRequests" in obj, get: obj => obj.totalRequests, set: (obj, value) => { obj.totalRequests = value; } }, metadata: _metadata }, _totalRequests_initializers, _totalRequests_extraInitializers);
            __esDecorate(null, null, _memoryUsage_decorators, { kind: "field", name: "memoryUsage", static: false, private: false, access: { has: obj => "memoryUsage" in obj, get: obj => obj.memoryUsage, set: (obj, value) => { obj.memoryUsage = value; } }, metadata: _metadata }, _memoryUsage_initializers, _memoryUsage_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheStatsDto };
/**
 * 缓存健康状态 DTO
 */
let CacheHealthStatusDto = (() => {
    var _a;
    let _level_decorators;
    let _level_initializers = [];
    let _level_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _lastCheckTime_decorators;
    let _lastCheckTime_initializers = [];
    let _lastCheckTime_extraInitializers = [];
    let _availability_decorators;
    let _availability_initializers = [];
    let _availability_extraInitializers = [];
    let _error_decorators;
    let _error_initializers = [];
    let _error_extraInitializers = [];
    return _a = class CacheHealthStatusDto {
            constructor() {
                this.level = __runInitializers(this, _level_initializers, void 0);
                this.status = (__runInitializers(this, _level_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.lastCheckTime = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _lastCheckTime_initializers, void 0));
                this.availability = (__runInitializers(this, _lastCheckTime_extraInitializers), __runInitializers(this, _availability_initializers, void 0));
                this.error = (__runInitializers(this, _availability_extraInitializers), __runInitializers(this, _error_initializers, void 0));
                __runInitializers(this, _error_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _level_decorators = [ApiProperty({ description: '缓存级别' })];
            _status_decorators = [ApiProperty({
                    description: '健康状态',
                    enum: ['healthy', 'degraded', 'unhealthy'],
                })];
            _lastCheckTime_decorators = [ApiProperty({ description: '最后检查时间' })];
            _availability_decorators = [ApiProperty({ description: '可用性（0-100）' })];
            _error_decorators = [ApiProperty({ description: '错误信息', required: false })];
            __esDecorate(null, null, _level_decorators, { kind: "field", name: "level", static: false, private: false, access: { has: obj => "level" in obj, get: obj => obj.level, set: (obj, value) => { obj.level = value; } }, metadata: _metadata }, _level_initializers, _level_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _lastCheckTime_decorators, { kind: "field", name: "lastCheckTime", static: false, private: false, access: { has: obj => "lastCheckTime" in obj, get: obj => obj.lastCheckTime, set: (obj, value) => { obj.lastCheckTime = value; } }, metadata: _metadata }, _lastCheckTime_initializers, _lastCheckTime_extraInitializers);
            __esDecorate(null, null, _availability_decorators, { kind: "field", name: "availability", static: false, private: false, access: { has: obj => "availability" in obj, get: obj => obj.availability, set: (obj, value) => { obj.availability = value; } }, metadata: _metadata }, _availability_initializers, _availability_extraInitializers);
            __esDecorate(null, null, _error_decorators, { kind: "field", name: "error", static: false, private: false, access: { has: obj => "error" in obj, get: obj => obj.error, set: (obj, value) => { obj.error = value; } }, metadata: _metadata }, _error_initializers, _error_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheHealthStatusDto };
/**
 * 缓存性能指标 DTO
 */
let CachePerformanceMetricsDto = (() => {
    var _a;
    let _avgResponseTime_decorators;
    let _avgResponseTime_initializers = [];
    let _avgResponseTime_extraInitializers = [];
    let _p50ResponseTime_decorators;
    let _p50ResponseTime_initializers = [];
    let _p50ResponseTime_extraInitializers = [];
    let _p95ResponseTime_decorators;
    let _p95ResponseTime_initializers = [];
    let _p95ResponseTime_extraInitializers = [];
    let _p99ResponseTime_decorators;
    let _p99ResponseTime_initializers = [];
    let _p99ResponseTime_extraInitializers = [];
    let _throughput_decorators;
    let _throughput_initializers = [];
    let _throughput_extraInitializers = [];
    let _errorRate_decorators;
    let _errorRate_initializers = [];
    let _errorRate_extraInitializers = [];
    return _a = class CachePerformanceMetricsDto {
            constructor() {
                this.avgResponseTime = __runInitializers(this, _avgResponseTime_initializers, void 0);
                this.p50ResponseTime = (__runInitializers(this, _avgResponseTime_extraInitializers), __runInitializers(this, _p50ResponseTime_initializers, void 0));
                this.p95ResponseTime = (__runInitializers(this, _p50ResponseTime_extraInitializers), __runInitializers(this, _p95ResponseTime_initializers, void 0));
                this.p99ResponseTime = (__runInitializers(this, _p95ResponseTime_extraInitializers), __runInitializers(this, _p99ResponseTime_initializers, void 0));
                this.throughput = (__runInitializers(this, _p99ResponseTime_extraInitializers), __runInitializers(this, _throughput_initializers, void 0));
                this.errorRate = (__runInitializers(this, _throughput_extraInitializers), __runInitializers(this, _errorRate_initializers, void 0));
                __runInitializers(this, _errorRate_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _avgResponseTime_decorators = [ApiProperty({ description: '平均响应时间（毫秒）' })];
            _p50ResponseTime_decorators = [ApiProperty({ description: 'P50 响应时间（毫秒）' })];
            _p95ResponseTime_decorators = [ApiProperty({ description: 'P95 响应时间（毫秒）' })];
            _p99ResponseTime_decorators = [ApiProperty({ description: 'P99 响应时间（毫秒）' })];
            _throughput_decorators = [ApiProperty({ description: '吞吐量（请求/秒）' })];
            _errorRate_decorators = [ApiProperty({ description: '错误率（0-100）' })];
            __esDecorate(null, null, _avgResponseTime_decorators, { kind: "field", name: "avgResponseTime", static: false, private: false, access: { has: obj => "avgResponseTime" in obj, get: obj => obj.avgResponseTime, set: (obj, value) => { obj.avgResponseTime = value; } }, metadata: _metadata }, _avgResponseTime_initializers, _avgResponseTime_extraInitializers);
            __esDecorate(null, null, _p50ResponseTime_decorators, { kind: "field", name: "p50ResponseTime", static: false, private: false, access: { has: obj => "p50ResponseTime" in obj, get: obj => obj.p50ResponseTime, set: (obj, value) => { obj.p50ResponseTime = value; } }, metadata: _metadata }, _p50ResponseTime_initializers, _p50ResponseTime_extraInitializers);
            __esDecorate(null, null, _p95ResponseTime_decorators, { kind: "field", name: "p95ResponseTime", static: false, private: false, access: { has: obj => "p95ResponseTime" in obj, get: obj => obj.p95ResponseTime, set: (obj, value) => { obj.p95ResponseTime = value; } }, metadata: _metadata }, _p95ResponseTime_initializers, _p95ResponseTime_extraInitializers);
            __esDecorate(null, null, _p99ResponseTime_decorators, { kind: "field", name: "p99ResponseTime", static: false, private: false, access: { has: obj => "p99ResponseTime" in obj, get: obj => obj.p99ResponseTime, set: (obj, value) => { obj.p99ResponseTime = value; } }, metadata: _metadata }, _p99ResponseTime_initializers, _p99ResponseTime_extraInitializers);
            __esDecorate(null, null, _throughput_decorators, { kind: "field", name: "throughput", static: false, private: false, access: { has: obj => "throughput" in obj, get: obj => obj.throughput, set: (obj, value) => { obj.throughput = value; } }, metadata: _metadata }, _throughput_initializers, _throughput_extraInitializers);
            __esDecorate(null, null, _errorRate_decorators, { kind: "field", name: "errorRate", static: false, private: false, access: { has: obj => "errorRate" in obj, get: obj => obj.errorRate, set: (obj, value) => { obj.errorRate = value; } }, metadata: _metadata }, _errorRate_initializers, _errorRate_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CachePerformanceMetricsDto };
/**
 * 热点数据 DTO
 */
let HotDataDto = (() => {
    var _a;
    let _key_decorators;
    let _key_initializers = [];
    let _key_extraInitializers = [];
    let _accessCount_decorators;
    let _accessCount_initializers = [];
    let _accessCount_extraInitializers = [];
    let _lastAccessTime_decorators;
    let _lastAccessTime_initializers = [];
    let _lastAccessTime_extraInitializers = [];
    let _accessFrequency_decorators;
    let _accessFrequency_initializers = [];
    let _accessFrequency_extraInitializers = [];
    return _a = class HotDataDto {
            constructor() {
                this.key = __runInitializers(this, _key_initializers, void 0);
                this.accessCount = (__runInitializers(this, _key_extraInitializers), __runInitializers(this, _accessCount_initializers, void 0));
                this.lastAccessTime = (__runInitializers(this, _accessCount_extraInitializers), __runInitializers(this, _lastAccessTime_initializers, void 0));
                this.accessFrequency = (__runInitializers(this, _lastAccessTime_extraInitializers), __runInitializers(this, _accessFrequency_initializers, void 0));
                __runInitializers(this, _accessFrequency_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _key_decorators = [ApiProperty({ description: '缓存键' })];
            _accessCount_decorators = [ApiProperty({ description: '访问次数' })];
            _lastAccessTime_decorators = [ApiProperty({ description: '最后访问时间' })];
            _accessFrequency_decorators = [ApiProperty({ description: '访问频率（次/分钟）' })];
            __esDecorate(null, null, _key_decorators, { kind: "field", name: "key", static: false, private: false, access: { has: obj => "key" in obj, get: obj => obj.key, set: (obj, value) => { obj.key = value; } }, metadata: _metadata }, _key_initializers, _key_extraInitializers);
            __esDecorate(null, null, _accessCount_decorators, { kind: "field", name: "accessCount", static: false, private: false, access: { has: obj => "accessCount" in obj, get: obj => obj.accessCount, set: (obj, value) => { obj.accessCount = value; } }, metadata: _metadata }, _accessCount_initializers, _accessCount_extraInitializers);
            __esDecorate(null, null, _lastAccessTime_decorators, { kind: "field", name: "lastAccessTime", static: false, private: false, access: { has: obj => "lastAccessTime" in obj, get: obj => obj.lastAccessTime, set: (obj, value) => { obj.lastAccessTime = value; } }, metadata: _metadata }, _lastAccessTime_initializers, _lastAccessTime_extraInitializers);
            __esDecorate(null, null, _accessFrequency_decorators, { kind: "field", name: "accessFrequency", static: false, private: false, access: { has: obj => "accessFrequency" in obj, get: obj => obj.accessFrequency, set: (obj, value) => { obj.accessFrequency = value; } }, metadata: _metadata }, _accessFrequency_initializers, _accessFrequency_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { HotDataDto };
/**
 * 缓存监控摘要 DTO
 */
let CacheMonitoringSummaryDto = (() => {
    var _a;
    let _stats_decorators;
    let _stats_initializers = [];
    let _stats_extraInitializers = [];
    let _healthStatus_decorators;
    let _healthStatus_initializers = [];
    let _healthStatus_extraInitializers = [];
    let _performanceMetrics_decorators;
    let _performanceMetrics_initializers = [];
    let _performanceMetrics_extraInitializers = [];
    let _hotData_decorators;
    let _hotData_initializers = [];
    let _hotData_extraInitializers = [];
    let _timestamp_decorators;
    let _timestamp_initializers = [];
    let _timestamp_extraInitializers = [];
    return _a = class CacheMonitoringSummaryDto {
            constructor() {
                this.stats = __runInitializers(this, _stats_initializers, void 0);
                this.healthStatus = (__runInitializers(this, _stats_extraInitializers), __runInitializers(this, _healthStatus_initializers, void 0));
                this.performanceMetrics = (__runInitializers(this, _healthStatus_extraInitializers), __runInitializers(this, _performanceMetrics_initializers, void 0));
                this.hotData = (__runInitializers(this, _performanceMetrics_extraInitializers), __runInitializers(this, _hotData_initializers, void 0));
                this.timestamp = (__runInitializers(this, _hotData_extraInitializers), __runInitializers(this, _timestamp_initializers, void 0));
                __runInitializers(this, _timestamp_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _stats_decorators = [ApiProperty({ description: '缓存统计' })];
            _healthStatus_decorators = [ApiProperty({ description: '健康状态' })];
            _performanceMetrics_decorators = [ApiProperty({ description: '性能指标' })];
            _hotData_decorators = [ApiProperty({ description: '热点数据' })];
            _timestamp_decorators = [ApiProperty({ description: '时间戳' })];
            __esDecorate(null, null, _stats_decorators, { kind: "field", name: "stats", static: false, private: false, access: { has: obj => "stats" in obj, get: obj => obj.stats, set: (obj, value) => { obj.stats = value; } }, metadata: _metadata }, _stats_initializers, _stats_extraInitializers);
            __esDecorate(null, null, _healthStatus_decorators, { kind: "field", name: "healthStatus", static: false, private: false, access: { has: obj => "healthStatus" in obj, get: obj => obj.healthStatus, set: (obj, value) => { obj.healthStatus = value; } }, metadata: _metadata }, _healthStatus_initializers, _healthStatus_extraInitializers);
            __esDecorate(null, null, _performanceMetrics_decorators, { kind: "field", name: "performanceMetrics", static: false, private: false, access: { has: obj => "performanceMetrics" in obj, get: obj => obj.performanceMetrics, set: (obj, value) => { obj.performanceMetrics = value; } }, metadata: _metadata }, _performanceMetrics_initializers, _performanceMetrics_extraInitializers);
            __esDecorate(null, null, _hotData_decorators, { kind: "field", name: "hotData", static: false, private: false, access: { has: obj => "hotData" in obj, get: obj => obj.hotData, set: (obj, value) => { obj.hotData = value; } }, metadata: _metadata }, _hotData_initializers, _hotData_extraInitializers);
            __esDecorate(null, null, _timestamp_decorators, { kind: "field", name: "timestamp", static: false, private: false, access: { has: obj => "timestamp" in obj, get: obj => obj.timestamp, set: (obj, value) => { obj.timestamp = value; } }, metadata: _metadata }, _timestamp_initializers, _timestamp_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheMonitoringSummaryDto };
/**
 * 缓存警告列表 DTO
 */
let CacheWarningsDto = (() => {
    var _a;
    let _warnings_decorators;
    let _warnings_initializers = [];
    let _warnings_extraInitializers = [];
    return _a = class CacheWarningsDto {
            constructor() {
                this.warnings = __runInitializers(this, _warnings_initializers, void 0);
                __runInitializers(this, _warnings_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _warnings_decorators = [ApiProperty({ description: '警告列表' })];
            __esDecorate(null, null, _warnings_decorators, { kind: "field", name: "warnings", static: false, private: false, access: { has: obj => "warnings" in obj, get: obj => obj.warnings, set: (obj, value) => { obj.warnings = value; } }, metadata: _metadata }, _warnings_initializers, _warnings_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheWarningsDto };
/**
 * 缓存操作请求 DTO
 */
let CacheOperationDto = (() => {
    var _a;
    let _key_decorators;
    let _key_initializers = [];
    let _key_extraInitializers = [];
    let _value_decorators;
    let _value_initializers = [];
    let _value_extraInitializers = [];
    let _ttl_decorators;
    let _ttl_initializers = [];
    let _ttl_extraInitializers = [];
    return _a = class CacheOperationDto {
            constructor() {
                this.key = __runInitializers(this, _key_initializers, void 0);
                this.value = (__runInitializers(this, _key_extraInitializers), __runInitializers(this, _value_initializers, void 0));
                this.ttl = (__runInitializers(this, _value_extraInitializers), __runInitializers(this, _ttl_initializers, void 0));
                __runInitializers(this, _ttl_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _key_decorators = [ApiProperty({ description: '缓存键' })];
            _value_decorators = [ApiProperty({ description: '缓存值', required: false })];
            _ttl_decorators = [ApiProperty({ description: 'TTL（秒）', required: false })];
            __esDecorate(null, null, _key_decorators, { kind: "field", name: "key", static: false, private: false, access: { has: obj => "key" in obj, get: obj => obj.key, set: (obj, value) => { obj.key = value; } }, metadata: _metadata }, _key_initializers, _key_extraInitializers);
            __esDecorate(null, null, _value_decorators, { kind: "field", name: "value", static: false, private: false, access: { has: obj => "value" in obj, get: obj => obj.value, set: (obj, value) => { obj.value = value; } }, metadata: _metadata }, _value_initializers, _value_extraInitializers);
            __esDecorate(null, null, _ttl_decorators, { kind: "field", name: "ttl", static: false, private: false, access: { has: obj => "ttl" in obj, get: obj => obj.ttl, set: (obj, value) => { obj.ttl = value; } }, metadata: _metadata }, _ttl_initializers, _ttl_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheOperationDto };
/**
 * 批量缓存操作请求 DTO
 */
let BatchCacheOperationDto = (() => {
    var _a;
    let _keys_decorators;
    let _keys_initializers = [];
    let _keys_extraInitializers = [];
    let _ttl_decorators;
    let _ttl_initializers = [];
    let _ttl_extraInitializers = [];
    return _a = class BatchCacheOperationDto {
            constructor() {
                this.keys = __runInitializers(this, _keys_initializers, void 0);
                this.ttl = (__runInitializers(this, _keys_extraInitializers), __runInitializers(this, _ttl_initializers, void 0));
                __runInitializers(this, _ttl_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _keys_decorators = [ApiProperty({ description: '缓存键列表' })];
            _ttl_decorators = [ApiProperty({ description: 'TTL（秒）', required: false })];
            __esDecorate(null, null, _keys_decorators, { kind: "field", name: "keys", static: false, private: false, access: { has: obj => "keys" in obj, get: obj => obj.keys, set: (obj, value) => { obj.keys = value; } }, metadata: _metadata }, _keys_initializers, _keys_extraInitializers);
            __esDecorate(null, null, _ttl_decorators, { kind: "field", name: "ttl", static: false, private: false, access: { has: obj => "ttl" in obj, get: obj => obj.ttl, set: (obj, value) => { obj.ttl = value; } }, metadata: _metadata }, _ttl_initializers, _ttl_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { BatchCacheOperationDto };
/**
 * 缓存刷新请求 DTO
 */
let CacheRefreshDto = (() => {
    var _a;
    let _key_decorators;
    let _key_initializers = [];
    let _key_extraInitializers = [];
    let _force_decorators;
    let _force_initializers = [];
    let _force_extraInitializers = [];
    return _a = class CacheRefreshDto {
            constructor() {
                this.key = __runInitializers(this, _key_initializers, void 0);
                this.force = (__runInitializers(this, _key_extraInitializers), __runInitializers(this, _force_initializers, void 0));
                __runInitializers(this, _force_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _key_decorators = [ApiProperty({ description: '缓存键' })];
            _force_decorators = [ApiProperty({ description: '是否强制刷新', required: false })];
            __esDecorate(null, null, _key_decorators, { kind: "field", name: "key", static: false, private: false, access: { has: obj => "key" in obj, get: obj => obj.key, set: (obj, value) => { obj.key = value; } }, metadata: _metadata }, _key_initializers, _key_extraInitializers);
            __esDecorate(null, null, _force_decorators, { kind: "field", name: "force", static: false, private: false, access: { has: obj => "force" in obj, get: obj => obj.force, set: (obj, value) => { obj.force = value; } }, metadata: _metadata }, _force_initializers, _force_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheRefreshDto };
/**
 * 缓存清理请求 DTO
 */
let CacheCleanupDto = (() => {
    var _a;
    let _level_decorators;
    let _level_initializers = [];
    let _level_extraInitializers = [];
    let _pattern_decorators;
    let _pattern_initializers = [];
    let _pattern_extraInitializers = [];
    return _a = class CacheCleanupDto {
            constructor() {
                this.level = __runInitializers(this, _level_initializers, void 0);
                this.pattern = (__runInitializers(this, _level_extraInitializers), __runInitializers(this, _pattern_initializers, void 0));
                __runInitializers(this, _pattern_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _level_decorators = [ApiProperty({
                    description: '缓存级别',
                    enum: ['L1', 'L2', 'L3', 'ALL'],
                    required: false,
                })];
            _pattern_decorators = [ApiProperty({ description: '模式（支持通配符）', required: false })];
            __esDecorate(null, null, _level_decorators, { kind: "field", name: "level", static: false, private: false, access: { has: obj => "level" in obj, get: obj => obj.level, set: (obj, value) => { obj.level = value; } }, metadata: _metadata }, _level_initializers, _level_extraInitializers);
            __esDecorate(null, null, _pattern_decorators, { kind: "field", name: "pattern", static: false, private: false, access: { has: obj => "pattern" in obj, get: obj => obj.pattern, set: (obj, value) => { obj.pattern = value; } }, metadata: _metadata }, _pattern_initializers, _pattern_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheCleanupDto };
/**
 * 缓存统计查询 DTO
 */
let CacheStatsQueryDto = (() => {
    var _a;
    let _level_decorators;
    let _level_initializers = [];
    let _level_extraInitializers = [];
    let _includePerformance_decorators;
    let _includePerformance_initializers = [];
    let _includePerformance_extraInitializers = [];
    let _includeHotData_decorators;
    let _includeHotData_initializers = [];
    let _includeHotData_extraInitializers = [];
    let _hotDataLimit_decorators;
    let _hotDataLimit_initializers = [];
    let _hotDataLimit_extraInitializers = [];
    return _a = class CacheStatsQueryDto {
            constructor() {
                this.level = __runInitializers(this, _level_initializers, void 0);
                this.includePerformance = (__runInitializers(this, _level_extraInitializers), __runInitializers(this, _includePerformance_initializers, void 0));
                this.includeHotData = (__runInitializers(this, _includePerformance_extraInitializers), __runInitializers(this, _includeHotData_initializers, void 0));
                this.hotDataLimit = (__runInitializers(this, _includeHotData_extraInitializers), __runInitializers(this, _hotDataLimit_initializers, void 0));
                __runInitializers(this, _hotDataLimit_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _level_decorators = [ApiProperty({
                    description: '缓存级别',
                    enum: ['L1', 'L2', 'L3'],
                    required: false,
                })];
            _includePerformance_decorators = [ApiProperty({ description: '是否包含性能指标', required: false })];
            _includeHotData_decorators = [ApiProperty({ description: '是否包含热点数据', required: false })];
            _hotDataLimit_decorators = [ApiProperty({ description: '热点数据数量', required: false })];
            __esDecorate(null, null, _level_decorators, { kind: "field", name: "level", static: false, private: false, access: { has: obj => "level" in obj, get: obj => obj.level, set: (obj, value) => { obj.level = value; } }, metadata: _metadata }, _level_initializers, _level_extraInitializers);
            __esDecorate(null, null, _includePerformance_decorators, { kind: "field", name: "includePerformance", static: false, private: false, access: { has: obj => "includePerformance" in obj, get: obj => obj.includePerformance, set: (obj, value) => { obj.includePerformance = value; } }, metadata: _metadata }, _includePerformance_initializers, _includePerformance_extraInitializers);
            __esDecorate(null, null, _includeHotData_decorators, { kind: "field", name: "includeHotData", static: false, private: false, access: { has: obj => "includeHotData" in obj, get: obj => obj.includeHotData, set: (obj, value) => { obj.includeHotData = value; } }, metadata: _metadata }, _includeHotData_initializers, _includeHotData_extraInitializers);
            __esDecorate(null, null, _hotDataLimit_decorators, { kind: "field", name: "hotDataLimit", static: false, private: false, access: { has: obj => "hotDataLimit" in obj, get: obj => obj.hotDataLimit, set: (obj, value) => { obj.hotDataLimit = value; } }, metadata: _metadata }, _hotDataLimit_initializers, _hotDataLimit_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheStatsQueryDto };
/**
 * 性能趋势查询 DTO
 */
let PerformanceTrendQueryDto = (() => {
    var _a;
    let _level_decorators;
    let _level_initializers = [];
    let _level_extraInitializers = [];
    let _minutes_decorators;
    let _minutes_initializers = [];
    let _minutes_extraInitializers = [];
    return _a = class PerformanceTrendQueryDto {
            constructor() {
                this.level = __runInitializers(this, _level_initializers, void 0);
                this.minutes = (__runInitializers(this, _level_extraInitializers), __runInitializers(this, _minutes_initializers, void 0));
                __runInitializers(this, _minutes_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _level_decorators = [ApiProperty({ description: '缓存级别', enum: ['L1', 'L2', 'L3'] })];
            _minutes_decorators = [ApiProperty({ description: '时间范围（分钟）', required: false })];
            __esDecorate(null, null, _level_decorators, { kind: "field", name: "level", static: false, private: false, access: { has: obj => "level" in obj, get: obj => obj.level, set: (obj, value) => { obj.level = value; } }, metadata: _metadata }, _level_initializers, _level_extraInitializers);
            __esDecorate(null, null, _minutes_decorators, { kind: "field", name: "minutes", static: false, private: false, access: { has: obj => "minutes" in obj, get: obj => obj.minutes, set: (obj, value) => { obj.minutes = value; } }, metadata: _metadata }, _minutes_initializers, _minutes_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PerformanceTrendQueryDto };
/**
 * 性能趋势响应 DTO
 */
let PerformanceTrendDto = (() => {
    var _a;
    let _timestamps_decorators;
    let _timestamps_initializers = [];
    let _timestamps_extraInitializers = [];
    let _avgResponseTimes_decorators;
    let _avgResponseTimes_initializers = [];
    let _avgResponseTimes_extraInitializers = [];
    let _errorRates_decorators;
    let _errorRates_initializers = [];
    let _errorRates_extraInitializers = [];
    return _a = class PerformanceTrendDto {
            constructor() {
                this.timestamps = __runInitializers(this, _timestamps_initializers, void 0);
                this.avgResponseTimes = (__runInitializers(this, _timestamps_extraInitializers), __runInitializers(this, _avgResponseTimes_initializers, void 0));
                this.errorRates = (__runInitializers(this, _avgResponseTimes_extraInitializers), __runInitializers(this, _errorRates_initializers, void 0));
                __runInitializers(this, _errorRates_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _timestamps_decorators = [ApiProperty({ description: '时间戳数组' })];
            _avgResponseTimes_decorators = [ApiProperty({ description: '平均响应时间数组' })];
            _errorRates_decorators = [ApiProperty({ description: '错误率数组' })];
            __esDecorate(null, null, _timestamps_decorators, { kind: "field", name: "timestamps", static: false, private: false, access: { has: obj => "timestamps" in obj, get: obj => obj.timestamps, set: (obj, value) => { obj.timestamps = value; } }, metadata: _metadata }, _timestamps_initializers, _timestamps_extraInitializers);
            __esDecorate(null, null, _avgResponseTimes_decorators, { kind: "field", name: "avgResponseTimes", static: false, private: false, access: { has: obj => "avgResponseTimes" in obj, get: obj => obj.avgResponseTimes, set: (obj, value) => { obj.avgResponseTimes = value; } }, metadata: _metadata }, _avgResponseTimes_initializers, _avgResponseTimes_extraInitializers);
            __esDecorate(null, null, _errorRates_decorators, { kind: "field", name: "errorRates", static: false, private: false, access: { has: obj => "errorRates" in obj, get: obj => obj.errorRates, set: (obj, value) => { obj.errorRates = value; } }, metadata: _metadata }, _errorRates_initializers, _errorRates_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PerformanceTrendDto };
/**
 * 缓存大小趋势响应 DTO
 */
let SizeTrendDto = (() => {
    var _a;
    let _L1_decorators;
    let _L1_initializers = [];
    let _L1_extraInitializers = [];
    let _L2_decorators;
    let _L2_initializers = [];
    let _L2_extraInitializers = [];
    let _L3_decorators;
    let _L3_initializers = [];
    let _L3_extraInitializers = [];
    return _a = class SizeTrendDto {
            constructor() {
                this.L1 = __runInitializers(this, _L1_initializers, void 0);
                this.L2 = (__runInitializers(this, _L1_extraInitializers), __runInitializers(this, _L2_initializers, void 0));
                this.L3 = (__runInitializers(this, _L2_extraInitializers), __runInitializers(this, _L3_initializers, void 0));
                __runInitializers(this, _L3_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _L1_decorators = [ApiProperty({ description: 'L1 缓存大小数组' })];
            _L2_decorators = [ApiProperty({ description: 'L2 缓存大小数组' })];
            _L3_decorators = [ApiProperty({ description: 'L3 缓存大小数组' })];
            __esDecorate(null, null, _L1_decorators, { kind: "field", name: "L1", static: false, private: false, access: { has: obj => "L1" in obj, get: obj => obj.L1, set: (obj, value) => { obj.L1 = value; } }, metadata: _metadata }, _L1_initializers, _L1_extraInitializers);
            __esDecorate(null, null, _L2_decorators, { kind: "field", name: "L2", static: false, private: false, access: { has: obj => "L2" in obj, get: obj => obj.L2, set: (obj, value) => { obj.L2 = value; } }, metadata: _metadata }, _L2_initializers, _L2_extraInitializers);
            __esDecorate(null, null, _L3_decorators, { kind: "field", name: "L3", static: false, private: false, access: { has: obj => "L3" in obj, get: obj => obj.L3, set: (obj, value) => { obj.L3 = value; } }, metadata: _metadata }, _L3_initializers, _L3_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SizeTrendDto };
//# sourceMappingURL=cache-stats.dto.js.map