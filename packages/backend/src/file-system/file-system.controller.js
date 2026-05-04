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
import { BadRequestException, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Logger, NotFoundException, Options, Patch, Post, UnauthorizedException, UseGuards, UseInterceptors, } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiQuery, ApiResponse, ApiTags, } from "@nestjs/swagger";
import * as fs from "fs";
import * as path from "path";
import { CsrfProtected } from "../auth/decorators/csrf-protected.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireProjectPermission } from "../common/decorators/require-project-permission.decorator";
import { StorageInfoDto } from "../common/dto/storage-info.dto";
import { ProjectPermission, SystemPermission, } from "../common/enums/permissions.enum";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequireProjectPermissionGuard } from "../common/guards/require-project-permission.guard";
import { StorageQuotaInterceptor } from "../common/interceptors/storage-quota.interceptor";
import { findThumbnailSync, } from "../mxcad/infra/thumbnail-utils";
import { CadDownloadFormat, } from "./dto/download-node.dto";
import { BatchOperationResponseDto, FileSystemNodeDto, NodeListResponseDto, NodeTreeResponseDto, OperationSuccessDto, PermissionCheckResponseDto, ProjectDto, ProjectListResponseDto, ProjectMemberDto, ProjectUserPermissionsDto, TrashListResponseDto, } from "./dto/file-system-response.dto";
let FileSystemController = (() => {
    let _classDecorators = [Controller('file-system'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard, PermissionsGuard), UseInterceptors(StorageQuotaInterceptor), ApiTags("文件系统"), ApiBearerAuth()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _createProject_decorators;
    let _getProjects_decorators;
    let _getPersonalSpace_decorators;
    let _getProject_decorators;
    let _getTrash_decorators;
    let _restoreTrashItems_decorators;
    let _permanentlyDeleteTrashItems_decorators;
    let _clearTrash_decorators;
    let _createNode_decorators;
    let _createFolder_decorators;
    let _getRootNode_decorators;
    let _restoreNode_decorators;
    let _getNode_decorators;
    let _getChildren_decorators;
    let _updateNode_decorators;
    let _deleteNode_decorators;
    let _moveNode_decorators;
    let _copyNode_decorators;
    let _getStorageQuota_decorators;
    let _updateStorageQuota_decorators;
    let _getProjectMembers_decorators;
    let _addProjectMember_decorators;
    let _updateProjectMember_decorators;
    let _removeProjectMember_decorators;
    let _getThumbnail_decorators;
    let _downloadNodeOptions_decorators;
    let _downloadNode_decorators;
    let _downloadNodeWithFormat_decorators;
    let _getUserProjectPermissions_decorators;
    let _checkProjectPermission_decorators;
    let _getUserProjectRole_decorators;
    let _search_decorators;
    var FileSystemController = _classThis = class {
        constructor(fileSystemService, fileTreeService, searchService, projectPermissionService, systemPermissionService, fileDownloadHandler) {
            this.fileSystemService = (__runInitializers(this, _instanceExtraInitializers), fileSystemService);
            this.fileTreeService = fileTreeService;
            this.searchService = searchService;
            this.projectPermissionService = projectPermissionService;
            this.systemPermissionService = systemPermissionService;
            this.fileDownloadHandler = fileDownloadHandler;
            this.logger = new Logger(FileSystemController.name);
        }
        async createProject(req, dto) {
            return this.fileSystemService.createProject(req.user.id, dto);
        }
        async getProjects(req, query) {
            return this.fileSystemService.getUserProjects(req.user.id, query);
        }
        async getPersonalSpace(req) {
            return this.fileSystemService.getPersonalSpace(req.user.id);
        }
        async getProject(projectId) {
            return this.fileSystemService.getProject(projectId);
        }
        async getTrash(req) {
            return this.fileSystemService.getTrashItems(req.user.id);
        }
        async restoreTrashItems(body, req) {
            return this.fileSystemService.restoreTrashItems(body.itemIds, req.user.id);
        }
        async permanentlyDeleteTrashItems(body) {
            return this.fileSystemService.permanentlyDeleteTrashItems(body.itemIds);
        }
        async clearTrash(req) {
            return this.fileSystemService.clearTrash(req.user.id);
        }
        async createNode(req, body) {
            return this.fileSystemService.createNode(req.user.id, body.name, {
                parentId: body.parentId,
                description: body.description,
            });
        }
        async createFolder(req, parentId, dto) {
            return this.fileSystemService.createFolder(req.user.id, parentId, dto);
        }
        async getRootNode(nodeId) {
            return this.fileSystemService.getRootNode(nodeId);
        }
        async restoreNode(nodeId, req) {
            return this.fileSystemService.restoreNode(nodeId, req.user.id);
        }
        async getNode(nodeId) {
            return this.fileSystemService.getNodeTree(nodeId);
        }
        async getChildren(nodeId, req, query) {
            return this.fileSystemService.getChildren(nodeId, req.user.id, query);
        }
        async updateNode(nodeId, dto) {
            return this.fileSystemService.updateNode(nodeId, dto);
        }
        async deleteNode(nodeId, body, permanentlyQuery) {
            const permanently = body?.permanently ?? permanentlyQuery ?? false;
            return this.fileSystemService.deleteNode(nodeId, permanently);
        }
        async moveNode(nodeId, dto) {
            return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
        }
        async copyNode(nodeId, dto) {
            return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
        }
        async getStorageQuota(req, nodeId) {
            if (nodeId) {
                return this.fileSystemService.getNodeStorageQuota(req.user.id, nodeId);
            }
            return this.fileSystemService.getUserStorageInfo(req.user.id);
        }
        async updateStorageQuota(req, dto) {
            return this.fileSystemService.updateNodeStorageQuota(dto.nodeId, dto.quota);
        }
        async getProjectMembers(projectId) {
            return this.fileSystemService.getProjectMembers(projectId);
        }
        async addProjectMember(projectId, body, req) {
            const { userId, projectRoleId } = body;
            return this.fileSystemService.addProjectMember(projectId, userId, projectRoleId, req.user.id);
        }
        async updateProjectMember(projectId, userId, dto, req) {
            const projectRoleId = dto.projectRoleId || dto.roleId;
            if (!projectRoleId) {
                throw new BadRequestException("projectRoleId 或 roleId 不能为空");
            }
            return this.fileSystemService.updateProjectMember(projectId, userId, projectRoleId, req.user.id);
        }
        async removeProjectMember(projectId, userId, req) {
            return this.fileSystemService.removeProjectMember(projectId, userId, req.user.id);
        }
        async getThumbnail(nodeId, req, res) {
            const userId = req.user?.id;
            const node = await this.fileSystemService.getNode(nodeId);
            if (!node) {
                throw new NotFoundException("文件节点不存在");
            }
            const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
            const isLibraryNode = libraryKey !== null;
            if (!userId) {
                if (isLibraryNode) {
                }
                else {
                    throw new UnauthorizedException("未登录");
                }
            }
            else {
                if (isLibraryNode) {
                    const requiredPermission = libraryKey === "drawing"
                        ? SystemPermission.LIBRARY_DRAWING_MANAGE
                        : SystemPermission.LIBRARY_BLOCK_MANAGE;
                    const hasPermission = await this.systemPermissionService.checkSystemPermission(userId, requiredPermission);
                    if (!hasPermission) {
                        throw new ForbiddenException("无权限访问该资源库");
                    }
                }
                else {
                    const hasAccess = await this.fileSystemService.checkFileAccess(nodeId, userId);
                    if (!hasAccess) {
                        throw new ForbiddenException("无权限访问该文件");
                    }
                }
            }
            if (node.isFolder || !node.path) {
                throw new NotFoundException("文件节点不存在");
            }
            const nodeFullPath = this.fileSystemService.getFullPath(node.path);
            const nodeDir = path.dirname(nodeFullPath);
            const thumbnail = findThumbnailSync(nodeDir);
            if (!thumbnail) {
                return res.status(204).end();
            }
            const thumbnailPath = thumbnail.path;
            const stats = fs.statSync(thumbnailPath);
            if (stats.isDirectory()) {
                this.logger.warn(`缩略图路径是目录而非文件: ${thumbnailPath}`);
                return res.status(204).end();
            }
            const fileStream = fs.createReadStream(thumbnailPath);
            res.setHeader("Content-Type", thumbnail.mimeType);
            res.setHeader("Cache-Control", "public, max-age=3600");
            fileStream.pipe(res);
            fileStream.on("error", (error) => {
                this.logger.error(`读取缩略图失败: ${error.message}`, error.stack);
                if (!res.headersSent) {
                    res.status(500).json({ message: "读取缩略图失败" });
                }
            });
        }
        async downloadNodeOptions(req, res) {
            const origin = req.headers.origin || "*";
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
            res.setHeader("Access-Control-Max-Age", "86400");
            res.status(204).end();
        }
        async downloadNode(nodeId, req, res) {
            const userId = req.user.id;
            const clientIp = req.ip || req.connection.remoteAddress;
            await this.fileDownloadHandler.handleDownload(nodeId, userId, res, {
                clientIp,
            });
        }
        async downloadNodeWithFormat(nodeId, req, res, query) {
            const userId = req.user?.id ||
                req.session?.userId;
            const clientIp = req.ip || req.connection?.remoteAddress;
            if (!userId) {
                throw new UnauthorizedException("未登录");
            }
            try {
                const format = query.format || CadDownloadFormat.MXWEB;
                const pdfParams = format === CadDownloadFormat.PDF
                    ? {
                        width: query.width || "2000",
                        height: query.height || "2000",
                        colorPolicy: query.colorPolicy || "mono",
                    }
                    : undefined;
                const { stream, filename, mimeType } = await this.fileSystemService.downloadNodeWithFormat(nodeId, userId, format, pdfParams);
                const origin = req.headers.origin || "*";
                res.setHeader("Access-Control-Allow-Origin", origin);
                res.setHeader("Access-Control-Allow-Credentials", "true");
                res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
                this.logger.log(`[下载] CORS 头已设置: ${origin}`);
                res.setHeader("Content-Type", mimeType);
                const encodedFilename = encodeURIComponent(filename);
                const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, "_");
                res.setHeader("Content-Disposition", `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`);
                const node = await this.fileSystemService.getNode(nodeId);
                if (node && !node.isFolder && (node.fileHash || node.id)) {
                    const etag = `"${node.fileHash || node.id}_${format}"`;
                    res.setHeader("ETag", etag);
                    if (req.headers["if-none-match"] === etag) {
                        if (stream &&
                            typeof stream
                                .destroy === "function") {
                            stream.destroy();
                        }
                        return res.status(304).end();
                    }
                    res.setHeader("Cache-Control", "public, max-age=3600");
                }
                else {
                    res.setHeader("Cache-Control", "no-cache");
                }
                this.logger.log(`多格式下载开始: ${filename} (格式: ${format}) (${nodeId}) by user ${userId} from IP ${clientIp}`);
                stream.pipe(res);
                stream.on("error", (error) => {
                    this.logger.error(`文件流传输错误: ${error.message}`, error.stack);
                    if (stream &&
                        typeof stream
                            .destroy === "function") {
                        stream.destroy();
                    }
                    if (!res.headersSent) {
                        res.status(500).json({ message: "文件下载失败" });
                    }
                    else if (!res.writableEnded) {
                        res.end();
                    }
                });
                stream.on("finish", () => {
                    this.logger.log(`多格式下载完成: ${filename} (格式: ${format}) (${nodeId}) by user ${userId}`);
                });
            }
            catch (error) {
                this.logger.error(`多格式下载失败: ${nodeId} by user ${userId} - ${error.message}`, error.stack);
                if (!res.headersSent) {
                    const status = error instanceof NotFoundException
                        ? 404
                        : error instanceof ForbiddenException
                            ? 403
                            : error instanceof BadRequestException
                                ? 400
                                : 500;
                    res.status(status).json({
                        message: error.message || "文件下载失败",
                    });
                }
            }
        }
        async getUserProjectPermissions(req, projectId) {
            const permissions = await this.projectPermissionService.getUserPermissions(req.user.id, projectId);
            return {
                projectId,
                userId: req.user.id,
                permissions,
            };
        }
        async checkProjectPermission(req, projectId, permission) {
            if (!permission) {
                throw new BadRequestException("缺少 permission 参数");
            }
            const hasPermission = await this.projectPermissionService.checkPermission(req.user.id, projectId, permission);
            return {
                projectId,
                userId: req.user.id,
                permission,
                hasPermission,
            };
        }
        async getUserProjectRole(req, projectId) {
            const role = await this.projectPermissionService.getUserRole(req.user.id, projectId);
            return {
                projectId,
                userId: req.user.id,
                role,
            };
        }
        async search(req, dto) {
            this.logger.log(`[统一搜索] 用户ID: ${req.user.id}, 关键词: ${dto.keyword}, 范围: ${dto.scope}, 项目ID: ${dto.projectId}`);
            return this.searchService.search(req.user.id, dto);
        }
    };
    __setFunctionName(_classThis, "FileSystemController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _createProject_decorators = [Post("projects"), RequirePermissions([SystemPermission.PROJECT_CREATE]), CsrfProtected(), ApiOperation({ summary: "创建项目" }), ApiResponse({
                status: 201,
                description: "项目创建成功",
                type: ProjectDto,
            }), ApiResponse({ status: 400, description: "请求参数错误" }), ApiResponse({ status: 403, description: "无权限创建项目" })];
        _getProjects_decorators = [Get("projects"), ApiOperation({ summary: "获取项目列表" }), ApiResponse({
                status: 200,
                description: "获取项目列表成功",
                type: ProjectListResponseDto,
            })];
        _getPersonalSpace_decorators = [Get('personal-space'), ApiOperation({ summary: '获取当前用户的私人空间' }), ApiResponse({
                status: 200,
                description: '获取私人空间成功',
                type: FileSystemNodeDto,
            })];
        _getProject_decorators = [Get('projects/:projectId'), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiOperation({ summary: '获取项目详情' }), ApiResponse({
                status: 200,
                description: '获取项目详情成功',
                type: ProjectDto,
            }), ApiResponse({ status: 404, description: '项目不存在' })];
        _getTrash_decorators = [Get('trash'), ApiOperation({ summary: '获取回收站列表' }), ApiResponse({
                status: 200,
                description: '获取回收站列表成功',
                type: TrashListResponseDto,
            })];
        _restoreTrashItems_decorators = [Post("trash/restore"), RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE), CsrfProtected(), HttpCode(HttpStatus.OK), ApiOperation({ summary: "恢复回收站项目" }), ApiResponse({
                status: 200,
                description: "恢复项目成功",
                type: BatchOperationResponseDto,
            })];
        _permanentlyDeleteTrashItems_decorators = [Delete('trash/items'), RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE), CsrfProtected(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '永久删除回收站项目' }), ApiResponse({
                status: 200,
                description: '永久删除项目成功',
                type: BatchOperationResponseDto,
            })];
        _clearTrash_decorators = [Delete('trash'), RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE), CsrfProtected(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '清空回收站' }), ApiResponse({
                status: 200,
                description: '清空回收站成功',
                type: OperationSuccessDto,
            })];
        _createNode_decorators = [Post("nodes"), RequireProjectPermission(ProjectPermission.FILE_CREATE), CsrfProtected(), ApiOperation({ summary: "创建节点（文件或文件夹）" }), ApiResponse({
                status: 201,
                description: "节点创建成功",
                type: FileSystemNodeDto,
            }), ApiResponse({ status: 400, description: "请求参数错误" })];
        _createFolder_decorators = [Post("nodes/:parentId/folders"), RequireProjectPermission(ProjectPermission.FILE_CREATE), CsrfProtected(), ApiOperation({ summary: "创建文件夹" }), ApiResponse({
                status: 201,
                description: "文件夹创建成功",
                type: FileSystemNodeDto,
            }), ApiResponse({ status: 400, description: "请求参数错误" })];
        _getRootNode_decorators = [Get('nodes/:nodeId/root'), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiOperation({ summary: '获取节点的根节点' }), ApiResponse({ status: 200, description: '获取根节点成功', type: FileSystemNodeDto }), ApiResponse({ status: 404, description: '节点不存在' })];
        _restoreNode_decorators = [Post("nodes/:nodeId/restore"), RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE), CsrfProtected(), HttpCode(HttpStatus.OK), ApiOperation({ summary: "恢复单个节点" }), ApiResponse({
                status: 200,
                description: "节点恢复成功",
                type: FileSystemNodeDto,
            }), ApiResponse({ status: 404, description: "节点不存在" })];
        _getNode_decorators = [Get('nodes/:nodeId'), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiOperation({ summary: '获取节点详情' }), ApiResponse({
                status: 200,
                description: '获取节点详情成功',
                type: NodeTreeResponseDto,
            }), ApiResponse({ status: 404, description: '节点不存在' })];
        _getChildren_decorators = [Get("nodes/:nodeId/children"), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiOperation({ summary: "获取子节点列表" }), ApiResponse({
                status: 200,
                description: "获取子节点列表成功",
                type: NodeListResponseDto,
            }), ApiResponse({ status: 404, description: "节点不存在" })];
        _updateNode_decorators = [Patch("nodes/:nodeId"), RequireProjectPermission(ProjectPermission.FILE_EDIT), CsrfProtected(), ApiOperation({ summary: "更新节点" }), ApiResponse({
                status: 200,
                description: "更新节点成功",
                type: FileSystemNodeDto,
            }), ApiResponse({ status: 404, description: "节点不存在" })];
        _deleteNode_decorators = [Delete("nodes/:nodeId"), RequireProjectPermission(ProjectPermission.FILE_DELETE), CsrfProtected(), HttpCode(HttpStatus.OK), ApiOperation({ summary: "删除节点" }), ApiResponse({
                status: 200,
                description: "删除节点成功",
                type: OperationSuccessDto,
            }), ApiResponse({ status: 404, description: "节点不存在" })];
        _moveNode_decorators = [Post("nodes/:nodeId/move"), RequireProjectPermission(ProjectPermission.FILE_MOVE), CsrfProtected(), ApiOperation({ summary: "移动节点" }), ApiResponse({
                status: 200,
                description: "移动节点成功",
                type: FileSystemNodeDto,
            }), ApiResponse({ status: 404, description: "节点不存在" })];
        _copyNode_decorators = [Post("nodes/:nodeId/copy"), RequireProjectPermission(ProjectPermission.FILE_COPY), CsrfProtected(), ApiOperation({ summary: "复制节点" }), ApiResponse({
                status: 201,
                description: "复制节点成功",
                type: FileSystemNodeDto,
            }), ApiResponse({ status: 404, description: "节点不存在" })];
        _getStorageQuota_decorators = [Get("quota"), ApiOperation({ summary: "获取存储配额信息" }), ApiResponse({
                status: 200,
                description: "获取配额信息成功",
                type: StorageInfoDto,
            })];
        _updateStorageQuota_decorators = [Post("quota/update"), RequirePermissions([SystemPermission.STORAGE_QUOTA]), CsrfProtected(), ApiOperation({ summary: "更新节点存储配额" }), ApiResponse({
                status: 200,
                description: "更新配额成功",
                type: FileSystemNodeDto,
            }), ApiResponse({ status: 400, description: "请求参数错误" }), ApiResponse({ status: 401, description: "未登录" }), ApiResponse({ status: 403, description: "无权限更新配额" }), ApiResponse({ status: 404, description: "节点不存在" })];
        _getProjectMembers_decorators = [Get('projects/:projectId/members'), RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE), ApiOperation({ summary: '获取项目成员列表' }), ApiResponse({
                status: 200,
                description: '获取成员列表成功',
                type: [ProjectMemberDto],
            }), ApiResponse({ status: 401, description: '未登录' }), ApiResponse({ status: 403, description: '无权限访问该项目' }), ApiResponse({ status: 404, description: '项目不存在' })];
        _addProjectMember_decorators = [Post("projects/:projectId/members"), RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE), CsrfProtected(), ApiOperation({ summary: "添加项目成员" }), ApiResponse({
                status: 201,
                description: "添加成员成功",
                type: ProjectMemberDto,
            }), ApiResponse({ status: 400, description: "请求参数错误" }), ApiResponse({ status: 401, description: "未登录" }), ApiResponse({ status: 403, description: "无权限添加成员" }), ApiResponse({ status: 404, description: "项目或用户不存在" })];
        _updateProjectMember_decorators = [Patch("projects/:projectId/members/:userId"), RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_ASSIGN), CsrfProtected(), ApiOperation({ summary: "更新项目成员角色" }), ApiResponse({
                status: 200,
                description: "更新成员角色成功",
                type: ProjectMemberDto,
            }), ApiResponse({ status: 400, description: "请求参数错误" }), ApiResponse({ status: 401, description: "未登录" }), ApiResponse({ status: 403, description: "无权限修改成员角色" }), ApiResponse({ status: 404, description: "项目或成员不存在" })];
        _removeProjectMember_decorators = [Delete("projects/:projectId/members/:userId"), RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE), CsrfProtected(), ApiOperation({ summary: "移除项目成员" }), ApiResponse({
                status: 200,
                description: "移除成员成功",
                type: OperationSuccessDto,
            }), ApiResponse({ status: 401, description: "未登录" }), ApiResponse({ status: 403, description: "无权限移除成员" }), ApiResponse({ status: 404, description: "项目或成员不存在" }), HttpCode(HttpStatus.OK)];
        _getThumbnail_decorators = [Get("nodes/:nodeId/thumbnail"), Public(), UseGuards(JwtAuthGuard), ApiOperation({ summary: "获取文件节点缩略图" }), ApiProduces("image/jpeg"), ApiResponse({ status: 200, description: "获取缩略图成功" }), ApiResponse({ status: 204, description: "缩略图不存在" }), ApiResponse({ status: 401, description: "未登录（项目文件需要登录）" }), ApiResponse({ status: 403, description: "无权限访问该文件" }), ApiResponse({ status: 404, description: "文件节点不存在" })];
        _downloadNodeOptions_decorators = [Options("nodes/:nodeId/download"), ApiOperation({ summary: "下载接口 OPTIONS 预检" })];
        _downloadNode_decorators = [Get("nodes/:nodeId/download"), ApiOperation({ summary: "下载节点（文件或目录）" }), ApiProduces("application/octet-stream"), ApiResponse({ status: 200, description: "下载成功" }), ApiResponse({ status: 401, description: "未登录" }), ApiResponse({ status: 403, description: "无权限访问该节点" }), ApiResponse({ status: 404, description: "节点不存在" }), RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)];
        _downloadNodeWithFormat_decorators = [Get("nodes/:nodeId/download-with-format"), ApiOperation({
                summary: "下载节点（支持多格式转换）",
                description: "支持下载 CAD 文件的多种格式：DWG、MXWEB、PDF。对于 PDF 格式，可以自定义宽度、高度和颜色策略。",
            }), ApiQuery({
                name: "format",
                enum: Object.values(CadDownloadFormat),
                enumName: "CadDownloadFormat",
                required: false,
                description: "下载格式：dwg（DWG格式）、mxweb（MXWEB格式，默认）、pdf（PDF格式）",
            }), ApiQuery({
                name: "width",
                required: false,
                description: "PDF 输出宽度（像素），仅当 format=pdf 时有效，默认：2000",
            }), ApiQuery({
                name: "height",
                required: false,
                description: "PDF 输出高度（像素），仅当 format=pdf 时有效，默认：2000",
            }), ApiQuery({
                name: "colorPolicy",
                required: false,
                description: "PDF 颜色策略（mono/color），仅当 format=pdf 时有效，默认：mono",
            }), ApiProduces("application/octet-stream"), ApiResponse({ status: 200, description: "下载成功" }), ApiResponse({ status: 400, description: "参数错误或转换失败" }), ApiResponse({ status: 401, description: "未登录" }), ApiResponse({ status: 403, description: "无权访问该节点" }), ApiResponse({ status: 404, description: "节点不存在或文件不存在" })];
        _getUserProjectPermissions_decorators = [Get("projects/:projectId/permissions"), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiOperation({ summary: "获取用户在项目中的权限列表" }), ApiResponse({
                status: 200,
                description: "成功获取用户权限列表",
                type: ProjectUserPermissionsDto,
            })];
        _checkProjectPermission_decorators = [Get("projects/:projectId/permissions/check"), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiOperation({ summary: "检查用户是否具有特定权限" }), ApiQuery({
                name: "permission",
                enum: Object.values(ProjectPermission),
                enumName: "ProjectPermissionEnum",
                description: "要检查的权限",
            }), ApiResponse({
                status: 200,
                description: "权限检查结果",
                type: PermissionCheckResponseDto,
            })];
        _getUserProjectRole_decorators = [Get("projects/:projectId/role"), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiOperation({ summary: "获取用户在项目中的角色" }), ApiResponse({ status: 200, description: "成功获取用户角色" })];
        _search_decorators = [Get("search"), ApiOperation({
                summary: "统一搜索接口",
                description: `支持多种搜索范围：
- project: 搜索项目列表
- project_files: 搜索指定项目内的文件（需提供 projectId）
- all_projects: 搜索所有有权限访问的项目中的文件`,
            }), ApiResponse({
                status: 200,
                description: "搜索成功",
                type: NodeListResponseDto,
            }), ApiResponse({ status: 400, description: "请求参数错误" })];
        __esDecorate(_classThis, null, _createProject_decorators, { kind: "method", name: "createProject", static: false, private: false, access: { has: obj => "createProject" in obj, get: obj => obj.createProject }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProjects_decorators, { kind: "method", name: "getProjects", static: false, private: false, access: { has: obj => "getProjects" in obj, get: obj => obj.getProjects }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getPersonalSpace_decorators, { kind: "method", name: "getPersonalSpace", static: false, private: false, access: { has: obj => "getPersonalSpace" in obj, get: obj => obj.getPersonalSpace }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProject_decorators, { kind: "method", name: "getProject", static: false, private: false, access: { has: obj => "getProject" in obj, get: obj => obj.getProject }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getTrash_decorators, { kind: "method", name: "getTrash", static: false, private: false, access: { has: obj => "getTrash" in obj, get: obj => obj.getTrash }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _restoreTrashItems_decorators, { kind: "method", name: "restoreTrashItems", static: false, private: false, access: { has: obj => "restoreTrashItems" in obj, get: obj => obj.restoreTrashItems }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _permanentlyDeleteTrashItems_decorators, { kind: "method", name: "permanentlyDeleteTrashItems", static: false, private: false, access: { has: obj => "permanentlyDeleteTrashItems" in obj, get: obj => obj.permanentlyDeleteTrashItems }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _clearTrash_decorators, { kind: "method", name: "clearTrash", static: false, private: false, access: { has: obj => "clearTrash" in obj, get: obj => obj.clearTrash }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _createNode_decorators, { kind: "method", name: "createNode", static: false, private: false, access: { has: obj => "createNode" in obj, get: obj => obj.createNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _createFolder_decorators, { kind: "method", name: "createFolder", static: false, private: false, access: { has: obj => "createFolder" in obj, get: obj => obj.createFolder }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getRootNode_decorators, { kind: "method", name: "getRootNode", static: false, private: false, access: { has: obj => "getRootNode" in obj, get: obj => obj.getRootNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _restoreNode_decorators, { kind: "method", name: "restoreNode", static: false, private: false, access: { has: obj => "restoreNode" in obj, get: obj => obj.restoreNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getNode_decorators, { kind: "method", name: "getNode", static: false, private: false, access: { has: obj => "getNode" in obj, get: obj => obj.getNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getChildren_decorators, { kind: "method", name: "getChildren", static: false, private: false, access: { has: obj => "getChildren" in obj, get: obj => obj.getChildren }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateNode_decorators, { kind: "method", name: "updateNode", static: false, private: false, access: { has: obj => "updateNode" in obj, get: obj => obj.updateNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _deleteNode_decorators, { kind: "method", name: "deleteNode", static: false, private: false, access: { has: obj => "deleteNode" in obj, get: obj => obj.deleteNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _moveNode_decorators, { kind: "method", name: "moveNode", static: false, private: false, access: { has: obj => "moveNode" in obj, get: obj => obj.moveNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _copyNode_decorators, { kind: "method", name: "copyNode", static: false, private: false, access: { has: obj => "copyNode" in obj, get: obj => obj.copyNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getStorageQuota_decorators, { kind: "method", name: "getStorageQuota", static: false, private: false, access: { has: obj => "getStorageQuota" in obj, get: obj => obj.getStorageQuota }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateStorageQuota_decorators, { kind: "method", name: "updateStorageQuota", static: false, private: false, access: { has: obj => "updateStorageQuota" in obj, get: obj => obj.updateStorageQuota }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProjectMembers_decorators, { kind: "method", name: "getProjectMembers", static: false, private: false, access: { has: obj => "getProjectMembers" in obj, get: obj => obj.getProjectMembers }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _addProjectMember_decorators, { kind: "method", name: "addProjectMember", static: false, private: false, access: { has: obj => "addProjectMember" in obj, get: obj => obj.addProjectMember }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateProjectMember_decorators, { kind: "method", name: "updateProjectMember", static: false, private: false, access: { has: obj => "updateProjectMember" in obj, get: obj => obj.updateProjectMember }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _removeProjectMember_decorators, { kind: "method", name: "removeProjectMember", static: false, private: false, access: { has: obj => "removeProjectMember" in obj, get: obj => obj.removeProjectMember }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getThumbnail_decorators, { kind: "method", name: "getThumbnail", static: false, private: false, access: { has: obj => "getThumbnail" in obj, get: obj => obj.getThumbnail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _downloadNodeOptions_decorators, { kind: "method", name: "downloadNodeOptions", static: false, private: false, access: { has: obj => "downloadNodeOptions" in obj, get: obj => obj.downloadNodeOptions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _downloadNode_decorators, { kind: "method", name: "downloadNode", static: false, private: false, access: { has: obj => "downloadNode" in obj, get: obj => obj.downloadNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _downloadNodeWithFormat_decorators, { kind: "method", name: "downloadNodeWithFormat", static: false, private: false, access: { has: obj => "downloadNodeWithFormat" in obj, get: obj => obj.downloadNodeWithFormat }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getUserProjectPermissions_decorators, { kind: "method", name: "getUserProjectPermissions", static: false, private: false, access: { has: obj => "getUserProjectPermissions" in obj, get: obj => obj.getUserProjectPermissions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkProjectPermission_decorators, { kind: "method", name: "checkProjectPermission", static: false, private: false, access: { has: obj => "checkProjectPermission" in obj, get: obj => obj.checkProjectPermission }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getUserProjectRole_decorators, { kind: "method", name: "getUserProjectRole", static: false, private: false, access: { has: obj => "getUserProjectRole" in obj, get: obj => obj.getUserProjectRole }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileSystemController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileSystemController = _classThis;
})();
export { FileSystemController };
//# sourceMappingURL=file-system.controller.js.map