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
import { Controller, Get, Post, Delete, HttpCode, HttpStatus, UseGuards, } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, } from '@nestjs/swagger';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheMonitoringSummaryDto } from '../dto/cache-stats.dto';
import { CacheWarningsDto } from '../dto/cache-stats.dto';
import { PerformanceTrendDto } from '../dto/cache-stats.dto';
import { SizeTrendDto } from '../dto/cache-stats.dto';
import { WarmupResponseDto } from '../dto/cache-warmup-config.dto';
import { WarmupHistoryDto } from '../dto/cache-warmup-config.dto';
import { WarmupStatsDto } from '../dto/cache-warmup-config.dto';
/**
 * 缓存监控控制器
 * 提供缓存管理、监控和预热 API
 */
let CacheMonitorController = (() => {
    let _classDecorators = [ApiTags('Cache Monitor'), Controller('cache-monitor'), UseGuards(JwtAuthGuard), ApiBearerAuth()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getSummary_decorators;
    let _getHealthStatus_decorators;
    let _getPerformanceMetrics_decorators;
    let _getHotData_decorators;
    let _getPerformanceTrend_decorators;
    let _getSizeTrend_decorators;
    let _getWarnings_decorators;
    let _getValue_decorators;
    let _deleteValue_decorators;
    let _deleteValues_decorators;
    let _refresh_decorators;
    let _cleanup_decorators;
    let _getWarmupConfig_decorators;
    let _updateWarmupConfig_decorators;
    let _triggerWarmup_decorators;
    let _getWarmupHistory_decorators;
    let _getWarmupStats_decorators;
    let _clearWarmupHistory_decorators;
    var CacheMonitorController = _classThis = class {
        constructor(cacheMonitorService, cacheService, cacheWarmupService) {
            this.cacheMonitorService = (__runInitializers(this, _instanceExtraInitializers), cacheMonitorService);
            this.cacheService = cacheService;
            this.cacheWarmupService = cacheWarmupService;
        }
        /**
         * 获取缓存监控摘要
         */
        async getSummary() {
            const summary = this.cacheMonitorService.getMonitoringSummary();
            return summary;
        }
        /**
         * 获取缓存健康状态
         */
        async getHealthStatus() {
            return this.cacheMonitorService.getHealthStatus();
        }
        /**
         * 获取性能指标
         */
        async getPerformanceMetrics() {
            const metrics = await this.cacheMonitorService.getPerformanceMetrics();
            return Object.fromEntries(metrics);
        }
        /**
         * 获取热点数据
         */
        async getHotData(limit) {
            const hotDataLimit = limit ? parseInt(limit, 10) : 100;
            return this.cacheMonitorService.getHotData(hotDataLimit);
        }
        /**
         * 获取性能趋势
         */
        async getPerformanceTrend(query) {
            const level = query.level;
            const trend = this.cacheMonitorService.getPerformanceTrend(level, query.minutes ?? 60);
            return trend;
        }
        /**
         * 获取缓存大小趋势
         */
        async getSizeTrend(minutes) {
            const trendMinutes = minutes ? parseInt(minutes, 10) : 60;
            const trend = await this.cacheMonitorService.getSizeTrend(trendMinutes);
            // 从 Map 转换为 DTO 格式
            const l1Trend = trend.get(CacheLevel.L1) ?? [];
            const l2Trend = trend.get(CacheLevel.L2) ?? [];
            const l3Trend = trend.get(CacheLevel.L3) ?? [];
            return {
                L1: l1Trend,
                L2: l2Trend,
                L3: l3Trend,
            };
        }
        /**
         * 获取缓存警告
         */
        async getWarnings() {
            const warnings = await this.cacheMonitorService.checkWarnings();
            return { warnings };
        }
        /**
         * 获取缓存值
         */
        async getValue(key) {
            return this.cacheService.get(key);
        }
        /**
         * 删除缓存
         */
        async deleteValue(key) {
            await this.cacheService.delete(key);
            return { success: true, message: '缓存删除成功' };
        }
        /**
         * 批量删除缓存
         */
        async deleteValues(dto) {
            await this.cacheService.deleteMany(dto.keys);
            return { success: true, message: `成功删除 ${dto.keys.length} 条缓存` };
        }
        /**
         * 刷新缓存
         */
        async refresh(dto) {
            const value = await this.cacheService.get(dto.key);
            if (value === null) {
                return { success: false, message: '缓存不存在' };
            }
            await this.cacheService.delete(dto.key);
            await this.cacheService.set(dto.key, value);
            return { success: true, message: '缓存刷新成功' };
        }
        /**
         * 清理缓存
         */
        async cleanup(dto) {
            if (dto.pattern) {
                const count = await this.cacheService.deleteByPattern(dto.pattern);
                return { success: true, message: `成功清理 ${count} 条缓存` };
            }
            if (dto.level === 'ALL' || !dto.level) {
                await this.cacheService.clear();
                return { success: true, message: '成功清理所有缓存' };
            }
            // 根据级别清理（需要实现特定级别的清理）
            return { success: true, message: '缓存清理成功' };
        }
        /**
         * 获取预热配置
         */
        async getWarmupConfig() {
            return this.cacheWarmupService.getConfig();
        }
        /**
         * 更新预热配置
         */
        async updateWarmupConfig(dto) {
            this.cacheWarmupService.updateConfig(dto);
            return { success: true, message: '预热配置更新成功' };
        }
        /**
         * 触发预热
         */
        async triggerWarmup(dto) {
            return this.cacheWarmupService.triggerWarmup();
        }
        /**
         * 获取预热历史
         */
        async getWarmupHistory() {
            return this.cacheWarmupService.getWarmupHistory();
        }
        /**
         * 获取预热统计
         */
        async getWarmupStats() {
            return this.cacheWarmupService.getWarmupStats();
        }
        /**
         * 清除预热历史
         */
        async clearWarmupHistory() {
            this.cacheWarmupService.clearWarmupHistory();
            return { success: true, message: '预热历史已清除' };
        }
    };
    __setFunctionName(_classThis, "CacheMonitorController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getSummary_decorators = [Get('summary'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取缓存监控摘要' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取监控摘要',
                type: CacheMonitoringSummaryDto,
            })];
        _getHealthStatus_decorators = [Get('health'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取缓存健康状态' }), ApiResponse({ status: HttpStatus.OK, description: '成功获取健康状态' })];
        _getPerformanceMetrics_decorators = [Get('performance'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取缓存性能指标' }), ApiResponse({ status: HttpStatus.OK, description: '成功获取性能指标' })];
        _getHotData_decorators = [Get('hot-data'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取热点数据' }), ApiResponse({ status: HttpStatus.OK, description: '成功获取热点数据' })];
        _getPerformanceTrend_decorators = [Get('performance-trend'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取性能趋势' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取性能趋势',
                type: PerformanceTrendDto,
            })];
        _getSizeTrend_decorators = [Get('size-trend'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取缓存大小趋势' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取大小趋势',
                type: SizeTrendDto,
            })];
        _getWarnings_decorators = [Get('warnings'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取缓存警告' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取警告',
                type: CacheWarningsDto,
            })];
        _getValue_decorators = [Get('value'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取缓存值' }), ApiResponse({ status: HttpStatus.OK, description: '成功获取缓存值' })];
        _deleteValue_decorators = [Delete('value'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '删除缓存' }), ApiResponse({ status: HttpStatus.OK, description: '成功删除缓存' })];
        _deleteValues_decorators = [Delete('values'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '批量删除缓存' }), ApiResponse({ status: HttpStatus.OK, description: '成功批量删除缓存' })];
        _refresh_decorators = [Post('refresh'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '刷新缓存' }), ApiResponse({ status: HttpStatus.OK, description: '成功刷新缓存' })];
        _cleanup_decorators = [Post('cleanup'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '清理缓存' }), ApiResponse({ status: HttpStatus.OK, description: '成功清理缓存' })];
        _getWarmupConfig_decorators = [Get('warmup/config'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取预热配置' }), ApiResponse({ status: HttpStatus.OK, description: '成功获取预热配置' })];
        _updateWarmupConfig_decorators = [Post('warmup/config'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '更新预热配置' }), ApiResponse({ status: HttpStatus.OK, description: '成功更新预热配置' })];
        _triggerWarmup_decorators = [Post('warmup/trigger'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '触发预热' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功触发预热',
                type: WarmupResponseDto,
            })];
        _getWarmupHistory_decorators = [Get('warmup/history'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取预热历史' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取预热历史',
                type: [WarmupHistoryDto],
            })];
        _getWarmupStats_decorators = [Get('warmup/stats'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取预热统计' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取预热统计',
                type: WarmupStatsDto,
            })];
        _clearWarmupHistory_decorators = [Delete('warmup/history'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '清除预热历史' }), ApiResponse({ status: HttpStatus.OK, description: '成功清除预热历史' })];
        __esDecorate(_classThis, null, _getSummary_decorators, { kind: "method", name: "getSummary", static: false, private: false, access: { has: obj => "getSummary" in obj, get: obj => obj.getSummary }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getHealthStatus_decorators, { kind: "method", name: "getHealthStatus", static: false, private: false, access: { has: obj => "getHealthStatus" in obj, get: obj => obj.getHealthStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getPerformanceMetrics_decorators, { kind: "method", name: "getPerformanceMetrics", static: false, private: false, access: { has: obj => "getPerformanceMetrics" in obj, get: obj => obj.getPerformanceMetrics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getHotData_decorators, { kind: "method", name: "getHotData", static: false, private: false, access: { has: obj => "getHotData" in obj, get: obj => obj.getHotData }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getPerformanceTrend_decorators, { kind: "method", name: "getPerformanceTrend", static: false, private: false, access: { has: obj => "getPerformanceTrend" in obj, get: obj => obj.getPerformanceTrend }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getSizeTrend_decorators, { kind: "method", name: "getSizeTrend", static: false, private: false, access: { has: obj => "getSizeTrend" in obj, get: obj => obj.getSizeTrend }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getWarnings_decorators, { kind: "method", name: "getWarnings", static: false, private: false, access: { has: obj => "getWarnings" in obj, get: obj => obj.getWarnings }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getValue_decorators, { kind: "method", name: "getValue", static: false, private: false, access: { has: obj => "getValue" in obj, get: obj => obj.getValue }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _deleteValue_decorators, { kind: "method", name: "deleteValue", static: false, private: false, access: { has: obj => "deleteValue" in obj, get: obj => obj.deleteValue }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _deleteValues_decorators, { kind: "method", name: "deleteValues", static: false, private: false, access: { has: obj => "deleteValues" in obj, get: obj => obj.deleteValues }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _refresh_decorators, { kind: "method", name: "refresh", static: false, private: false, access: { has: obj => "refresh" in obj, get: obj => obj.refresh }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _cleanup_decorators, { kind: "method", name: "cleanup", static: false, private: false, access: { has: obj => "cleanup" in obj, get: obj => obj.cleanup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getWarmupConfig_decorators, { kind: "method", name: "getWarmupConfig", static: false, private: false, access: { has: obj => "getWarmupConfig" in obj, get: obj => obj.getWarmupConfig }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateWarmupConfig_decorators, { kind: "method", name: "updateWarmupConfig", static: false, private: false, access: { has: obj => "updateWarmupConfig" in obj, get: obj => obj.updateWarmupConfig }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _triggerWarmup_decorators, { kind: "method", name: "triggerWarmup", static: false, private: false, access: { has: obj => "triggerWarmup" in obj, get: obj => obj.triggerWarmup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getWarmupHistory_decorators, { kind: "method", name: "getWarmupHistory", static: false, private: false, access: { has: obj => "getWarmupHistory" in obj, get: obj => obj.getWarmupHistory }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getWarmupStats_decorators, { kind: "method", name: "getWarmupStats", static: false, private: false, access: { has: obj => "getWarmupStats" in obj, get: obj => obj.getWarmupStats }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _clearWarmupHistory_decorators, { kind: "method", name: "clearWarmupHistory", static: false, private: false, access: { has: obj => "clearWarmupHistory" in obj, get: obj => obj.clearWarmupHistory }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheMonitorController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheMonitorController = _classThis;
})();
export { CacheMonitorController };
//# sourceMappingURL=cache-monitor.controller.js.map