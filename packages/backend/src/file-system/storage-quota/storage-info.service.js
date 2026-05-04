///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
import { FileStatus } from '@prisma/client';
import { StorageQuotaType } from './storage-quota.service';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
export { StorageQuotaType };
let StorageInfoService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StorageInfoService = _classThis = class {
        constructor(prisma, configService, storageQuotaService) {
            this.prisma = prisma;
            this.configService = configService;
            this.storageQuotaService = storageQuotaService;
            this.logger = new Logger(StorageInfoService.name);
            this.quotaCache = new Map();
            this.cacheTTL = 5 * 60 * 1000; // 5 分钟缓存
        }
        determineQuotaType(node) {
            return this.storageQuotaService.determineQuotaType(node);
        }
        async getStorageQuotaLimit(node) {
            return this.storageQuotaService.getStorageQuotaLimit(node);
        }
        async getStorageQuota(userId, nodeId, node) {
            // 如果未提供 node 但提供了 nodeId，从数据库获取节点信息
            let resolvedNode = node;
            let resolvedNodeId = nodeId;
            if (!resolvedNode && nodeId) {
                resolvedNode = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: {
                        id: true,
                        isRoot: true,
                        libraryKey: true,
                        projectId: true,
                        storageQuota: true,
                    },
                });
            }
            else if (!nodeId) {
                // 如果没有 nodeId，获取用户个人空间节点
                const personalSpace = await this.prisma.fileSystemNode.findUnique({
                    where: { personalSpaceKey: userId },
                    select: {
                        id: true,
                        isRoot: true,
                        libraryKey: true,
                        projectId: true,
                        storageQuota: true,
                    },
                });
                if (personalSpace) {
                    resolvedNode = personalSpace;
                    resolvedNodeId = personalSpace.id;
                }
            }
            // 生成缓存键
            const cacheKey = `quota:${userId}:${resolvedNodeId || 'personal'}`;
            // 尝试从缓存获取
            const cached = this.quotaCache.get(cacheKey);
            if (cached && Date.now() < cached.expiresAt) {
                this.logger.debug(`配额缓存命中: ${cacheKey}`);
                return cached.data;
            }
            // 缓存未命中，计算配额
            this.logger.debug(`配额缓存未命中，计算中: ${cacheKey}`);
            const quotaInfo = await this.calculateStorageQuota(userId, resolvedNodeId, resolvedNode);
            // 存入缓存
            this.quotaCache.set(cacheKey, {
                data: quotaInfo,
                expiresAt: Date.now() + this.cacheTTL,
            });
            return quotaInfo;
        }
        /**
         * 计算存储配额（内部方法）
         * 使用数据库聚合查询优化性能，避免传输大量数据到内存
         */
        async calculateStorageQuota(userId, nodeId, node) {
            const type = node
                ? this.determineQuotaType(node)
                : StorageQuotaType.PERSONAL;
            const totalLimit = await this.getStorageQuotaLimit(node);
            let totalUsed = 0;
            // 使用数据库聚合查询，性能优化
            if (type === StorageQuotaType.LIBRARY && node?.id) {
                const result = await this.prisma.fileSystemNode.aggregate({
                    where: {
                        projectId: node.id,
                        isFolder: false,
                        fileStatus: FileStatus.COMPLETED,
                    },
                    _sum: { size: true },
                });
                totalUsed = result._sum.size || 0;
            }
            else if (type === StorageQuotaType.PROJECT && node?.id) {
                const result = await this.prisma.fileSystemNode.aggregate({
                    where: {
                        isFolder: false,
                        fileStatus: FileStatus.COMPLETED,
                        OR: [{ id: node.id }, { projectId: node.id }],
                    },
                    _sum: { size: true },
                });
                totalUsed = result._sum.size || 0;
            }
            else {
                const result = await this.prisma.fileSystemNode.aggregate({
                    where: {
                        ownerId: userId,
                        isFolder: false,
                        fileStatus: FileStatus.COMPLETED,
                        projectId: null,
                    },
                    _sum: { size: true },
                });
                totalUsed = result._sum.size || 0;
            }
            const available = totalLimit - totalUsed;
            const usagePercentage = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;
            return {
                type,
                used: totalUsed,
                total: totalLimit,
                remaining: available,
                usagePercent: usagePercentage,
            };
        }
        /**
         * 清除配额缓存
         */
        async invalidateQuotaCache(userId, nodeId) {
            const cacheKey = `quota:${userId}:${nodeId || 'personal'}`;
            this.quotaCache.delete(cacheKey);
            this.logger.debug(`配额缓存已清除: ${cacheKey}`);
        }
        async getUserStorageInfo(userId) {
            return this.getStorageQuota(userId);
        }
        async deleteMxCadFilesFromUploads(fileHash) {
            if (!fileHash) {
                return 0;
            }
            let totalDeleted = 0;
            try {
                const uploadPath = this.configService.get('mxcadUploadPath', {
                    infer: true,
                });
                try {
                    await fsPromises.access(uploadPath);
                    const files = await fsPromises.readdir(uploadPath);
                    const relatedFiles = files.filter((file) => file.startsWith(fileHash));
                    for (const fileName of relatedFiles) {
                        const filePath = path.join(uploadPath, fileName);
                        try {
                            await fsPromises.unlink(filePath);
                            this.logger.log(`删除 uploads 文件成功: ${filePath}`);
                            totalDeleted++;
                        }
                        catch (error) {
                            this.logger.error(`删除 uploads 文件失败: ${filePath}: ${error.message}`);
                        }
                    }
                    const hashDir = path.join(uploadPath, fileHash);
                    try {
                        await fsPromises.access(hashDir);
                        const extRefFiles = await fsPromises.readdir(hashDir);
                        for (const extRefFile of extRefFiles) {
                            const extRefFilePath = path.join(hashDir, extRefFile);
                            try {
                                await fsPromises.unlink(extRefFilePath);
                                this.logger.log(`删除 uploads 外部参照文件成功: ${extRefFilePath}`);
                                totalDeleted++;
                            }
                            catch (error) {
                                this.logger.error(`删除 uploads 外部参照文件失败: ${extRefFilePath}: ${error.message}`);
                            }
                        }
                        await fsPromises.rmdir(hashDir);
                        this.logger.log(`删除 uploads 外部参照目录成功: ${hashDir}`);
                    }
                    catch (error) {
                        this.logger.debug(`外部参照子目录不存在: ${hashDir}`);
                    }
                }
                catch (error) {
                    this.logger.warn(`uploads 目录不存在或读取失败: ${uploadPath}: ${error.message}`);
                }
                this.logger.log(`共删除 ${totalDeleted} 个临时文件（uploads 目录），哈希值: ${fileHash}`);
                return totalDeleted;
            }
            catch (error) {
                this.logger.error(`删除 MxCAD 临时文件失败: ${error.message}`, error.stack);
                return 0;
            }
        }
        async deleteMxCadFilesFromUploadsBatch(fileHashes) {
            if (!fileHashes || fileHashes.length === 0) {
                return 0;
            }
            let totalDeleted = 0;
            for (const fileHash of fileHashes) {
                const deleted = await this.deleteMxCadFilesFromUploads(fileHash);
                totalDeleted += deleted;
            }
            this.logger.log(`批量删除 uploads 文件完成，共删除 ${totalDeleted} 个文件，哈希值数量: ${fileHashes.length}`);
            return totalDeleted;
        }
    };
    __setFunctionName(_classThis, "StorageInfoService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StorageInfoService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StorageInfoService = _classThis;
})();
export { StorageInfoService };
//# sourceMappingURL=storage-info.service.js.map