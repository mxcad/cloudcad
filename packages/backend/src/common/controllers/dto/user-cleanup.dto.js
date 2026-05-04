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
/////////////////////////////////////////////////////////////////////////////
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
let UserCleanupStatsResponseDto = (() => {
    var _a;
    let _pendingCleanup_decorators;
    let _pendingCleanup_initializers = [];
    let _pendingCleanup_extraInitializers = [];
    let _expiryDate_decorators;
    let _expiryDate_initializers = [];
    let _expiryDate_extraInitializers = [];
    let _delayDays_decorators;
    let _delayDays_initializers = [];
    let _delayDays_extraInitializers = [];
    return _a = class UserCleanupStatsResponseDto {
            constructor() {
                this.pendingCleanup = __runInitializers(this, _pendingCleanup_initializers, void 0);
                this.expiryDate = (__runInitializers(this, _pendingCleanup_extraInitializers), __runInitializers(this, _expiryDate_initializers, void 0));
                this.delayDays = (__runInitializers(this, _expiryDate_extraInitializers), __runInitializers(this, _delayDays_initializers, void 0));
                __runInitializers(this, _delayDays_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _pendingCleanup_decorators = [ApiProperty({ description: '待清理用户数', example: 15 })];
            _expiryDate_decorators = [ApiProperty({
                    description: '过期截止日期',
                    example: '2026-03-11T00:00:00.000Z',
                })];
            _delayDays_decorators = [ApiProperty({ description: '延迟天数', example: 30 })];
            __esDecorate(null, null, _pendingCleanup_decorators, { kind: "field", name: "pendingCleanup", static: false, private: false, access: { has: obj => "pendingCleanup" in obj, get: obj => obj.pendingCleanup, set: (obj, value) => { obj.pendingCleanup = value; } }, metadata: _metadata }, _pendingCleanup_initializers, _pendingCleanup_extraInitializers);
            __esDecorate(null, null, _expiryDate_decorators, { kind: "field", name: "expiryDate", static: false, private: false, access: { has: obj => "expiryDate" in obj, get: obj => obj.expiryDate, set: (obj, value) => { obj.expiryDate = value; } }, metadata: _metadata }, _expiryDate_initializers, _expiryDate_extraInitializers);
            __esDecorate(null, null, _delayDays_decorators, { kind: "field", name: "delayDays", static: false, private: false, access: { has: obj => "delayDays" in obj, get: obj => obj.delayDays, set: (obj, value) => { obj.delayDays = value; } }, metadata: _metadata }, _delayDays_initializers, _delayDays_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserCleanupStatsResponseDto };
let UserCleanupTriggerDto = (() => {
    var _a;
    let _delayDays_decorators;
    let _delayDays_initializers = [];
    let _delayDays_extraInitializers = [];
    return _a = class UserCleanupTriggerDto {
            constructor() {
                this.delayDays = __runInitializers(this, _delayDays_initializers, void 0);
                __runInitializers(this, _delayDays_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _delayDays_decorators = [ApiPropertyOptional({
                    description: '自定义延迟天数（覆盖默认值）',
                    example: 7,
                })];
            __esDecorate(null, null, _delayDays_decorators, { kind: "field", name: "delayDays", static: false, private: false, access: { has: obj => "delayDays" in obj, get: obj => obj.delayDays, set: (obj, value) => { obj.delayDays = value; } }, metadata: _metadata }, _delayDays_initializers, _delayDays_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserCleanupTriggerDto };
let UserCleanupTriggerResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _success_decorators;
    let _success_initializers = [];
    let _success_extraInitializers = [];
    let _processedUsers_decorators;
    let _processedUsers_initializers = [];
    let _processedUsers_extraInitializers = [];
    let _deletedMembers_decorators;
    let _deletedMembers_initializers = [];
    let _deletedMembers_extraInitializers = [];
    let _deletedProjects_decorators;
    let _deletedProjects_initializers = [];
    let _deletedProjects_extraInitializers = [];
    let _deletedAuditLogs_decorators;
    let _deletedAuditLogs_initializers = [];
    let _deletedAuditLogs_extraInitializers = [];
    let _markedForStorageCleanup_decorators;
    let _markedForStorageCleanup_initializers = [];
    let _markedForStorageCleanup_extraInitializers = [];
    let _errors_decorators;
    let _errors_initializers = [];
    let _errors_extraInitializers = [];
    return _a = class UserCleanupTriggerResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                this.success = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _success_initializers, void 0));
                this.processedUsers = (__runInitializers(this, _success_extraInitializers), __runInitializers(this, _processedUsers_initializers, void 0));
                this.deletedMembers = (__runInitializers(this, _processedUsers_extraInitializers), __runInitializers(this, _deletedMembers_initializers, void 0));
                this.deletedProjects = (__runInitializers(this, _deletedMembers_extraInitializers), __runInitializers(this, _deletedProjects_initializers, void 0));
                this.deletedAuditLogs = (__runInitializers(this, _deletedProjects_extraInitializers), __runInitializers(this, _deletedAuditLogs_initializers, void 0));
                this.markedForStorageCleanup = (__runInitializers(this, _deletedAuditLogs_extraInitializers), __runInitializers(this, _markedForStorageCleanup_initializers, void 0));
                this.errors = (__runInitializers(this, _markedForStorageCleanup_extraInitializers), __runInitializers(this, _errors_initializers, void 0));
                __runInitializers(this, _errors_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '消息', example: '清理完成: 处理 0 个用户' })];
            _success_decorators = [ApiProperty({ description: '是否成功', example: true })];
            _processedUsers_decorators = [ApiProperty({ description: '处理的用户数', example: 0 })];
            _deletedMembers_decorators = [ApiProperty({ description: '删除的成员关系数', example: 0 })];
            _deletedProjects_decorators = [ApiProperty({ description: '删除的项目数', example: 0 })];
            _deletedAuditLogs_decorators = [ApiProperty({ description: '删除的审计日志数', example: 0 })];
            _markedForStorageCleanup_decorators = [ApiProperty({ description: '标记待清理的存储数', example: 0 })];
            _errors_decorators = [ApiProperty({ description: '错误列表', example: [] })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _success_decorators, { kind: "field", name: "success", static: false, private: false, access: { has: obj => "success" in obj, get: obj => obj.success, set: (obj, value) => { obj.success = value; } }, metadata: _metadata }, _success_initializers, _success_extraInitializers);
            __esDecorate(null, null, _processedUsers_decorators, { kind: "field", name: "processedUsers", static: false, private: false, access: { has: obj => "processedUsers" in obj, get: obj => obj.processedUsers, set: (obj, value) => { obj.processedUsers = value; } }, metadata: _metadata }, _processedUsers_initializers, _processedUsers_extraInitializers);
            __esDecorate(null, null, _deletedMembers_decorators, { kind: "field", name: "deletedMembers", static: false, private: false, access: { has: obj => "deletedMembers" in obj, get: obj => obj.deletedMembers, set: (obj, value) => { obj.deletedMembers = value; } }, metadata: _metadata }, _deletedMembers_initializers, _deletedMembers_extraInitializers);
            __esDecorate(null, null, _deletedProjects_decorators, { kind: "field", name: "deletedProjects", static: false, private: false, access: { has: obj => "deletedProjects" in obj, get: obj => obj.deletedProjects, set: (obj, value) => { obj.deletedProjects = value; } }, metadata: _metadata }, _deletedProjects_initializers, _deletedProjects_extraInitializers);
            __esDecorate(null, null, _deletedAuditLogs_decorators, { kind: "field", name: "deletedAuditLogs", static: false, private: false, access: { has: obj => "deletedAuditLogs" in obj, get: obj => obj.deletedAuditLogs, set: (obj, value) => { obj.deletedAuditLogs = value; } }, metadata: _metadata }, _deletedAuditLogs_initializers, _deletedAuditLogs_extraInitializers);
            __esDecorate(null, null, _markedForStorageCleanup_decorators, { kind: "field", name: "markedForStorageCleanup", static: false, private: false, access: { has: obj => "markedForStorageCleanup" in obj, get: obj => obj.markedForStorageCleanup, set: (obj, value) => { obj.markedForStorageCleanup = value; } }, metadata: _metadata }, _markedForStorageCleanup_initializers, _markedForStorageCleanup_extraInitializers);
            __esDecorate(null, null, _errors_decorators, { kind: "field", name: "errors", static: false, private: false, access: { has: obj => "errors" in obj, get: obj => obj.errors, set: (obj, value) => { obj.errors = value; } }, metadata: _metadata }, _errors_initializers, _errors_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserCleanupTriggerResponseDto };
//# sourceMappingURL=user-cleanup.dto.js.map