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
import { Injectable, Logger, Scope } from '@nestjs/common';
import { FileUtils } from '../../common/utils/file-utils';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
/**
 * 分片上传服务
 * 负责分片文件的上传、检查、合并和临时目录清理
 */
let ChunkUploadService = (() => {
    let _classDecorators = [Injectable({ scope: Scope.DEFAULT })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ChunkUploadService = _classThis = class {
        constructor(configService, concurrencyManager) {
            this.configService = configService;
            this.concurrencyManager = concurrencyManager;
            this.logger = new Logger(ChunkUploadService.name);
            this.tempPath = this.configService.get('mxcadTempPath', { infer: true });
        }
        /**
         * 检查分片是否存在
         * @param hash 文件哈希值
         * @param chunk 分片索引
         * @returns 是否存在
         */
        async checkChunkExists(hash, chunk) {
            try {
                const chunkFilename = `${chunk}_${hash}`;
                const chunkPath = path.join(this.getChunkTempDirPath(hash), chunkFilename);
                const exists = await FileUtils.exists(chunkPath);
                if (exists) {
                    // 检查文件大小是否为0（可能是不完整的分片）
                    const size = await FileUtils.getFileSize(chunkPath);
                    if (size === 0) {
                        this.logger.warn(`分片文件存在但大小为0，视为不存在: ${chunkFilename}`);
                        return false;
                    }
                }
                this.logger.debug(`检查分片存在性: hash=${hash}, chunk=${chunk}, exists=${exists}`);
                return exists;
            }
            catch (error) {
                this.logger.error(`检查分片存在性失败: hash=${hash}, chunk=${chunk}, error=${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 上传分片文件
         * @param chunkData 分片数据路径
         * @returns 是否成功
         */
        async uploadChunk(chunkData) {
            try {
                // 验证分片文件是否存在
                const exists = await FileUtils.exists(chunkData);
                if (!exists) {
                    this.logger.error(`分片文件不存在: ${chunkData}`);
                    return false;
                }
                // 检查文件大小
                const size = await FileUtils.getFileSize(chunkData);
                if (size === 0) {
                    this.logger.error(`分片文件大小为0: ${chunkData}`);
                    return false;
                }
                this.logger.debug(`分片上传成功: ${chunkData}, size=${size}`);
                return true;
            }
            catch (error) {
                this.logger.error(`上传分片失败: ${chunkData}, error=${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 合并分片文件
         * @param options 合并选项
         * @returns 是否成功
         */
        async mergeChunks(options) {
            const { hash, name, chunks, targetPath } = options;
            try {
                const chunkDir = path.join(this.tempPath, `chunk_${hash}`);
                // 检查临时目录是否存在
                const dirExists = await FileUtils.exists(chunkDir);
                if (!dirExists) {
                    this.logger.error(`分片临时目录不存在: ${chunkDir}`);
                    return false;
                }
                // 读取目录中的所有文件
                const files = await FileUtils.readDirectory(chunkDir);
                // 验证分片数量
                if (files.length !== chunks) {
                    this.logger.error(`分片数量不匹配: 期望=${chunks}, 实际=${files.length}`);
                    // 清理临时文件
                    await this.cleanupTempDirectory(hash);
                    return false;
                }
                // 使用并发管理器执行合并操作
                const success = await this.concurrencyManager.acquireLock(`merge:${hash}`, async () => {
                    return await this.performMerge(chunkDir, targetPath, hash, chunks);
                });
                if (!success) {
                    this.logger.error(`合并分片失败: ${name} (${hash})`);
                    // 清理临时文件
                    await this.cleanupTempDirectory(hash);
                    return false;
                }
                this.logger.log(`分片合并成功: ${name} (${hash}) -> ${targetPath}`);
                // 合并成功后清理临时目录
                await this.cleanupTempDirectory(hash);
                return true;
            }
            catch (error) {
                this.logger.error(`合并分片失败: ${name} (${hash}), error=${error.message}`, error.stack);
                // 确保在失败时清理临时文件
                try {
                    await this.cleanupTempDirectory(hash);
                }
                catch (cleanupError) {
                    this.logger.error(`清理临时目录失败: ${cleanupError.message}`, cleanupError.stack);
                }
                return false;
            }
        }
        /**
         * 获取分片临时目录路径
         * @param hash 文件哈希值
         * @returns 临时目录路径
         */
        getChunkTempDirPath(hash) {
            return path.join(this.tempPath, `chunk_${hash}`);
        }
        /**
         * 清理临时目录
         * 增强版本：增加重试机制
         * @param hash 文件哈希值
         * @returns 是否成功
         */
        async cleanupTempDirectory(hash) {
            const chunkDir = this.getChunkTempDirPath(hash);
            try {
                const exists = await FileUtils.exists(chunkDir);
                if (!exists) {
                    this.logger.debug(`临时目录不存在，无需清理: ${chunkDir}`);
                    return true;
                }
                // 使用重试机制清理临时目录
                const maxRetries = 3;
                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        const success = await FileUtils.deleteDirectory(chunkDir);
                        if (success) {
                            this.logger.log(`临时目录清理成功: ${chunkDir} (尝试 ${attempt + 1}/${maxRetries})`);
                            return true;
                        }
                        else {
                            this.logger.warn(`临时目录清理失败 (尝试 ${attempt + 1}/${maxRetries}): ${chunkDir}`);
                            // 如果不是最后一次尝试，等待后重试
                            if (attempt < maxRetries - 1) {
                                const delay = 1000 * (attempt + 1); // 指数退避：1s, 2s, 3s
                                this.logger.debug(`等待 ${delay}ms 后重试...`);
                                await this.sleep(delay);
                            }
                        }
                    }
                    catch (error) {
                        this.logger.error(`临时目录清理异常 (尝试 ${attempt + 1}/${maxRetries}): ${chunkDir}, 错误: ${error.message}`);
                        // 如果不是最后一次尝试，等待后重试
                        if (attempt < maxRetries - 1) {
                            const delay = 1000 * (attempt + 1); // 指数退避
                            await this.sleep(delay);
                        }
                    }
                }
                // 所有重试都失败
                this.logger.error(`临时目录清理最终失败: ${chunkDir}`);
                return false;
            }
            catch (error) {
                this.logger.error(`清理临时目录失败: hash=${hash}, error=${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 清理所有过期的临时文件
         * 定时任务调用，清理超过指定时间的临时文件
         * @param maxAge 最大文件年龄（毫秒），默认 24 小时
         * @returns 清理的目录数量
         */
        async cleanupExpiredTempFiles(maxAge = 24 * 60 * 60 * 1000) {
            try {
                const tempDir = this.tempPath;
                const exists = await FileUtils.exists(tempDir);
                if (!exists) {
                    this.logger.debug(`临时目录不存在: ${tempDir}`);
                    return 0;
                }
                // 读取临时目录中的所有子目录
                const entries = await FileUtils.readDirectory(tempDir);
                const chunkDirs = entries.filter((entry) => entry.startsWith('chunk_'));
                this.logger.log(`找到 ${chunkDirs.length} 个临时分片目录`);
                let cleanedCount = 0;
                const now = Date.now();
                for (const chunkDir of chunkDirs) {
                    const chunkDirPath = path.join(tempDir, chunkDir);
                    try {
                        // 获取目录的修改时间
                        const stats = await fsPromises.stat(chunkDirPath);
                        const dirAge = now - stats.mtimeMs;
                        if (dirAge > maxAge) {
                            this.logger.log(`清理过期临时目录: ${chunkDir}, 年龄: ${Math.round(dirAge / 1000 / 60)} 分钟`);
                            // 删除过期目录
                            const success = await FileUtils.deleteDirectory(chunkDirPath);
                            if (success) {
                                cleanedCount++;
                                this.logger.log(`过期临时目录清理成功: ${chunkDir}`);
                            }
                            else {
                                this.logger.warn(`过期临时目录清理失败: ${chunkDir}`);
                            }
                        }
                    }
                    catch (error) {
                        this.logger.error(`清理过期临时目录失败: ${chunkDir}, 错误: ${error.message}`);
                    }
                }
                this.logger.log(`过期临时文件清理完成，共清理 ${cleanedCount} 个目录`);
                return cleanedCount;
            }
            catch (error) {
                this.logger.error(`清理过期临时文件失败: error=${error.message}`, error.stack);
                return 0;
            }
        }
        /**
         * 检查磁盘空间
         * @param requiredSpace 需要的磁盘空间（字节），默认 1GB
         * @returns 磁盘空间是否足够
         */
        async checkDiskSpace(requiredSpace = 1024 * 1024 * 1024) {
            try {
                const tempDir = this.tempPath;
                // 使用 fs.statfs 获取磁盘统计信息
                // 在 Windows 上，statfs 需要两个参数
                const stats = await fsPromises.statfs(tempDir);
                // TypeScript 类型定义可能不准确，使用类型断言
                const typedStats = stats;
                const freeSpace = typedStats.bavail * typedStats.bsize; // 可用空间（字节）
                this.logger.debug(`磁盘空间检查: 可用空间=${Math.round(freeSpace / 1024 / 1024)}MB, 需要=${Math.round(requiredSpace / 1024 / 1024)}MB`);
                if (freeSpace < requiredSpace) {
                    this.logger.error(`磁盘空间不足: 可用=${Math.round(freeSpace / 1024 / 1024)}MB, 需要=${Math.round(requiredSpace / 1024 / 1024)}MB`);
                    return false;
                }
                return true;
            }
            catch (error) {
                this.logger.error(`磁盘空间检查失败: ${error.message}`);
                // 检查失败时默认返回 true，避免影响正常上传
                return true;
            }
        }
        /**
         * 延迟函数
         * @param ms 延迟毫秒数
         * @returns Promise
         */
        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
        /**
         * 执行实际的合并操作
         * @param chunkDir 分片目录
         * @param targetPath 目标文件路径
         * @param hash 文件哈希值
         * @param chunks 分片总数
         * @returns 是否成功
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
    };
    __setFunctionName(_classThis, "ChunkUploadService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ChunkUploadService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ChunkUploadService = _classThis;
})();
export { ChunkUploadService };
//# sourceMappingURL=chunk-upload.service.js.map