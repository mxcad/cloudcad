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
import { Controller, Post, Get, UseInterceptors, BadRequestException, NotFoundException, Logger, } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiResponse, ApiQuery, } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CheckChunkResponseDto, UploadChunkResponseDto, MergeCompleteResponseDto, CheckFileResponseDto, } from './dto';
import { memoryStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
let PublicFileController = (() => {
    let _classDecorators = [ApiTags('公开文件服务'), Controller('public-file')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _checkChunk_decorators;
    let _checkFile_decorators;
    let _uploadChunk_decorators;
    let _mergeChunks_decorators;
    let _accessFile_decorators;
    let _uploadExtReference_decorators;
    let _checkExtReference_decorators;
    let _getPreloadingData_decorators;
    var PublicFileController = _classThis = class {
        constructor(publicFileService) {
            this.publicFileService = (__runInitializers(this, _instanceExtraInitializers), publicFileService);
            this.logger = new Logger(PublicFileController.name);
        }
        /**
         * 检查分片是否存在
         * POST /api/public-file/chunk/check
         */
        async checkChunk(dto) {
            return this.publicFileService.checkChunk(dto);
        }
        /**
         * 检查文件是否已存在（秒传检查）
         * POST /api/public-file/file/check
         */
        async checkFile(dto) {
            return this.publicFileService.checkFile(dto);
        }
        /**
         * 上传分片
         * POST /api/public-file/chunk/upload
         * 注意：使用内存存储，然后手动保存到正确的分片目录
         * 因为 Multer 的 destination 回调在 req.body 解析之前执行
         */
        async uploadChunk(dto, file) {
            if (!file) {
                throw new BadRequestException('未上传文件');
            }
            // 验证必要参数
            if (!dto.hash || dto.chunk === undefined || !dto.chunks) {
                throw new BadRequestException('缺少必要参数: hash, chunk 或 chunks');
            }
            // 手动保存分片文件到正确的目录
            await this.publicFileService.saveChunk(file.buffer, dto.hash, dto.chunk);
            const isLastChunk = dto.chunk + 1 === dto.chunks;
            this.logger.log(`分片上传成功: hash=${dto.hash}, chunk=${dto.chunk}/${dto.chunks - 1}`);
            return {
                ret: 'success',
                isLastChunk,
            };
        }
        /**
         * 合并分片并获取文件访问信息
         * POST /api/public-file/chunk/merge
         */
        async mergeChunks(dto) {
            this.logger.log(`开始合并分片: hash=${dto.hash}, name=${dto.name}`);
            return this.publicFileService.mergeChunks(dto);
        }
        /**
         * 通过文件哈希访问目录下的文件
         * GET /api/public-file/access/:hash/:filename
         * 返回 uploads/{hash}/{filename}
         */
        async accessFile(hash, filename, res) {
            const filePath = await this.publicFileService.findFileInDir(hash, filename);
            if (!filePath) {
                throw new NotFoundException('文件不存在');
            }
            this.logger.log(`文件访问: hash=${hash}, filename=${filename}, path=${filePath}`);
            try {
                const fileStats = fs.statSync(filePath);
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Length', fileStats.size);
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('Access-Control-Allow-Origin', '*');
                const fileStream = fs.createReadStream(filePath);
                fileStream.pipe(res);
                fileStream.on('error', (error) => {
                    this.logger.error(`文件流错误: ${error.message}`, error);
                    if (!res.headersSent) {
                        res.status(500).json({ code: -1, message: '获取文件失败' });
                    }
                });
            }
            catch (error) {
                this.logger.error(`访问文件失败: ${error.message}`, error.stack);
                if (!res.headersSent) {
                    throw new NotFoundException('文件不存在或已被删除');
                }
            }
        }
        /**
         * 上传外部参照文件（公开接口，无需认证）
         * POST /api/public-file/ext-reference/upload
         * 外部参照文件存储在主图纸的 hash 目录下
         */
        async uploadExtReference(dto, file) {
            if (!file) {
                throw new BadRequestException('未上传文件');
            }
            if (!dto.srcFileHash) {
                throw new BadRequestException('缺少源图纸哈希值');
            }
            if (!dto.extRefFile) {
                throw new BadRequestException('缺少外部参照文件名');
            }
            this.logger.log(`[uploadExtReference] 开始处理: srcHash=${dto.srcFileHash}, extRefFile=${dto.extRefFile}, size=${file.size}`);
            return this.publicFileService.uploadExtReference(file.buffer, dto.srcFileHash, dto.extRefFile, dto.hash);
        }
        /**
         * 检查外部参照文件是否存在
         * GET /api/public-file/ext-reference/check?srcHash=xxx&fileName=xxx
         */
        async checkExtReference(srcHash, fileName) {
            if (!srcHash) {
                throw new BadRequestException('缺少源图纸哈希值');
            }
            if (!fileName) {
                throw new BadRequestException('缺少外部参照文件名');
            }
            const exists = await this.publicFileService.checkExtReferenceExists(srcHash, fileName);
            this.logger.log(`[checkExtReference] 检查结果: srcHash=${srcHash}, fileName=${fileName}, exists=${exists}`);
            return { exists };
        }
        /**
         * 获取预加载数据（包含外部参照信息）
         * GET /api/public-file/preloading/:hash
         */
        async getPreloadingData(hash) {
            if (!hash) {
                throw new BadRequestException('缺少文件哈希值');
            }
            const data = await this.publicFileService.getPreloadingData(hash);
            if (!data) {
                this.logger.log(`[getPreloadingData] 预加载数据不存在: hash=${hash}`);
                return null;
            }
            this.logger.log(`[getPreloadingData] 预加载数据返回: hash=${hash}`);
            return data;
        }
    };
    __setFunctionName(_classThis, "PublicFileController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _checkChunk_decorators = [Post('chunk/check'), Public(), ApiOperation({ summary: '检查分片是否存在' }), ApiResponse({
                status: 200,
                description: '返回分片存在状态',
                type: CheckChunkResponseDto,
            })];
        _checkFile_decorators = [Post('file/check'), Public(), ApiOperation({ summary: '检查文件是否已存在（秒传检查）' }), ApiResponse({
                status: 200,
                description: '返回文件存在状态',
                type: CheckFileResponseDto,
            })];
        _uploadChunk_decorators = [Post('chunk/upload'), Public(), ApiOperation({ summary: '上传分片' }), ApiConsumes('multipart/form-data'), ApiResponse({
                status: 200,
                description: '上传成功',
                type: UploadChunkResponseDto,
            }), UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))];
        _mergeChunks_decorators = [Post('chunk/merge'), Public(), ApiOperation({ summary: '合并分片并获取文件访问信息' }), ApiResponse({
                status: 200,
                description: '合并成功，返回文件信息',
                type: MergeCompleteResponseDto,
            })];
        _accessFile_decorators = [Get('access/:hash/:filename'), Public(), ApiOperation({ summary: '通过文件哈希访问目录下的文件' }), ApiResponse({
                status: 200,
                description: '返回文件二进制数据',
                content: { 'application/octet-stream': {} },
            }), ApiResponse({ status: 404, description: '文件不存在' })];
        _uploadExtReference_decorators = [Post('ext-reference/upload'), Public(), ApiOperation({ summary: '上传外部参照文件（公开接口）' }), ApiConsumes('multipart/form-data'), ApiResponse({
                status: 200,
                description: '上传成功',
                schema: {
                    type: 'object',
                    properties: {
                        ret: { type: 'string', example: 'ok' },
                        hash: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            }), ApiResponse({ status: 400, description: '请求参数错误' }), UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))];
        _checkExtReference_decorators = [Get('ext-reference/check'), Public(), ApiOperation({ summary: '检查外部参照文件是否存在' }), ApiQuery({
                name: 'srcHash',
                description: '源图纸文件的哈希值',
                required: true,
            }), ApiQuery({ name: 'fileName', description: '外部参照文件名', required: true }), ApiResponse({
                status: 200,
                description: '返回文件存在状态',
                schema: {
                    type: 'object',
                    properties: {
                        exists: { type: 'boolean' },
                    },
                },
            })];
        _getPreloadingData_decorators = [Get('preloading/:hash'), Public(), ApiOperation({ summary: '获取预加载数据（包含外部参照信息）' }), ApiResponse({
                status: 200,
                description: '返回预加载数据',
            }), ApiResponse({ status: 404, description: '预加载数据不存在' })];
        __esDecorate(_classThis, null, _checkChunk_decorators, { kind: "method", name: "checkChunk", static: false, private: false, access: { has: obj => "checkChunk" in obj, get: obj => obj.checkChunk }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkFile_decorators, { kind: "method", name: "checkFile", static: false, private: false, access: { has: obj => "checkFile" in obj, get: obj => obj.checkFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadChunk_decorators, { kind: "method", name: "uploadChunk", static: false, private: false, access: { has: obj => "uploadChunk" in obj, get: obj => obj.uploadChunk }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _mergeChunks_decorators, { kind: "method", name: "mergeChunks", static: false, private: false, access: { has: obj => "mergeChunks" in obj, get: obj => obj.mergeChunks }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _accessFile_decorators, { kind: "method", name: "accessFile", static: false, private: false, access: { has: obj => "accessFile" in obj, get: obj => obj.accessFile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadExtReference_decorators, { kind: "method", name: "uploadExtReference", static: false, private: false, access: { has: obj => "uploadExtReference" in obj, get: obj => obj.uploadExtReference }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkExtReference_decorators, { kind: "method", name: "checkExtReference", static: false, private: false, access: { has: obj => "checkExtReference" in obj, get: obj => obj.checkExtReference }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getPreloadingData_decorators, { kind: "method", name: "getPreloadingData", static: false, private: false, access: { has: obj => "getPreloadingData" in obj, get: obj => obj.getPreloadingData }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PublicFileController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PublicFileController = _classThis;
})();
export { PublicFileController };
//# sourceMappingURL=public-file.controller.js.map