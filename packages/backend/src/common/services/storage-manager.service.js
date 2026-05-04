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
import * as path from 'path';
import * as fsPromises from 'fs/promises';
let StorageManager = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StorageManager = _classThis = class {
        constructor(directoryAllocator, localStorageProvider) {
            this.directoryAllocator = directoryAllocator;
            this.localStorageProvider = localStorageProvider;
            this.logger = new Logger(StorageManager.name);
        }
        /**
         * 为新节点分配存储空间
         * @param nodeId 节点 ID
         * @param fileName 文件名（可选）
         * @returns 存储信息
         */
        async allocateNodeStorage(nodeId, fileName) {
            // 分配目标目录
            const allocation = await this.directoryAllocator.allocateDirectory();
            // 创建节点目录（使用正斜杠确保跨平台兼容）
            const nodeRelativePath = `${allocation.targetDirectory}/${nodeId}`;
            await this.localStorageProvider.createDirectory(nodeRelativePath);
            // 构建路径
            const nodeDirectoryPath = this.localStorageProvider['getAbsolutePath'](nodeRelativePath);
            const storageInfo = {
                nodeId,
                directory: allocation.targetDirectory,
                nodeDirectoryPath,
                nodeDirectoryRelativePath: nodeRelativePath,
            };
            // 如果提供了文件名，构建文件路径
            if (fileName) {
                const fileRelativePath = `${nodeRelativePath}/${fileName}`;
                storageInfo.filePath =
                    this.localStorageProvider['getAbsolutePath'](fileRelativePath);
                storageInfo.fileRelativePath = fileRelativePath;
            }
            this.logger.log(`[allocateNodeStorage] nodeId=${nodeId}, directory=${allocation.targetDirectory}, fileName=${fileName || 'none'}`);
            this.logger.log(`为节点 ${nodeId} 分配存储成功: ${storageInfo.nodeDirectoryRelativePath}`);
            return storageInfo;
        }
        /**
         * 获取节点存储信息
         * @param nodeId 节点 ID
         * @param directory 目录（YYYYMM[/N]）
         * @param fileName 文件名（可选）
         * @returns 存储信息
         */
        getNodeStorageInfo(nodeId, directory, fileName) {
            const nodeRelativePath = `${directory}/${nodeId}`;
            const nodeDirectoryPath = this.localStorageProvider['getAbsolutePath'](nodeRelativePath);
            const storageInfo = {
                nodeId,
                directory,
                nodeDirectoryPath,
                nodeDirectoryRelativePath: nodeRelativePath,
            };
            if (fileName) {
                const fileRelativePath = `${nodeRelativePath}/${fileName}`;
                storageInfo.filePath =
                    this.localStorageProvider['getAbsolutePath'](fileRelativePath);
                storageInfo.fileRelativePath = fileRelativePath;
            }
            return storageInfo;
        }
        /**
         * 删除节点存储
         * @param nodeId 节点 ID
         * @param directory 目录（YYYYMM[/N]）
         */
        async deleteNodeStorage(nodeId, directory) {
            const nodeRelativePath = `${directory}/${nodeId}`;
            await this.localStorageProvider.deleteDirectory(nodeRelativePath);
            this.logger.log(`删除节点存储成功: ${nodeId} (${directory})`);
        }
        /**
         * 检查节点存储是否存在
         * @param nodeId 节点 ID
         * @param directory 目录（YYYYMM[/N]）
         * @returns 是否存在
         */
        async nodeStorageExists(nodeId, directory) {
            const nodeRelativePath = path.join(directory, nodeId);
            return await this.localStorageProvider.directoryExists(nodeRelativePath);
        }
        /**
         * 获取存储统计信息
         * @returns 统计信息
         */
        async getStorageStats() {
            const directories = await this.directoryAllocator.listDirectories();
            const totalNodes = directories.reduce((sum, dir) => sum + dir.nodeCount, 0);
            return {
                totalDirectories: directories.length,
                totalNodes,
                directories,
            };
        }
        /**
         * 清理空目录
         * @returns 清理的目录数量
         */
        async cleanupEmptyDirectories() {
            try {
                const directories = await this.directoryAllocator.listDirectories();
                let cleanedCount = 0;
                for (const dir of directories) {
                    if (dir.nodeCount === 0) {
                        await this.localStorageProvider.deleteDirectory(dir.name);
                        cleanedCount++;
                        this.logger.log(`清理空目录: ${dir.name}`);
                    }
                }
                return cleanedCount;
            }
            catch (error) {
                this.logger.error(`清理空目录失败`, error.stack);
                return 0;
            }
        }
        /**
         * 递归复制目录
         */
        async recursiveCopyDirectory(sourceDir, targetDir) {
            // 列出源目录中的所有条目
            const entries = await this.localStorageProvider.listFiles(sourceDir);
            for (const entry of entries) {
                const sourcePath = entry;
                const destPath = entry.replace(sourceDir, targetDir);
                // 检查是否是目录
                const absoluteSourcePath = this.localStorageProvider['getAbsolutePath'](sourcePath);
                const stats = await fsPromises.stat(absoluteSourcePath);
                if (stats.isDirectory()) {
                    // 创建目标目录
                    await this.localStorageProvider.createDirectory(destPath);
                    // 递归复制子目录
                    await this.recursiveCopyDirectory(sourcePath, destPath);
                }
                else {
                    // 复制文件
                    await this.localStorageProvider.copyFile(sourcePath, destPath);
                }
            }
        }
        /**
         * 复制整个节点目录（包括所有相关文件）
         * @param sourceDirRelativePath 源目录相对路径
         * @param targetNodeId 目标节点ID
         * @param fileName 文件名
         * @returns 目标文件的相对路径
         */
        async copyNodeDirectory(sourceDirRelativePath, targetNodeId, fileName) {
            // 为目标节点分配存储空间
            const storageInfo = await this.allocateNodeStorage(targetNodeId, fileName);
            // 递归复制整个目录结构（包括所有相关文件，如外部参照、缩略图等）
            await this.recursiveCopyDirectory(sourceDirRelativePath, storageInfo.nodeDirectoryRelativePath);
            return storageInfo.fileRelativePath;
        }
        /**
         * 获取节点完整路径
         * @param relativePath 相对路径（可能是 /mxcad/file/YYYYMM[/N]/nodeId/... 或 YYYYMM[/N]/nodeId/...）
         * @returns 完整路径
         */
        getFullPath(relativePath) {
            // 去掉 /mxcad/file/ 前缀，获取实际的存储路径
            const storagePath = relativePath.replace(/^\/mxcad\/file\//, '');
            return this.localStorageProvider['getAbsolutePath'](storagePath);
        }
        /**
         * 从数据库存储路径中提取节点目录路径
         * @param dbRelativePath 数据库中的相对路径 (YYYYMM/nodeId/fileName 或 YYYYMM/nodeId)
         * @returns 节点目录的完整路径
         */
        getNodeDirectoryPath(dbRelativePath) {
            // 去掉前缀
            const cleanPath = dbRelativePath.replace(/^\/mxcad\/file\//, '');
            // 路径格式: YYYYMM/nodeId 或 YYYYMM/nodeId/fileName
            const pathParts = cleanPath.split('/').filter(Boolean);
            // 如果是 2 部分: YYYYMM/nodeId
            if (pathParts.length === 2) {
                return this.localStorageProvider['getAbsolutePath'](cleanPath);
            }
            // 如果是 3+ 部分: YYYYMM/nodeId/fileName, 提取前两部分
            if (pathParts.length >= 3) {
                const nodeDirectoryPath = `${pathParts[0]}/${pathParts[1]}`;
                return this.localStorageProvider['getAbsolutePath'](nodeDirectoryPath);
            }
            // 异常情况，直接返回
            return this.localStorageProvider['getAbsolutePath'](cleanPath);
        }
        /**
         * 从数据库存储路径中提取节点目录相对路径
         * @param dbRelativePath 数据库中的相对路径
         * @returns 节点目录的相对路径 (YYYYMM/nodeId)
         */
        getNodeDirectoryRelativePath(dbRelativePath) {
            // 去掉前缀
            const cleanPath = dbRelativePath.replace(/^\/mxcad\/file\//, '');
            const pathParts = cleanPath.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                return `${pathParts[0]}/${pathParts[1]}`;
            }
            return cleanPath;
        }
    };
    __setFunctionName(_classThis, "StorageManager");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StorageManager = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StorageManager = _classThis;
})();
export { StorageManager };
//# sourceMappingURL=storage-manager.service.js.map