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
import { Controller, Get, HttpCode, HttpStatus, UseGuards, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiResponse, ApiQuery, ApiParam, } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { SvnLogResponseDto, FileContentResponseDto } from './dto';
let VersionControlController = (() => {
    let _classDecorators = [ApiTags('version-control'), Controller('version-control'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getFileHistory_decorators;
    let _getFileContentAtRevision_decorators;
    var VersionControlController = _classThis = class {
        constructor(versionControlService) {
            this.versionControlService = (__runInitializers(this, _instanceExtraInitializers), versionControlService);
        }
        /**
         * 获取节点的 SVN 提交历史（自动提取目录路径）
         * 传入文件路径时，会自动提取所在目录的历史记录
         * 这样可以看到节点目录下所有文件的变更记录
         */
        async getFileHistory(projectId, filePath, limit) {
            return this.versionControlService.getFileHistory(filePath, limit);
        }
        /**
         * 获取指定版本的文件内容
         */
        async getFileContentAtRevision(revision, projectId, filePath) {
            return this.versionControlService.getFileContentAtRevision(filePath, revision);
        }
    };
    __setFunctionName(_classThis, "VersionControlController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getFileHistory_decorators = [Get('history'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取节点的 SVN 提交历史' }), ApiQuery({ name: 'projectId', required: true, description: '项目ID' }), ApiQuery({
                name: 'filePath',
                required: true,
                description: '节点路径（文件或目录路径，后端自动提取目录）',
            }), ApiQuery({
                name: 'limit',
                required: false,
                description: '限制返回的记录数量',
                type: Number,
            }), ApiOkResponse({
                description: '获取成功',
                type: SvnLogResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 401, description: '未授权' }), ApiResponse({ status: 403, description: '无权限' }), RequireProjectPermission(ProjectPermission.VERSION_READ)];
        _getFileContentAtRevision_decorators = [Get('file/:revision'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取指定版本的文件内容' }), ApiParam({
                name: 'revision',
                required: true,
                description: '修订版本号',
                type: Number,
            }), ApiQuery({ name: 'projectId', required: true, description: '项目ID' }), ApiQuery({ name: 'filePath', required: true, description: '文件路径' }), ApiOkResponse({
                description: '获取成功',
                type: FileContentResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 401, description: '未授权' }), ApiResponse({ status: 403, description: '无权限' }), RequireProjectPermission(ProjectPermission.VERSION_READ)];
        __esDecorate(_classThis, null, _getFileHistory_decorators, { kind: "method", name: "getFileHistory", static: false, private: false, access: { has: obj => "getFileHistory" in obj, get: obj => obj.getFileHistory }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getFileContentAtRevision_decorators, { kind: "method", name: "getFileContentAtRevision", static: false, private: false, access: { has: obj => "getFileContentAtRevision" in obj, get: obj => obj.getFileContentAtRevision }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        VersionControlController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return VersionControlController = _classThis;
})();
export { VersionControlController };
//# sourceMappingURL=version-control.controller.js.map