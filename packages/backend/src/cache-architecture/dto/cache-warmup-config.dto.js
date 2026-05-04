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
import { IsBoolean, IsNumber, IsArray, IsString, IsOptional, } from 'class-validator';
/**
 * 缓存预热配置 DTO
 */
let CacheWarmupConfigDto = (() => {
    var _a;
    let _enabled_decorators;
    let _enabled_initializers = [];
    let _enabled_extraInitializers = [];
    let _schedule_decorators;
    let _schedule_initializers = [];
    let _schedule_extraInitializers = [];
    let _hotDataThreshold_decorators;
    let _hotDataThreshold_initializers = [];
    let _hotDataThreshold_extraInitializers = [];
    let _maxWarmupSize_decorators;
    let _maxWarmupSize_initializers = [];
    let _maxWarmupSize_extraInitializers = [];
    let _dataTypes_decorators;
    let _dataTypes_initializers = [];
    let _dataTypes_extraInitializers = [];
    return _a = class CacheWarmupConfigDto {
            constructor() {
                this.enabled = __runInitializers(this, _enabled_initializers, void 0);
                this.schedule = (__runInitializers(this, _enabled_extraInitializers), __runInitializers(this, _schedule_initializers, void 0));
                this.hotDataThreshold = (__runInitializers(this, _schedule_extraInitializers), __runInitializers(this, _hotDataThreshold_initializers, void 0));
                this.maxWarmupSize = (__runInitializers(this, _hotDataThreshold_extraInitializers), __runInitializers(this, _maxWarmupSize_initializers, void 0));
                this.dataTypes = (__runInitializers(this, _maxWarmupSize_extraInitializers), __runInitializers(this, _dataTypes_initializers, void 0));
                __runInitializers(this, _dataTypes_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _enabled_decorators = [ApiProperty({ description: '是否启用预热' }), IsBoolean()];
            _schedule_decorators = [ApiProperty({ description: '预热时间（cron 表达式）' }), IsString()];
            _hotDataThreshold_decorators = [ApiProperty({ description: '热点数据阈值（次/分钟）' }), IsNumber()];
            _maxWarmupSize_decorators = [ApiProperty({ description: '最大预热数据量' }), IsNumber()];
            _dataTypes_decorators = [ApiProperty({ description: '预热数据类型' }), IsArray(), IsString({ each: true })];
            __esDecorate(null, null, _enabled_decorators, { kind: "field", name: "enabled", static: false, private: false, access: { has: obj => "enabled" in obj, get: obj => obj.enabled, set: (obj, value) => { obj.enabled = value; } }, metadata: _metadata }, _enabled_initializers, _enabled_extraInitializers);
            __esDecorate(null, null, _schedule_decorators, { kind: "field", name: "schedule", static: false, private: false, access: { has: obj => "schedule" in obj, get: obj => obj.schedule, set: (obj, value) => { obj.schedule = value; } }, metadata: _metadata }, _schedule_initializers, _schedule_extraInitializers);
            __esDecorate(null, null, _hotDataThreshold_decorators, { kind: "field", name: "hotDataThreshold", static: false, private: false, access: { has: obj => "hotDataThreshold" in obj, get: obj => obj.hotDataThreshold, set: (obj, value) => { obj.hotDataThreshold = value; } }, metadata: _metadata }, _hotDataThreshold_initializers, _hotDataThreshold_extraInitializers);
            __esDecorate(null, null, _maxWarmupSize_decorators, { kind: "field", name: "maxWarmupSize", static: false, private: false, access: { has: obj => "maxWarmupSize" in obj, get: obj => obj.maxWarmupSize, set: (obj, value) => { obj.maxWarmupSize = value; } }, metadata: _metadata }, _maxWarmupSize_initializers, _maxWarmupSize_extraInitializers);
            __esDecorate(null, null, _dataTypes_decorators, { kind: "field", name: "dataTypes", static: false, private: false, access: { has: obj => "dataTypes" in obj, get: obj => obj.dataTypes, set: (obj, value) => { obj.dataTypes = value; } }, metadata: _metadata }, _dataTypes_initializers, _dataTypes_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheWarmupConfigDto };
/**
 * 更新预热配置 DTO
 */
let UpdateWarmupConfigDto = (() => {
    var _a;
    let _enabled_decorators;
    let _enabled_initializers = [];
    let _enabled_extraInitializers = [];
    let _schedule_decorators;
    let _schedule_initializers = [];
    let _schedule_extraInitializers = [];
    let _hotDataThreshold_decorators;
    let _hotDataThreshold_initializers = [];
    let _hotDataThreshold_extraInitializers = [];
    let _maxWarmupSize_decorators;
    let _maxWarmupSize_initializers = [];
    let _maxWarmupSize_extraInitializers = [];
    let _dataTypes_decorators;
    let _dataTypes_initializers = [];
    let _dataTypes_extraInitializers = [];
    return _a = class UpdateWarmupConfigDto {
            constructor() {
                this.enabled = __runInitializers(this, _enabled_initializers, void 0);
                this.schedule = (__runInitializers(this, _enabled_extraInitializers), __runInitializers(this, _schedule_initializers, void 0));
                this.hotDataThreshold = (__runInitializers(this, _schedule_extraInitializers), __runInitializers(this, _hotDataThreshold_initializers, void 0));
                this.maxWarmupSize = (__runInitializers(this, _hotDataThreshold_extraInitializers), __runInitializers(this, _maxWarmupSize_initializers, void 0));
                this.dataTypes = (__runInitializers(this, _maxWarmupSize_extraInitializers), __runInitializers(this, _dataTypes_initializers, void 0));
                __runInitializers(this, _dataTypes_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _enabled_decorators = [ApiProperty({ description: '是否启用预热', required: false }), IsOptional(), IsBoolean()];
            _schedule_decorators = [ApiProperty({ description: '预热时间（cron 表达式）', required: false }), IsOptional(), IsString()];
            _hotDataThreshold_decorators = [ApiProperty({ description: '热点数据阈值（次/分钟）', required: false }), IsOptional(), IsNumber()];
            _maxWarmupSize_decorators = [ApiProperty({ description: '最大预热数据量', required: false }), IsOptional(), IsNumber()];
            _dataTypes_decorators = [ApiProperty({ description: '预热数据类型', required: false }), IsOptional(), IsArray(), IsString({ each: true })];
            __esDecorate(null, null, _enabled_decorators, { kind: "field", name: "enabled", static: false, private: false, access: { has: obj => "enabled" in obj, get: obj => obj.enabled, set: (obj, value) => { obj.enabled = value; } }, metadata: _metadata }, _enabled_initializers, _enabled_extraInitializers);
            __esDecorate(null, null, _schedule_decorators, { kind: "field", name: "schedule", static: false, private: false, access: { has: obj => "schedule" in obj, get: obj => obj.schedule, set: (obj, value) => { obj.schedule = value; } }, metadata: _metadata }, _schedule_initializers, _schedule_extraInitializers);
            __esDecorate(null, null, _hotDataThreshold_decorators, { kind: "field", name: "hotDataThreshold", static: false, private: false, access: { has: obj => "hotDataThreshold" in obj, get: obj => obj.hotDataThreshold, set: (obj, value) => { obj.hotDataThreshold = value; } }, metadata: _metadata }, _hotDataThreshold_initializers, _hotDataThreshold_extraInitializers);
            __esDecorate(null, null, _maxWarmupSize_decorators, { kind: "field", name: "maxWarmupSize", static: false, private: false, access: { has: obj => "maxWarmupSize" in obj, get: obj => obj.maxWarmupSize, set: (obj, value) => { obj.maxWarmupSize = value; } }, metadata: _metadata }, _maxWarmupSize_initializers, _maxWarmupSize_extraInitializers);
            __esDecorate(null, null, _dataTypes_decorators, { kind: "field", name: "dataTypes", static: false, private: false, access: { has: obj => "dataTypes" in obj, get: obj => obj.dataTypes, set: (obj, value) => { obj.dataTypes = value; } }, metadata: _metadata }, _dataTypes_initializers, _dataTypes_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UpdateWarmupConfigDto };
/**
 * 触发预热请求 DTO
 */
let TriggerWarmupDto = (() => {
    var _a;
    let _dataType_decorators;
    let _dataType_initializers = [];
    let _dataType_extraInitializers = [];
    let _ids_decorators;
    let _ids_initializers = [];
    let _ids_extraInitializers = [];
    return _a = class TriggerWarmupDto {
            constructor() {
                this.dataType = __runInitializers(this, _dataType_initializers, void 0);
                this.ids = (__runInitializers(this, _dataType_extraInitializers), __runInitializers(this, _ids_initializers, void 0));
                __runInitializers(this, _ids_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _dataType_decorators = [ApiProperty({ description: '数据类型', required: false }), IsOptional(), IsString()];
            _ids_decorators = [ApiProperty({ description: '数据 ID 列表', required: false }), IsOptional(), IsArray(), IsNumber({}, { each: true })];
            __esDecorate(null, null, _dataType_decorators, { kind: "field", name: "dataType", static: false, private: false, access: { has: obj => "dataType" in obj, get: obj => obj.dataType, set: (obj, value) => { obj.dataType = value; } }, metadata: _metadata }, _dataType_initializers, _dataType_extraInitializers);
            __esDecorate(null, null, _ids_decorators, { kind: "field", name: "ids", static: false, private: false, access: { has: obj => "ids" in obj, get: obj => obj.ids, set: (obj, value) => { obj.ids = value; } }, metadata: _metadata }, _ids_initializers, _ids_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { TriggerWarmupDto };
/**
 * 预热历史记录 DTO
 */
let WarmupHistoryDto = (() => {
    var _a;
    let _key_decorators;
    let _key_initializers = [];
    let _key_extraInitializers = [];
    let _lastWarmup_decorators;
    let _lastWarmup_initializers = [];
    let _lastWarmup_extraInitializers = [];
    return _a = class WarmupHistoryDto {
            constructor() {
                this.key = __runInitializers(this, _key_initializers, void 0);
                this.lastWarmup = (__runInitializers(this, _key_extraInitializers), __runInitializers(this, _lastWarmup_initializers, void 0));
                __runInitializers(this, _lastWarmup_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _key_decorators = [ApiProperty({ description: '缓存键' })];
            _lastWarmup_decorators = [ApiProperty({ description: '最后预热时间' })];
            __esDecorate(null, null, _key_decorators, { kind: "field", name: "key", static: false, private: false, access: { has: obj => "key" in obj, get: obj => obj.key, set: (obj, value) => { obj.key = value; } }, metadata: _metadata }, _key_initializers, _key_extraInitializers);
            __esDecorate(null, null, _lastWarmup_decorators, { kind: "field", name: "lastWarmup", static: false, private: false, access: { has: obj => "lastWarmup" in obj, get: obj => obj.lastWarmup, set: (obj, value) => { obj.lastWarmup = value; } }, metadata: _metadata }, _lastWarmup_initializers, _lastWarmup_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WarmupHistoryDto };
/**
 * 预热统计 DTO
 */
let WarmupStatsDto = (() => {
    var _a;
    let _config_decorators;
    let _config_initializers = [];
    let _config_extraInitializers = [];
    let _strategies_decorators;
    let _strategies_initializers = [];
    let _strategies_extraInitializers = [];
    let _strategyCount_decorators;
    let _strategyCount_initializers = [];
    let _strategyCount_extraInitializers = [];
    return _a = class WarmupStatsDto {
            constructor() {
                this.config = __runInitializers(this, _config_initializers, void 0);
                this.strategies = (__runInitializers(this, _config_extraInitializers), __runInitializers(this, _strategies_initializers, void 0));
                this.strategyCount = (__runInitializers(this, _strategies_extraInitializers), __runInitializers(this, _strategyCount_initializers, void 0));
                __runInitializers(this, _strategyCount_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _config_decorators = [ApiProperty({ description: '预热配置' })];
            _strategies_decorators = [ApiProperty({ description: '已注册策略列表' })];
            _strategyCount_decorators = [ApiProperty({ description: '策略数量' })];
            __esDecorate(null, null, _config_decorators, { kind: "field", name: "config", static: false, private: false, access: { has: obj => "config" in obj, get: obj => obj.config, set: (obj, value) => { obj.config = value; } }, metadata: _metadata }, _config_initializers, _config_extraInitializers);
            __esDecorate(null, null, _strategies_decorators, { kind: "field", name: "strategies", static: false, private: false, access: { has: obj => "strategies" in obj, get: obj => obj.strategies, set: (obj, value) => { obj.strategies = value; } }, metadata: _metadata }, _strategies_initializers, _strategies_extraInitializers);
            __esDecorate(null, null, _strategyCount_decorators, { kind: "field", name: "strategyCount", static: false, private: false, access: { has: obj => "strategyCount" in obj, get: obj => obj.strategyCount, set: (obj, value) => { obj.strategyCount = value; } }, metadata: _metadata }, _strategyCount_initializers, _strategyCount_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WarmupStatsDto };
/**
 * 预热响应 DTO
 */
let WarmupResponseDto = (() => {
    var _a;
    let _success_decorators;
    let _success_initializers = [];
    let _success_extraInitializers = [];
    let _count_decorators;
    let _count_initializers = [];
    let _count_extraInitializers = [];
    let _duration_decorators;
    let _duration_initializers = [];
    let _duration_extraInitializers = [];
    let _error_decorators;
    let _error_initializers = [];
    let _error_extraInitializers = [];
    return _a = class WarmupResponseDto {
            constructor() {
                this.success = __runInitializers(this, _success_initializers, void 0);
                this.count = (__runInitializers(this, _success_extraInitializers), __runInitializers(this, _count_initializers, void 0));
                this.duration = (__runInitializers(this, _count_extraInitializers), __runInitializers(this, _duration_initializers, void 0));
                this.error = (__runInitializers(this, _duration_extraInitializers), __runInitializers(this, _error_initializers, void 0));
                __runInitializers(this, _error_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _success_decorators = [ApiProperty({ description: '是否成功' })];
            _count_decorators = [ApiProperty({ description: '预热数量' })];
            _duration_decorators = [ApiProperty({ description: '耗时（毫秒）', required: false })];
            _error_decorators = [ApiProperty({ description: '错误信息', required: false })];
            __esDecorate(null, null, _success_decorators, { kind: "field", name: "success", static: false, private: false, access: { has: obj => "success" in obj, get: obj => obj.success, set: (obj, value) => { obj.success = value; } }, metadata: _metadata }, _success_initializers, _success_extraInitializers);
            __esDecorate(null, null, _count_decorators, { kind: "field", name: "count", static: false, private: false, access: { has: obj => "count" in obj, get: obj => obj.count, set: (obj, value) => { obj.count = value; } }, metadata: _metadata }, _count_initializers, _count_extraInitializers);
            __esDecorate(null, null, _duration_decorators, { kind: "field", name: "duration", static: false, private: false, access: { has: obj => "duration" in obj, get: obj => obj.duration, set: (obj, value) => { obj.duration = value; } }, metadata: _metadata }, _duration_initializers, _duration_extraInitializers);
            __esDecorate(null, null, _error_decorators, { kind: "field", name: "error", static: false, private: false, access: { has: obj => "error" in obj, get: obj => obj.error, set: (obj, value) => { obj.error = value; } }, metadata: _metadata }, _error_initializers, _error_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WarmupResponseDto };
//# sourceMappingURL=cache-warmup-config.dto.js.map