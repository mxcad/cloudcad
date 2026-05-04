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
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
let QueryUsersDto = (() => {
    var _a;
    let _search_decorators;
    let _search_initializers = [];
    let _search_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _roleId_decorators;
    let _roleId_initializers = [];
    let _roleId_extraInitializers = [];
    let _page_decorators;
    let _page_initializers = [];
    let _page_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _sortBy_decorators;
    let _sortBy_initializers = [];
    let _sortBy_extraInitializers = [];
    let _sortOrder_decorators;
    let _sortOrder_initializers = [];
    let _sortOrder_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    return _a = class QueryUsersDto {
            constructor() {
                this.search = __runInitializers(this, _search_initializers, void 0);
                this.status = (__runInitializers(this, _search_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.roleId = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _roleId_initializers, void 0));
                this.page = (__runInitializers(this, _roleId_extraInitializers), __runInitializers(this, _page_initializers, 1));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, 20));
                this.sortBy = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _sortBy_initializers, 'createdAt'));
                this.sortOrder = (__runInitializers(this, _sortBy_extraInitializers), __runInitializers(this, _sortOrder_initializers, 'desc'));
                this.projectId = (__runInitializers(this, _sortOrder_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
                __runInitializers(this, _projectId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _search_decorators = [ApiProperty({ description: '搜索关键词', required: false }), IsOptional(), IsString()];
            _status_decorators = [ApiProperty({
                    description: '用户状态筛选（ACTIVE/INACTIVE/SUSPENDED/DELETED）',
                    required: false,
                }), IsOptional(), IsString()];
            _roleId_decorators = [ApiProperty({ description: '用户角色ID筛选', required: false }), IsOptional(), IsString()];
            _page_decorators = [ApiProperty({ description: '页码', required: false, minimum: 1, default: 1 }), IsOptional(), Type(() => Number), IsInt(), Min(1)];
            _limit_decorators = [ApiProperty({
                    description: '每页数量',
                    required: false,
                    minimum: 10,
                    maximum: 100,
                    default: 20,
                }), IsOptional(), Type(() => Number), IsInt(), Min(10), Max(100)];
            _sortBy_decorators = [ApiProperty({
                    description: '排序字段',
                    required: false,
                    default: 'createdAt',
                }), IsOptional(), IsString()];
            _sortOrder_decorators = [ApiProperty({
                    description: '排序方向',
                    required: false,
                    enum: ['asc', 'desc'],
                    default: 'desc',
                }), IsOptional(), IsString()];
            _projectId_decorators = [ApiProperty({
                    description: '项目ID（用于权限检查）',
                    required: false,
                }), IsOptional(), IsString()];
            __esDecorate(null, null, _search_decorators, { kind: "field", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search, set: (obj, value) => { obj.search = value; } }, metadata: _metadata }, _search_initializers, _search_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _roleId_decorators, { kind: "field", name: "roleId", static: false, private: false, access: { has: obj => "roleId" in obj, get: obj => obj.roleId, set: (obj, value) => { obj.roleId = value; } }, metadata: _metadata }, _roleId_initializers, _roleId_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _sortBy_decorators, { kind: "field", name: "sortBy", static: false, private: false, access: { has: obj => "sortBy" in obj, get: obj => obj.sortBy, set: (obj, value) => { obj.sortBy = value; } }, metadata: _metadata }, _sortBy_initializers, _sortBy_extraInitializers);
            __esDecorate(null, null, _sortOrder_decorators, { kind: "field", name: "sortOrder", static: false, private: false, access: { has: obj => "sortOrder" in obj, get: obj => obj.sortOrder, set: (obj, value) => { obj.sortOrder = value; } }, metadata: _metadata }, _sortOrder_initializers, _sortOrder_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { QueryUsersDto };
//# sourceMappingURL=query-users.dto.js.map