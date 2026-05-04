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
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, } from '@nestjs/terminus';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
let HealthController = (() => {
    let _classDecorators = [ApiTags('健康检查'), Controller('health'), UseGuards(JwtAuthGuard, PermissionsGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _liveness_decorators;
    let _publicHealth_decorators;
    let _check_decorators;
    let _checkDatabase_decorators;
    let _checkStorage_decorators;
    var HealthController = _classThis = class {
        constructor(health, databaseService, storageService, redis) {
            this.health = (__runInitializers(this, _instanceExtraInitializers), health);
            this.databaseService = databaseService;
            this.storageService = storageService;
            this.redis = redis;
        }
        async liveness() {
            const memUsage = process.memoryUsage();
            let databaseStatus = 'unknown';
            let redisStatus = 'unknown';
            try {
                const dbResult = await this.databaseService.healthCheck();
                databaseStatus = dbResult.status === 'healthy' ? 'ok' : 'error';
            }
            catch {
                databaseStatus = 'error';
            }
            try {
                await this.redis.ping();
                redisStatus = 'ok';
            }
            catch {
                redisStatus = 'error';
            }
            const overallStatus = databaseStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';
            return {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                uptime: Math.round(process.uptime()) + 's',
                memory: {
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
                },
                checks: {
                    database: databaseStatus,
                    redis: redisStatus,
                },
            };
        }
        async publicHealth() {
            let databaseStatus = 'up';
            let databaseMessage;
            let storageStatus = 'up';
            let storageMessage;
            try {
                const dbResult = await this.databaseService.healthCheck();
                databaseStatus = dbResult.status === 'healthy' ? 'up' : 'down';
                databaseMessage = dbResult.message;
            }
            catch {
                databaseStatus = 'down';
                databaseMessage = '数据库连接异常';
            }
            try {
                const storageResult = await this.storageService.healthCheck();
                storageStatus = storageResult.status === 'healthy' ? 'up' : 'down';
                storageMessage = storageResult.message;
            }
            catch {
                storageStatus = 'down';
                storageMessage = '存储服务异常';
            }
            const overallStatus = databaseStatus === 'up' && storageStatus === 'up' ? 'ok' : 'error';
            return {
                status: overallStatus,
                info: {
                    database: {
                        status: databaseStatus,
                        message: databaseMessage,
                    },
                    storage: {
                        status: storageStatus,
                        message: storageMessage,
                    },
                },
                error: {},
                details: {},
            };
        }
        async check() {
            return this.health.check([
                async () => {
                    const result = await this.databaseService.healthCheck();
                    return {
                        database: {
                            status: result.status === 'healthy' ? 'up' : 'down',
                            message: result.message,
                        },
                    };
                },
                async () => {
                    const result = await this.storageService.healthCheck();
                    return {
                        storage: {
                            status: result.status === 'healthy' ? 'up' : 'down',
                            message: result.message,
                        },
                    };
                },
            ]);
        }
        async checkDatabase() {
            return this.databaseService.healthCheck();
        }
        async checkStorage() {
            return this.storageService.healthCheck();
        }
    };
    __setFunctionName(_classThis, "HealthController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _liveness_decorators = [Get('live'), Public(), ApiOperation({ summary: '存活检查（Docker 健康检查）' }), ApiResponse({ status: 200, description: '服务存活' })];
        _publicHealth_decorators = [Get(), Public(), ApiOperation({ summary: '服务健康检查（公开）' }), ApiResponse({ status: 200, description: '服务正常运行' })];
        _check_decorators = [Get('full'), HealthCheck(), ApiOperation({ summary: '系统健康检查（详细）' }), ApiResponse({ status: 200, description: '系统正常运行' }), ApiResponse({ status: 503, description: '服务不可用' }), RequirePermissions([SystemPermission.SYSTEM_MONITOR])];
        _checkDatabase_decorators = [Get('db'), ApiOperation({ summary: '数据库健康检查' }), ApiResponse({ status: 200, description: '数据库连接正常' }), ApiResponse({ status: 503, description: '数据库连接失败' }), RequirePermissions([SystemPermission.SYSTEM_MONITOR])];
        _checkStorage_decorators = [Get('storage'), ApiOperation({ summary: '存储服务健康检查' }), ApiResponse({ status: 200, description: '存储服务正常' }), ApiResponse({ status: 503, description: '存储服务不可用' }), RequirePermissions([SystemPermission.SYSTEM_MONITOR])];
        __esDecorate(_classThis, null, _liveness_decorators, { kind: "method", name: "liveness", static: false, private: false, access: { has: obj => "liveness" in obj, get: obj => obj.liveness }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _publicHealth_decorators, { kind: "method", name: "publicHealth", static: false, private: false, access: { has: obj => "publicHealth" in obj, get: obj => obj.publicHealth }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _check_decorators, { kind: "method", name: "check", static: false, private: false, access: { has: obj => "check" in obj, get: obj => obj.check }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkDatabase_decorators, { kind: "method", name: "checkDatabase", static: false, private: false, access: { has: obj => "checkDatabase" in obj, get: obj => obj.checkDatabase }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkStorage_decorators, { kind: "method", name: "checkStorage", static: false, private: false, access: { has: obj => "checkStorage" in obj, get: obj => obj.checkStorage }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HealthController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HealthController = _classThis;
})();
export { HealthController };
//# sourceMappingURL=health.controller.js.map