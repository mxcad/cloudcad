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
import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException, } from '@nestjs/common';
import { NodeUtils } from '../../common/utils/node-utils';
import { FileUtils } from '../../common/utils/file-utils';
import { FileStatus } from '@prisma/client';
/**
 * 节点创建服务
 *
 * 职责：
 * 1. 创建新的文件系统节点
 * 2. 引用已存在的文件系统节点
 * 3. 使用事务确保数据一致性
 * 4. 使用锁防止并发冲突
 */
let NodeCreationService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var NodeCreationService = _classThis = class {
        constructor(databaseService, storageManager, concurrencyManager, fileTreeService) {
            this.databaseService = databaseService;
            this.storageManager = storageManager;
            this.concurrencyManager = concurrencyManager;
            this.fileTreeService = fileTreeService;
            this.logger = new Logger(NodeCreationService.name);
        }
        /**
         * 创建文件系统节点
         *
         * @param options 创建选项
         * @returns 创建结果
         */
        async createNode(options) {
            try {
                // 验证创建选项
                const validationResult = NodeUtils.validateCreateOptions(options);
                if (!validationResult.isValid) {
                    this.logger.error(`创建节点选项验证失败: ${validationResult.errorMessage}`);
                    return {
                        success: false,
                        errorMessage: validationResult.errorMessage,
                    };
                }
                // 生成节点唯一标识符
                const identifier = NodeUtils.generateNodeIdentifier(options.fileHash, options.ownerId);
                const lockName = NodeUtils.generateLockName('create', identifier);
                // 使用锁执行创建操作
                const result = await this.concurrencyManager.acquireLock(lockName, async () => {
                    return await this.performCreateNode(options);
                });
                if (result === null) {
                    return {
                        success: false,
                        errorMessage: '创建节点失败：无法获取锁',
                    };
                }
                return result;
            }
            catch (error) {
                this.logger.error(`创建节点失败: ${options.name} (${options.fileHash}): ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message || '创建节点失败',
                };
            }
        }
        /**
         * 引用已存在的文件系统节点
         *
         * @param hash 文件哈希值
         * @param context 节点引用上下文
         * @returns 创建结果
         */
        async referenceNode(hash, context) {
            try {
                // 验证文件哈希格式
                if (!NodeUtils.isValidFileHash(hash)) {
                    this.logger.error(`无效的文件哈希格式: ${hash}`);
                    return {
                        success: false,
                        errorMessage: `无效的文件哈希格式: ${hash}`,
                    };
                }
                // 生成节点唯一标识符
                const identifier = NodeUtils.generateNodeIdentifier(hash, context.context.userId);
                const lockName = NodeUtils.generateLockName('reference', identifier);
                // 使用锁执行引用操作
                const result = await this.concurrencyManager.acquireLock(lockName, async () => {
                    return await this.performReferenceNode(hash, context);
                });
                if (result === null) {
                    return {
                        success: false,
                        errorMessage: '引用节点失败：无法获取锁',
                    };
                }
                return result;
            }
            catch (error) {
                this.logger.error(`引用节点失败: ${hash}: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message || '引用节点失败',
                };
            }
        }
        /**
         * 执行实际的节点创建操作
         *
         * @param options 创建选项
         * @returns 创建结果
         */
        async performCreateNode(options) {
            const { name, fileHash, size, mimeType, extension, parentId, ownerId, sourceFilePath, skipFileCopy, } = options;
            this.logger.log(`[performCreateNode] 开始创建节点: ${name} (${fileHash})`);
            let nodeId;
            let storageInfo = null;
            try {
                // 阶段1：数据库操作（事务）
                await this.databaseService.$transaction(async (tx) => {
                    // 检查父节点是否存在
                    const parentNode = await tx.fileSystemNode.findUnique({
                        where: { id: parentId, deletedAt: null },
                        select: { id: true, isFolder: true },
                    });
                    if (!parentNode) {
                        throw new NotFoundException(`父节点不存在或已被删除: ${parentId}`);
                    }
                    if (!parentNode.isFolder) {
                        throw new BadRequestException(`父节点不是文件夹: ${parentId}`);
                    }
                    // 检查是否已存在相同哈希的文件节点
                    const existingNode = await tx.fileSystemNode.findFirst({
                        where: {
                            parentId,
                            fileHash,
                            ownerId,
                            deletedAt: null,
                        },
                    });
                    if (existingNode) {
                        // 相同哈希的文件已存在，直接返回该节点
                        nodeId = existingNode.id;
                        this.logger.log(`[performCreateNode] 节点已存在: ${nodeId}`);
                        return;
                    }
                    // 生成唯一文件名
                    const existingNames = await this.getExistingNodeNames(tx, parentId);
                    const uniqueName = NodeUtils.generateUniqueFileName(NodeUtils.extractBaseName(name), extension, existingNames);
                    // 获取父节点的projectId
                    const projectId = await this.fileTreeService.getProjectId(parentId);
                    // 创建新节点
                    const newNode = await tx.fileSystemNode.create({
                        data: {
                            name: uniqueName,
                            originalName: name,
                            isFolder: false,
                            isRoot: false,
                            parentId,
                            path: null, // 临时设为 null，IO操作完成后更新
                            size,
                            mimeType,
                            extension,
                            fileStatus: FileStatus.COMPLETED,
                            fileHash,
                            ownerId,
                            projectId,
                        },
                    });
                    nodeId = newNode.id;
                    this.logger.log(`[performCreateNode] 数据库节点创建成功: ${nodeId}, name=${uniqueName}`);
                });
                // 确保 nodeId 已被赋值
                if (!nodeId) {
                    throw new InternalServerErrorException('节点创建失败：nodeId 未被赋值');
                }
                // 阶段2：IO操作（事务外）
                if (!skipFileCopy && sourceFilePath) {
                    try {
                        // 检查源文件是否存在
                        const sourceExists = await FileUtils.exists(sourceFilePath);
                        if (!sourceExists) {
                            throw new NotFoundException(`源文件不存在: ${sourceFilePath}`);
                        }
                        // 分配存储空间
                        storageInfo = await this.storageManager.allocateNodeStorage(nodeId, name);
                        // 拷贝文件
                        const copySuccess = await FileUtils.copyFile(sourceFilePath, storageInfo.filePath);
                        if (!copySuccess) {
                            throw new InternalServerErrorException('文件拷贝失败');
                        }
                        // 更新节点的 path
                        await this.databaseService.fileSystemNode.update({
                            where: { id: nodeId },
                            data: { path: storageInfo.fileRelativePath },
                        });
                        this.logger.log(`[performCreateNode] IO操作成功: ${storageInfo.fileRelativePath}`);
                    }
                    catch (error) {
                        // IO失败，回滚数据库
                        this.logger.error(`[performCreateNode] IO操作失败，回滚数据库: ${error.message}`);
                        await this.databaseService.fileSystemNode.delete({
                            where: { id: nodeId },
                        });
                        throw error;
                    }
                }
                // 记录操作日志
                NodeUtils.logNodeOperation(nodeId, name, fileHash, 'create');
                return {
                    success: true,
                    nodeId,
                };
            }
            catch (error) {
                this.logger.error(`[performCreateNode] 创建节点失败: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message,
                };
            }
        }
        /**
         * 执行实际的节点引用操作
         *
         * @param hash 文件哈希值
         * @param context 节点引用上下文
         * @returns 创建结果
         */
        async performReferenceNode(hash, context) {
            const { context: nodeContext } = context;
            const { nodeId: parentId, userId: ownerId } = nodeContext;
            this.logger.log(`[performReferenceNode] 开始引用节点: ${hash}`);
            let newNodeId;
            let storageInfo = null;
            let originalNodeInfo = {
                name: '',
                extension: null,
                path: null,
            };
            try {
                // 阶段1：数据库操作（事务）
                await this.databaseService.$transaction(async (tx) => {
                    // 查找已存在的文件节点
                    const existingNode = await tx.fileSystemNode.findFirst({
                        where: {
                            fileHash: hash,
                            deletedAt: null,
                            isFolder: false,
                            path: { not: null },
                        },
                        select: {
                            id: true,
                            name: true,
                            fileHash: true,
                            size: true,
                            mimeType: true,
                            extension: true,
                            path: true,
                            ownerId: true,
                        },
                    });
                    if (!existingNode) {
                        throw new NotFoundException(`未找到哈希为 ${hash} 的文件节点`);
                    }
                    // 保存原节点信息供事务外使用
                    originalNodeInfo = {
                        name: existingNode.name,
                        extension: existingNode.extension,
                        path: existingNode.path,
                    };
                    // 检查是否在当前目录下已存在引用
                    const existingReference = await tx.fileSystemNode.findFirst({
                        where: {
                            parentId,
                            fileHash: hash,
                            ownerId,
                            deletedAt: null,
                        },
                    });
                    if (existingReference) {
                        // 引用已存在，直接返回
                        newNodeId = existingReference.id;
                        this.logger.log(`[performReferenceNode] 引用已存在: ${newNodeId}`);
                        return;
                    }
                    // 检查父节点是否存在
                    const parentNode = await tx.fileSystemNode.findUnique({
                        where: { id: parentId, deletedAt: null },
                        select: { id: true, isFolder: true },
                    });
                    if (!parentNode) {
                        throw new NotFoundException(`父节点不存在或已被删除: ${parentId}`);
                    }
                    if (!parentNode.isFolder) {
                        throw new BadRequestException(`父节点不是文件夹: ${parentId}`);
                    }
                    // 生成唯一文件名
                    const existingNames = await this.getExistingNodeNames(tx, parentId);
                    const uniqueName = NodeUtils.generateUniqueFileName(NodeUtils.extractBaseName(existingNode.name), existingNode.extension || '', existingNames);
                    // 获取父节点的projectId
                    const projectId = await this.fileTreeService.getProjectId(parentId);
                    // 创建引用节点
                    const newNode = await tx.fileSystemNode.create({
                        data: {
                            name: uniqueName,
                            originalName: existingNode.name,
                            isFolder: false,
                            isRoot: false,
                            parentId,
                            path: null, // 临时设为 null，IO操作完成后更新
                            size: existingNode.size,
                            mimeType: existingNode.mimeType,
                            extension: existingNode.extension,
                            fileStatus: FileStatus.COMPLETED,
                            fileHash: existingNode.fileHash,
                            ownerId,
                            projectId,
                        },
                    });
                    newNodeId = newNode.id;
                    this.logger.log(`[performReferenceNode] 数据库节点创建成功: ${newNodeId}, name=${uniqueName}`);
                });
                // 确保 newNodeId 已被赋值
                if (!newNodeId) {
                    throw new InternalServerErrorException('节点引用失败：newNodeId 未被赋值');
                }
                // 阶段2：IO操作（事务外）
                try {
                    // 检查 originalNodeInfo 是否存在
                    if (!originalNodeInfo || !originalNodeInfo.extension) {
                        throw new BadRequestException('原节点信息缺失');
                    }
                    // 分配存储空间
                    storageInfo = await this.storageManager.allocateNodeStorage(newNodeId, NodeUtils.extractBaseName(originalNodeInfo.name) +
                        originalNodeInfo.extension);
                    // 获取原节点存储信息
                    const sourceNode = await this.databaseService.fileSystemNode.findFirst({
                        where: { fileHash: hash, deletedAt: null, path: { not: null } },
                        select: { path: true },
                    });
                    if (!sourceNode || !sourceNode.path) {
                        throw new NotFoundException('原节点路径不存在');
                    }
                    // 拷贝文件
                    const sourceFullPath = this.storageManager.getFullPath(sourceNode.path);
                    const copySuccess = await FileUtils.copyFile(sourceFullPath, storageInfo.filePath);
                    if (!copySuccess) {
                        throw new InternalServerErrorException('文件拷贝失败');
                    }
                    // 更新节点的 path
                    await this.databaseService.fileSystemNode.update({
                        where: { id: newNodeId },
                        data: { path: storageInfo.fileRelativePath },
                    });
                    this.logger.log(`[performReferenceNode] IO操作成功: ${storageInfo.fileRelativePath}`);
                }
                catch (error) {
                    // IO失败，回滚数据库
                    this.logger.error(`[performReferenceNode] IO操作失败，回滚数据库: ${error.message}`);
                    await this.databaseService.fileSystemNode.delete({
                        where: { id: newNodeId },
                    });
                    throw error;
                }
                // 记录操作日志
                if (originalNodeInfo) {
                    NodeUtils.logNodeOperation(newNodeId, originalNodeInfo.name, hash, 'reference');
                }
                return {
                    success: true,
                    nodeId: newNodeId,
                };
            }
            catch (error) {
                this.logger.error(`[performReferenceNode] 引用节点失败: ${error.message}`, error.stack);
                return {
                    success: false,
                    errorMessage: error.message,
                };
            }
        }
        /**
         * 获取父节点下的所有现有节点名称
         *
         * @param tx 数据库事务
         * @param parentId 父节点 ID
         * @returns 节点名称列表
         */
        async getExistingNodeNames(tx, parentId) {
            const nodes = await tx.fileSystemNode.findMany({
                where: {
                    parentId,
                    deletedAt: null,
                },
                select: {
                    name: true,
                },
            });
            return nodes.map((node) => node.name);
        }
    };
    __setFunctionName(_classThis, "NodeCreationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        NodeCreationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return NodeCreationService = _classThis;
})();
export { NodeCreationService };
//# sourceMappingURL=node-creation.service.js.map