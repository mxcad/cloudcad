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
import { Injectable, Logger, BadRequestException, InternalServerErrorException, } from '@nestjs/common';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { FileUtils } from '../../common/utils/file-utils';
/**
 * 公开文件上传服务
 * 提供无需认证的分片上传功能
 * 复用 MxCadModule 的图纸转换和秒传逻辑
 */
let PublicFileUploadService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PublicFileUploadService = _classThis = class {
        constructor(configService, concurrencyManager, fileConversionService, fileSystemService) {
            this.configService = configService;
            this.concurrencyManager = concurrencyManager;
            this.fileConversionService = fileConversionService;
            this.fileSystemService = fileSystemService;
            this.logger = new Logger(PublicFileUploadService.name);
            this.tempPath = this.configService.get('mxcadTempPath', { infer: true });
            this.uploadPath = this.configService.get('mxcadUploadPath', {
                infer: true,
            });
        }
        /**
         * 检查分片是否存在
         */
        async checkChunkExists(dto) {
            const { fileHash, chunk } = dto;
            const chunkFilename = `${chunk}_${fileHash}`;
            const chunkPath = path.join(this.getChunkTempDirPath(fileHash), chunkFilename);
            const exists = await FileUtils.exists(chunkPath);
            if (exists) {
                const size = await FileUtils.getFileSize(chunkPath);
                if (size === 0) {
                    this.logger.warn(`分片文件存在但大小为0: ${chunkFilename}`);
                    return false;
                }
            }
            this.logger.debug(`检查分片: hash=${fileHash}, chunk=${chunk}, exists=${exists}`);
            return exists;
        }
        /**
         * 检查文件是否已存在（秒传检查）
         * 复用 MxCadModule 的逻辑，检查 uploads 目录是否已有转换好的 mxweb 文件
         */
        async checkFileExist(filename, fileHash) {
            try {
                // 检查文件是否需要转换
                const needsConversion = this.fileConversionService.needsConversion(filename);
                if (needsConversion) {
                    // CAD 文件：检查转换后的 mxweb 是否存在
                    const convertedExt = this.fileConversionService.getConvertedExtension(filename);
                    const mxwebFilename = `${fileHash}${convertedExt}`;
                    const mxwebPath = this.fileSystemService.getMd5Path(mxwebFilename);
                    const exists = await this.fileSystemService.exists(mxwebPath);
                    this.logger.log(`[checkFileExist] CAD文件检查: filename=${filename}, hash=${fileHash}, mxwebPath=${mxwebPath}, exists=${exists}`);
                    if (exists) {
                        return { exist: true, mxwebPath };
                    }
                    return { exist: false };
                }
                else {
                    // 非 CAD 文件：检查原始文件是否存在
                    const ext = path.extname(filename);
                    const originalFilename = `${fileHash}${ext}`;
                    const originalPath = this.fileSystemService.getMd5Path(originalFilename);
                    const exists = await this.fileSystemService.exists(originalPath);
                    this.logger.log(`[checkFileExist] 非CAD文件检查: filename=${filename}, hash=${fileHash}, originalPath=${originalPath}, exists=${exists}`);
                    if (exists) {
                        return { exist: true, mxwebPath: originalPath };
                    }
                    return { exist: false };
                }
            }
            catch (error) {
                this.logger.error(`检查文件存在性失败: ${error.message}`, error.stack);
                return { exist: false };
            }
        }
        /**
         * 获取分片临时目录路径
         * 使用与登录上传相同的目录结构
         */
        getChunkTempDirPath(hash) {
            return this.fileSystemService.getChunkTempDirPath(hash);
        }
        /**
         * 获取上传文件保存路径（使用 hash 命名，与登录上传一致）
         */
        getUploadFilePath(hash, ext) {
            const filename = `${hash}${ext}`;
            return this.fileSystemService.getMd5Path(filename);
        }
        /**
         * 根据文件名获取文件路径
         */
        getFilePath(filename) {
            return this.fileSystemService.getMd5Path(filename);
        }
        /**
         * 获取 uploads 目录路径
         */
        getUploadPath() {
            return this.uploadPath;
        }
        /**
         * 合并分片并进行图纸转换
         * 复用 MxCadModule 的图纸转换逻辑
         */
        async mergeChunks(dto) {
            const { hash, name, chunks } = dto;
            const chunkDir = this.getChunkTempDirPath(hash);
            // 检查临时目录是否存在
            const dirExists = await FileUtils.exists(chunkDir);
            if (!dirExists) {
                throw new BadRequestException(`分片临时目录不存在: ${hash}`);
            }
            // 读取目录中的所有文件
            const files = await FileUtils.readDirectory(chunkDir);
            // 验证分片数量
            if (files.length !== chunks) {
                throw new BadRequestException(`分片数量不匹配: 期望=${chunks}, 实际=${files.length}`);
            }
            // 获取文件扩展名
            const ext = path.extname(name);
            const targetPath = this.getUploadFilePath(hash, ext);
            // 使用并发管理器执行合并操作
            const success = await this.concurrencyManager.acquireLock(`merge:public:${hash}`, async () => {
                return await this.performMerge(chunkDir, targetPath, hash, chunks);
            });
            if (!success) {
                // 清理临时文件
                await this.cleanupTempDirectory(hash);
                throw new InternalServerErrorException(`合并分片失败: ${name}`);
            }
            this.logger.log(`分片合并成功: ${name} -> ${targetPath}`);
            // 判断是否需要图纸转换
            let finalFilePath = targetPath;
            let finalExt = ext;
            const needsConversion = this.fileConversionService.needsConversion(name);
            if (needsConversion) {
                this.logger.log(`开始图纸转换: ${name}`);
                // 调用图纸转换服务
                const { isOk, ret } = await this.fileConversionService.convertFile({
                    srcPath: targetPath,
                    fileHash: hash,
                    createPreloadingData: true,
                });
                if (!isOk) {
                    // 转换失败，清理临时文件
                    await this.cleanupTempDirectory(hash);
                    this.logger.error(`图纸转换失败: ${name}, error=${ret?.message}`);
                    throw new InternalServerErrorException(`图纸转换失败: ${ret?.message || '未知错误'}`);
                }
                // 转换成功，获取 mxweb 文件路径
                // 转换工具在原始文件旁边生成 {originalName}.mxweb，如: {hash}.dwg -> {hash}.dwg.mxweb
                finalFilePath = targetPath + '.mxweb';
                finalExt = path.extname(finalFilePath);
                this.logger.log(`图纸转换成功: ${name} -> ${finalFilePath}`);
            }
            // 合并成功后清理临时目录
            await this.cleanupTempDirectory(hash);
            return { hash, fileName: name };
        }
        /**
         * 查找 uploads 目录中以指定前缀开头的文件
         */
        async findFilesByPrefix(prefix) {
            const files = await FileUtils.readDirectory(this.uploadPath);
            return files.filter((f) => f.startsWith(prefix));
        }
        /**
         * 执行实际的合并操作
         */
        async performMerge(chunkDir, targetPath, hash, chunks) {
            return new Promise((resolve) => {
                try {
                    // 确保目标目录存在
                    const targetDir = path.dirname(targetPath);
                    FileUtils.ensureDirectory(targetDir);
                    // 读取并排序分片文件
                    FileUtils.readDirectory(chunkDir).then((list) => {
                        const aryList = [];
                        list.forEach((val) => {
                            const strNum = val.substring(0, val.indexOf('_'));
                            aryList.push({ num: parseInt(strNum, 10), file: val });
                        });
                        aryList.sort((a, b) => a.num - b.num);
                        const fileList = aryList.map((val) => ({
                            num: val.num,
                            name: val.file,
                            filePath: path.resolve(chunkDir, val.file),
                        }));
                        // 验证分片连续性
                        for (let i = 0; i < fileList.length; i++) {
                            if (fileList[i].num !== i) {
                                this.logger.error(`分片不连续: 期望=${i}, 实际=${fileList[i].num}`);
                                resolve(false);
                                return;
                            }
                        }
                        // 创建写入流
                        const fileWriteStream = fs.createWriteStream(targetPath);
                        // 递归合并分片
                        let currentChunkIndex = 0;
                        const streamMergeRecursive = () => {
                            if (currentChunkIndex >= fileList.length) {
                                fileWriteStream.end();
                                resolve(true);
                                return;
                            }
                            const data = fileList[currentChunkIndex];
                            const { filePath: chunkFilePath } = data;
                            // 检查路径是否是目录
                            try {
                                const stats = fs.statSync(chunkFilePath);
                                if (stats.isDirectory()) {
                                    this.logger.error(`路径是目录而非文件: ${chunkFilePath}`);
                                    fileWriteStream.close();
                                    resolve(false);
                                    return;
                                }
                            }
                            catch (error) {
                                this.logger.error(`无法读取文件信息: ${chunkFilePath}`, error);
                                fileWriteStream.close();
                                resolve(false);
                                return;
                            }
                            const currentReadStream = fs.createReadStream(chunkFilePath);
                            currentReadStream.pipe(fileWriteStream, { end: false });
                            currentReadStream.on('end', () => {
                                currentChunkIndex++;
                                streamMergeRecursive();
                            });
                            currentReadStream.on('error', (error) => {
                                this.logger.error(`读取分片失败: ${chunkFilePath}`, error);
                                fileWriteStream.close();
                                resolve(false);
                            });
                        };
                        fileWriteStream.on('error', (error) => {
                            this.logger.error(`写入文件失败: ${targetPath}`, error);
                            resolve(false);
                        });
                        streamMergeRecursive();
                    });
                }
                catch (error) {
                    this.logger.error(`合并操作失败: ${error.message}`, error);
                    resolve(false);
                }
            });
        }
        /**
         * 清理临时目录
         */
        async cleanupTempDirectory(hash) {
            const chunkDir = this.getChunkTempDirPath(hash);
            try {
                const exists = await FileUtils.exists(chunkDir);
                if (!exists) {
                    return true;
                }
                const success = await FileUtils.deleteDirectory(chunkDir);
                if (success) {
                    this.logger.log(`临时目录清理成功: ${chunkDir}`);
                }
                else {
                    this.logger.warn(`临时目录清理失败: ${chunkDir}`);
                }
                return success;
            }
            catch (error) {
                this.logger.error(`清理临时目录失败: hash=${hash}, error=${error.message}`);
                return false;
            }
        }
        /**
         * 读取文件内容
         */
        async readFile(filePath) {
            const exists = await FileUtils.exists(filePath);
            if (!exists) {
                throw new BadRequestException('文件不存在');
            }
            try {
                const buffer = await fsPromises.readFile(filePath);
                return buffer;
            }
            catch (error) {
                this.logger.error(`读取文件失败: ${filePath}`, error);
                throw new InternalServerErrorException('读取文件失败');
            }
        }
        /**
         * 删除文件
         */
        async deleteFile(filePath) {
            try {
                const exists = await FileUtils.exists(filePath);
                if (exists) {
                    await fsPromises.unlink(filePath);
                    this.logger.log(`文件已删除: ${filePath}`);
                }
            }
            catch (error) {
                this.logger.error(`删除文件失败: ${filePath}`, error);
            }
        }
    };
    __setFunctionName(_classThis, "PublicFileUploadService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PublicFileUploadService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PublicFileUploadService = _classThis;
})();
export { PublicFileUploadService };
//# sourceMappingURL=public-file-upload.service.js.map