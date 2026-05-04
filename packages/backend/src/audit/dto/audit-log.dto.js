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
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
let AuditLogUserDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _nickname_decorators;
    let _nickname_initializers = [];
    let _nickname_extraInitializers = [];
    return _a = class AuditLogUserDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.email = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.nickname = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                __runInitializers(this, _nickname_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '用户 ID' })];
            _email_decorators = [ApiProperty({ description: '用户邮箱' })];
            _username_decorators = [ApiProperty({ description: '用户名' })];
            _nickname_decorators = [ApiProperty({ description: '用户昵称', required: false })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { AuditLogUserDto };
let AuditLogDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _action_decorators;
    let _action_initializers = [];
    let _action_extraInitializers = [];
    let _resourceType_decorators;
    let _resourceType_initializers = [];
    let _resourceType_extraInitializers = [];
    let _resourceId_decorators;
    let _resourceId_initializers = [];
    let _resourceId_extraInitializers = [];
    let _userId_decorators;
    let _userId_initializers = [];
    let _userId_extraInitializers = [];
    let _details_decorators;
    let _details_initializers = [];
    let _details_extraInitializers = [];
    let _ipAddress_decorators;
    let _ipAddress_initializers = [];
    let _ipAddress_extraInitializers = [];
    let _userAgent_decorators;
    let _userAgent_initializers = [];
    let _userAgent_extraInitializers = [];
    let _success_decorators;
    let _success_initializers = [];
    let _success_extraInitializers = [];
    let _errorMessage_decorators;
    let _errorMessage_initializers = [];
    let _errorMessage_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _user_decorators;
    let _user_initializers = [];
    let _user_extraInitializers = [];
    return _a = class AuditLogDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.action = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _action_initializers, void 0));
                this.resourceType = (__runInitializers(this, _action_extraInitializers), __runInitializers(this, _resourceType_initializers, void 0));
                this.resourceId = (__runInitializers(this, _resourceType_extraInitializers), __runInitializers(this, _resourceId_initializers, void 0));
                this.userId = (__runInitializers(this, _resourceId_extraInitializers), __runInitializers(this, _userId_initializers, void 0));
                this.details = (__runInitializers(this, _userId_extraInitializers), __runInitializers(this, _details_initializers, void 0));
                this.ipAddress = (__runInitializers(this, _details_extraInitializers), __runInitializers(this, _ipAddress_initializers, void 0));
                this.userAgent = (__runInitializers(this, _ipAddress_extraInitializers), __runInitializers(this, _userAgent_initializers, void 0));
                this.success = (__runInitializers(this, _userAgent_extraInitializers), __runInitializers(this, _success_initializers, void 0));
                this.errorMessage = (__runInitializers(this, _success_extraInitializers), __runInitializers(this, _errorMessage_initializers, void 0));
                this.createdAt = (__runInitializers(this, _errorMessage_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.user = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _user_initializers, void 0));
                __runInitializers(this, _user_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '审计日志 ID' })];
            _action_decorators = [ApiProperty({
                    description: '操作类型',
                    enum: Object.values(AuditAction),
                    enumName: 'AuditActionEnum',
                })];
            _resourceType_decorators = [ApiProperty({
                    description: '资源类型',
                    enum: Object.values(ResourceType),
                    enumName: 'ResourceTypeEnum',
                })];
            _resourceId_decorators = [ApiProperty({ description: '资源 ID', required: false })];
            _userId_decorators = [ApiProperty({ description: '操作用户 ID' })];
            _details_decorators = [ApiProperty({ description: '详细信息（JSON 格式）', required: false })];
            _ipAddress_decorators = [ApiProperty({ description: 'IP 地址', required: false })];
            _userAgent_decorators = [ApiProperty({ description: '用户代理', required: false })];
            _success_decorators = [ApiProperty({ description: '操作是否成功' })];
            _errorMessage_decorators = [ApiProperty({ description: '错误信息', required: false })];
            _createdAt_decorators = [ApiProperty({ description: '创建时间' })];
            _user_decorators = [ApiProperty({ description: '用户信息', type: () => AuditLogUserDto })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _action_decorators, { kind: "field", name: "action", static: false, private: false, access: { has: obj => "action" in obj, get: obj => obj.action, set: (obj, value) => { obj.action = value; } }, metadata: _metadata }, _action_initializers, _action_extraInitializers);
            __esDecorate(null, null, _resourceType_decorators, { kind: "field", name: "resourceType", static: false, private: false, access: { has: obj => "resourceType" in obj, get: obj => obj.resourceType, set: (obj, value) => { obj.resourceType = value; } }, metadata: _metadata }, _resourceType_initializers, _resourceType_extraInitializers);
            __esDecorate(null, null, _resourceId_decorators, { kind: "field", name: "resourceId", static: false, private: false, access: { has: obj => "resourceId" in obj, get: obj => obj.resourceId, set: (obj, value) => { obj.resourceId = value; } }, metadata: _metadata }, _resourceId_initializers, _resourceId_extraInitializers);
            __esDecorate(null, null, _userId_decorators, { kind: "field", name: "userId", static: false, private: false, access: { has: obj => "userId" in obj, get: obj => obj.userId, set: (obj, value) => { obj.userId = value; } }, metadata: _metadata }, _userId_initializers, _userId_extraInitializers);
            __esDecorate(null, null, _details_decorators, { kind: "field", name: "details", static: false, private: false, access: { has: obj => "details" in obj, get: obj => obj.details, set: (obj, value) => { obj.details = value; } }, metadata: _metadata }, _details_initializers, _details_extraInitializers);
            __esDecorate(null, null, _ipAddress_decorators, { kind: "field", name: "ipAddress", static: false, private: false, access: { has: obj => "ipAddress" in obj, get: obj => obj.ipAddress, set: (obj, value) => { obj.ipAddress = value; } }, metadata: _metadata }, _ipAddress_initializers, _ipAddress_extraInitializers);
            __esDecorate(null, null, _userAgent_decorators, { kind: "field", name: "userAgent", static: false, private: false, access: { has: obj => "userAgent" in obj, get: obj => obj.userAgent, set: (obj, value) => { obj.userAgent = value; } }, metadata: _metadata }, _userAgent_initializers, _userAgent_extraInitializers);
            __esDecorate(null, null, _success_decorators, { kind: "field", name: "success", static: false, private: false, access: { has: obj => "success" in obj, get: obj => obj.success, set: (obj, value) => { obj.success = value; } }, metadata: _metadata }, _success_initializers, _success_extraInitializers);
            __esDecorate(null, null, _errorMessage_decorators, { kind: "field", name: "errorMessage", static: false, private: false, access: { has: obj => "errorMessage" in obj, get: obj => obj.errorMessage, set: (obj, value) => { obj.errorMessage = value; } }, metadata: _metadata }, _errorMessage_initializers, _errorMessage_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _user_decorators, { kind: "field", name: "user", static: false, private: false, access: { has: obj => "user" in obj, get: obj => obj.user, set: (obj, value) => { obj.user = value; } }, metadata: _metadata }, _user_initializers, _user_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { AuditLogDto };
let AuditLogListResponseDto = (() => {
    var _a;
    let _logs_decorators;
    let _logs_initializers = [];
    let _logs_extraInitializers = [];
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _page_decorators;
    let _page_initializers = [];
    let _page_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _totalPages_decorators;
    let _totalPages_initializers = [];
    let _totalPages_extraInitializers = [];
    return _a = class AuditLogListResponseDto {
            constructor() {
                this.logs = __runInitializers(this, _logs_initializers, void 0);
                this.total = (__runInitializers(this, _logs_extraInitializers), __runInitializers(this, _total_initializers, void 0));
                this.page = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _page_initializers, void 0));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, void 0));
                this.totalPages = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _totalPages_initializers, void 0));
                __runInitializers(this, _totalPages_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _logs_decorators = [ApiProperty({ description: '审计日志列表', type: () => [AuditLogDto] })];
            _total_decorators = [ApiProperty({ description: '总数' })];
            _page_decorators = [ApiProperty({ description: '当前页码' })];
            _limit_decorators = [ApiProperty({ description: '每页数量' })];
            _totalPages_decorators = [ApiProperty({ description: '总页数' })];
            __esDecorate(null, null, _logs_decorators, { kind: "field", name: "logs", static: false, private: false, access: { has: obj => "logs" in obj, get: obj => obj.logs, set: (obj, value) => { obj.logs = value; } }, metadata: _metadata }, _logs_initializers, _logs_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _totalPages_decorators, { kind: "field", name: "totalPages", static: false, private: false, access: { has: obj => "totalPages" in obj, get: obj => obj.totalPages, set: (obj, value) => { obj.totalPages = value; } }, metadata: _metadata }, _totalPages_initializers, _totalPages_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { AuditLogListResponseDto };
let AuditStatisticsResponseDto = (() => {
    var _a;
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _successCount_decorators;
    let _successCount_initializers = [];
    let _successCount_extraInitializers = [];
    let _failureCount_decorators;
    let _failureCount_initializers = [];
    let _failureCount_extraInitializers = [];
    let _successRate_decorators;
    let _successRate_initializers = [];
    let _successRate_extraInitializers = [];
    let _actionStats_decorators;
    let _actionStats_initializers = [];
    let _actionStats_extraInitializers = [];
    return _a = class AuditStatisticsResponseDto {
            constructor() {
                this.total = __runInitializers(this, _total_initializers, void 0);
                this.successCount = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _successCount_initializers, void 0));
                this.failureCount = (__runInitializers(this, _successCount_extraInitializers), __runInitializers(this, _failureCount_initializers, void 0));
                this.successRate = (__runInitializers(this, _failureCount_extraInitializers), __runInitializers(this, _successRate_initializers, void 0));
                this.actionStats = (__runInitializers(this, _successRate_extraInitializers), __runInitializers(this, _actionStats_initializers, void 0));
                __runInitializers(this, _actionStats_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _total_decorators = [ApiProperty({ description: '总记录数' })];
            _successCount_decorators = [ApiProperty({ description: '成功记录数' })];
            _failureCount_decorators = [ApiProperty({ description: '失败记录数' })];
            _successRate_decorators = [ApiProperty({ description: '成功率' })];
            _actionStats_decorators = [ApiProperty({ description: '操作类型统计', example: {} })];
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _successCount_decorators, { kind: "field", name: "successCount", static: false, private: false, access: { has: obj => "successCount" in obj, get: obj => obj.successCount, set: (obj, value) => { obj.successCount = value; } }, metadata: _metadata }, _successCount_initializers, _successCount_extraInitializers);
            __esDecorate(null, null, _failureCount_decorators, { kind: "field", name: "failureCount", static: false, private: false, access: { has: obj => "failureCount" in obj, get: obj => obj.failureCount, set: (obj, value) => { obj.failureCount = value; } }, metadata: _metadata }, _failureCount_initializers, _failureCount_extraInitializers);
            __esDecorate(null, null, _successRate_decorators, { kind: "field", name: "successRate", static: false, private: false, access: { has: obj => "successRate" in obj, get: obj => obj.successRate, set: (obj, value) => { obj.successRate = value; } }, metadata: _metadata }, _successRate_initializers, _successRate_extraInitializers);
            __esDecorate(null, null, _actionStats_decorators, { kind: "field", name: "actionStats", static: false, private: false, access: { has: obj => "actionStats" in obj, get: obj => obj.actionStats, set: (obj, value) => { obj.actionStats = value; } }, metadata: _metadata }, _actionStats_initializers, _actionStats_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { AuditStatisticsResponseDto };
let CleanupResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _deletedCount_decorators;
    let _deletedCount_initializers = [];
    let _deletedCount_extraInitializers = [];
    return _a = class CleanupResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                this.deletedCount = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _deletedCount_initializers, void 0));
                __runInitializers(this, _deletedCount_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '提示信息' })];
            _deletedCount_decorators = [ApiProperty({ description: '删除的记录数' })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _deletedCount_decorators, { kind: "field", name: "deletedCount", static: false, private: false, access: { has: obj => "deletedCount" in obj, get: obj => obj.deletedCount, set: (obj, value) => { obj.deletedCount = value; } }, metadata: _metadata }, _deletedCount_initializers, _deletedCount_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CleanupResponseDto };
//# sourceMappingURL=audit-log.dto.js.map