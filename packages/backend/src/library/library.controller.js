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
import { Controller, Get, UseGuards, Logger, UseInterceptors, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { FileSystemNodeDto, NodeListResponseDto, } from '../file-system/dto/file-system-response.dto';
import { FileContentResponseDto } from '../version-control/dto/file-content-response.dto';
import { StorageQuotaInterceptor } from '../common/interceptors/storage-quota.interceptor';
/**
 * 公共资源库控制器（仅保留只读接口）
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目，不是某个人的资源库
 * - 读操作：公开访问（无需登录）
 * - 写操作：已废弃，统一走文件管理模块
 * - 无版本管理、无回收站（删除即永久删除）
 */
let LibraryController = (() => {
    let _classDecorators = [ApiTags('library', '公共资源库'), Controller('library'), UseInterceptors(StorageQuotaInterceptor)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getDrawingLibrary_decorators;
    let _getDrawingChildren_decorators;
    let _getDrawingAllFiles_decorators;
    let _getDrawingFile_decorators;
    let _getDrawingNode_decorators;
    let _downloadDrawingNode_decorators;
    let _getDrawingThumbnail_decorators;
    let _getBlockLibrary_decorators;
    let _getBlockChildren_decorators;
    let _getBlockAllFiles_decorators;
    let _getBlockFile_decorators;
    let _getBlockNode_decorators;
    let _downloadBlockNode_decorators;
    let _getBlockThumbnail_decorators;
    var LibraryController = _classThis = class {
        constructor(libraryService, fileSystemService, fileDownloadHandler, mxcadFileHandler, drawingLibraryProvider, blockLibraryProvider) {
            this.libraryService = (__runInitializers(this, _instanceExtraInitializers), libraryService);
            this.fileSystemService = fileSystemService;
            this.fileDownloadHandler = fileDownloadHandler;
            this.mxcadFileHandler = mxcadFileHandler;
            this.drawingLibraryProvider = drawingLibraryProvider;
            this.blockLibraryProvider = blockLibraryProvider;
            this.logger = new Logger(LibraryController.name);
        }
        // ========== 图纸库接口（只读） ==========
        /**
         * 获取图纸库详情
         */
        async getDrawingLibrary() {
            return this.drawingLibraryProvider.getRootNode();
        }
        /**
         * 获取图纸库子节点列表
         */
        async getDrawingChildren(nodeId, query) {
            const mockUserId = 'system';
            const actualNodeId = nodeId === 'root'
                ? await this.drawingLibraryProvider.getLibraryId()
                : nodeId;
            return this.fileSystemService.getChildren(actualNodeId, mockUserId, query);
        }
        /**
         * 递归获取图纸库节点下的所有文件（包括子目录）
         */
        async getDrawingAllFiles(nodeId, query) {
            const mockUserId = 'system';
            const actualNodeId = nodeId === 'root'
                ? await this.drawingLibraryProvider.getLibraryId()
                : nodeId;
            return this.fileSystemService.getAllFilesUnderNode(actualNodeId, mockUserId, query);
        }
        /**
         * 图纸库统一文件访问路由（公开访问）
         *
         * URL 格式：/api/library/drawing/filesData/*path
         */
        async getDrawingFile(filePath, res) {
            const filename = filePath.join('/');
            return this.mxcadFileHandler.serveFile(filename, res);
        }
        /**
         * 获取图纸库节点详情
         */
        async getDrawingNode(nodeId) {
            return this.fileSystemService.getNodeTree(nodeId);
        }
        /**
         * 下载图纸库文件（需要图纸库管理权限）
         */
        async downloadDrawingNode(nodeId, req, res) {
            await this.fileDownloadHandler.handleDownload(nodeId, req.user.id, res, {
                clientIp: req.ip,
            });
        }
        /**
         * 获取图纸库文件缩略图
         */
        async getDrawingThumbnail(nodeId, req) {
            const mockUserId = 'system';
            return this.fileSystemService.checkFileAccess(nodeId, mockUserId);
        }
        // ========== 图块库接口（只读） ==========
        /**
         * 获取图块库详情
         */
        async getBlockLibrary() {
            return this.blockLibraryProvider.getRootNode();
        }
        /**
         * 获取图块库子节点列表
         */
        async getBlockChildren(nodeId, query) {
            const mockUserId = 'system';
            const actualNodeId = nodeId === 'root'
                ? await this.blockLibraryProvider.getLibraryId()
                : nodeId;
            return this.fileSystemService.getChildren(actualNodeId, mockUserId, query);
        }
        /**
         * 递归获取图块库节点下的所有文件（包括子目录）
         */
        async getBlockAllFiles(nodeId, query) {
            const mockUserId = 'system';
            const actualNodeId = nodeId === 'root'
                ? await this.blockLibraryProvider.getLibraryId()
                : nodeId;
            return this.fileSystemService.getAllFilesUnderNode(actualNodeId, mockUserId, query);
        }
        /**
         * 图块库统一文件访问路由（公开访问）
         *
         * URL 格式：/api/library/block/filesData/*path
         */
        async getBlockFile(filePath, res, req) {
            const filename = filePath.join('/');
            this.logger.log(`
========================================
[图块库文件访问] 收到请求
- 完整URL: ${req.protocol}://${req.get('host')}${req.originalUrl}
- 请求路径: ${filename}
- 请求方法: ${req.method}
- 来源页面(Referer): ${req.get('referer') || '无'}
- 客户端IP: ${req.ip}
- User-Agent: ${req.get('user-agent')}
- 时间: ${new Date().toISOString()}
========================================
    `);
            return this.mxcadFileHandler.serveFile(filename, res);
        }
        /**
         * 获取图块库节点详情
         */
        async getBlockNode(nodeId) {
            return this.fileSystemService.getNodeTree(nodeId);
        }
        /**
         * 下载图块库文件（需要图块库管理权限）
         */
        async downloadBlockNode(nodeId, req, res) {
            await this.fileDownloadHandler.handleDownload(nodeId, req.user.id, res, {
                clientIp: req.ip,
            });
        }
        /**
         * 获取图块库文件缩略图
         */
        async getBlockThumbnail(nodeId, req) {
            const mockUserId = 'system';
            return this.fileSystemService.checkFileAccess(nodeId, mockUserId);
        }
    };
    __setFunctionName(_classThis, "LibraryController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getDrawingLibrary_decorators = [Get('drawing'), Public(), ApiOperation({ summary: '获取图纸库详情' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: FileSystemNodeDto,
            })];
        _getDrawingChildren_decorators = [Get('drawing/children/:nodeId'), Public(), ApiOperation({ summary: '获取图纸库子节点列表' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: NodeListResponseDto,
            })];
        _getDrawingAllFiles_decorators = [Get('drawing/all-files/:nodeId'), Public(), ApiOperation({ summary: '递归获取图纸库节点下的所有文件' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: NodeListResponseDto,
            })];
        _getDrawingFile_decorators = [Get('drawing/filesData/*path'), Public(), ApiOperation({ summary: '获取图纸库文件（统一入口）' }), ApiResponse({
                status: 200,
                description: '获取成功',
                content: { 'application/octet-stream': {} },
            })];
        _getDrawingNode_decorators = [Get('drawing/nodes/:nodeId'), Public(), ApiOperation({ summary: '获取图纸库节点详情' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: FileSystemNodeDto,
            })];
        _downloadDrawingNode_decorators = [Get('drawing/nodes/:nodeId/download'), UseGuards(JwtAuthGuard, PermissionsGuard), RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE]), ApiBearerAuth(), ApiOperation({ summary: '下载图纸库文件' }), ApiResponse({
                status: 200,
                description: '下载成功',
                type: FileContentResponseDto,
            })];
        _getDrawingThumbnail_decorators = [Get('drawing/nodes/:nodeId/thumbnail'), Public(), ApiOperation({ summary: '获取图纸库文件缩略图' }), ApiResponse({ status: 200, description: '获取成功' })];
        _getBlockLibrary_decorators = [Get('block'), Public(), ApiOperation({ summary: '获取图块库详情' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: FileSystemNodeDto,
            })];
        _getBlockChildren_decorators = [Get('block/children/:nodeId'), Public(), ApiOperation({ summary: '获取图块库子节点列表' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: NodeListResponseDto,
            })];
        _getBlockAllFiles_decorators = [Get('block/all-files/:nodeId'), Public(), ApiOperation({ summary: '递归获取图块库节点下的所有文件' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: NodeListResponseDto,
            })];
        _getBlockFile_decorators = [Get('block/filesData/*path'), Public(), ApiOperation({ summary: '获取图块库文件（统一入口）' }), ApiResponse({
                status: 200,
                description: '获取成功',
                content: { 'application/octet-stream': {} },
            })];
        _getBlockNode_decorators = [Get('block/nodes/:nodeId'), Public(), ApiOperation({ summary: '获取图块库节点详情' }), ApiResponse({
                status: 200,
                description: '获取成功',
                type: FileSystemNodeDto,
            })];
        _downloadBlockNode_decorators = [Get('block/nodes/:nodeId/download'), UseGuards(JwtAuthGuard, PermissionsGuard), RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE]), ApiBearerAuth(), ApiOperation({ summary: '下载图块库文件' }), ApiResponse({
                status: 200,
                description: '下载成功',
                type: FileContentResponseDto,
            })];
        _getBlockThumbnail_decorators = [Get('block/nodes/:nodeId/thumbnail'), Public(), ApiOperation({ summary: '获取图块库文件缩略图' }), ApiResponse({ status: 200, description: '获取成功' })];
        __esDecorate(_classThis, null, _getDrawingLibrary_decorators, { kind: "method", name: "getDrawingLibrary", static: false, private: false, access: { has: obj => "getDrawingLibrary" in obj, get: obj => obj.getDrawingLibrary }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getDrawingChildren_decorators, { kind: "method", name: "getDrawingChildren", static: false, private: false, access: { has: obj => "getDrawingChildren" in obj, get: obj => obj.getDrawingChildren }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getDrawingAllFiles_decorators, { kind: "method", name: "getDrawingAllFiles", static: false, private: false, access: { has: obj => "getDrawingAllFiles" in obj, get: obj => obj.getDrawingAllFiles }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getDrawingFile_decorators, { kind: "method", name: "getDrawingFile", static: false, private: false, access: { has: obj => "getDrawingFile" in obj, get: obj => obj.getDrawingFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getDrawingNode_decorators, { kind: "method", name: "getDrawingNode", static: false, private: false, access: { has: obj => "getDrawingNode" in obj, get: obj => obj.getDrawingNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _downloadDrawingNode_decorators, { kind: "method", name: "downloadDrawingNode", static: false, private: false, access: { has: obj => "downloadDrawingNode" in obj, get: obj => obj.downloadDrawingNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getDrawingThumbnail_decorators, { kind: "method", name: "getDrawingThumbnail", static: false, private: false, access: { has: obj => "getDrawingThumbnail" in obj, get: obj => obj.getDrawingThumbnail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getBlockLibrary_decorators, { kind: "method", name: "getBlockLibrary", static: false, private: false, access: { has: obj => "getBlockLibrary" in obj, get: obj => obj.getBlockLibrary }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getBlockChildren_decorators, { kind: "method", name: "getBlockChildren", static: false, private: false, access: { has: obj => "getBlockChildren" in obj, get: obj => obj.getBlockChildren }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getBlockAllFiles_decorators, { kind: "method", name: "getBlockAllFiles", static: false, private: false, access: { has: obj => "getBlockAllFiles" in obj, get: obj => obj.getBlockAllFiles }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getBlockFile_decorators, { kind: "method", name: "getBlockFile", static: false, private: false, access: { has: obj => "getBlockFile" in obj, get: obj => obj.getBlockFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getBlockNode_decorators, { kind: "method", name: "getBlockNode", static: false, private: false, access: { has: obj => "getBlockNode" in obj, get: obj => obj.getBlockNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _downloadBlockNode_decorators, { kind: "method", name: "downloadBlockNode", static: false, private: false, access: { has: obj => "downloadBlockNode" in obj, get: obj => obj.downloadBlockNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getBlockThumbnail_decorators, { kind: "method", name: "getBlockThumbnail", static: false, private: false, access: { has: obj => "getBlockThumbnail" in obj, get: obj => obj.getBlockThumbnail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        LibraryController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return LibraryController = _classThis;
})();
export { LibraryController };
//# sourceMappingURL=library.controller.js.map