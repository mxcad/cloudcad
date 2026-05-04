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
import { Injectable, Logger, NotFoundException, BadRequestException, } from '@nestjs/common';
import { FileStatus, } from '@prisma/client';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
let FileTreeService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileTreeService = _classThis = class {
        constructor(prisma, storageManager, storageInfoService) {
            this.prisma = prisma;
            this.storageManager = storageManager;
            this.storageInfoService = storageInfoService;
            this.logger = new Logger(FileTreeService.name);
        }
        async createFileNode(options) {
            const { name, fileHash, size, mimeType, extension, parentId, ownerId, sourceFilePath, sourceDirectoryPath, skipFileCopy = false, } = options;
            this.logger.log(`[createFileNode] 开始创建文件节点: name=${name}, fileHash=${fileHash}, parentId=${parentId}, ownerId=${ownerId}, skipFileCopy=${skipFileCopy}`);
            const parent = await this.prisma.fileSystemNode.findUnique({
                where: { id: parentId, deletedAt: null },
                select: { id: true, isFolder: true, isRoot: true, projectId: true },
            });
            if (!parent) {
                throw new NotFoundException(`父节点不存在: ${parentId}`);
            }
            if (!parent.isFolder) {
                throw new BadRequestException('父节点必须是文件夹');
            }
            const createdNode = await this.prisma.$transaction(async (tx) => {
                // 检查是否已存在同名文件
                const existingNodes = await tx.fileSystemNode.findMany({
                    where: {
                        parentId,
                        name: {
                            equals: name,
                            mode: 'insensitive',
                        },
                        deletedAt: null,
                    },
                    select: { name: true },
                });
                // 生成唯一文件名
                const existingNames = existingNodes.map((n) => n.name);
                let uniqueName = name;
                if (existingNames.includes(name)) {
                    const lastDotIndex = name.lastIndexOf('.');
                    if (lastDotIndex === -1) {
                        let counter = 1;
                        do {
                            uniqueName = `${name} (${counter})`;
                            counter++;
                        } while (existingNames.includes(uniqueName));
                    }
                    else {
                        const nameWithoutExt = name.substring(0, lastDotIndex);
                        const fileExtension = name.substring(lastDotIndex);
                        let counter = 1;
                        do {
                            uniqueName = `${nameWithoutExt} (${counter})${fileExtension}`;
                            counter++;
                        } while (existingNames.includes(uniqueName));
                    }
                }
                // 获取正确的projectId
                const projectId = await this.getProjectId(parentId);
                const fileNode = await tx.fileSystemNode.create({
                    data: {
                        name: uniqueName,
                        isFolder: false,
                        isRoot: false,
                        parentId,
                        originalName: name,
                        path: null,
                        size,
                        mimeType,
                        extension,
                        fileStatus: FileStatus.COMPLETED,
                        fileHash,
                        ownerId,
                        projectId,
                    },
                });
                this.logger.log(`[createFileNode] 数据库节点创建成功: ID=${fileNode.id}`);
                let storageInfo = null;
                if (!skipFileCopy) {
                    storageInfo = await this.storageManager.allocateNodeStorage(fileNode.id, name);
                    this.logger.log(`[createFileNode] 物理目录创建成功: ${storageInfo.nodeDirectoryRelativePath}`);
                }
                else {
                    this.logger.log(`[createFileNode] skipFileCopy=true，跳过物理目录创建`);
                }
                if (!skipFileCopy) {
                    if (sourceFilePath) {
                        await fsPromises.copyFile(sourceFilePath, storageInfo.filePath);
                        this.logger.log(`[createFileNode] 文件拷贝成功: ${sourceFilePath} -> ${storageInfo.filePath}`);
                    }
                    else if (sourceDirectoryPath) {
                        const files = await fsPromises.readdir(sourceDirectoryPath);
                        const matchingFiles = files.filter((file) => file.startsWith(fileHash));
                        if (matchingFiles.length === 0) {
                            this.logger.warn(`[createFileNode] 未找到匹配 ${fileHash} 的文件`);
                        }
                        else {
                            const nodeDirectory = storageInfo.nodeDirectoryPath;
                            for (const file of matchingFiles) {
                                const sourcePath = path.join(sourceDirectoryPath, file);
                                const targetFileName = file.replace(fileHash, fileNode.id);
                                const targetPath = path.join(nodeDirectory, targetFileName);
                                await fsPromises.copyFile(sourcePath, targetPath);
                                this.logger.log(`[createFileNode] 文件拷贝成功: ${file} -> ${targetFileName}`);
                            }
                            this.logger.log(`[createFileNode] 目录文件拷贝成功: ${matchingFiles.length} 个文件`);
                        }
                    }
                    else {
                        this.logger.warn(`[createFileNode] 未提供源文件路径，跳过文件拷贝`);
                    }
                    await tx.fileSystemNode.update({
                        where: { id: fileNode.id },
                        data: { path: storageInfo.fileRelativePath },
                    });
                    this.logger.log(`[createFileNode] 节点 path 已更新: ${storageInfo.fileRelativePath}`);
                }
                else {
                    this.logger.log(`[createFileNode] skipFileCopy=true，保持 path 为 null，等待后续更新`);
                }
                return (await tx.fileSystemNode.findUnique({
                    where: { id: fileNode.id },
                }));
            });
            // 在事务外清除配额缓存
            const projectId = await this.getProjectId(parentId);
            await this.storageInfoService.invalidateQuotaCache(ownerId, projectId || undefined);
            this.logger.debug(`[createFileNode] 配额缓存已清除: userId=${ownerId}, projectId=${projectId}`);
            return createdNode;
        }
        async getNode(nodeId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId, deletedAt: null },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                return node;
            }
            catch (error) {
                this.logger.error(`获取节点失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        /**
         * 获取节点详情（不包含子节点，用于判断库类型）
         */
        async getNodeWithLibraryKey(nodeId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId, deletedAt: null },
                    select: { id: true, libraryKey: true, personalSpaceKey: true },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                return node;
            }
            catch (error) {
                this.logger.error(`获取节点失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async isLibraryNode(nodeId) {
            const libraryKey = await this.getLibraryKey(nodeId);
            return libraryKey !== null;
        }
        async getNodeTree(nodeId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    include: {
                        owner: {
                            select: {
                                id: true,
                                username: true,
                                nickname: true,
                            },
                        },
                        children: {
                            include: {
                                owner: {
                                    select: {
                                        id: true,
                                        username: true,
                                        nickname: true,
                                    },
                                },
                                _count: {
                                    select: {
                                        children: {
                                            where: { deletedAt: null },
                                        },
                                    },
                                },
                            },
                            orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
                        },
                    },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                // 确保返回的节点信息包含正确的projectId
                let projectId = node.projectId;
                if (!projectId && !node.isRoot) {
                    // 如果projectId为null且不是根节点，尝试获取正确的projectId
                    projectId = await this.getProjectId(nodeId);
                }
                else if (node.isRoot) {
                    // 如果是根节点，projectId就是节点本身的ID
                    projectId = node.id;
                }
                // 返回包含正确projectId的节点信息
                return {
                    ...node,
                    projectId,
                };
            }
            catch (error) {
                this.logger.error(`查询节点失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async getChildren(nodeId, userId, query) {
            const { search, nodeType, extension, fileStatus, page = 1, limit = 50, sortBy, sortOrder, includeDeleted = false, } = query || {};
            const safePage = Number(page) || 1;
            const safeLimit = Number(limit) || 50;
            const skip = (safePage - 1) * safeLimit;
            const where = {
                parentId: nodeId,
                deletedAt: includeDeleted ? undefined : null,
            };
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ];
            }
            if (nodeType) {
                where.isFolder = nodeType === 'folder';
            }
            if (extension) {
                where.extension = extension;
            }
            if (fileStatus) {
                where.fileStatus = fileStatus;
            }
            try {
                const parentNode = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: { id: true, deletedAt: true },
                });
                if (!parentNode || parentNode.deletedAt) {
                    return {
                        nodes: [],
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                    };
                }
                const [nodes, total] = await Promise.all([
                    this.prisma.fileSystemNode.findMany({
                        where,
                        skip,
                        take: safeLimit,
                        orderBy: sortBy
                            ? { [sortBy]: sortOrder }
                            : [{ isFolder: 'desc' }, { name: 'asc' }],
                        include: {
                            owner: {
                                select: {
                                    id: true,
                                    username: true,
                                    nickname: true,
                                },
                            },
                            _count: {
                                select: {
                                    children: {
                                        where: { deletedAt: null },
                                    },
                                },
                            },
                        },
                    }),
                    this.prisma.fileSystemNode.count({ where }),
                ]);
                return {
                    nodes,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / safeLimit),
                };
            }
            catch (error) {
                this.logger.error(`查询子节点失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async updateNodePath(nodeId, path) {
            try {
                const node = await this.prisma.fileSystemNode.update({
                    where: { id: nodeId },
                    data: { path },
                });
                this.logger.log(`节点路径更新成功: ${nodeId} -> ${path}`);
                return node;
            }
            catch (error) {
                this.logger.error(`节点路径更新失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async getRootNode(nodeId) {
            const node = await this.prisma.fileSystemNode.findUnique({
                where: { id: nodeId },
                select: { isRoot: true },
            });
            if (!node) {
                throw new NotFoundException('节点不存在');
            }
            if (node.isRoot) {
                return { id: nodeId };
            }
            // 使用统一的getProjectId方法获取项目ID
            const projectId = await this.getProjectId(nodeId);
            if (!projectId) {
                throw new NotFoundException('未找到根节点');
            }
            return { id: projectId };
        }
        async getProjectId(nodeId) {
            const node = await this.prisma.fileSystemNode.findUnique({
                where: { id: nodeId },
                select: { projectId: true, isRoot: true, parentId: true },
            });
            if (!node) {
                return null;
            }
            if (node.isRoot) {
                return nodeId;
            }
            if (node.projectId) {
                return node.projectId;
            }
            if (node.parentId) {
                return this.getProjectId(node.parentId);
            }
            return null;
        }
        async getLibraryKey(nodeId) {
            const node = await this.prisma.fileSystemNode.findUnique({
                where: { id: nodeId },
                select: { projectId: true, isRoot: true, libraryKey: true },
            });
            if (!node) {
                return null;
            }
            if (node.isRoot) {
                return node.libraryKey;
            }
            const projectId = node.projectId;
            if (!projectId) {
                return null;
            }
            const rootNode = await this.prisma.fileSystemNode.findUnique({
                where: { id: projectId },
                select: { libraryKey: true },
            });
            return rootNode?.libraryKey;
        }
        async getTrashItems(userId) {
            try {
                const projects = await this.prisma.fileSystemNode.findMany({
                    where: {
                        isRoot: true,
                        deletedAt: { not: null },
                        libraryKey: null,
                        OR: [
                            { ownerId: userId },
                            {
                                projectMembers: {
                                    some: { userId },
                                },
                            },
                        ],
                    },
                    include: {
                        owner: {
                            select: {
                                id: true,
                                email: true,
                                username: true,
                                nickname: true,
                            },
                        },
                        projectMembers: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        email: true,
                                        username: true,
                                        nickname: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        deletedAt: 'desc',
                    },
                });
                const nodes = await this.prisma.fileSystemNode.findMany({
                    where: {
                        deletedAt: { not: null },
                        ownerId: userId,
                        isRoot: false,
                        deletedByCascade: false,
                    },
                    include: {
                        owner: {
                            select: {
                                id: true,
                                username: true,
                                nickname: true,
                            },
                        },
                        _count: {
                            select: {
                                children: {
                                    where: { deletedAt: null },
                                },
                            },
                        },
                    },
                    orderBy: {
                        deletedAt: 'desc',
                    },
                });
                const allItems = [
                    ...projects.map((p) => ({ ...p, itemType: 'project' })),
                    ...nodes.map((n) => ({ ...n, itemType: 'node' })),
                ];
                return {
                    items: allItems,
                    total: allItems.length,
                };
            }
            catch (error) {
                this.logger.error(`获取回收站列表失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        /**
         * 递归获取某个节点下的所有文件（包括子目录中的文件）
         * @param nodeId 节点 ID
         * @param userId 用户 ID
         * @param query 查询参数
         * @returns 文件列表（分页）
         */
        async getAllFilesUnderNode(nodeId, userId, query) {
            const { search, extension, fileStatus, page = 1, limit = 50, sortBy, sortOrder, includeDeleted = false, } = query || {};
            const safePage = Number(page) || 1;
            const safeLimit = Number(limit) || 50;
            try {
                // 检查节点是否存在
                const parentNode = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: { id: true, deletedAt: true },
                });
                if (!parentNode || parentNode.deletedAt) {
                    return {
                        nodes: [],
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                    };
                }
                // 递归收集所有文件 ID
                const allFileIds = [];
                const collectFileIds = async (currentNodeId) => {
                    // 获取当前节点下的所有子节点
                    const children = await this.prisma.fileSystemNode.findMany({
                        where: {
                            parentId: currentNodeId,
                            deletedAt: includeDeleted ? undefined : null,
                        },
                        select: { id: true, isFolder: true },
                    });
                    for (const child of children) {
                        if (child.isFolder) {
                            // 递归处理文件夹
                            await collectFileIds(child.id);
                        }
                        else {
                            // 收集文件 ID
                            allFileIds.push(child.id);
                        }
                    }
                };
                // 从指定节点开始递归
                await collectFileIds(nodeId);
                // 如果没有文件，直接返回
                if (allFileIds.length === 0) {
                    return {
                        nodes: [],
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                    };
                }
                // 构建查询条件
                const skip = (safePage - 1) * safeLimit;
                const where = {
                    id: { in: allFileIds },
                    deletedAt: includeDeleted ? undefined : null,
                    isFolder: false, // 只返回文件
                };
                if (search) {
                    where.OR = [
                        { name: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } },
                    ];
                }
                if (extension) {
                    where.extension = extension;
                }
                if (fileStatus) {
                    where.fileStatus = fileStatus;
                }
                // 查询文件列表和总数
                const [nodes, total] = await Promise.all([
                    this.prisma.fileSystemNode.findMany({
                        where,
                        skip,
                        take: safeLimit,
                        orderBy: sortBy ? { [sortBy]: sortOrder } : [{ createdAt: 'desc' }],
                        include: {
                            owner: {
                                select: {
                                    id: true,
                                    username: true,
                                    nickname: true,
                                },
                            },
                        },
                    }),
                    this.prisma.fileSystemNode.count({ where }),
                ]);
                return {
                    nodes,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / safeLimit),
                };
            }
            catch (error) {
                this.logger.error(`递归获取文件失败: ${error.message}`, error.stack);
                throw error;
            }
        }
    };
    __setFunctionName(_classThis, "FileTreeService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileTreeService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileTreeService = _classThis;
})();
export { FileTreeService };
//# sourceMappingURL=file-tree.service.js.map