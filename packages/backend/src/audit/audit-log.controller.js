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
import { Controller, Get, Post, HttpCode, HttpStatus, UseGuards, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
let AuditLogController = (() => {
    let _classDecorators = [ApiTags('audit'), Controller('audit'), ApiBearerAuth(), UseGuards(JwtAuthGuard, PermissionsGuard), RequirePermissions([SystemPermission.SYSTEM_ADMIN])];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _findAll_decorators;
    let _findOne_decorators;
    let _getStatistics_decorators;
    let _cleanupOldLogs_decorators;
    var AuditLogController = _classThis = class {
        constructor(auditLogService) {
            this.auditLogService = (__runInitializers(this, _instanceExtraInitializers), auditLogService);
        }
        async findAll(userId, action, resourceType, resourceId, startDate, endDate, success, page, limit) {
            const filters = {};
            if (userId)
                filters.userId = userId;
            if (action)
                filters.action = action;
            if (resourceType)
                filters.resourceType = resourceType;
            if (resourceId)
                filters.resourceId = resourceId;
            if (startDate)
                filters.startDate = new Date(startDate);
            if (endDate)
                filters.endDate = new Date(endDate);
            if (success !== undefined)
                filters.success = success === 'true';
            const pagination = {
                page: page ? parseInt(page, 10) : 1,
                limit: limit ? parseInt(limit, 10) : 20,
            };
            return await this.auditLogService.findAll(filters, pagination);
        }
        async findOne(id) {
            return await this.auditLogService.findOne(id);
        }
        async getStatistics(startDate, endDate, userId) {
            const filters = {};
            if (startDate)
                filters.startDate = new Date(startDate);
            if (endDate)
                filters.endDate = new Date(endDate);
            if (userId)
                filters.userId = userId;
            return await this.auditLogService.getStatistics(filters);
        }
        async cleanupOldLogs(req, body) {
            const userId = req.user?.id || 'unknown';
            const deletedCount = await this.auditLogService.cleanupOldLogs(body.daysToKeep, userId);
            return {
                message: `成功清理了 ${deletedCount} 条审计日志`,
                deletedCount,
            };
        }
    };
    __setFunctionName(_classThis, "AuditLogController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _findAll_decorators = [Get('logs'), ApiOperation({ summary: '查询审计日志' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取审计日志',
            }), ApiQuery({ name: 'userId', required: false, description: '用户 ID' }), ApiQuery({ name: 'action', required: false, description: '操作类型' }), ApiQuery({ name: 'resourceType', required: false, description: '资源类型' }), ApiQuery({ name: 'resourceId', required: false, description: '资源 ID' }), ApiQuery({ name: 'startDate', required: false, description: '开始日期' }), ApiQuery({ name: 'endDate', required: false, description: '结束日期' }), ApiQuery({ name: 'success', required: false, description: '是否成功' }), ApiQuery({ name: 'page', required: false, description: '页码', example: 1 }), ApiQuery({
                name: 'limit',
                required: false,
                description: '每页数量',
                example: 20,
            })];
        _findOne_decorators = [Get('logs/:id'), ApiOperation({ summary: '获取审计日志详情' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取审计日志详情',
            })];
        _getStatistics_decorators = [Get('statistics'), ApiOperation({ summary: '获取审计统计信息' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取审计统计信息',
            }), ApiQuery({ name: 'startDate', required: false, description: '开始日期' }), ApiQuery({ name: 'endDate', required: false, description: '结束日期' }), ApiQuery({ name: 'userId', required: false, description: '用户 ID' })];
        _cleanupOldLogs_decorators = [Post('cleanup'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '清理旧审计日志' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功清理旧审计日志',
            })];
        __esDecorate(_classThis, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getStatistics_decorators, { kind: "method", name: "getStatistics", static: false, private: false, access: { has: obj => "getStatistics" in obj, get: obj => obj.getStatistics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _cleanupOldLogs_decorators, { kind: "method", name: "cleanupOldLogs", static: false, private: false, access: { has: obj => "cleanupOldLogs" in obj, get: obj => obj.cleanupOldLogs }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuditLogController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuditLogController = _classThis;
})();
export { AuditLogController };
//# sourceMappingURL=audit-log.controller.js.map