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
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { FileStatus } from '@prisma/client';
export var SearchScope;
(function (SearchScope) {
    SearchScope["PROJECT"] = "project";
    SearchScope["PROJECT_FILES"] = "project_files";
    SearchScope["ALL_PROJECTS"] = "all_projects";
    SearchScope["LIBRARY"] = "library";
})(SearchScope || (SearchScope = {}));
export var SearchType;
(function (SearchType) {
    SearchType["ALL"] = "all";
    SearchType["FILE"] = "file";
    SearchType["FOLDER"] = "folder";
})(SearchType || (SearchType = {}));
let SearchDto = (() => {
    var _a;
    let _keyword_decorators;
    let _keyword_initializers = [];
    let _keyword_extraInitializers = [];
    let _scope_decorators;
    let _scope_initializers = [];
    let _scope_extraInitializers = [];
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _filter_decorators;
    let _filter_initializers = [];
    let _filter_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    let _libraryKey_decorators;
    let _libraryKey_initializers = [];
    let _libraryKey_extraInitializers = [];
    let _extension_decorators;
    let _extension_initializers = [];
    let _extension_extraInitializers = [];
    let _fileStatus_decorators;
    let _fileStatus_initializers = [];
    let _fileStatus_extraInitializers = [];
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
    return _a = class SearchDto {
            constructor() {
                this.keyword = __runInitializers(this, _keyword_initializers, void 0);
                this.scope = (__runInitializers(this, _keyword_extraInitializers), __runInitializers(this, _scope_initializers, SearchScope.PROJECT_FILES));
                this.type = (__runInitializers(this, _scope_extraInitializers), __runInitializers(this, _type_initializers, SearchType.ALL));
                this.filter = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _filter_initializers, void 0));
                this.projectId = (__runInitializers(this, _filter_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
                this.libraryKey = (__runInitializers(this, _projectId_extraInitializers), __runInitializers(this, _libraryKey_initializers, void 0));
                this.extension = (__runInitializers(this, _libraryKey_extraInitializers), __runInitializers(this, _extension_initializers, void 0));
                this.fileStatus = (__runInitializers(this, _extension_extraInitializers), __runInitializers(this, _fileStatus_initializers, void 0));
                this.page = (__runInitializers(this, _fileStatus_extraInitializers), __runInitializers(this, _page_initializers, 1));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, 50));
                this.sortBy = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _sortBy_initializers, 'updatedAt'));
                this.sortOrder = (__runInitializers(this, _sortBy_extraInitializers), __runInitializers(this, _sortOrder_initializers, 'desc'));
                __runInitializers(this, _sortOrder_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _keyword_decorators = [ApiProperty({ description: '搜索关键词', required: true }), IsString(), MaxLength(200, { message: '搜索关键词最长200个字符' })];
            _scope_decorators = [ApiProperty({
                    description: '搜索范围',
                    enum: Object.values(SearchScope),
                    enumName: 'SearchScope',
                    required: false,
                    default: SearchScope.PROJECT_FILES,
                }), IsOptional(), IsEnum(SearchScope)];
            _type_decorators = [ApiProperty({
                    description: '搜索类型',
                    enum: Object.values(SearchType),
                    enumName: 'SearchType',
                    required: false,
                    default: SearchType.ALL,
                }), IsOptional(), IsEnum(SearchType)];
            _filter_decorators = [ApiProperty({
                    description: '项目过滤类型（scope=project 时使用）',
                    enum: ['all', 'owned', 'joined'],
                    enumName: 'ProjectFilter',
                    required: false,
                }), IsOptional(), IsString()];
            _projectId_decorators = [ApiProperty({
                    description: '目标项目 ID',
                    required: false,
                }), IsOptional(), IsString()];
            _libraryKey_decorators = [ApiProperty({
                    description: '资源库类型（scope=library 时使用）',
                    enum: ['drawing', 'block'],
                    enumName: 'LibraryType',
                    required: false,
                }), IsOptional(), IsString()];
            _extension_decorators = [ApiProperty({
                    description: '文件扩展名过滤',
                    required: false,
                    example: '.dwg',
                }), IsOptional(), IsString()];
            _fileStatus_decorators = [ApiProperty({
                    description: '文件状态',
                    enum: Object.values(FileStatus),
                    enumName: 'FileStatus',
                    required: false,
                }), IsOptional(), IsEnum(FileStatus)];
            _page_decorators = [ApiProperty({ description: '页码', required: false, minimum: 1, default: 1 }), IsOptional(), Type(() => Number), IsInt(), Min(1)];
            _limit_decorators = [ApiProperty({
                    description: '每页数量',
                    required: false,
                    minimum: 10,
                    maximum: 100,
                    default: 50,
                }), IsOptional(), Type(() => Number), IsInt(), Min(10), Max(100)];
            _sortBy_decorators = [ApiProperty({
                    description: '排序字段',
                    required: false,
                    default: 'updatedAt',
                }), IsOptional(), IsString()];
            _sortOrder_decorators = [ApiProperty({
                    description: '排序方向',
                    required: false,
                    enum: ['asc', 'desc'],
                    default: 'desc',
                }), IsOptional(), IsString()];
            __esDecorate(null, null, _keyword_decorators, { kind: "field", name: "keyword", static: false, private: false, access: { has: obj => "keyword" in obj, get: obj => obj.keyword, set: (obj, value) => { obj.keyword = value; } }, metadata: _metadata }, _keyword_initializers, _keyword_extraInitializers);
            __esDecorate(null, null, _scope_decorators, { kind: "field", name: "scope", static: false, private: false, access: { has: obj => "scope" in obj, get: obj => obj.scope, set: (obj, value) => { obj.scope = value; } }, metadata: _metadata }, _scope_initializers, _scope_extraInitializers);
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _filter_decorators, { kind: "field", name: "filter", static: false, private: false, access: { has: obj => "filter" in obj, get: obj => obj.filter, set: (obj, value) => { obj.filter = value; } }, metadata: _metadata }, _filter_initializers, _filter_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            __esDecorate(null, null, _libraryKey_decorators, { kind: "field", name: "libraryKey", static: false, private: false, access: { has: obj => "libraryKey" in obj, get: obj => obj.libraryKey, set: (obj, value) => { obj.libraryKey = value; } }, metadata: _metadata }, _libraryKey_initializers, _libraryKey_extraInitializers);
            __esDecorate(null, null, _extension_decorators, { kind: "field", name: "extension", static: false, private: false, access: { has: obj => "extension" in obj, get: obj => obj.extension, set: (obj, value) => { obj.extension = value; } }, metadata: _metadata }, _extension_initializers, _extension_extraInitializers);
            __esDecorate(null, null, _fileStatus_decorators, { kind: "field", name: "fileStatus", static: false, private: false, access: { has: obj => "fileStatus" in obj, get: obj => obj.fileStatus, set: (obj, value) => { obj.fileStatus = value; } }, metadata: _metadata }, _fileStatus_initializers, _fileStatus_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _sortBy_decorators, { kind: "field", name: "sortBy", static: false, private: false, access: { has: obj => "sortBy" in obj, get: obj => obj.sortBy, set: (obj, value) => { obj.sortBy = value; } }, metadata: _metadata }, _sortBy_initializers, _sortBy_extraInitializers);
            __esDecorate(null, null, _sortOrder_decorators, { kind: "field", name: "sortOrder", static: false, private: false, access: { has: obj => "sortOrder" in obj, get: obj => obj.sortOrder, set: (obj, value) => { obj.sortOrder = value; } }, metadata: _metadata }, _sortOrder_initializers, _sortOrder_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SearchDto };
//# sourceMappingURL=search.dto.js.map