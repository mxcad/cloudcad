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
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
let ExternalRefService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ExternalRefService = _classThis = class {
        constructor(fileSystemService, fileSystemNodeService, storageManager) {
            this.fileSystemService = fileSystemService;
            this.fileSystemNodeService = fileSystemNodeService;
            this.storageManager = storageManager;
            this.logger = new Logger(ExternalRefService.name);
        }
        async getExternalRefDirName(srcDwgNodeId) {
            try {
                const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);
                if (!sourceNode || !sourceNode.path) {
                    throw new NotFoundException(`源图纸节点不存在: ${srcDwgNodeId}`);
                }
                const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
                const sourceNodeDir = path.dirname(sourceNodePath);
                const preloadingFileName = `${srcDwgNodeId}.dwg.mxweb_preloading.json`;
                const preloadingFilePath = path.join(sourceNodeDir, preloadingFileName);
                if (!(await this.fileSystemService.exists(preloadingFilePath))) {
                    return srcDwgNodeId;
                }
                const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
                const data = JSON.parse(content);
                const srcFileMd5 = data.src_file_md5;
                if (!srcFileMd5) {
                    return srcDwgNodeId;
                }
                return srcFileMd5;
            }
            catch (error) {
                this.logger.error(`[getExternalRefDirName] 读取失败: ${error.message}`, error.stack);
                return srcDwgNodeId;
            }
        }
        async handleExternalReferenceFile(extRefHash, srcDwgNodeId, extRefFileName, srcFilePath) {
            try {
                this.logger.log(`[handleExternalReferenceFile] 开始处理: extRefHash=${extRefHash}, srcDwgNodeId=${srcDwgNodeId}, extRefFileName=${extRefFileName}`);
                const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);
                if (!sourceNode || !sourceNode.path) {
                    throw new NotFoundException(`源图纸节点不存在: ${srcDwgNodeId}`);
                }
                const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
                const sourceNodeDir = path.dirname(sourceNodePath);
                const externalRefDirName = await this.getExternalRefDirName(srcDwgNodeId);
                const externalRefDir = path.join(sourceNodeDir, externalRefDirName);
                if (!(await this.fileSystemService.exists(externalRefDir))) {
                    await fsPromises.mkdir(externalRefDir, { recursive: true });
                }
                const targetFile = path.join(externalRefDir, `${extRefFileName}.mxweb`);
                if (!(await this.fileSystemService.exists(srcFilePath))) {
                    throw new NotFoundException(`转换后的文件不存在: ${srcFilePath}`);
                }
                await fsPromises.copyFile(srcFilePath, targetFile);
                this.logger.log(`[handleExternalReferenceFile] mxweb 文件拷贝成功: ${targetFile}`);
            }
            catch (error) {
                this.logger.error(`[handleExternalReferenceFile] 处理失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async handleExternalReferenceImage(fileHash, srcDwgNodeId, extRefFileName, srcFilePath, context) {
            try {
                this.logger.log(`[handleExternalReferenceImage] 开始处理: srcDwgNodeId=${srcDwgNodeId}, extRefFileName=${extRefFileName}`);
                const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);
                if (!sourceNode || !sourceNode.path) {
                    throw new NotFoundException(`源图纸节点不存在: ${srcDwgNodeId}`);
                }
                const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
                const sourceNodeDir = path.dirname(sourceNodePath);
                const externalRefDirName = await this.getExternalRefDirName(srcDwgNodeId);
                const externalRefDir = path.join(sourceNodeDir, externalRefDirName);
                if (!(await this.fileSystemService.exists(externalRefDir))) {
                    await fsPromises.mkdir(externalRefDir, { recursive: true });
                }
                const targetImageFile = path.join(externalRefDir, extRefFileName);
                await fsPromises.copyFile(srcFilePath, targetImageFile);
                this.logger.log(`[handleExternalReferenceImage] 图片文件拷贝成功: ${targetImageFile}`);
            }
            catch (error) {
                this.logger.error(`[handleExternalReferenceImage] 处理失败: ${error.message}`, error.stack);
                throw error;
            }
        }
    };
    __setFunctionName(_classThis, "ExternalRefService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ExternalRefService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ExternalRefService = _classThis;
})();
export { ExternalRefService };
//# sourceMappingURL=external-ref.service.js.map