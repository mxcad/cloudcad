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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger } from '@nestjs/common';
import path from 'path';
import { FileTypeDetector } from '../utils/file-type-detector';
/**
 * 上传编排器
 *
 * 职责：
 * 1. 编排文件上传的完整流程
 * 2. 协调各个子服务的调用
 * 3. 处理上传流程中的异常
 * 4. 提供统一的上传接口
 */
let UploadOrchestrator = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var UploadOrchestrator = _classThis = class {
        constructor(chunkUploadService, fileCheckService, nodeCreationService, fileConversionService, concurrencyManager) {
            this.chunkUploadService = chunkUploadService;
            this.fileCheckService = fileCheckService;
            this.nodeCreationService = nodeCreationService;
            this.fileConversionService = fileConversionService;
            this.concurrencyManager = concurrencyManager;
            this.logger = new Logger(UploadOrchestrator.name);
        }
        /**
         * 处理分片上传
         *
         * @param options 分片上传选项
         * @returns 上传结果
         */
        async handleChunkUpload(options) {
            try {
                const { hash, chunk, chunkData, size } = options;
                this.logger.debug(`处理分片上传: hash=${hash}, chunk=${chunk}, size=${size}`);
                // 验证分片数据路径
                if (!chunkData || typeof chunkData !== 'string') {
                    return {
                        success: false,
                        errorMessage: '分片数据路径无效',
                    };
                }
                // 上传分片
                const uploadSuccess = await this.chunkUploadService.uploadChunk(chunkData);
                if (!uploadSuccess) {
                    return {
                        success: false,
                        errorMessage: '分片上传失败',
                    };
                }
                this.logger.log(`分片上传成功: hash=${hash}, chunk=${chunk}`);
                return { success: true };
            }
            catch (error) {
                this.logger.error(`处理分片上传失败: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message || '分片上传失败',
                };
            }
        }
        /**
         * 处理文件上传（非分片）
         *
         * @param options 文件上传选项
         * @returns 上传结果
         */
        async handleFileUpload(options) {
            try {
                const { hash, name, size, mimeType, context } = options;
                this.logger.debug(`处理文件上传: hash=${hash}, name=${name}, size=${size}`);
                // 检查文件是否已存在
                const fileExists = await this.fileCheckService.checkFileExists(hash, name);
                if (fileExists) {
                    this.logger.log(`文件已存在，跳过上传: ${name} (${hash})`);
                    return { success: true };
                }
                // 创建文件系统节点
                const extension = this.getFileExtension(name);
                const createOptions = {
                    name,
                    fileHash: hash,
                    size,
                    mimeType: mimeType || this.getMimeType(name),
                    extension,
                    parentId: context.nodeId,
                    ownerId: context.userId,
                    skipFileCopy: true, // 文件已由调用者处理，无需复制
                };
                const createResult = await this.nodeCreationService.createNode(createOptions);
                if (!createResult.success) {
                    return {
                        success: false,
                        errorMessage: createResult.errorMessage || '创建节点失败',
                    };
                }
                this.logger.log(`文件上传成功: ${name} (${hash}), nodeId=${createResult.nodeId}`);
                return {
                    success: true,
                    nodeId: createResult.nodeId,
                };
            }
            catch (error) {
                this.logger.error(`处理文件上传失败: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message || '文件上传失败',
                };
            }
        }
        /**
         * 处理合并请求
         *
         * @param options 合并请求选项
         * @returns 上传结果
         */
        async handleMergeRequest(options) {
            const { hash, name, size, chunks, context } = options;
            this.logger.debug(`处理合并请求: hash=${hash}, name=${name}, size=${size}, chunks=${chunks}`);
            // 使用并发控制执行合并流程
            const result = await this.concurrencyManager.acquireLock(`merge:${hash}`, async () => {
                return await this.performMerge(options);
            });
            if (result === null) {
                return {
                    success: false,
                    errorMessage: '合并请求失败：无法获取锁',
                };
            }
            return result;
        }
        /**
         * 检查分片是否存在
         *
         * @param options 分片存在检查选项
         * @returns 上传结果
         */
        async checkChunkExists(options) {
            try {
                const { hash, chunk } = options;
                this.logger.debug(`检查分片存在: hash=${hash}, chunk=${chunk}`);
                const exists = await this.chunkUploadService.checkChunkExists(hash, chunk);
                this.logger.debug(`分片存在检查结果: hash=${hash}, chunk=${chunk}, exists=${exists}`);
                return { success: true };
            }
            catch (error) {
                this.logger.error(`检查分片存在失败: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message || '检查分片存在失败',
                };
            }
        }
        /**
         * 检查文件是否存在
         *
         * @param filename 文件名
         * @param fileHash 文件哈希值
         * @param context 上传上下文
         * @returns 上传结果
         */
        async checkFileExists(filename, fileHash, context) {
            try {
                this.logger.debug(`检查文件存在: filename=${filename}, hash=${fileHash}`);
                const exists = await this.fileCheckService.checkFileExists(fileHash, filename);
                this.logger.debug(`文件存在检查结果: filename=${filename}, hash=${fileHash}, exists=${exists}`);
                return { success: true };
            }
            catch (error) {
                this.logger.error(`检查文件存在失败: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message || '检查文件存在失败',
                };
            }
        }
        /**
         * 执行实际的合并操作
         *
         * @param options 合并请求选项
         * @returns 上传结果
         */
        async performMerge(options) {
            const { hash, name, size, chunks, context } = options;
            try {
                // 生成临时文件路径
                const tempPath = this.chunkUploadService.getChunkTempDirPath(hash);
                const tempFilePath = path.join(tempPath, `${hash}${path.extname(name)}`);
                // 合并分片
                const mergeOptions = {
                    hash,
                    name,
                    size,
                    chunks,
                    targetPath: tempFilePath,
                };
                const mergeSuccess = await this.chunkUploadService.mergeChunks(mergeOptions);
                if (!mergeSuccess) {
                    return {
                        success: false,
                        errorMessage: '合并分片失败',
                    };
                }
                this.logger.log(`分片合并成功: ${name} (${hash})`);
                // 检查文件是否已存在
                const fileExists = await this.fileCheckService.checkFileExists(hash, name);
                let nodeId;
                if (fileExists) {
                    // 文件已存在，引用现有节点
                    const referenceContext = {
                        hash,
                        context: this.convertUploadContextToNodeCreationContext(context),
                    };
                    const referenceResult = await this.nodeCreationService.referenceNode(hash, referenceContext);
                    if (!referenceResult.success) {
                        return {
                            success: false,
                            errorMessage: referenceResult.errorMessage || '引用节点失败',
                        };
                    }
                    nodeId = referenceResult.nodeId;
                    this.logger.log(`引用现有节点成功: ${name} (${hash}), nodeId=${nodeId}`);
                }
                else {
                    // 创建新节点
                    const extension = this.getFileExtension(name);
                    const createOptions = {
                        name,
                        fileHash: hash,
                        size,
                        mimeType: this.getMimeType(name),
                        extension,
                        parentId: context.nodeId,
                        ownerId: context.userId,
                        sourceFilePath: tempFilePath,
                        skipFileCopy: false,
                    };
                    const createResult = await this.nodeCreationService.createNode(createOptions);
                    if (!createResult.success) {
                        return {
                            success: false,
                            errorMessage: createResult.errorMessage || '创建节点失败',
                        };
                    }
                    nodeId = createResult.nodeId;
                    this.logger.log(`创建新节点成功: ${name} (${hash}), nodeId=${nodeId}`);
                }
                // 转换文件（如果需要）
                // MXWeb 文件不需要转换，直接跳过
                if (!FileTypeDetector.isMxwebFile(name) && this.fileConversionService.needsConversion(name)) {
                    const convertedExt = this.fileConversionService.getConvertedExtension(name);
                    const convertedPath = path.join(path.dirname(tempFilePath), `${hash}${convertedExt}`);
                    const conversionOptions = {
                        srcPath: tempFilePath,
                        fileHash: hash,
                        createPreloadingData: true,
                    };
                    const conversionResult = await this.fileConversionService.convertFile(conversionOptions);
                    if (!conversionResult.isOk) {
                        this.logger.warn(`文件转换失败: ${name} (${hash}), error=${conversionResult.error}`);
                        // 转换失败不影响上传结果，文件仍可用
                    }
                    else {
                        this.logger.log(`文件转换成功: ${name} (${hash})`);
                    }
                }
                else if (FileTypeDetector.isMxwebFile(name)) {
                    this.logger.log(`MXWeb 文件跳过转换步骤: ${name} (${hash})`);
                }
                // 清理临时目录
                await this.chunkUploadService.cleanupTempDirectory(hash);
                this.logger.log(`合并流程完成: ${name} (${hash}), nodeId=${nodeId}`);
                return {
                    success: true,
                    nodeId,
                };
            }
            catch (error) {
                this.logger.error(`执行合并操作失败: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message || '合并操作失败',
                };
            }
        }
        /**
         * 获取文件扩展名
         *
         * @param filename 文件名
         * @returns 文件扩展名（包含点）
         */
        getFileExtension(filename) {
            const ext = path.extname(filename);
            return ext || '';
        }
        /**
         * 获取 MIME 类型
         *
         * @param filename 文件名
         * @returns MIME 类型
         */
        getMimeType(filename) {
            const ext = this.getFileExtension(filename).toLowerCase();
            const mimeTypes = {
                '.dwg': 'application/acad',
                '.dxf': 'application/dxf',
                '.pdf': 'application/pdf',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
            };
            return mimeTypes[ext] || 'application/octet-stream';
        }
        /**
         * 将 UploadContext 转换为 NodeCreationContext
         */
        convertUploadContextToNodeCreationContext(uploadContext) {
            return {
                nodeId: uploadContext.nodeId,
                userId: uploadContext.userId,
                userRole: uploadContext.userRole,
                srcDwgNodeId: uploadContext.srcDwgNodeId,
                isImage: uploadContext.isImage,
            };
        }
    };
    __setFunctionName(_classThis, "UploadOrchestrator");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        UploadOrchestrator = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return UploadOrchestrator = _classThis;
})();
export { UploadOrchestrator };
//# sourceMappingURL=upload.orchestrator.js.map