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
let FileUploadManagerFacadeService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileUploadManagerFacadeService = _classThis = class {
        constructor(configService, fileConversionService, fileSystemService, fileSystemServiceMain, fileSystemNodeService, cacheManager, storageManager, versionControlService, chunkUploadManagerService, fileMergeService, externalRefService, uploadUtilityService, fileConversionUploadService) {
            this.configService = configService;
            this.fileConversionService = fileConversionService;
            this.fileSystemService = fileSystemService;
            this.fileSystemServiceMain = fileSystemServiceMain;
            this.fileSystemNodeService = fileSystemNodeService;
            this.cacheManager = cacheManager;
            this.storageManager = storageManager;
            this.versionControlService = versionControlService;
            this.chunkUploadManagerService = chunkUploadManagerService;
            this.fileMergeService = fileMergeService;
            this.externalRefService = externalRefService;
            this.uploadUtilityService = uploadUtilityService;
            this.fileConversionUploadService = fileConversionUploadService;
            this.logger = new Logger(FileUploadManagerFacadeService.name);
            this.checkingFiles = new Map();
            this.mxcadUploadPath = this.configService.get('mxcadUploadPath') || '../../uploads';
            this.filesDataPath = this.configService.get('filesDataPath') || '../../filesData';
        }
        async checkChunkExist(options) {
            return this.chunkUploadManagerService.checkChunkExist(options);
        }
        async checkFileExist(filename, fileHash, context) {
            return this.fileConversionUploadService.checkFileExist(filename, fileHash, context);
        }
        async mergeConvertFile(options) {
            return this.fileMergeService.mergeConvertFile(options);
        }
        async uploadChunk(options) {
            return this.chunkUploadManagerService.uploadChunk(options);
        }
        async uploadAndConvertFile(options) {
            return this.fileConversionUploadService.uploadAndConvertFile(options);
        }
        async mergeChunksWithPermission(options) {
            return this.fileMergeService.mergeChunksWithPermission(options);
        }
        async uploadAndConvertFileWithPermission(options) {
            return this.fileConversionUploadService.uploadAndConvertFileWithPermission(options);
        }
        getConvertedFileName(fileHash, originalFilename) {
            return this.uploadUtilityService.getConvertedFileName(fileHash, originalFilename);
        }
        async getExternalRefDirName(srcDwgNodeId) {
            return this.externalRefService.getExternalRefDirName(srcDwgNodeId);
        }
        async handleExternalReferenceFile(extRefHash, srcDwgNodeId, extRefFileName, srcFilePath) {
            return this.externalRefService.handleExternalReferenceFile(extRefHash, srcDwgNodeId, extRefFileName, srcFilePath);
        }
        async handleExternalReferenceImage(fileHash, srcDwgNodeId, extRefFileName, srcFilePath, context) {
            return this.externalRefService.handleExternalReferenceImage(fileHash, srcDwgNodeId, extRefFileName, srcFilePath, context);
        }
    };
    __setFunctionName(_classThis, "FileUploadManagerFacadeService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileUploadManagerFacadeService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileUploadManagerFacadeService = _classThis;
})();
export { FileUploadManagerFacadeService };
//# sourceMappingURL=file-upload-manager-facade.service.js.map