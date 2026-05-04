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
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { FileTypeDetector } from '../utils/file-type-detector';
async function copyFileOrDir(sourcePath, targetPath, options) {
    const stat = await fsPromises.stat(sourcePath);
    if (stat.isDirectory()) {
        await fsPromises.cp(sourcePath, targetPath, { recursive: true });
    }
    else {
        let finalTargetPath = targetPath;
        if (options?.fileHash && options?.newNodeId) {
            const fileName = path.basename(sourcePath);
            const replacedFileName = fileName.replace(options.fileHash, options.newNodeId);
            finalTargetPath = path.join(path.dirname(targetPath), replacedFileName);
        }
        await fsPromises.copyFile(sourcePath, finalTargetPath);
    }
}
let FileConversionUploadService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileConversionUploadService = _classThis = class {
        constructor(configService, fileSystemService, fileSystemServiceMain, fileSystemNodeService, cacheManager, storageManager, versionControlService, fileConversionService, externalReferenceUpdateService, externalRefService, uploadUtilityService, fileMergeService, thumbnailGenerationService, storageService) {
            this.configService = configService;
            this.fileSystemService = fileSystemService;
            this.fileSystemServiceMain = fileSystemServiceMain;
            this.fileSystemNodeService = fileSystemNodeService;
            this.cacheManager = cacheManager;
            this.storageManager = storageManager;
            this.versionControlService = versionControlService;
            this.fileConversionService = fileConversionService;
            this.externalReferenceUpdateService = externalReferenceUpdateService;
            this.externalRefService = externalRefService;
            this.uploadUtilityService = uploadUtilityService;
            this.fileMergeService = fileMergeService;
            this.thumbnailGenerationService = thumbnailGenerationService;
            this.storageService = storageService;
            this.logger = new Logger(FileConversionUploadService.name);
            this.checkingFiles = new Map();
            this.mxcadUploadPath =
                this.configService.get('mxcadUploadPath') || '../../uploads';
            this.filesDataPath =
                this.configService.get('filesDataPath') || '../../filesData';
        }
        async uploadAndConvertFile(options) {
            const { filePath, hash, name, size, context } = options;
            try {
                await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
                const { isOk, ret } = await this.fileConversionService.convertFile({
                    srcPath: filePath,
                    fileHash: hash,
                    createPreloadingData: true,
                });
                if (isOk) {
                    await this.handleFileNodeCreation(name, hash, size, context);
                    return { ret: MxUploadReturn.kOk, tz: ret?.tz };
                }
                else {
                    return { ret: MxUploadReturn.kConvertFileError };
                }
            }
            catch (error) {
                this.logger.error(`上传并转换文件失败: ${error.message}`, error.stack);
                return { ret: MxUploadReturn.kConvertFileError };
            }
        }
        async uploadAndConvertFileWithPermission(options) {
            const { filePath, hash, name, size, context } = options;
            const fileExists = await this.uploadUtilityService.checkFileExistsInStorage(hash, name);
            if (fileExists) {
                this.logger.log(`[uploadAndConvertFileWithPermission] 文件已存在，执行秒传: ${name}`);
                // 外部参照上传：跳过创建数据库节点和存储分配，直接处理外部参照文件
                if (context.srcDwgNodeId) {
                    this.logger.log(`[uploadAndConvertFileWithPermission] 外部参照文件已存在，跳过创建节点和存储分配: ${name}`);
                    try {
                        const uploadPath = this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
                        const targetFile = path.join(uploadPath, this.uploadUtilityService.getConvertedFileName(hash, name));
                        if (!context.isImage) {
                            await this.externalRefService.handleExternalReferenceFile(hash, context.srcDwgNodeId, name, targetFile);
                        }
                        else {
                            await this.externalRefService.handleExternalReferenceImage(hash, context.srcDwgNodeId, name, targetFile, context);
                        }
                    }
                    catch (extRefError) {
                        this.logger.error(`外部参照文件拷贝失败: ${extRefError.message}`);
                    }
                    return { ret: MxUploadReturn.kFileAlreadyExist };
                }
                // 普通图纸上传：创建数据库节点和存储分配
                if (context && context.userId && context.nodeId) {
                    const extension = path.extname(name).toLowerCase();
                    const mimeType = this.fileSystemNodeService.getMimeType(extension);
                    const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);
                    if (!parentNode) {
                        return { ret: MxUploadReturn.kConvertFileError };
                    }
                    const parentId = parentNode.isFolder
                        ? parentNode.id
                        : parentNode.parentId;
                    if (!parentId) {
                        return { ret: MxUploadReturn.kConvertFileError };
                    }
                    const uploadPath = this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
                    const newNode = await this.fileSystemServiceMain.createFileNode({
                        name: name,
                        fileHash: hash,
                        size: size,
                        mimeType,
                        extension,
                        parentId: parentId,
                        ownerId: context.userId,
                        skipFileCopy: true,
                    });
                    const newNodeId = newNode.id;
                    const storageInfo = await this.storageManager.allocateNodeStorage(newNodeId, name);
                    const files = await fsPromises.readdir(uploadPath);
                    const matchingFiles = files.filter((file) => file.startsWith(hash));
                    if (matchingFiles.length > 0) {
                        const nodeDirectory = storageInfo.nodeDirectoryPath;
                        let mxwebFileName = '';
                        for (const file of matchingFiles) {
                            const sourcePath = path.join(uploadPath, file);
                            const targetFileName = file.replace(hash, newNodeId);
                            const targetPath = path.join(nodeDirectory, targetFileName);
                            await copyFileOrDir(sourcePath, targetPath, {
                                fileHash: hash,
                                newNodeId,
                            });
                            if (targetFileName.endsWith('.mxweb')) {
                                mxwebFileName = targetFileName;
                            }
                        }
                        if (mxwebFileName) {
                            const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`;
                            await this.fileSystemServiceMain.updateNodePath(newNodeId, nodePathWithFile);
                        }
                        else {
                            const expectedMxwebFileName = `${newNodeId}${extension}.mxweb`;
                            const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${expectedMxwebFileName}`;
                            await this.fileSystemServiceMain.updateNodePath(newNodeId, nodePathWithFile);
                        }
                    }
                    // 注意：公开资源库上传不需要提交 SVN
                    if (!context.isLibrary) {
                        try {
                            const nodeDirectory = storageInfo.nodeDirectoryPath;
                            await this.versionControlService.commitNodeDirectory(nodeDirectory, `Fast upload file: ${name}`, context.userId, `User${context.userId}`);
                        }
                        catch (svnError) {
                            this.logger.error(`[uploadAndConvertFileWithPermission] SVN 提交异常`, svnError.stack);
                        }
                    }
                    return { ret: MxUploadReturn.kFileAlreadyExist, nodeId: newNodeId };
                }
                else {
                    return { ret: MxUploadReturn.kConvertFileError };
                }
            }
            const uploadPath = this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
            const targetFile = path.join(uploadPath, this.uploadUtilityService.getConvertedFileName(hash, name));
            if (FileTypeDetector.isMxwebFile(name)) {
                this.logger.log(`检测到 MXWeb 文件，直接复制到节点目录: ${name}`);
                try {
                    const fileSize = await this.fileSystemService.getFileSize(filePath);
                    if (context && context.userId && context.nodeId) {
                        const extension = path.extname(name).toLowerCase();
                        const mimeType = this.fileSystemNodeService.getMimeType(extension);
                        const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);
                        if (!parentNode) {
                            return { ret: MxUploadReturn.kConvertFileError };
                        }
                        const parentId = parentNode.isFolder
                            ? parentNode.id
                            : parentNode.parentId;
                        if (!parentId) {
                            return { ret: MxUploadReturn.kConvertFileError };
                        }
                        const newNode = await this.fileSystemServiceMain.createFileNode({
                            name: name,
                            fileHash: hash,
                            size: fileSize,
                            mimeType,
                            extension,
                            parentId: parentId,
                            ownerId: context.userId,
                            skipFileCopy: true,
                        });
                        const newNodeId = newNode.id;
                        const mxwebFileName = `${newNodeId}.mxweb`;
                        const storageInfo = await this.storageManager.allocateNodeStorage(newNodeId, mxwebFileName);
                        await this.storageService.copyFromFs(filePath, storageInfo.fileRelativePath);
                        await this.fileSystemServiceMain.updateNodePath(newNodeId, storageInfo.fileRelativePath);
                        if (!context.isLibrary) {
                            try {
                                const nodeDirectory = storageInfo.nodeDirectoryPath;
                                await this.versionControlService.commitNodeDirectory(nodeDirectory, `Upload MXWeb file: ${mxwebFileName}`, context.userId, `User${context.userId}`);
                            }
                            catch (svnError) {
                                this.logger.error(`[uploadAndConvertFileWithPermission] MXWeb SVN 提交异常`, svnError.stack);
                            }
                        }
                        return { ret: MxUploadReturn.kOk, nodeId: newNodeId };
                    }
                    else {
                        return { ret: MxUploadReturn.kConvertFileError };
                    }
                }
                catch (error) {
                    this.logger.error(`MXWeb 文件上传失败: ${error.message}`, error.stack);
                    return { ret: MxUploadReturn.kConvertFileError };
                }
            }
            if (this.fileConversionService.needsConversion(name)) {
                this.logger.log(`检测到CAD文件，执行转换流程: ${name}`);
                await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
                const { isOk, ret } = await this.fileConversionService.convertFile({
                    srcPath: filePath,
                    fileHash: hash,
                    createPreloadingData: true,
                });
                if (isOk) {
                    // 外部参照上传：跳过创建数据库节点和存储分配，直接处理外部参照文件
                    if (context.srcDwgNodeId && !context.isImage) {
                        this.logger.log(`[uploadAndConvertFileWithPermission] 外部参照 DWG 文件上传，跳过创建节点和存储分配: ${name}`);
                        try {
                            const convertedFilePath = path.join(uploadPath, this.uploadUtilityService.getConvertedFileName(hash, name));
                            await this.externalRefService.handleExternalReferenceFile(hash, context.srcDwgNodeId, name, convertedFilePath);
                        }
                        catch (error) {
                            this.logger.error(`外部参照文件拷贝失败: ${error.message}`, error.stack);
                        }
                    }
                    else {
                        // 普通图纸上传：创建数据库节点和存储分配
                        await this.handleFileNodeCreation(name, hash, size, context);
                    }
                    return { ret: MxUploadReturn.kOk, tz: ret?.tz };
                }
                else {
                    return { ret: MxUploadReturn.kConvertFileError };
                }
            }
            else {
                this.logger.log(`检测到非CAD文件，直接拷贝到本地存储: ${name}`);
                try {
                    const fileSize = await this.fileSystemService.getFileSize(filePath);
                    if (context && context.userId && context.nodeId) {
                        const extension = path.extname(name).toLowerCase();
                        const mimeType = this.fileSystemNodeService.getMimeType(extension);
                        const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);
                        if (!parentNode) {
                            return { ret: MxUploadReturn.kConvertFileError };
                        }
                        const parentId = parentNode.isFolder
                            ? parentNode.id
                            : parentNode.parentId;
                        if (!parentId) {
                            return { ret: MxUploadReturn.kConvertFileError };
                        }
                        const newNode = await this.fileSystemServiceMain.createFileNode({
                            name: name,
                            fileHash: hash,
                            size: fileSize,
                            mimeType,
                            extension,
                            parentId: parentId,
                            ownerId: context.userId,
                            skipFileCopy: true,
                        });
                        const newNodeId = newNode.id;
                        const storageInfo = await this.storageManager.allocateNodeStorage(newNodeId, name);
                        await this.storageService.copyFromFs(filePath, storageInfo.fileRelativePath);
                        await this.fileSystemServiceMain.updateNodePath(newNodeId, storageInfo.fileRelativePath);
                        if (context.srcDwgNodeId && context.isImage) {
                            try {
                                await this.externalRefService.handleExternalReferenceImage(hash, context.srcDwgNodeId, name, filePath, context);
                            }
                            catch (error) {
                                this.logger.error(`外部参照图片文件拷贝失败: ${error.message}`, error.stack);
                            }
                        }
                        return { ret: MxUploadReturn.kOk };
                    }
                    else {
                        return { ret: MxUploadReturn.kConvertFileError };
                    }
                }
                catch (error) {
                    this.logger.error(`非CAD文件上传失败: ${error.message}`, error.stack);
                    return { ret: MxUploadReturn.kConvertFileError };
                }
            }
        }
        async checkFileExist(filename, fileHash, context) {
            try {
                const suffix = filename.substring(filename.lastIndexOf('.') + 1);
                const convertedExt = this.fileConversionService.getConvertedExtension(filename);
                const checkKey = `${fileHash}.${suffix}`;
                if (this.checkingFiles.has(checkKey)) {
                    return await this.checkingFiles.get(checkKey);
                }
                const checkPromise = this.fileMergeService.performFileExistenceCheck(filename, fileHash, suffix, convertedExt, context);
                this.checkingFiles.set(checkKey, checkPromise);
                try {
                    const result = await checkPromise;
                    return result;
                }
                finally {
                    this.checkingFiles.delete(checkKey);
                }
            }
            catch (error) {
                this.logger.error(`检查文件存在性失败: ${error.message}`, error.stack);
                return { ret: MxUploadReturn.kFileNoExist };
            }
        }
        async handleFileNodeCreation(originalName, fileHash, fileSize, context) {
            if (!context.nodeId) {
                this.logger.warn('⚠️ 缺少节点ID，无法创建文件系统节点。');
                return;
            }
            try {
                const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);
                if (!parentNode) {
                    this.logger.error(`[handleFileNodeCreation] 父节点不存在: ${context.nodeId}`);
                    return;
                }
                const parentId = parentNode.isFolder
                    ? parentNode.id
                    : parentNode.parentId;
                if (!parentId) {
                    this.logger.error(`[handleFileNodeCreation] 无法确定父节点ID: ${context.nodeId}`);
                    return;
                }
                const uploadPath = this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
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
                const files = await fsPromises.readdir(uploadPath);
                const matchingFiles = files.filter((file) => file.startsWith(fileHash));
                if (matchingFiles.length > 0) {
                    const nodeDirectory = storageInfo.nodeDirectoryPath;
                    let mxwebFileName = '';
                    for (const file of matchingFiles) {
                        const sourcePath = path.join(uploadPath, file);
                        const targetFileName = file.replace(fileHash, newNode.id);
                        const targetPath = path.join(nodeDirectory, targetFileName);
                        await fsPromises.copyFile(sourcePath, targetPath);
                        if (targetFileName.endsWith('.mxweb')) {
                            mxwebFileName = targetFileName;
                        }
                    }
                    if (mxwebFileName) {
                        const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`;
                        await this.fileSystemServiceMain.updateNodePath(newNode.id, nodePathWithFile);
                    }
                    else {
                        const expectedMxwebFileName = `${newNode.id}${extension}.mxweb`;
                        const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${expectedMxwebFileName}`;
                        await this.fileSystemServiceMain.updateNodePath(newNode.id, nodePathWithFile);
                    }
                    // 自动生成缩略图（仅当存在 mxweb 文件时）
                    if (mxwebFileName) {
                        try {
                            const filesDataPath = this.filesDataPath || path.join(process.cwd(), 'filesData');
                            const nodeDir = storageInfo.nodeDirectoryPath;
                            const mxwebPath = path.join(nodeDir, mxwebFileName);
                            // 检查缩略图生成功能是否启用
                            if (this.thumbnailGenerationService.isEnabled()) {
                                this.logger.log(`[handleFileNodeCreation] 开始自动生成缩略图: ${newNode.id}`);
                                const result = await this.thumbnailGenerationService.generateThumbnail(mxwebPath, nodeDir, newNode.id);
                                if (result.success) {
                                    this.logger.log(`[handleFileNodeCreation] 缩略图生成成功: ${result.thumbnailPath}`);
                                }
                                else {
                                    this.logger.warn(`[handleFileNodeCreation] 缩略图生成失败: ${result.error}`);
                                }
                            }
                        }
                        catch (thumbnailError) {
                            // 缩略图生成失败不影响主流程
                            this.logger.warn(`[handleFileNodeCreation] 缩略图生成异常: ${thumbnailError.message}`);
                        }
                    }
                }
                // 注意：公开资源库上传不需要提交 SVN
                if (!context.isLibrary) {
                    try {
                        const nodeDirectory = storageInfo.nodeDirectoryPath;
                        await this.versionControlService.commitNodeDirectory(nodeDirectory, `Upload file: ${originalName}`, context.userId, `User${context.userId}`);
                    }
                    catch (svnError) {
                        this.logger.error(`[handleFileNodeCreation] SVN 提交异常`, svnError.stack);
                    }
                }
                try {
                    await this.externalReferenceUpdateService.updateAfterUpload(context.nodeId);
                }
                catch (extRefError) {
                    this.logger.warn(`⚠️ 外部参照信息更新失败: ${extRefError.message}`);
                }
            }
            catch (error) {
                this.logger.error(`创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
            }
        }
    };
    __setFunctionName(_classThis, "FileConversionUploadService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileConversionUploadService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileConversionUploadService = _classThis;
})();
export { FileConversionUploadService };
//# sourceMappingURL=file-conversion-upload.service.js.map