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
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { RateLimiter } from '../../common/concurrency/rate-limiter';
import * as path from 'path';
let ChunkUploadManagerService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ChunkUploadManagerService = _classThis = class {
        constructor(configService, fileSystemService, fileMergeService) {
            this.configService = configService;
            this.fileSystemService = fileSystemService;
            this.fileMergeService = fileMergeService;
            this.logger = new Logger(ChunkUploadManagerService.name);
            // 分片上传是 I/O 密集型，可以较高的并发数
            const uploadConfig = this.configService.get('upload', { infer: true });
            const maxConcurrent = uploadConfig?.chunkMaxConcurrent || 5;
            this.uploadRateLimiter = new RateLimiter(maxConcurrent);
            this.logger.log(`分片上传限流器初始化: 最大并发数=${maxConcurrent}`);
        }
        async checkChunkExist(options) {
            const { chunk, hash, size, chunks: totalChunks, name, context } = options;
            this.logger.log(`[checkChunkExist] 开始检查: userId=${context.userId}, nodeId=${context.nodeId}, chunk=${chunk}/${totalChunks}, hash=${hash}, name=${name}, size=${size}`);
            try {
                if (chunk === 0) {
                    const maxSize = 104857600;
                    if (size > maxSize) {
                        this.logger.warn(`[checkChunkExist] 文件大小超过限制: ${size} bytes > ${maxSize} bytes`);
                        return { ret: 'errorparam' };
                    }
                }
                const cbfilename = `${chunk}_${hash}`;
                const tmpDir = this.fileSystemService.getChunkTempDirPath(hash);
                const chunkPath = path.join(tmpDir, cbfilename);
                const chunkExists = await this.fileSystemService.exists(chunkPath);
                if (chunkExists) {
                    const chunkSize = await this.fileSystemService.getFileSize(chunkPath);
                    if (chunkSize !== size) {
                        return { ret: MxUploadReturn.kChunkNoExist };
                    }
                    if (chunk === totalChunks - 1) {
                        this.logger.log(`🔍 最后分片已上传，检查是否需要合并: ${name}`);
                        let allChunksExist = true;
                        for (let i = 0; i < totalChunks; i++) {
                            const eachChunkPath = path.join(tmpDir, `${i}_${hash}`);
                            if (!(await this.fileSystemService.exists(eachChunkPath))) {
                                allChunksExist = false;
                                break;
                            }
                        }
                        if (allChunksExist) {
                            this.logger.log(`✅ 所有分片已存在，等待 uploadChunk 触发合并: ${name}`);
                            return { ret: MxUploadReturn.kChunkAlreadyExist };
                        }
                    }
                    return { ret: MxUploadReturn.kChunkAlreadyExist };
                }
                else {
                    return { ret: MxUploadReturn.kChunkNoExist };
                }
            }
            catch (error) {
                this.logger.error(`检查分片存在性失败: ${error.message}`, error.stack);
                return { ret: MxUploadReturn.kChunkNoExist };
            }
        }
        async uploadChunk(options) {
            const { hash, chunks, name, size, chunk, context } = options;
            return this.uploadRateLimiter.execute(async () => {
                const isLastChunk = chunk + 1 === chunks;
                if (isLastChunk) {
                    this.logger.log(`[uploadChunk] 最后一个分片，触发合并: hash=${hash}`);
                    return this.fileMergeService.mergeConvertFile({
                        hash,
                        chunks,
                        name,
                        size,
                        context,
                    });
                }
                else {
                    this.logger.log(`[uploadChunk] 保存分片: hash=${hash}, chunk=${chunk}`);
                    return { ret: MxUploadReturn.kOk };
                }
            });
        }
    };
    __setFunctionName(_classThis, "ChunkUploadManagerService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ChunkUploadManagerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ChunkUploadManagerService = _classThis;
})();
export { ChunkUploadManagerService };
//# sourceMappingURL=chunk-upload-manager.service.js.map