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
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream, statSync } from 'fs';
let FileSystemService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileSystemService = _classThis = class {
        constructor(configService) {
            this.configService = configService;
            this.logger = new Logger(FileSystemService.name);
            this.uploadPath = this.configService.get('mxcadUploadPath', {
                infer: true,
            });
            this.tempPath = this.configService.get('mxcadTempPath', { infer: true });
        }
        async exists(path) {
            return fs.existsSync(path);
        }
        async createDirectory(dirPath) {
            try {
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
                return true;
            }
            catch (error) {
                this.logger.error(`创建目录失败: ${dirPath}`, error);
                return false;
            }
        }
        async getFileSize(filePath) {
            try {
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    return stats.size;
                }
                return 0;
            }
            catch (error) {
                this.logger.error(`获取文件大小失败: ${filePath}`, error);
                return 0;
            }
        }
        async readDirectory(dirPath) {
            try {
                if (fs.existsSync(dirPath)) {
                    return fs.readdirSync(dirPath);
                }
                return [];
            }
            catch (error) {
                this.logger.error(`读取目录失败: ${dirPath}`, error);
                return [];
            }
        }
        /**
         * 查找目录中以指定前缀开头的文件
         * @param dirPath 目录路径
         * @param prefix 文件名前缀
         * @returns 匹配的文件名列表
         */
        async findFilesByPrefix(dirPath, prefix) {
            try {
                if (!fs.existsSync(dirPath)) {
                    return [];
                }
                const files = fs.readdirSync(dirPath);
                return files.filter((file) => file.startsWith(prefix));
            }
            catch (error) {
                this.logger.error(`查找文件失败: ${dirPath}, prefix=${prefix}`, error);
                return [];
            }
        }
        async delete(path) {
            try {
                if (fs.existsSync(path)) {
                    if (fs.statSync(path).isDirectory()) {
                        return await this.deleteDirectory(path);
                    }
                    else {
                        fs.unlinkSync(path);
                    }
                }
                return true;
            }
            catch (error) {
                this.logger.error(`删除失败: ${path}`, error);
                return false;
            }
        }
        async mergeChunks(options) {
            return new Promise((resolve) => {
                const { sourceFiles, targetPath, chunkDir } = options;
                try {
                    if (!fs.existsSync(chunkDir)) {
                        resolve({ success: false, error: `分片目录不存在: ${chunkDir}` });
                        return;
                    }
                    // 确保目标目录存在
                    const targetDir = path.dirname(targetPath);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                        this.logger.log(`创建目标目录: ${targetDir}`);
                    }
                    const list = fs.readdirSync(chunkDir);
                    const aryList = [];
                    list.forEach((val) => {
                        const strNum = val.substring(0, val.indexOf('_'));
                        aryList.push({ num: parseInt(strNum, 10), file: val });
                    });
                    aryList.sort((a, b) => a.num - b.num);
                    const fileList = aryList.map((val) => ({
                        name: val.file,
                        filePath: path.resolve(chunkDir, val.file),
                    }));
                    const fileWriteStream = createWriteStream(targetPath);
                    this.streamMergeRecursive(fileList, fileWriteStream, (ret) => {
                        if (ret === 0) {
                            resolve({ success: true });
                        }
                        else {
                            resolve({ success: false, error: '文件合并失败' });
                        }
                    });
                }
                catch (error) {
                    this.logger.error(`合并分片失败: ${error.message}`, error);
                    resolve({ success: false, error: error.message });
                }
            });
        }
        async writeStatusFile(name, size, hash, targetPath) {
            try {
                const status = {
                    name,
                    size,
                    hash,
                };
                const jsonPath = path.join(path.dirname(targetPath), `${hash}.json`);
                fs.writeFileSync(jsonPath, JSON.stringify(status));
                return true;
            }
            catch (error) {
                this.logger.error(`写入状态文件失败: ${error.message}`, error);
                return false;
            }
        }
        getChunkTempDirPath(fileHash) {
            return path.join(this.tempPath, `chunk_${fileHash}`);
        }
        getMd5Path(fileHash) {
            return path.join(this.uploadPath, fileHash);
        }
        async deleteDirectory(dirPath) {
            try {
                if (fs.existsSync(dirPath)) {
                    fs.readdirSync(dirPath).forEach((file) => {
                        const curPath = path.join(dirPath, file);
                        if (statSync(curPath).isDirectory()) {
                            this.deleteDirectory(curPath);
                        }
                        else {
                            fs.unlinkSync(curPath);
                        }
                    });
                    fs.rmdirSync(dirPath);
                }
                return true;
            }
            catch (error) {
                this.logger.error(`删除目录失败: ${dirPath}`, error);
                return false;
            }
        }
        streamMergeRecursive(fileList, fileWriteStream, resultCall) {
            if (!fileList.length) {
                fileWriteStream.end('done');
                resultCall(0);
                return;
            }
            const data = fileList.shift();
            const { filePath: chunkFilePath } = data;
            // 检查路径是否是目录
            try {
                const stats = statSync(chunkFilePath);
                if (stats.isDirectory()) {
                    this.logger.error(`路径是目录而非文件: ${chunkFilePath}`);
                    fileWriteStream.close();
                    resultCall(1);
                    return;
                }
            }
            catch (error) {
                this.logger.error(`无法读取文件信息: ${chunkFilePath}`, error);
                fileWriteStream.close();
                resultCall(1);
                return;
            }
            const currentReadStream = createReadStream(chunkFilePath);
            currentReadStream.pipe(fileWriteStream, { end: false });
            currentReadStream.on('end', () => {
                this.streamMergeRecursive(fileList, fileWriteStream, resultCall);
            });
            currentReadStream.on('error', (error) => {
                this.logger.error('WriteStream 合并失败', error);
                fileWriteStream.close();
                resultCall(1);
            });
        }
    };
    __setFunctionName(_classThis, "FileSystemService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileSystemService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileSystemService = _classThis;
})();
export { FileSystemService };
//# sourceMappingURL=file-system.service.js.map