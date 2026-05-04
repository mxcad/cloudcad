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
import { Injectable, Logger, NotFoundException, BadRequestException, } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
let UploadUtilityService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var UploadUtilityService = _classThis = class {
        constructor(configService, fileSystemService, fileSystemServiceMain, fileSystemNodeService, storageManager, storageService) {
            this.configService = configService;
            this.fileSystemService = fileSystemService;
            this.fileSystemServiceMain = fileSystemServiceMain;
            this.fileSystemNodeService = fileSystemNodeService;
            this.storageManager = storageManager;
            this.storageService = storageService;
            this.logger = new Logger(UploadUtilityService.name);
            this.mxcadUploadPath =
                this.configService.get('mxcadUploadPath') || '../../uploads';
        }
        async createNonCadNode(originalName, fileHash, fileSize, sourceFilePath, context) {
            try {
                const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);
                if (!parentNode) {
                    throw new NotFoundException(`父节点不存在: ${context.nodeId}`);
                }
                const parentId = parentNode.isFolder
                    ? parentNode.id
                    : parentNode.parentId;
                if (!parentId) {
                    throw new BadRequestException(`无法确定父节点ID: ${context.nodeId}`);
                }
                const extension = path.extname(originalName).toLowerCase();
                const mimeType = this.fileSystemNodeService.getMimeType(extension);
                const newNode = await this.fileSystemServiceMain.createFileNode({
                    name: originalName,
                    fileHash: fileHash,
                    size: fileSize,
                    mimeType,
                    extension,
                    parentId: parentId,
                    ownerId: context.userId,
                    skipFileCopy: true,
                });
                const storageInfo = await this.storageManager.allocateNodeStorage(newNode.id, originalName);
                await this.storageService.copyFromFs(sourceFilePath, storageInfo.fileRelativePath);
                await this.fileSystemServiceMain.updateNodePath(newNode.id, storageInfo.fileRelativePath);
                this.logger.log(`✅ 非CAD文件系统节点创建成功: ${originalName} (${fileHash})`);
            }
            catch (error) {
                this.logger.error(`创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
                throw error;
            }
        }
        async getFileSize(fileHash, filename, targetFile) {
            try {
                const localPath = this.fileSystemService.getMd5Path(targetFile);
                const size = await this.fileSystemService.getFileSize(localPath);
                if (size > 0) {
                    return size;
                }
                const uploadPath = this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
                const allFiles = await this.fileSystemService.readDirectory(uploadPath);
                const relatedFiles = allFiles.filter((file) => file.startsWith(fileHash));
                if (relatedFiles.length > 0) {
                    const firstFile = path.join(uploadPath, relatedFiles[0]);
                    return await this.fileSystemService.getFileSize(firstFile);
                }
                return 0;
            }
            catch (error) {
                this.logger.warn(`获取文件大小失败: ${error.message}`);
                return 0;
            }
        }
        async checkFileExistsInStorage(fileHash, originalFilename) {
            const targetFile = this.getConvertedFileName(fileHash, originalFilename);
            const uploadPath = this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
            const localPath = path.join(uploadPath, targetFile);
            const existsInLocal = fs.existsSync(localPath);
            if (!existsInLocal) {
                return false;
            }
            try {
                const fd = fs.openSync(localPath, 'r');
                const stats = fs.fstatSync(fd);
                fs.closeSync(fd);
                if (stats.size === 0) {
                    return false;
                }
                return true;
            }
            catch (error) {
                return false;
            }
        }
        getConvertedFileName(fileHash, originalFilename) {
            const suffix = originalFilename.substring(originalFilename.lastIndexOf('.') + 1);
            return `${fileHash}.${suffix}.mxweb`;
        }
        async generateUniqueFileName(parentId, baseName) {
            try {
                // 检查是否是文件夹（根据文件名是否有扩展名判断）
                const isFolder = path.extname(baseName) === '';
                // 调用文件系统服务的统一方法生成唯一名称
                return await this.fileSystemServiceMain.generateUniqueName(parentId, baseName, isFolder);
            }
            catch (error) {
                this.logger.error(`[generateUniqueFileName] 生成唯一文件名失败: ${error.message}`, error.stack);
                return baseName;
            }
        }
    };
    __setFunctionName(_classThis, "UploadUtilityService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        UploadUtilityService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return UploadUtilityService = _classThis;
})();
export { UploadUtilityService };
//# sourceMappingURL=upload-utility.service.js.map