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
import { Controller, Post, Get, Head, UseInterceptors, HttpStatus, HttpCode, Logger, NotFoundException, UnauthorizedException, BadRequestException, InternalServerErrorException, UseGuards, } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiResponse, ApiBody, ApiOperation, ApiBearerAuth, } from '@nestjs/swagger';
import { PreloadingDataDto } from '../dto/preloading-data.dto';
import { UploadExtReferenceFileDto } from '../dto/upload-ext-reference-file.dto';
import { UploadFilesDto } from '../dto/upload-files.dto';
import { FileExistResponseDto } from '../dto/file-exist-response.dto';
import { ChunkExistResponseDto } from '../dto/chunk-exist-response.dto';
import { CheckDuplicateFileResponseDto } from '../dto/check-duplicate-file-response.dto';
import { CheckReferenceResponseDto } from '../dto/check-reference-response.dto';
import { RefreshExternalReferencesResponseDto } from '../dto/refresh-external-references-response.dto';
import { UploadFileResponseDto } from '../dto/upload-file-response.dto';
import { SaveMxwebResponseDto } from '../dto/save-mxweb-response.dto';
import { SaveMxwebDto } from '../dto/save-mxweb.dto';
import { SaveMxwebAsDto } from '../dto/save-mxweb-as.dto';
import { SaveMxwebAsResponseDto } from '../dto/save-mxweb-as-response.dto';
import { CheckThumbnailResponseDto } from '../dto/check-thumbnail-response.dto';
import { UploadThumbnailResponseDto } from '../dto/upload-thumbnail-response.dto';
import { UploadThumbnailDto } from '../dto/upload-thumbnail.dto';
import { getThumbnailFileName, THUMBNAIL_FORMATS, } from '../infra/thumbnail-utils';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { StorageQuotaInterceptor } from '../../common/interceptors/storage-quota.interceptor';
let MxCadController = (() => {
    let _classDecorators = [ApiTags('MxCAD 文件上传与转换'), Controller('mxcad'), UseInterceptors(StorageQuotaInterceptor)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _checkChunkExist_decorators;
    let _checkFileExist_decorators;
    let _checkDuplicateFile_decorators;
    let _getPreloadingData_decorators;
    let _checkExternalReference_decorators;
    let _refreshExternalReferences_decorators;
    let _uploadFile_decorators;
    let _saveMxwebToNode_decorators;
    let _saveMxwebAs_decorators;
    let _uploadExtReferenceDwg_decorators;
    let _uploadExtReferenceImage_decorators;
    let _getFilesDataFile_decorators;
    let _getFilesDataFileHead_decorators;
    let _getFile_decorators;
    let _getFileHead_decorators;
    let _checkThumbnail_decorators;
    let _uploadThumbnail_decorators;
    let _getNonCadFile_decorators;
    var MxCadController = _classThis = class {
        constructor(mxCadService, jwtService, configService, storageService, permissionService, versionControlService, fileConversionService, saveAsService, mxcadFileHandler, fileTreeService) {
            this.mxCadService = (__runInitializers(this, _instanceExtraInitializers), mxCadService);
            this.jwtService = jwtService;
            this.configService = configService;
            this.storageService = storageService;
            this.permissionService = permissionService;
            this.versionControlService = versionControlService;
            this.fileConversionService = fileConversionService;
            this.saveAsService = saveAsService;
            this.mxcadFileHandler = mxcadFileHandler;
            this.fileTreeService = fileTreeService;
            this.logger = new Logger(MxCadController.name);
            // 预加载数据缓存
            this.preloadingDataCache = new Map();
            // 历史版本转换锁（防止同一版本的并发请求重复转换）
            this.historyConversionLocks = new Map();
            this.mxCadFileExt =
                this.configService.get('mxcad.fileExt', { infer: true }) || '.mxweb';
            const cacheTTLConfig = this.configService.get('cacheTTL', { infer: true });
            this.cacheTTL = cacheTTLConfig.mxcad * 1000; // 转为毫秒
        }
        /**
         * 检查分片是否存在
         */
        async checkChunkExist(body, request) {
            this.logger.log(`[chunkisExist] 收到的参数: ${JSON.stringify(body)}`);
            // 构建上下文
            const context = await this.buildContextFromRequest(request);
            const result = await this.mxCadService.checkChunkExist(body.chunk, body.fileHash, body.size, body.chunks, body.filename, context);
            // 转换为标准格式：ret === 'chunkAlreadyExist' 表示分片已存在
            return { exists: result.ret === 'chunkAlreadyExist' };
        }
        /**
         * 检查文件是否存在
         */
        async checkFileExist(body, request) {
            const context = await this.buildContextFromRequest(request);
            // 添加文件大小到 context
            context.fileSize = body.fileSize;
            this.logger.log(`[checkFileExist] 接收参数: filename=${body.filename}, fileHash=${body.fileHash}, fileSize=${body.fileSize}, nodeId=${context.nodeId}`);
            const result = (await this.mxCadService.checkFileExist(body.filename, body.fileHash, context));
            // 转换为标准格式：ret === 'fileAlreadyExist' 表示文件已存在（秒传）
            return {
                exists: result.ret === 'fileAlreadyExist',
                nodeId: result.nodeId,
            };
        }
        /**
         * 检查目录中是否存在重复文件（相同文件名和hash）
         */
        async checkDuplicateFile(body, request) {
            this.logger.log(`[checkDuplicateFile] 接收参数: filename=${body.filename}, fileHash=${body.fileHash}, nodeId=${body.nodeId}, currentFileId=${body.currentFileId}`);
            return this.mxCadService.checkDuplicateFile(body.filename, body.fileHash, body.nodeId, body.currentFileId);
        }
        /**
         * 获取外部参照预加载数据
         *
         * @param nodeId 节点 ID
         * @returns 预加载数据
         * @throws NotFoundException 预加载数据不存在时抛出异常
         */
        async getPreloadingData(nodeId) {
            this.logger.debug(`[getPreloadingData] 请求参数: nodeId=${nodeId}`);
            // 检查缓存
            const cached = this.preloadingDataCache.get(nodeId);
            const now = Date.now();
            if (cached && now - cached.timestamp < this.cacheTTL) {
                this.logger.debug(`[getPreloadingData] 返回缓存数据: ${nodeId}`);
                return cached.data;
            }
            // 从服务获取数据
            const data = await this.mxCadService.getPreloadingData(nodeId);
            if (!data) {
                this.logger.warn(`[getPreloadingData] 预加载数据不存在: ${nodeId}`);
                throw new NotFoundException('预加载数据不存在');
            }
            // 更新缓存
            this.preloadingDataCache.set(nodeId, { data, timestamp: now });
            // 清理过期缓存
            this.cleanExpiredCache();
            this.logger.debug(`[getPreloadingData] 成功返回预加载数据: ${nodeId}`);
            return data;
        }
        /**
         * 清理过期的缓存项
         */
        cleanExpiredCache() {
            const now = Date.now();
            for (const [key, value] of this.preloadingDataCache.entries()) {
                if (now - value.timestamp >= this.cacheTTL) {
                    this.preloadingDataCache.delete(key);
                }
            }
        }
        /**
         * 检查外部参照文件是否存在
         *
         * @param nodeId 源图纸节点 ID
         * @param body 请求体，包含 fileName 字段
         * @returns 文件是否存在
         */
        async checkExternalReference(nodeId, body) {
            this.logger.log(`[checkExternalReference] 请求参数: nodeId=${nodeId}, fileName=${body.fileName}`);
            // 验证参数
            if (!body.fileName) {
                throw new BadRequestException('缺少必要参数: fileName');
            }
            const exists = await this.mxCadService.checkExternalReferenceExists(nodeId, body.fileName);
            this.logger.log(`[checkExternalReference] 检查结果: ${exists}`);
            return { exists };
        }
        /**
         * 手动刷新文件的外部参照信息
         * @param nodeId 文件系统节点 ID
         * @returns 刷新结果
         */
        async refreshExternalReferences(nodeId) {
            this.logger.log(`[refreshExternalReferences] 请求参数: nodeId=${nodeId}`);
            const stats = await this.mxCadService.getExternalReferenceStats(nodeId);
            await this.mxCadService.updateExternalReferenceInfo(nodeId, stats);
            this.logger.log(`[refreshExternalReferences] 刷新成功: nodeId=${nodeId}`);
            return {
                code: 0,
                message: '刷新成功',
                stats,
            };
        }
        /**
         * 上传文件（支持分片）
         *
         * 注意：RequireProjectPermissionGuard 现在通过 nodeId → 数据库查询解析项目 ID。
         * 对于 multipart 请求，客户端需确保 nodeId 可通过 query 参数传递，
         * 因为 Multer 在 Guard 之后才解析 request.body。
         */
        async uploadFile(files, body, request) {
            const file = files && files.length > 0 ? files[0] : null;
            this.logger.log(`[uploadFile] files count: ${files?.length || 0}, file exists: ${!!file}, file size: ${file?.size}, body: ${JSON.stringify(body)}`);
            // 检查是否为合并请求（没有文件，只有 chunks 信息）
            const isMergeRequest = !file && body.chunks !== undefined;
            // 合并请求不需要检查 file，但需要检查必要参数
            if (!isMergeRequest && !file) {
                throw new BadRequestException('缺少上传文件');
            }
            if (!body.hash || !body.name || !body.size) {
                throw new BadRequestException('缺少必要参数: hash, name 或 size');
            }
            if (body.chunk !== undefined && body.chunks === undefined) {
                throw new BadRequestException('缺少必要参数: chunks');
            }
            // 构建上下文 - 从JWT token验证用户身份
            const context = await this.buildContextFromRequest(request);
            // 优先处理合并请求（没有文件，有 chunks 信息）
            if (isMergeRequest) {
                try {
                    // 验证 chunks 参数
                    if (body.chunks === undefined) {
                        throw new BadRequestException('缺少必要参数: chunks');
                    }
                    const result = await this.mxCadService.mergeChunksWithPermission(body.hash, body.name, body.size, body.chunks, context, body.srcDwgNodeId // 外部参照上传时的源图纸节点 ID
                    );
                    // 返回完整结果，包含 ret 字段用于判断是否是跳过策略
                    return { nodeId: result.nodeId, tz: result.tz, ret: result.ret };
                }
                catch (error) {
                    this.mxCadService.logError(`文件合并失败: ${error.message}`, error);
                    throw new InternalServerErrorException(`文件合并失败: ${error.message}`);
                }
            }
            if (body.chunk !== undefined) {
                // 分片上传 - Multer 已在模块配置中正确处理存储位置和文件名
                this.logger.log(`[uploadFiles] 收到分片上传请求: chunk=${body.chunk}, chunks=${body.chunks}, hash=${body.hash}, filePath=${file?.path}`);
                try {
                    // 验证 chunks 参数
                    if (body.chunks === undefined) {
                        throw new BadRequestException('缺少必要参数: chunks');
                    }
                    // 验证文件已由 Multer 正确保存
                    if (!file) {
                        throw new BadRequestException('缺少上传文件');
                    }
                    const result = await this.mxCadService.uploadChunkWithPermission(body.hash, body.name, body.size, body.chunk, body.chunks, context);
                    // 返回完整结果，包含 ret 字段用于判断是否是跳过策略
                    return { nodeId: result.nodeId, tz: result.tz, ret: result.ret };
                }
                catch (error) {
                    this.mxCadService.logError(`分片文件处理失败: ${error.message}`, error);
                    throw new InternalServerErrorException(`分片文件处理失败: ${error.message}`);
                }
            }
            else {
                // 完整文件上传（带权限验证）
                if (!file) {
                    throw new BadRequestException('缺少上传文件');
                }
                const result = await this.mxCadService.uploadAndConvertFileWithPermission(file.path, body.hash, body.name, body.size, context);
                // 返回完整结果，包含 ret 字段用于判断是否是跳过策略
                return { nodeId: result.nodeId, tz: result.tz, ret: result.ret };
            }
        }
        /**
         * 保存 mxweb 文件到指定节点
         * 路由: POST /api/mxcad/savemxweb/:nodeId
         */
        async saveMxwebToNode(nodeId, file, commitMessage, expectedTimestamp, request) {
            this.logger.log(`[saveMxwebToNode] 开始保存: nodeId=${nodeId}, commitMessage=${commitMessage || '(无)'}`);
            // 获取用户信息
            const userId = request.user?.id;
            const userName = request.user?.username || request.user?.nickname || request.user?.email;
            // 调用服务保存文件
            const result = await this.mxCadService.saveMxwebFile(nodeId, file, userId, userName, commitMessage, false, expectedTimestamp);
            if (!result.success) {
                this.logger.error(`[saveMxwebToNode] 保存失败: ${result.message}`);
                throw new BadRequestException(result.message);
            }
            this.logger.log(`[saveMxwebToNode] 保存成功: nodeId=${nodeId}`);
            return {
                nodeId,
                path: result.path,
            };
        }
        /**
         * 保存mxweb文件为新文件（Save As）
         * 路由: POST /api/mxcad/save-as
         */
        async saveMxwebAs(file, dto, request) {
            this.logger.log(`[saveMxwebAs] 开始保存: targetType=${dto.targetType}, parentId=${dto.targetParentId}, format=${dto.format}`);
            const userId = request.user?.id;
            const userName = request.user?.username || request.user?.nickname || request.user?.email;
            if (!userId) {
                throw new UnauthorizedException('用户未登录');
            }
            if (dto.targetType === 'project' && !dto.projectId) {
                throw new BadRequestException('保存到项目时必须提供projectId');
            }
            // ==================== 权限验证 ====================
            // 1. 验证目标父节点存在
            const targetParentNode = await this.mxCadService.findNodeByIdWithDeletedAt(dto.targetParentId, { id: true, isFolder: true, personalSpaceKey: true });
            if (!targetParentNode) {
                throw new BadRequestException('目标文件夹不存在');
            }
            if (!targetParentNode.isFolder) {
                throw new BadRequestException('目标必须是文件夹');
            }
            // 2. 根据保存类型进行权限验证
            if (dto.targetType === 'personal') {
                // 私人空间：验证目标节点是否属于当前用户
                // 查找目标节点的根节点（私人空间）
                const rootId = await this.fileTreeService.getProjectId(dto.targetParentId);
                const rootNode = rootId
                    ? await this.mxCadService.findNodeById(rootId, { personalSpaceKey: true, ownerId: true })
                    : null;
                // 验证是否为当前用户的私人空间
                const isUserPersonalSpace = rootNode?.personalSpaceKey === userId || rootNode?.ownerId === userId;
                if (!isUserPersonalSpace) {
                    this.logger.warn(`[saveMxwebAs] 用户 ${userId} 尝试保存到非自己的私人空间: ${dto.targetParentId}`);
                    throw new BadRequestException('您没有权限保存到此位置');
                }
            }
            else {
                // 项目：验证用户是否有项目的 CAD_SAVE 权限
                if (dto.projectId) {
                    const hasPermission = await this.permissionService.checkNodePermission(userId, dto.projectId, ProjectPermission.CAD_SAVE);
                    if (!hasPermission) {
                        this.logger.warn(`[saveMxwebAs] 用户 ${userId} 没有项目 ${dto.projectId} 的 CAD_SAVE 权限`);
                        throw new BadRequestException('您没有权限保存到此项目');
                    }
                }
                else {
                    throw new BadRequestException('保存到项目时必须提供projectId');
                }
            }
            // ==================== 权限验证结束 ====================
            const result = await this.saveAsService.saveMxwebAs({
                file,
                targetType: dto.targetType,
                targetParentId: dto.targetParentId,
                projectId: dto.projectId,
                format: dto.format || 'dwg',
                userId,
                userName,
                commitMessage: dto.commitMessage,
                fileName: dto.fileName,
            });
            if (!result.success) {
                this.logger.error(`[saveMxwebAs] 保存失败: ${result.message}`);
                throw new BadRequestException(result.message);
            }
            this.logger.log(`[saveMxwebAs] 保存成功: nodeId=${result.nodeId}`);
            return result;
        }
        /**
         * 上传外部参照 DWG
         *
         * 优化流程：先上传到临时目录，验证通过后直接移动到目标目录，避免转换后再拷贝。
         */
        async uploadExtReferenceDwg(nodeId, file, body, request, res) {
            // 确保 body 中的 nodeId 与路由参数一致
            body.nodeId = nodeId;
            this.logger.log(`[uploadExtReferenceDwg] 开始处理: ${body.ext_ref_file}`);
            this.logger.log(`[uploadExtReferenceDwg] 接收到的 body 参数: ${JSON.stringify(body)}`);
            this.logger.log(`[uploadExtReferenceDwg] 接收到的文件路径: ${file?.path}`);
            // 验证上传请求
            const validationResult = await this.validateExtReferenceUpload(file, body, 'uploadExtReferenceDwg', ['.dwg', '.dxf']);
            if (!validationResult.success) {
                return res.json(validationResult.error);
            }
            // 通过 nodeId 直接获取源图纸节点
            const node = await this.mxCadService.getFileSystemNodeByNodeId(body.nodeId);
            if (!node) {
                this.logger.warn(`[uploadExtReferenceDwg] 未找到源图纸: nodeId=${body.nodeId}`);
                return res.json({ code: -1, message: '未找到源图纸' });
            }
            this.logger.log(`[uploadExtReferenceDwg] 找到源图纸: ${node.name} (ID: ${node.id})`);
            // 计算文件哈希（优先使用前端传递的值，避免二次计算）
            let fileHash = body.hash;
            let isBackendCalculated = false;
            if (!fileHash) {
                // 兼容 MxCAD-App：如果前端没有传递 hash，则后端计算
                const fileBuffer = fs.readFileSync(file.path);
                fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
                isBackendCalculated = true;
                this.logger.log(`[uploadExtReferenceDwg] 前端未传递 hash，后端计算: ${fileHash}`);
                // 重命名文件为 hash 格式
                const ext = path.extname(file.originalname);
                const newPath = path.join(path.dirname(file.path), `${fileHash}${ext}`);
                if (file.path !== newPath) {
                    fs.renameSync(file.path, newPath);
                    file.path = newPath;
                    this.logger.log(`[uploadExtReferenceDwg] 文件已重命名: ${file.originalname} -> ${path.basename(newPath)}`);
                }
            }
            else {
                this.logger.log(`[uploadExtReferenceDwg] 使用前端传递的 hash: ${fileHash}`);
            }
            // 外部参照文件应该创建在源图纸所在目录中
            // 如果源图纸在项目根目录，则使用项目根目录
            // 否则使用源图纸的父节点（图纸所在目录）
            const parentFolderId = node?.parentId || node?.id || 'external-reference';
            this.logger.log(`[uploadExtReferenceDwg] 外部参照文件将存储在目录: ${parentFolderId} (源图纸: ${node?.name})`);
            // 构建上下文（外部参照上传）
            const context = {
                nodeId: parentFolderId, // 使用源图纸所在目录
                userId: await this.validateTokenAndGetUserId(request),
                userRole: 'USER',
                srcDwgNodeId: node.id, // 源图纸节点 ID（从节点获取）
                isImage: false, // DWG 文件
            };
            // 复用现有的上传和转换逻辑
            const result = await this.mxCadService.uploadAndConvertFileWithPermission(file.path, fileHash || '', body.ext_ref_file, file.size, context);
            // 统一返回格式：与参考代码保持一致
            if (result.ret === 'ok' || result.ret === 'fileAlreadyExist') {
                // 更新源图纸的外部参照信息
                try {
                    await this.mxCadService.updateExternalReferenceAfterUpload(body.nodeId);
                    this.logger.log(`[uploadExtReferenceDwg] 外部参照信息已更新: nodeId=${body.nodeId}`);
                }
                catch (updateError) {
                    this.logger.error(`[uploadExtReferenceDwg] 更新外部参照信息失败: ${updateError.message}`, updateError.stack);
                    // 更新失败不影响主流程
                }
                return res.json({ code: 0, message: 'ok' });
            }
            else {
                return res.json({ code: -1, message: result.ret || 'upload failed' });
            }
        }
        /**
         * 上传外部参照图片
         *
         * 图片不需要转换，直接拷贝到源图纸的 hash 目录。
         */
        async uploadExtReferenceImage(file, body, request, res) {
            this.logger.log(`[uploadExtReferenceImage] 开始处理: ${body.ext_ref_file}`);
            // 验证上传请求
            const validationResult = await this.validateExtReferenceUpload(file, body, 'uploadExtReferenceImage', ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);
            if (!validationResult.success) {
                return res.json(validationResult.error);
            }
            // 验证用户权限
            let sourceNode = null;
            try {
                const userId = await this.validateTokenAndGetUserId(request);
                this.logger.log(`[uploadExtReferenceImage] 用户ID: ${userId}`);
                // 通过 nodeId 直接获取源图纸节点
                const node = await this.mxCadService.getFileSystemNodeByNodeId(body.nodeId);
                if (!node) {
                    this.logger.warn(`[uploadExtReferenceImage] 未找到源图纸: nodeId=${body.nodeId}`);
                    return res.json({ code: -1, message: '未找到源图纸' });
                }
                // 检查用户是否有权限访问该图纸
                const permission = await this.checkFileAccessPermission(body.nodeId, userId, userId);
                if (!permission) {
                    this.logger.warn(`[uploadExtReferenceImage] 用户 ${userId} 无权限访问图纸 nodeId=${body.nodeId}`);
                    return res.json({ code: -1, message: '无权限访问该图纸' });
                }
                // 保存节点信息，供后续使用
                sourceNode = node;
                this.logger.log(`[uploadExtReferenceImage] 用户有权限访问图纸: ${sourceNode.name} (ID: ${sourceNode.id})`);
            }
            catch (authError) {
                this.logger.warn(`[uploadExtReferenceImage] 权限验证失败: ${authError.message}`);
                return res.json({ code: -1, message: '权限验证失败' });
            }
            // 计算文件哈希
            const fileBuffer = fs.readFileSync(file.path);
            const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
            this.logger.log(`[uploadExtReferenceImage] 文件哈希: ${fileHash}`);
            // 重命名文件为 hash 格式
            const ext = path.extname(file.originalname);
            const newPath = path.join(path.dirname(file.path), `${fileHash}${ext}`);
            if (file.path !== newPath) {
                fs.renameSync(file.path, newPath);
                file.path = newPath;
                this.logger.log(`[uploadExtReferenceImage] 文件已重命名: ${file.originalname} -> ${path.basename(newPath)}`);
            }
            // 构建上下文（外部参照上传）
            const context = {
                nodeId: sourceNode?.id,
                userId: await this.validateTokenAndGetUserId(request),
                userRole: 'USER',
                srcDwgNodeId: sourceNode.id, // 源图纸节点 ID（从节点获取）
                isImage: true, // 图片文件
            };
            // 直接拷贝图片到源图纸目录，不创建数据库记录
            try {
                await this.mxCadService.handleExternalReferenceImage(fileHash, sourceNode.id, body.ext_ref_file, file.path, context);
                // 如果指定了 updatePreloading，则更新源图纸的外部参照信息
                if (body.updatePreloading) {
                    try {
                        await this.mxCadService.updateExternalReferenceAfterUpload(body.nodeId);
                        this.logger.log(`[uploadExtReferenceImage] 外部参照信息已更新: nodeId=${body.nodeId}`);
                    }
                    catch (updateError) {
                        this.logger.error(`[uploadExtReferenceImage] 更新外部参照信息失败: ${updateError.message}`, updateError.stack);
                        // 更新失败不影响主流程
                    }
                }
                else {
                    this.logger.log(`[uploadExtReferenceImage] skip updatePreloading: nodeId=${body.nodeId}`);
                }
                return res.json({ code: 0, message: 'ok' });
            }
            catch (error) {
                this.logger.error(`[uploadExtReferenceImage] 图片文件拷贝失败: ${error.message}`, error.stack);
                return res.json({ code: -1, message: '图片文件拷贝失败' });
            }
        }
        /**
         * 访问 filesData 目录中的文件
         * 支持访问路径: /mxcad/filesData/YYYYMM/nodeId/nodeId.dwg.mxweb
         * 从本地存储读取文件
         *
         * 需要登录认证，不允许公开访问
         *
         * @param res Express Response 对象
         * @param req Express Request 对象
         * @returns 返回文件流或错误信息
         */
        async getFilesDataFile(res, req) {
            // 从 req.params.path 获取完整的路径（支持多层路径）
            const pathArray = req.params.path;
            const filename = Array.isArray(pathArray)
                ? pathArray.join('/')
                : pathArray || '';
            if (!filename) {
                this.logger.error(`无法获取文件路径，req.params: ${JSON.stringify(req.params)}`);
                return res.status(400).json({ code: -1, message: '无效的文件路径' });
            }
            // 使用共享的文件处理服务
            return this.mxcadFileHandler.serveFile(filename, res);
        }
        /**
         * 访问 filesData 目录中的文件 - HEAD 方法
         * 用于获取文件信息而不下载文件内容
         * 注意：HEAD 请求公开访问，因为 MxCAD 库内部发送的 HEAD 请求无法自定义请求头
         * 实际的安全性由 GET 请求和文件路径的随机性保证
         *
         * @param res Express Response 对象
         * @param req Express Request 对象
         * @returns 返回文件头信息或错误信息
         */
        async getFilesDataFileHead(res, req) {
            // 从 req.params.path 获取完整的路径（支持多层路径）
            const pathArray = req.params.path;
            const filename = Array.isArray(pathArray)
                ? pathArray.join('/')
                : pathArray || '';
            if (!filename) {
                this.logger.error(`无法获取文件路径，req.params: ${JSON.stringify(req.params)}`);
                return res.status(400).json({ code: -1, message: '无效的文件路径' });
            }
            return this.handleFilesDataFileRequest(filename, res, req, true);
        }
        /**
         * 处理 filesData 目录的文件请求
         * @param filename 文件名
         * @param res Express Response 对象
         * @param req Express Request 对象
         * @param isHeadRequest 是否为 HEAD 请求
         */
        async handleFilesDataFileRequest(filename, res, req, isHeadRequest) {
            try {
                // 调试日志
                this.logger.log(`访问 filesData 文件: ${filename}, 方法: ${isHeadRequest ? 'HEAD' : 'GET'}`);
                // Express 的 *filename 通配符会将路径中的 / 替换为 ,，需要先还原
                const normalizedFilename = filename.replace(/,/g, '/');
                // 检查是否请求历史版本（通过 v 参数）
                const versionParam = req.query.v;
                if (versionParam) {
                    // 请求历史版本
                    return this.handleHistoricalVersionRequest(normalizedFilename, versionParam, res, req, isHeadRequest);
                }
                // 正常请求：构建完整的文件路径: filesData/YYYYMM/nodeId/nodeId.dwg.mxweb
                const filesDataPath = this.configService.get('filesDataPath', {
                    infer: true,
                });
                const absoluteFilePath = path.resolve(filesDataPath, normalizedFilename);
                this.logger.debug(`文件路径检查: ${filesDataPath}, ${filename}, exists=${fs.existsSync(absoluteFilePath)}`);
                this.logger.log(`尝试访问文件: ${absoluteFilePath}`);
                // 检查文件是否存在
                if (!fs.existsSync(absoluteFilePath)) {
                    this.logger.error(`文件不存在: ${absoluteFilePath}`);
                    return res.status(404).json({ code: -1, message: '文件不存在' });
                }
                // 获取文件信息
                const fileStats = fs.statSync(absoluteFilePath);
                if (isHeadRequest) {
                    // 对于 HEAD 请求，只返回头部信息
                    const contentType = this.getContentType(absoluteFilePath);
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Content-Length', fileStats.size);
                    res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
                    res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问
                    res.end();
                    return;
                }
                // GET 请求直接返回文件流
                const contentType = this.getContentType(absoluteFilePath);
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Length', fileStats.size);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('Access-Control-Allow-Origin', '*');
                // 创建文件流并返回
                const fileStream = fs.createReadStream(absoluteFilePath);
                fileStream.pipe(res);
                // 监听流错误
                fileStream.on('error', (error) => {
                    this.logger.error(`文件流错误: ${error.message}`, error);
                    if (!res.headersSent) {
                        res.status(500).json({ code: -1, message: '获取文件失败' });
                    }
                });
                this.logger.log(`成功返回文件: ${absoluteFilePath}`);
            }
            catch (error) {
                this.logger.error(`获取 filesData 文件失败: ${error.message}`, error.stack);
                if (!res.headersSent) {
                    res.status(500).json({ code: -1, message: '获取文件失败' });
                }
            }
        }
        /**
         * 处理历史版本文件请求
         * @param filename 文件路径
         * @param version 版本号
         * @param res Express Response 对象
         * @param req Express Request 对象
         * @param isHeadRequest 是否为 HEAD 请求
         */
        async handleHistoricalVersionRequest(filename, version, res, req, isHeadRequest) {
            try {
                this.logger.log(`访问历史版本文件: ${filename} v${version}, 方法: ${isHeadRequest ? 'HEAD' : 'GET'}`);
                // 构建完整的文件路径
                const filesDataPath = this.configService.get('filesDataPath', {
                    infer: true,
                });
                const absoluteFilePath = path.resolve(filesDataPath, filename);
                // 对于 HEAD 请求，直接返回本地文件信息（当前版本），不从 SVN 获取
                if (isHeadRequest) {
                    this.logger.log(`HEAD 请求 - 返回本地文件信息: ${absoluteFilePath}`);
                    // 检查本地文件是否存在
                    if (!fs.existsSync(absoluteFilePath)) {
                        this.logger.error(`本地文件不存在: ${absoluteFilePath}`);
                        return res.status(404).json({ code: -1, message: '文件不存在' });
                    }
                    // 获取本地文件信息
                    const fileStats = fs.statSync(absoluteFilePath);
                    const contentType = this.getContentType(filename);
                    // 对于历史版本，使用 ETag 包含版本号，确保浏览器不会错误使用缓存
                    const etag = `"v${version}-${fileStats.mtime.getTime()}"`;
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Content-Length', fileStats.size);
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // 禁用缓存
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                    res.setHeader('ETag', etag);
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end();
                    return;
                }
                // GET 请求：从版本控制服务获取历史版本文件内容
                this.logger.log(`GET 请求 - 从 SVN 获取历史版本: ${filename} v${version}`);
                // 对于历史版本，忽略条件请求头，始终返回完整内容
                res.removeHeader('If-None-Match');
                res.removeHeader('If-Modified-Since');
                let buffer;
                // 如果请求的是 .mxweb 文件，需要处理历史版本
                if (filename.endsWith('.mxweb')) {
                    // 获取文件所在目录和基础文件名
                    const fileDir = path.dirname(absoluteFilePath);
                    const mxwebBaseName = path.basename(filename); // 如: xxx.dxf.mxweb
                    // 历史版本 mxweb 文件命名：{basename}_v{revision}.mxweb
                    // 例如：xxx.dxf_v78.mxweb
                    const historyMxwebName = mxwebBaseName.replace(/\.mxweb$/, `_v${version}.mxweb`);
                    const historyMxwebPath = path.join(fileDir, historyMxwebName);
                    // 检查是否已有转换好的历史版本 mxweb 文件
                    if (fs.existsSync(historyMxwebPath)) {
                        this.logger.log(`历史版本 mxweb 已存在，直接返回: ${historyMxwebName}`);
                        buffer = await fsPromises.readFile(historyMxwebPath);
                    }
                    else {
                        // 检查是否有正在进行的转换（防止并发请求重复转换）
                        const lockKey = historyMxwebPath;
                        const existingLock = this.historyConversionLocks.get(lockKey);
                        if (existingLock) {
                            // 等待正在进行的转换完成
                            this.logger.log(`等待正在进行的转换: ${historyMxwebName}`);
                            await existingLock;
                            // 转换完成后重新检查缓存文件
                            if (fs.existsSync(historyMxwebPath)) {
                                this.logger.log(`转换完成，返回缓存文件: ${historyMxwebName}`);
                                buffer = await fsPromises.readFile(historyMxwebPath);
                            }
                            else {
                                // 等待完成但文件不存在，说明转换失败，返回错误
                                this.logger.error(`转换完成但文件不存在: ${historyMxwebName}`);
                                return res.status(500).json({
                                    code: -1,
                                    message: '历史版本文件转换失败',
                                });
                            }
                        }
                        else {
                            // 没有缓存，需要从 SVN 获取 bin 文件并转换
                            this.logger.log(`历史版本 mxweb 不存在，从 SVN 获取 .bin 分片文件并转换`);
                            // 创建转换任务（先声明，后存入锁，再执行）
                            let resolveConversionTask;
                            let rejectConversionTask;
                            const conversionTask = new Promise((resolve, reject) => {
                                resolveConversionTask = resolve;
                                rejectConversionTask = reject;
                            });
                            // 立即存入锁 Map，防止竞态条件
                            this.historyConversionLocks.set(lockKey, conversionTask);
                            // 执行转换任务
                            (async () => {
                                try {
                                    // 列出目录内容，找到所有分片 bin 文件
                                    const listResult = await this.versionControlService.listDirectoryAtRevision(fileDir, parseInt(version, 10));
                                    if (!listResult.success || !listResult.files) {
                                        throw new NotFoundException('历史版本目录不存在');
                                    }
                                    const binFiles = listResult.files;
                                    if (binFiles.length === 0) {
                                        // 没有 bin 分片文件，说明这是第一个版本（上传时的原始版本）
                                        // 返回 null 表示需要使用初始版本逻辑（不生成缓存文件）
                                        resolveConversionTask(null);
                                        return;
                                    }
                                    this.logger.log(`找到 ${binFiles.length} 个分片 bin 文件`);
                                    // 创建临时目录用于存放 bin 分片文件
                                    const mxcadTempPath = this.configService.get('mxcadTempPath', {
                                        infer: true,
                                    });
                                    const tempDir = path.join(mxcadTempPath, `mxcad-history-${version}-${Date.now()}`);
                                    await fsPromises.mkdir(tempDir, { recursive: true });
                                    try {
                                        // 获取所有分片文件并保存到临时目录（保持原文件名，转换程序会自动处理分片）
                                        for (const binFile of binFiles) {
                                            const binFilePath = path.join(fileDir, binFile);
                                            this.logger.log(`获取分片文件: ${binFile} v${version}`);
                                            const binResult = await this.versionControlService.getFileContentAtRevision(binFilePath, parseInt(version, 10));
                                            if (!binResult.success || !binResult.content) {
                                                throw new NotFoundException(`分片文件获取失败: ${binFile}`);
                                            }
                                            // 保存分片文件到临时目录，保持原文件名
                                            const tempBinFile = path.join(tempDir, binFile);
                                            await fsPromises.writeFile(tempBinFile, binResult.content);
                                        }
                                        // 转换 bin 文件为 mxweb
                                        const binSrcPath = path.join(tempDir, `${mxwebBaseName}.bin`);
                                        const conversionResult = await this.fileConversionService.convertBinToMxweb(binSrcPath, fileDir, historyMxwebName);
                                        if (!conversionResult.success ||
                                            !conversionResult.outputPath) {
                                            throw new InternalServerErrorException(`bin→mxweb 转换失败: ${conversionResult.error}`);
                                        }
                                        this.logger.log(`成功转换并保存历史版本 mxweb: ${historyMxwebName}`);
                                        resolveConversionTask(conversionResult.outputPath);
                                    }
                                    finally {
                                        // 清理临时目录
                                        await this.cleanupTempFiles(tempDir);
                                    }
                                }
                                catch (error) {
                                    rejectConversionTask(error);
                                }
                            })();
                            try {
                                const resultPath = await conversionTask;
                                if (resultPath) {
                                    // 有分片文件，读取转换后的 mxweb
                                    buffer = await fsPromises.readFile(resultPath);
                                }
                                else {
                                    // 没有分片文件，使用初始版本逻辑
                                    const initialMxwebName = mxwebBaseName.replace(/\.mxweb$/, '_initial.mxweb');
                                    const initialMxwebPath = path.join(fileDir, initialMxwebName);
                                    if (fs.existsSync(initialMxwebPath)) {
                                        buffer = await fsPromises.readFile(initialMxwebPath);
                                        this.logger.log(`成功返回初始版本 mxweb: ${initialMxwebName} (本地文件)`);
                                    }
                                    else {
                                        const currentMxwebPath = path.join(fileDir, mxwebBaseName);
                                        if (!fs.existsSync(currentMxwebPath)) {
                                            return res.status(404).json({
                                                code: -1,
                                                message: '历史版本文件不存在',
                                            });
                                        }
                                        buffer = await fsPromises.readFile(currentMxwebPath);
                                        this.logger.log(`成功返回当前 mxweb 文件: ${mxwebBaseName}`);
                                    }
                                }
                            }
                            catch (error) {
                                const err = error;
                                this.logger.error(`历史版本转换失败: ${err.message}`);
                                return res.status(500).json({
                                    code: -1,
                                    message: `历史版本文件转换失败: ${err.message}`,
                                });
                            }
                            finally {
                                // 转换完成，清除锁
                                this.historyConversionLocks.delete(lockKey);
                            }
                        }
                    }
                }
                else {
                    // 非 .mxweb 文件（如 .dwg、.json 等），直接从 SVN 获取
                    const result = await this.versionControlService.getFileContentAtRevision(absoluteFilePath, parseInt(version, 10));
                    if (!result.success || !result.content) {
                        this.logger.error(`历史版本文件不存在或读取失败: ${filename} v${version}`);
                        return res.status(404).json({
                            code: -1,
                            message: result.message || '历史版本文件不存在',
                        });
                    }
                    buffer = result.content;
                    this.logger.log(`成功返回历史版本文件: ${filename} v${version}`);
                }
                // 设置响应头
                const contentType = this.getContentType(filename);
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Length', buffer.length);
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // 历史版本不缓存
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问
                // 发送文件流
                res.status(200).send(buffer);
                this.logger.log(`成功返回历史版本文件: ${filename} v${version}`);
            }
            catch (error) {
                const err = error;
                this.logger.error(`获取历史版本文件失败: ${filename} v${version}, 错误: ${err.message}`, err.stack);
                if (!res.headersSent) {
                    res.status(500).json({ code: -1, message: '获取历史版本文件失败' });
                }
            }
        }
        /**
         * 清理临时文件目录
         * @param tempDir 临时目录路径
         */
        async cleanupTempFiles(tempDir) {
            try {
                await fsPromises.rm(tempDir, { recursive: true, force: true });
                this.logger.log(`已清理临时目录: ${tempDir}`);
            }
            catch (error) {
                const err = error;
                this.logger.warn(`清理临时目录失败: ${tempDir}, 错误: ${err.message}`);
            }
        }
        /**
         * 根据文件扩展名获取 MIME 类型
         * @param filePath 文件路径
         * @returns MIME 类型
         */
        getContentType(filePath) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.mxweb': 'application/octet-stream',
                '.dwg': 'application/dwg',
                '.dxf': 'application/dxf',
                '.pdf': 'application/pdf',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.bmp': 'image/bmp',
                '.webp': 'image/webp',
                '.json': 'application/json',
                '.txt': 'text/plain',
            };
            return mimeTypes[ext] || 'application/octet-stream';
        }
        /**
         * 访问转换后的文件 (.mxweb) - GET 方法
         * 支持 MxCAD-App 访问路径: /mxcad/file/{filename}
         * 从本地存储读取文件
         *
         * @param res Express Response 对象
         * @param req Express Request 对象
         * @returns 返回文件流或错误信息
         */
        async getFile(res, req) {
            // 从 req.params.path 获取完整的路径（支持多层路径）
            // req.params.path 可能是数组，需要拼接成字符串
            const pathArray = req.params.path;
            const filename = Array.isArray(pathArray)
                ? pathArray.join('/')
                : pathArray || '';
            if (!filename) {
                this.logger.error(`无法获取文件路径，req.params: ${JSON.stringify(req.params)}`);
                return res.status(400).json({ code: -1, message: '无效的文件路径' });
            }
            return this.handleFileRequest(filename, res, req, false);
        }
        /**
         * 访问转换后的文件 (.mxweb) - HEAD 方法
         * 用于获取文件信息而不下载文件内容
         *
         * @param res Express Response 对象
         * @param req Express Request 对象
         * @returns 返回文件头信息或错误信息
         */
        async getFileHead(res, req) {
            // 从 req.params.path 获取完整的路径（支持多层路径）
            // req.params.path 可能是数组，需要拼接成字符串
            const pathArray = req.params.path;
            const filename = Array.isArray(pathArray)
                ? pathArray.join('/')
                : pathArray || '';
            if (!filename) {
                this.logger.error(`无法获取文件路径，req.params: ${JSON.stringify(req.params)}`);
                return res.status(400).json({ code: -1, message: '无效的文件路径' });
            }
            return this.handleFileRequest(filename, res, req, true);
        }
        /**
         * 统一的文件请求处理方法
         * @param filename 文件名
         * @param res Express Response 对象
         * @param req Express Request 对象
         * @param isHeadRequest 是否为 HEAD 请求
         */
        async handleFileRequest(filename, res, req, isHeadRequest) {
            try {
                // 对于文件访问请求，优先使用 Session 认证，如果 Session 不存在则回退到 JWT token
                // 通过文件路径查找 FileSystemNode 并验证权限
                // 调试日志
                this.logger.log(`原始 filename 参数: "${filename}"`);
                this.logger.log(`访问文件请求: ${filename}, 方法: ${isHeadRequest ? 'HEAD' : 'GET'}, Authorization: ${req.headers.authorization ? 'present' : 'missing'}`);
                this.logger.log(`Session 信息: ${JSON.stringify(req.session)}`);
                this.logger.log(`Cookies: ${JSON.stringify(req.cookies)}`);
                let userId;
                // 优先尝试从 Session 获取用户 ID（用于 img.src 等无法携带请求头的场景）
                if (req.session?.userId) {
                    userId = req.session.userId;
                    this.logger.log(`使用 Session 认证成功: ${userId}`);
                }
                else {
                    // Session 不存在，回退到 JWT Token 认证
                    try {
                        userId = await this.validateTokenAndGetUserId(req);
                        this.logger.log(`使用 JWT Token 认证成功: ${userId}`);
                    }
                    catch (authError) {
                        this.logger.warn(`认证失败: ${authError.message}`);
                        return res.status(401).json({ code: -1, message: authError.message });
                    }
                }
                // Express 的 *filename 通配符会将路径中的 / 替换为 ,，需要先还原
                const normalizedFilename = filename.replace(/,/g, '/');
                // 从文件路径中提取节点 ID（格式：nodeId/filename）
                const pathParts = normalizedFilename.split('/');
                const nodeId = pathParts[0]; // 第一个部分是节点 ID
                const actualFilename = pathParts.length > 1
                    ? pathParts.slice(1).join('/')
                    : normalizedFilename;
                this.logger.log(`提取的nodeId: ${nodeId}, actualFilename: ${actualFilename}`);
                // 通过节点 ID 查找节点，验证用户是否有访问权限
                const node = await this.mxCadService.findFileNodeByIdNotDeleted(nodeId, { id: true, name: true, ownerId: true, parentId: true, isRoot: true });
                this.logger.log(`查找文件节点: nodeId=${nodeId}, 找到=${node ? '是' : '否'}`);
                if (!node) {
                    // 文件节点不存在，降级到本地文件系统查找（兼容旧文件）
                    this.logger.log(`文件节点不存在，降级到本地文件系统: ${normalizedFilename}`);
                }
                else {
                    // 检查用户是否有权限
                    const permission = await this.checkFileAccessPermission(node.id, userId, userId);
                    const hasPermission = !!permission;
                    this.logger.log(`权限检查结果: userId=${userId}, hasPermission=${hasPermission}, nodeId=${nodeId}`);
                    if (!hasPermission) {
                        return res.status(401).json({
                            code: -1,
                            message: 'Unauthorized',
                        });
                    }
                }
                // 根据文件扩展名确定可能的存储路径
                const ext = path.extname(normalizedFilename).toLowerCase();
                const possiblePaths = [];
                // 对于 MxCAD 转换文件，使用 mxcad/file/ 路径
                if (ext === this.mxCadFileExt) {
                    possiblePaths.push(`mxcad/file/${normalizedFilename}`);
                }
                // 对于 .jpg 缩略图文件，只尝试 mxcad/file/ 路径
                else if (ext === '.jpg') {
                    possiblePaths.push(`mxcad/file/${normalizedFilename}`);
                }
                // 对于 JSON 文件
                else if (ext === '.json') {
                    possiblePaths.push(`mxcad/file/${normalizedFilename}`);
                    possiblePaths.push(normalizedFilename);
                }
                // 其他文件类型
                else {
                    possiblePaths.push(`mxcad/file/${normalizedFilename}`);
                    possiblePaths.push(normalizedFilename);
                }
                this.logger.log(`访问文件 - 尝试路径: ${possiblePaths.join(', ')}`);
                let foundStoragePath = null;
                // 尝试找到文件
                for (const mxcadPath of possiblePaths) {
                    try {
                        const exists = await this.storageService.fileExists(mxcadPath);
                        if (exists) {
                            foundStoragePath = mxcadPath;
                            this.logger.log(`找到存储文件: ${mxcadPath}`);
                            break;
                        }
                    }
                    catch (error) {
                        this.logger.log(`路径 ${mxcadPath} 不存在，尝试下一个路径`);
                    }
                }
                if (foundStoragePath) {
                    // 存储中存在文件
                    if (isHeadRequest) {
                        // 对于 HEAD 请求，获取文件信息
                        try {
                            const fileInfo = await this.storageService.getFileInfo(foundStoragePath);
                            if (fileInfo) {
                                // 设置响应头
                                res.setHeader('Content-Type', fileInfo.contentType);
                                res.setHeader('Content-Length', fileInfo.contentLength);
                                res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
                                res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问
                                // HEAD 请求只返回头部信息
                                res.end();
                                return;
                            }
                            else {
                                throw new NotFoundException(`获取存储文件信息失败: ${normalizedFilename}`);
                            }
                        }
                        catch (error) {
                            this.logger.error(`获取存储文件信息失败: ${error.message}`, error);
                            throw error;
                        }
                    }
                    else {
                        // GET 请求直接返回文件流
                        try {
                            this.logger.log(`准备返回文件流: ${foundStoragePath}`);
                            const fileStream = await this.storageService.getFileStream(foundStoragePath);
                            // 设置响应头
                            const fileInfo = await this.storageService.getFileInfo(foundStoragePath);
                            if (fileInfo) {
                                res.setHeader('Content-Type', fileInfo.contentType);
                                res.setHeader('Content-Length', fileInfo.contentLength);
                                res.setHeader('Cache-Control', 'public, max-age=3600');
                                res.setHeader('Access-Control-Allow-Origin', '*');
                            }
                            // 返回文件流
                            this.logger.log(`开始返回文件流: ${foundStoragePath}`);
                            // 监听流错误
                            fileStream.on('error', (error) => {
                                this.logger.error(`文件流错误: ${error.message}`, error);
                                if (!res.headersSent) {
                                    res.status(500).json({ code: -1, message: '文件流错误' });
                                }
                            });
                            fileStream.pipe(res);
                            return;
                        }
                        catch (error) {
                            this.logger.error(`获取存储文件流失败: ${error.message}`, error);
                            throw error;
                        }
                    }
                }
                // 存储中不存在文件，返回 404
                this.logger.warn(`文件不存在: ${normalizedFilename}`);
                return res.status(404).json({
                    code: -1,
                    message: '文件不存在',
                });
            }
            catch (error) {
                this.logger.error(`访问文件失败: ${error.message}`, error);
                if (!res.headersSent) {
                    res.status(500).json({
                        code: -1,
                        message: '访问文件失败',
                    });
                }
            }
        }
        // ────────────────────────── 缩略图 ──────────────────────────
        /**
         * 检查缩略图是否存在
         */
        async checkThumbnail(nodeId, res) {
            this.logger.log(`[checkThumbnail] 查询缩略图, nodeId: ${nodeId}`);
            try {
                const node = await this.mxCadService.getFileSystemNodeByNodeId(nodeId);
                if (!node || !node.path) {
                    return res.status(404).json({ code: -1, message: '文件不存在或没有 path' });
                }
                const result = await this.mxCadService.checkThumbnailExists(nodeId);
                return res.json({ code: 0, message: 'ok', exists: result.exists });
            }
            catch (error) {
                this.logger.error(`[checkThumbnail] 查询缩略图失败: ${error.message}`, error.stack);
                return res.status(500).json({ code: -1, message: '查询缩略图失败' });
            }
        }
        /**
         * 上传缩略图
         */
        async uploadThumbnail(nodeId, file, res) {
            this.logger.log(`[uploadThumbnail] 上传缩略图, nodeId: ${nodeId}`);
            if (!file) {
                return res.status(400).json({ code: -1, message: '缺少文件' });
            }
            if (!fs.existsSync(file.path)) {
                return res.status(500).json({ code: -1, message: '上传的文件不存在' });
            }
            try {
                const node = await this.mxCadService.getFileSystemNodeByNodeId(nodeId);
                if (!node || !node.path) {
                    return res.status(404).json({ code: -1, message: '文件不存在或没有 path' });
                }
                const filesDataPath = this.configService.get('filesDataPath', { infer: true });
                const nodePathParts = node.path.split('/');
                const dirParts = nodePathParts.slice(0, -1);
                const targetDir = path.resolve(filesDataPath, dirParts.join('/'));
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                const fileExt = path.extname(file.originalname || file.filename).toLowerCase();
                const extMap = {
                    '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp',
                };
                const thumbnailFormat = extMap[fileExt];
                if (!thumbnailFormat) {
                    return res.status(400).json({
                        code: -1,
                        message: `不支持的图片格式: ${fileExt}，仅支持 ${THUMBNAIL_FORMATS.join(', ')}`,
                    });
                }
                const targetFileName = getThumbnailFileName(thumbnailFormat);
                const targetFilePath = path.join(targetDir, targetFileName);
                if (fs.existsSync(targetFilePath)) {
                    fs.unlinkSync(targetFilePath);
                }
                fs.renameSync(file.path, targetFilePath);
                this.logger.log(`[uploadThumbnail] 缩略图已上传: ${targetFilePath}`);
                return res.json({ code: 0, message: '缩略图上传成功', data: { fileName: targetFileName } });
            }
            catch (error) {
                this.logger.error(`[uploadThumbnail] 上传缩略图失败: ${error.message}`, error.stack);
                return res.status(500).json({ code: -1, message: '上传缩略图失败' });
            }
        }
        // ────────────────────────── 非 CAD 文件 ──────────────────────────
        /**
         * 获取非 CAD 文件（图片、文档等）
         */
        async getNonCadFile(storageKey, res) {
            try {
                if (!storageKey || storageKey.includes('..') || storageKey.includes('\\')) {
                    return res.status(400).json({ code: -1, message: '无效的文件路径' });
                }
                let actualStorageKey = storageKey;
                if (storageKey.startsWith('files/')) {
                    try {
                        const node = await this.mxCadService.getFileSystemNodeByPath(storageKey);
                        if (node) {
                            const extension = node.extension?.toLowerCase() || '';
                            actualStorageKey = `mxcad/file/${node.id}${extension}`;
                        }
                    }
                    catch (queryError) {
                        this.logger.warn(`[getNonCadFile] 查询节点失败，使用原路径: ${queryError.message}`);
                    }
                }
                const fileStream = await this.storageService.getFileStream(actualStorageKey);
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Disposition', `inline; filename="${path.basename(actualStorageKey)}"`);
                fileStream.pipe(res);
            }
            catch (error) {
                this.logger.error(`[getNonCadFile] 获取文件失败: ${error.message}`);
                if (!res.headersSent) {
                    res.status(500).json({ code: -1, message: '获取文件失败' });
                }
            }
        }
        /**
         * 从请求中构建上下文信息，通过JWT验证用户身份
         * 强制要求JWT认证，确保安全性}
      
        /**
         * 从请求中构建上下文信息，通过JWT验证用户身份
         * 强制要求JWT认证，确保安全性
         */
        async buildContextFromRequest(request) {
            try {
                // 1. 必须从 Authorization header 获取 JWT token
                if (!request.headers.authorization) {
                    throw new UnauthorizedException('缺少Authorization header，请提供有效的JWT token');
                }
                const token = request.headers.authorization.replace('Bearer ', '');
                let payload;
                try {
                    payload = this.jwtService.verify(token);
                }
                catch (error) {
                    throw new UnauthorizedException('JWT token无效或已过期');
                }
                // 2. 验证用户存在且状态正常
                const userData = await this.mxCadService.findUserById(payload.sub, { id: true, email: true, username: true, nickname: true, roleId: true, status: true });
                if (!userData) {
                    throw new UnauthorizedException('用户不存在');
                }
                if (userData.status !== 'ACTIVE') {
                    throw new UnauthorizedException('用户账号已被禁用');
                }
                this.logger.log(`JWT 验证成功: ${userData.username}`);
                // 3. 从多个来源获取节点信息：
                // - POST 请求：从 request.body 获取
                // - GET/HEAD 请求：从 request.query 获取
                // nodeId 是当前文件夹或项目根目录的 FileSystemNode ID
                const nodeId = request.body?.nodeId || request.query?.nodeId;
                this.logger.log(`🔍 解析参数: body.nodeId=${request.body?.nodeId}, query.nodeId=${request.query?.nodeId}`);
                this.logger.log(`🔍 最终值: nodeId=${nodeId}`);
                // 4. 严格验证 nodeId 是否存在
                if (!nodeId) {
                    throw new BadRequestException('缺少节点ID（nodeId），无法创建文件系统节点');
                }
                // 5. 检查节点是否属于公共资源库（用于 isLibrary 字段）
                const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
                // 6. 构建上下文
                const context = {
                    nodeId,
                    userId: userData.id,
                    userRole: userData.roleId,
                    conflictStrategy: request.body?.conflictStrategy || 'rename',
                    isLibrary: libraryKey === 'drawing' || libraryKey === 'block',
                };
                this.logger.log(`构建上下文: userId=${userData.id}, nodeId=${nodeId}, conflictStrategy=${context.conflictStrategy}, libraryKey=${libraryKey}, isLibrary=${context.isLibrary}`);
                return context;
            }
            catch (error) {
                this.logger.error(`构建上下文失败: ${error.message}`, error);
                // 验证失败时抛出异常，不再返回空上下文
                if (error instanceof UnauthorizedException) {
                    throw error;
                }
                throw new UnauthorizedException('身份验证失败');
            }
        }
        /**
         * 验证 JWT token 并返回用户 ID（用于文件访问）
         * @param request Express Request 对象
         * @returns 用户 ID
         */
        async validateTokenAndGetUserId(request) {
            const authorization = request.headers.authorization;
            if (!authorization) {
                throw new UnauthorizedException('缺少Authorization header');
            }
            const token = authorization.replace('Bearer ', '');
            let payload;
            try {
                payload = this.jwtService.verify(token);
            }
            catch (error) {
                throw new UnauthorizedException('JWT token无效或已过期');
            }
            const userData = await this.mxCadService.findUserById(payload.sub, { id: true, status: true });
            if (!userData) {
                throw new UnauthorizedException('用户不存在');
            }
            if (userData.status !== 'ACTIVE') {
                throw new UnauthorizedException('用户账号已被禁用');
            }
            return userData.id;
        }
        /**
         * 获取项目中的所有节点ID（递归）
         * @param projectId 项目根目录ID
         * @returns 所有节点ID数组
         */
        async getAllNodeIdsInProject(projectId) {
            return this.mxCadService.getAllNodeIdsInProject(projectId);
        }
        /**
         * 通过文件哈希值查找 FileSystemNode
         * @param fileHash 文件哈希值
         * @param projectId 项目ID（可选，如果指定则只查找该项目中的节点）
         * @returns FileSystemNode 或 null
         */
        async getFileSystemNodeByHash(fileHash, projectId) {
            return this.mxCadService.findFileNodeByHash(fileHash, projectId);
        }
        /**
         * 根据节点 ID 查找项目根目录
         * @param nodeId 节点 ID
         * @returns 项目根目录节点或 null
         */
        async getProjectRootByNodeId(nodeId) {
            return this.mxCadService.getProjectRootByNodeId(nodeId);
        }
        /**
         * 检查用户是否有文件访问权限
         * @param nodeId 文件节点 ID
         * @param userId 用户 ID
         * @param checkUserId 要检查权限的用户 ID
         * @returns 是否有权限
         */
        async checkFileAccessPermission(nodeId, userId, checkUserId) {
            try {
                this.logger.log(`[checkFileAccessPermission] 开始检查权限: nodeId=${nodeId}, checkUserId=${checkUserId}`);
                const role = await this.permissionService.getNodeAccessRole(checkUserId, nodeId);
                const hasPermission = role !== null;
                this.logger.log(`[checkFileAccessPermission] 权限检查结果: ${hasPermission}, role=${role}`);
                return hasPermission;
            }
            catch (error) {
                this.logger.error(`检查文件访问权限失败: ${error.message}`, error);
                return false;
            }
        }
        /**
         * 验证文件名是否安全（防止路径遍历攻击）
         * @param fileName 文件名
         * @returns 是否安全
         */
        validateFileName(fileName) {
            // 检查文件名是否包含路径遍历字符
            if (fileName.includes('..') ||
                fileName.includes('/') ||
                fileName.includes('\\')) {
                return false;
            }
            // 检查文件名是否为空
            if (!fileName || fileName.trim().length === 0) {
                return false;
            }
            // 检查文件名长度（限制为 255 字符）
            if (fileName.length > 255) {
                return false;
            }
            // 检查文件名是否包含非法字符（Windows 和 Linux 都不允许的字符）
            const invalidChars = /[<>:"|?*]/;
            if (invalidChars.test(fileName)) {
                return false;
            }
            // 单独检查控制字符
            for (let i = 0; i < fileName.length; i++) {
                const charCode = fileName.charCodeAt(i);
                if (charCode < 0x20 || charCode === 0x7f) {
                    return false;
                }
            }
            return true;
        }
        /**
         * 验证文件大小是否在允许范围内
         * @param fileSize 文件大小（字节）
         * @param maxSize 最大文件大小（字节），默认 100MB
         * @returns 是否在允许范围内
         */
        validateFileSize(fileSize, maxSize = 104857600) {
            return fileSize > 0 && fileSize <= maxSize;
        }
        /**
         * 验证文件类型是否允许
         * @param fileName 文件名
         * @param allowedExtensions 允许的文件扩展名列表
         * @returns 是否允许
         */
        validateFileType(fileName, allowedExtensions = [
            '.dwg',
            '.dxf',
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
            '.bmp',
            '.webp',
        ]) {
            const ext = path.extname(fileName).toLowerCase();
            return allowedExtensions.includes(ext);
        }
        /**
         * 验证外部参照上传请求
         * @param file 上传的文件
         * @param body 请求体
         * @param methodPrefix 方法前缀（用于日志）
         * @param allowedExtensions 允许的文件扩展名列表
         * @returns 验证结果
         */
        async validateExtReferenceUpload(file, body, methodPrefix, allowedExtensions) {
            // 1. 验证文件
            if (!file) {
                this.logger.warn(`[${methodPrefix}] 缺少文件`);
                return { success: false, error: { code: -1, message: '缺少文件' } };
            }
            // 2. 验证参数
            if (!body.nodeId || !body.ext_ref_file) {
                this.logger.warn(`[${methodPrefix}] 缺少必要参数`);
                return { success: false, error: { code: -1, message: '缺少必要参数' } };
            }
            // 3. 验证图纸文件是否存在
            const preloadingData = await this.mxCadService.getPreloadingData(body.nodeId);
            if (!preloadingData) {
                this.logger.warn(`[${methodPrefix}] 图纸文件不存在: nodeId=${body.nodeId}`);
                return { success: false, error: { code: -1, message: '图纸文件不存在' } };
            }
            // 4. 验证外部参照文件是否在预加载数据列表中
            const isValidReference = preloadingData.externalReference.includes(body.ext_ref_file) ||
                preloadingData.images.includes(body.ext_ref_file);
            if (!isValidReference) {
                this.logger.warn(`[${methodPrefix}] 无效的外部参照文件: ${body.ext_ref_file}`);
                return {
                    success: false,
                    error: { code: -1, message: '无效的外部参照文件' },
                };
            }
            // 5. 验证文件名安全性（防止路径遍历攻击）
            if (!this.validateFileName(body.ext_ref_file)) {
                this.logger.warn(`[${methodPrefix}] 文件名包含非法字符: ${body.ext_ref_file}`);
                return {
                    success: false,
                    error: { code: -1, message: '文件名包含非法字符' },
                };
            }
            // 6. 验证文件大小
            if (!this.validateFileSize(file.size)) {
                this.logger.warn(`[${methodPrefix}] 文件大小超出限制: ${file.size} bytes`);
                return {
                    success: false,
                    error: { code: -1, message: '文件大小超出限制（最大 100MB）' },
                };
            }
            // 7. 验证文件类型
            if (!this.validateFileType(body.ext_ref_file, allowedExtensions)) {
                this.logger.warn(`[${methodPrefix}] 不支持的文件类型: ${body.ext_ref_file}`);
                const allowedTypes = allowedExtensions.join(', ');
                return {
                    success: false,
                    error: { code: -1, message: `仅支持 ${allowedTypes} 文件` },
                };
            }
            return { success: true, preloadingData };
        }
    };
    __setFunctionName(_classThis, "MxCadController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _checkChunkExist_decorators = [Post('files/chunkisExist'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.FILE_OPEN), HttpCode(HttpStatus.OK), ApiResponse({
                status: 200,
                description: '检查分片是否存在',
                type: ChunkExistResponseDto,
            })];
        _checkFileExist_decorators = [Post('files/fileisExist'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.FILE_OPEN), HttpCode(HttpStatus.OK), ApiResponse({
                status: 200,
                description: '检查文件是否存在',
                type: FileExistResponseDto,
            })];
        _checkDuplicateFile_decorators = [Post('files/checkDuplicate'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.FILE_OPEN), HttpCode(HttpStatus.OK), ApiOperation({ summary: '检查目录中是否存在重复文件' }), ApiResponse({
                status: 200,
                description: '返回重复检查结果',
                type: CheckDuplicateFileResponseDto,
            })];
        _getPreloadingData_decorators = [Get('file/:nodeId/preloading'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.FILE_OPEN), ApiResponse({
                status: 200,
                description: '成功获取预加载数据',
                type: PreloadingDataDto,
            }), ApiResponse({
                status: 404,
                description: '预加载数据不存在',
            })];
        _checkExternalReference_decorators = [Post('file/:nodeId/check-reference'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE), ApiResponse({
                status: 200,
                description: '成功检查文件存在性',
                type: CheckReferenceResponseDto,
            }), ApiResponse({
                status: 400,
                description: '请求参数错误',
                schema: {
                    type: 'object',
                    properties: {
                        code: { type: 'number', example: -1 },
                        message: { type: 'string', example: '缺少必要参数' },
                    },
                },
            })];
        _refreshExternalReferences_decorators = [Post('file/:nodeId/refresh-external-references'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE), ApiResponse({
                status: 200,
                description: '刷新成功',
                type: RefreshExternalReferencesResponseDto,
            }), ApiResponse({
                status: 500,
                description: '刷新失败',
            })];
        _uploadFile_decorators = [Post('files/uploadFiles'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.FILE_UPLOAD), UseInterceptors(AnyFilesInterceptor()), ApiConsumes('multipart/form-data'), ApiBody({ type: UploadFilesDto }), ApiResponse({
                status: 200,
                description: '上传文件成功',
                type: UploadFileResponseDto,
            })];
        _saveMxwebToNode_decorators = [Post('savemxweb/:nodeId'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.CAD_SAVE), HttpCode(HttpStatus.OK), UseInterceptors(FileInterceptor('file')), ApiConsumes('multipart/form-data'), ApiBody({ type: SaveMxwebDto }), ApiResponse({
                status: 200,
                description: '保存 mxweb 文件到指定节点',
                type: SaveMxwebResponseDto,
            })];
        _saveMxwebAs_decorators = [Post('save-as'), UseGuards(JwtAuthGuard), HttpCode(HttpStatus.OK), UseInterceptors(FileInterceptor('file')), ApiConsumes('multipart/form-data'), ApiBody({ type: SaveMxwebAsDto }), ApiResponse({
                status: 200,
                description: '保存mxweb文件为新文件',
                type: SaveMxwebAsResponseDto,
            }), ApiResponse({
                status: 400,
                description: '请求参数错误',
            })];
        _uploadExtReferenceDwg_decorators = [Post('up_ext_reference_dwg/:nodeId'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), UseInterceptors(FileInterceptor('file')), RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE), ApiConsumes('multipart/form-data'), ApiBody({ type: UploadExtReferenceFileDto }), ApiResponse({
                status: 200,
                description: '上传成功',
                schema: {
                    type: 'object',
                    properties: {
                        code: { type: 'number', example: 0 },
                        message: { type: 'string', example: 'ok' },
                    },
                },
            }), ApiResponse({
                status: 400,
                description: '请求参数错误',
            }), ApiResponse({
                status: 404,
                description: '图纸文件不存在',
            }), ApiResponse({
                status: 403,
                description: '无效的外部参照文件',
            })];
        _uploadExtReferenceImage_decorators = [Post('up_ext_reference_image'), UseGuards(JwtAuthGuard, RequireProjectPermissionGuard), RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE), UseInterceptors(FileInterceptor('file')), ApiConsumes('multipart/form-data'), ApiBody({ type: UploadExtReferenceFileDto }), ApiResponse({
                status: 200,
                description: '上传成功',
                schema: {
                    type: 'object',
                    properties: {
                        code: { type: 'number', example: 0 },
                        message: { type: 'string', example: 'ok' },
                    },
                },
            }), ApiResponse({
                status: 400,
                description: '请求参数错误',
            }), ApiResponse({
                status: 404,
                description: '图纸文件不存在',
            }), ApiResponse({
                status: 403,
                description: '无效的外部参照文件',
            })];
        _getFilesDataFile_decorators = [Get('filesData/*path'), UseGuards(JwtAuthGuard), ApiBearerAuth(), ApiResponse({
                status: 200,
                description: '成功获取文件',
                content: {
                    'application/octet-stream': {
                        schema: {
                            type: 'string',
                            format: 'binary',
                        },
                    },
                },
            }), ApiResponse({
                status: 401,
                description: '未登录，无法访问文件',
            }), ApiResponse({
                status: 404,
                description: '文件不存在',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                code: { type: 'number', example: -1 },
                                message: { type: 'string', example: '文件不存在' },
                            },
                        },
                    },
                },
            }), ApiResponse({
                status: 500,
                description: '服务器内部错误',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                code: { type: 'number', example: -1 },
                                message: { type: 'string', example: '获取文件失败' },
                            },
                        },
                    },
                },
            })];
        _getFilesDataFileHead_decorators = [Head('filesData/*path'), ApiResponse({
                status: 200,
                description: '成功获取文件信息',
            }), ApiResponse({
                status: 404,
                description: '文件不存在',
            }), ApiResponse({
                status: 500,
                description: '服务器内部错误',
            })];
        _getFile_decorators = [Get('file/*path'), ApiResponse({
                status: 200,
                description: '成功获取文件',
                content: {
                    'application/octet-stream': {
                        schema: {
                            type: 'string',
                            format: 'binary',
                        },
                    },
                },
            }), ApiResponse({
                status: 404,
                description: '文件不存在',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                code: { type: 'number', example: -1 },
                                message: { type: 'string', example: '文件不存在' },
                            },
                        },
                    },
                },
            }), ApiResponse({
                status: 500,
                description: '服务器内部错误',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                code: { type: 'number', example: -1 },
                                message: { type: 'string', example: '获取文件失败' },
                            },
                        },
                    },
                },
            })];
        _getFileHead_decorators = [Head('file/*path'), ApiResponse({
                status: 200,
                description: '成功获取文件信息',
            }), ApiResponse({
                status: 404,
                description: '文件不存在',
            }), ApiResponse({
                status: 500,
                description: '服务器内部错误',
            })];
        _checkThumbnail_decorators = [Get('thumbnail/:nodeId'), UseGuards(JwtAuthGuard), ApiBearerAuth(), ApiResponse({
                status: 200,
                description: '查询成功',
                type: CheckThumbnailResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 404, description: '文件不存在' })];
        _uploadThumbnail_decorators = [Post('thumbnail/:nodeId'), UseGuards(JwtAuthGuard), UseInterceptors(FileInterceptor('file')), ApiBearerAuth(), ApiConsumes('multipart/form-data'), ApiBody({ type: UploadThumbnailDto }), ApiResponse({ status: 200, description: '上传成功', type: UploadThumbnailResponseDto }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 500, description: '上传失败' })];
        _getNonCadFile_decorators = [Get('files/:storageKey'), UseGuards(JwtAuthGuard), ApiBearerAuth(), ApiResponse({
                status: 200, description: '成功获取文件',
                content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
            }), ApiResponse({ status: 404, description: '文件不存在' }), ApiResponse({ status: 500, description: '服务器内部错误' })];
        __esDecorate(_classThis, null, _checkChunkExist_decorators, { kind: "method", name: "checkChunkExist", static: false, private: false, access: { has: obj => "checkChunkExist" in obj, get: obj => obj.checkChunkExist }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkFileExist_decorators, { kind: "method", name: "checkFileExist", static: false, private: false, access: { has: obj => "checkFileExist" in obj, get: obj => obj.checkFileExist }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkDuplicateFile_decorators, { kind: "method", name: "checkDuplicateFile", static: false, private: false, access: { has: obj => "checkDuplicateFile" in obj, get: obj => obj.checkDuplicateFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getPreloadingData_decorators, { kind: "method", name: "getPreloadingData", static: false, private: false, access: { has: obj => "getPreloadingData" in obj, get: obj => obj.getPreloadingData }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkExternalReference_decorators, { kind: "method", name: "checkExternalReference", static: false, private: false, access: { has: obj => "checkExternalReference" in obj, get: obj => obj.checkExternalReference }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _refreshExternalReferences_decorators, { kind: "method", name: "refreshExternalReferences", static: false, private: false, access: { has: obj => "refreshExternalReferences" in obj, get: obj => obj.refreshExternalReferences }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadFile_decorators, { kind: "method", name: "uploadFile", static: false, private: false, access: { has: obj => "uploadFile" in obj, get: obj => obj.uploadFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _saveMxwebToNode_decorators, { kind: "method", name: "saveMxwebToNode", static: false, private: false, access: { has: obj => "saveMxwebToNode" in obj, get: obj => obj.saveMxwebToNode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _saveMxwebAs_decorators, { kind: "method", name: "saveMxwebAs", static: false, private: false, access: { has: obj => "saveMxwebAs" in obj, get: obj => obj.saveMxwebAs }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadExtReferenceDwg_decorators, { kind: "method", name: "uploadExtReferenceDwg", static: false, private: false, access: { has: obj => "uploadExtReferenceDwg" in obj, get: obj => obj.uploadExtReferenceDwg }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadExtReferenceImage_decorators, { kind: "method", name: "uploadExtReferenceImage", static: false, private: false, access: { has: obj => "uploadExtReferenceImage" in obj, get: obj => obj.uploadExtReferenceImage }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getFilesDataFile_decorators, { kind: "method", name: "getFilesDataFile", static: false, private: false, access: { has: obj => "getFilesDataFile" in obj, get: obj => obj.getFilesDataFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getFilesDataFileHead_decorators, { kind: "method", name: "getFilesDataFileHead", static: false, private: false, access: { has: obj => "getFilesDataFileHead" in obj, get: obj => obj.getFilesDataFileHead }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getFile_decorators, { kind: "method", name: "getFile", static: false, private: false, access: { has: obj => "getFile" in obj, get: obj => obj.getFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getFileHead_decorators, { kind: "method", name: "getFileHead", static: false, private: false, access: { has: obj => "getFileHead" in obj, get: obj => obj.getFileHead }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkThumbnail_decorators, { kind: "method", name: "checkThumbnail", static: false, private: false, access: { has: obj => "checkThumbnail" in obj, get: obj => obj.checkThumbnail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadThumbnail_decorators, { kind: "method", name: "uploadThumbnail", static: false, private: false, access: { has: obj => "uploadThumbnail" in obj, get: obj => obj.uploadThumbnail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getNonCadFile_decorators, { kind: "method", name: "getNonCadFile", static: false, private: false, access: { has: obj => "getNonCadFile" in obj, get: obj => obj.getNonCadFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MxCadController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MxCadController = _classThis;
})();
export { MxCadController };
//# sourceMappingURL=mxcad.controller.js.map