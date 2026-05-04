///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
import { FileStore } from '@tus/file-store';
import * as path from 'path';
import * as fs from 'fs';
/**
 * Tus 事件处理器
 *
 * 处理 @tus/server 的上传完成事件（finish）。
 * 在文件上传完成后调用 FileMergeService 进行文件转换和节点创建。
 *
 * 职责：
 * 1. 监听 tus onUploadFinish 事件
 * 2. 获取上传文件信息（文件路径、元数据等）
 * 3. 调用文件转换服务进行格式转换
 * 4. 创建文件系统节点
 * 5. 清理临时文件
 */
let TusEventHandler = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TusEventHandler = _classThis = class {
        constructor(configService, fileSystemService, fileMergeService) {
            this.configService = configService;
            this.fileSystemService = fileSystemService;
            this.fileMergeService = fileMergeService;
            this.logger = new Logger(TusEventHandler.name);
            this.logger.log('TusEventHandler 已初始化');
            this.mxcadUploadPath = this.configService.get('mxcadUploadPath', { infer: true }) || path.join(process.cwd(), 'uploads');
        }
        /**
         * 处理上传完成事件
         * @param uploadId tus 上传 ID
         * @param filePath 上传文件路径
         * @param metadata 上传元数据（文件名、哈希等）
         * @param userId 用户 ID（可选）
         */
        async handleUploadFinish(uploadId, filePath, metadata, userId, userRole) {
            const filename = metadata.filename || 'unknown';
            const fileHash = metadata.fileHash;
            const nodeId = metadata.nodeId;
            const fileSize = metadata.fileSize ? parseInt(metadata.fileSize, 10) : 0;
            this.logger.log(`处理上传完成事件: uploadId=${uploadId}, filename=${filename}, fileHash=${fileHash}, nodeId=${nodeId}, userId=${userId}`);
            try {
                // 从 FileStore 获取实际的文件路径
                const tempPath = this.configService.get('mxcadTempPath', { infer: true });
                const store = new FileStore({ directory: tempPath });
                // 尝试获取实际的文件路径
                let actualFilePath = filePath;
                // 尝试构造 tus file store 的路径
                const possibleTusPath = path.join(tempPath, uploadId);
                if (!actualFilePath || !fs.existsSync(actualFilePath)) {
                    actualFilePath = possibleTusPath;
                }
                if (!fs.existsSync(actualFilePath)) {
                    this.logger.error(`上传文件不存在: ${actualFilePath}`);
                    return;
                }
                this.logger.log(`上传文件路径: ${actualFilePath}`);
                this.logger.log(`上传元数据: ${JSON.stringify(metadata)}`);
                // 将 Tus 上传的文件复制到 uploads 目录，重命名为 fileHash + 扩展名
                let targetFilePath = '';
                if (fileHash) {
                    const ext = path.extname(filename);
                    targetFilePath = path.join(this.mxcadUploadPath, `${fileHash}${ext}`);
                    await fs.promises.copyFile(actualFilePath, targetFilePath);
                    this.logger.log(`文件已复制到: ${targetFilePath}`);
                }
                if (!userId || !nodeId) {
                    this.logger.warn('缺少 userId 或 nodeId，无法继续处理文件转换和节点创建');
                    return;
                }
                // 检查文件是否已存在（秒传逻辑）
                if (fileHash) {
                    const existResult = await this.fileMergeService.performFileExistenceCheck(filename, fileHash, path.extname(filename).toLowerCase().replace('.', ''), '.mxweb', {
                        nodeId,
                        userId,
                        userRole: userRole || '',
                        fileSize,
                        conflictStrategy: metadata.conflictStrategy || 'rename'
                    });
                    if (existResult.ret === 'kFileAlreadyExist') {
                        this.logger.log(`文件已存在，直接返回节点 ID: ${existResult.nodeId}`);
                        return;
                    }
                }
                // 对于 Tus，我们需要创建一个临时的 chunk 目录，并将文件放进去
                // 这样可以复用 FileMergeService 的 mergeConvertFile 逻辑
                const fileMd5 = fileHash || filename;
                const tempDir = this.fileSystemService.getChunkTempDirPath(fileMd5);
                if (!fs.existsSync(tempDir)) {
                    await fs.promises.mkdir(tempDir, { recursive: true });
                }
                // 将文件复制到临时 chunk 目录，模拟 chunk 上传
                const chunkFilePath = path.join(tempDir, '0'); // 单个 chunk
                await fs.promises.copyFile(actualFilePath, chunkFilePath);
                // 调用 FileMergeService 进行合并转换和节点创建
                const mergeResult = await this.fileMergeService.mergeChunksWithPermission({
                    hash: fileMd5,
                    name: filename,
                    size: fileSize,
                    chunks: 1,
                    context: {
                        userId,
                        nodeId,
                        userRole: userRole || '',
                        conflictStrategy: metadata.conflictStrategy || 'rename'
                    }
                });
                this.logger.log(`上传完成处理成功: uploadId=${uploadId}, result=${JSON.stringify(mergeResult)}`);
                // 清理临时文件
                try {
                    await fs.promises.rm(actualFilePath, { force: true });
                    await fs.promises.rmdir(tempDir, { recursive: true });
                    this.logger.log(`临时文件清理成功`);
                }
                catch (cleanError) {
                    this.logger.warn(`临时文件清理失败: ${cleanError.message}`);
                }
            }
            catch (error) {
                this.logger.error(`处理上传完成事件失败: uploadId=${uploadId}, error=${error.message}`, error.stack);
            }
        }
    };
    __setFunctionName(_classThis, "TusEventHandler");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TusEventHandler = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TusEventHandler = _classThis;
})();
export { TusEventHandler };
//# sourceMappingURL=tus-event-handler.service.js.map