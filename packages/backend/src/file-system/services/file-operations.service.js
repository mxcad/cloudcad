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
import { FileStatus, ProjectStatus, } from '@prisma/client';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
let FileOperationsService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileOperationsService = _classThis = class {
        constructor(prisma, storageManager, configService, versionControlService, storageInfoService, fileTreeService) {
            this.prisma = prisma;
            this.storageManager = storageManager;
            this.configService = configService;
            this.versionControlService = versionControlService;
            this.storageInfoService = storageInfoService;
            this.fileTreeService = fileTreeService;
            this.logger = new Logger(FileOperationsService.name);
        }
        async checkNameUniqueness(name, userId, parentId, excludeNodeId) {
            if (!parentId) {
                const existingProject = await this.prisma.fileSystemNode.findFirst({
                    where: {
                        name: {
                            equals: name,
                            mode: 'insensitive',
                        },
                        ownerId: userId,
                        isRoot: true,
                        deletedAt: null,
                        ...(excludeNodeId && { id: { not: excludeNodeId } }),
                    },
                    select: { id: true },
                });
                if (existingProject) {
                    throw new BadRequestException('已存在同名项目，请使用其他名称');
                }
                return;
            }
            const existingNode = await this.prisma.fileSystemNode.findFirst({
                where: {
                    name: {
                        equals: name,
                        mode: 'insensitive',
                    },
                    parentId,
                    deletedAt: null,
                    ...(excludeNodeId && { id: { not: excludeNodeId } }),
                },
                select: { id: true, isFolder: true },
            });
            if (existingNode) {
                throw new BadRequestException(existingNode.isFolder
                    ? '同级目录已存在同名文件夹'
                    : '同级目录已存在同名文件');
            }
        }
        async generateUniqueName(parentId, baseName, isFolder) {
            const existingNodes = await this.prisma.fileSystemNode.findMany({
                where: {
                    parentId,
                    deletedAt: null,
                },
                select: { name: true },
            });
            const existingNames = new Set(existingNodes.map((n) => n.name));
            if (!existingNames.has(baseName)) {
                return baseName;
            }
            if (!isFolder) {
                const lastDotIndex = baseName.lastIndexOf('.');
                if (lastDotIndex === -1) {
                    return this.generateNumberedName(baseName, existingNames);
                }
                const nameWithoutExt = baseName.substring(0, lastDotIndex);
                const extension = baseName.substring(lastDotIndex);
                // 生成完整的模式，包含扩展名
                const generateFullName = (counter) => `${nameWithoutExt} (${counter})${extension}`;
                // 找到现有名称中的最大数字后缀
                let maxCounter = 0;
                const escapedNameWithoutExt = nameWithoutExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = new RegExp(`^${escapedNameWithoutExt} \((\d+)\)${escapedExtension}$`);
                for (const name of existingNames) {
                    const match = name.match(pattern);
                    if (match) {
                        const counter = parseInt(match[1], 10);
                        if (counter > maxCounter) {
                            maxCounter = counter;
                        }
                    }
                }
                // 从最大值+1开始计数
                let counter = maxCounter + 1;
                let newName;
                do {
                    newName = generateFullName(counter);
                    counter++;
                } while (existingNames.has(newName));
                return newName;
            }
            return this.generateNumberedName(baseName, existingNames);
        }
        generateNumberedName(baseName, existingNames) {
            // 对 baseName 进行正则转义，避免特殊字符影响匹配
            const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // 找到现有名称中的最大数字后缀
            let maxCounter = 0;
            const pattern = new RegExp(`^${escapedBaseName} \((\d+)\)$`);
            for (const name of existingNames) {
                const match = name.match(pattern);
                if (match) {
                    const counter = parseInt(match[1], 10);
                    if (counter > maxCounter) {
                        maxCounter = counter;
                    }
                }
            }
            // 从最大值+1开始计数
            let counter = maxCounter + 1;
            let newName;
            do {
                newName = `${baseName} (${counter})`;
                counter++;
            } while (existingNames.has(newName));
            return newName;
        }
        async deleteNode(nodeId, permanently = false) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: {
                        isRoot: true,
                        isFolder: true,
                        path: true,
                        fileHash: true,
                        deletedAt: true,
                        ownerId: true,
                        projectId: true,
                        size: true,
                    },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                const nodeType = node.isRoot ? '项目' : '节点';
                this.logger.log(`开始删除${nodeType}: ${nodeId}, permanently=${permanently}`);
                if (permanently) {
                    // 1. 收集所有需要删除的文件信息
                    const filesToDelete = [];
                    const nodesToDelete = [];
                    // 2. 递归收集文件信息（不执行删除操作）
                    await this.collectFilesToDelete(nodeId, filesToDelete, nodesToDelete);
                    // 3. 在事务中执行数据库操作（快速完成）
                    await this.prisma.$transaction(async (tx) => {
                        // 更新子文件节点状态
                        for (const file of filesToDelete) {
                            if (file.path) {
                                await tx.fileSystemNode.update({
                                    where: { id: file.nodeId },
                                    data: { deletedFromStorage: new Date() },
                                });
                            }
                        }
                        // 批量删除子节点
                        if (nodesToDelete.length > 0) {
                            await tx.fileSystemNode.deleteMany({
                                where: { id: { in: nodesToDelete } },
                            });
                        }
                        // 更新并删除主节点
                        if (!node.isFolder && node.path) {
                            await tx.fileSystemNode.update({
                                where: { id: nodeId },
                                data: { deletedFromStorage: new Date() },
                            });
                        }
                        await tx.fileSystemNode.delete({ where: { id: nodeId } });
                    }, {
                        timeout: 30000, // 增加事务超时时间到30秒
                    });
                    // 4. 在事务外部执行耗时的文件系统操作
                    for (const file of filesToDelete) {
                        if (file.path) {
                            await this.deleteFileFromStorage(file.path, file.fileHash, true);
                        }
                    }
                    // 5. 处理主节点的文件删除（如果是文件）
                    if (!node.isFolder && node.path) {
                        await this.deleteFileFromStorage(node.path, node.fileHash, true);
                    }
                    // 清除配额缓存
                    if (node.ownerId) {
                        await this.storageInfoService.invalidateQuotaCache(node.ownerId, node.projectId || undefined);
                    }
                    this.logger.log(`${nodeType}彻底删除成功: ${nodeId}`);
                    return { message: `${nodeType}已彻底删除` };
                }
                const updateData = {
                    deletedAt: new Date(),
                    deletedByCascade: false,
                };
                if (node.isRoot) {
                    updateData.projectStatus = ProjectStatus.DELETED;
                }
                else {
                    updateData.fileStatus = FileStatus.DELETED;
                }
                await this.prisma.fileSystemNode.update({
                    where: { id: nodeId },
                    data: updateData,
                });
                // 清除配额缓存（软删除也会影响已用空间）
                if (node.ownerId) {
                    await this.storageInfoService.invalidateQuotaCache(node.ownerId, node.projectId || undefined);
                }
                this.logger.log(`${nodeType}已移至回收站: ${nodeId}`);
                return { message: `${nodeType}已移至回收站` };
            }
            catch (error) {
                this.logger.error(`节点删除失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async deleteProject(projectId, permanently = false) {
            const project = await this.prisma.fileSystemNode.findUnique({
                where: { id: projectId, isRoot: true },
                select: { id: true, personalSpaceKey: true },
            });
            if (!project) {
                throw new NotFoundException('项目不存在');
            }
            if (project.personalSpaceKey) {
                throw new BadRequestException('私人空间不支持删除操作');
            }
            return this.deleteNode(projectId, permanently);
        }
        async restoreNode(nodeId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: {
                        isRoot: true,
                        isFolder: true,
                        deletedAt: true,
                        deletedByCascade: true,
                        parentId: true,
                        ownerId: true,
                        projectId: true,
                        name: true,
                    },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                if (!node.deletedAt) {
                    throw new BadRequestException('节点未被删除，无需恢复');
                }
                const nodeType = node.isRoot ? '项目' : '节点';
                if (!node.isRoot && node.parentId) {
                    const parentNode = await this.prisma.fileSystemNode.findUnique({
                        where: { id: node.parentId },
                        select: { deletedAt: true },
                    });
                    if (!parentNode) {
                        throw new NotFoundException('父节点不存在');
                    }
                    if (parentNode.deletedAt) {
                        throw new BadRequestException('父节点已被删除，无法恢复');
                    }
                }
                const updateData = {
                    deletedAt: null,
                    deletedByCascade: false,
                };
                if (node.isRoot) {
                    updateData.projectStatus = ProjectStatus.ACTIVE;
                }
                else {
                    updateData.fileStatus = FileStatus.COMPLETED;
                    // 检查是否存在文件名冲突，如果存在则生成唯一文件名
                    if (node.parentId && node.name) {
                        const uniqueName = await this.generateUniqueName(node.parentId, node.name, node.isFolder);
                        if (uniqueName !== node.name) {
                            updateData.name = uniqueName;
                        }
                    }
                }
                const restoredNode = await this.prisma.fileSystemNode.update({
                    where: { id: nodeId },
                    data: updateData,
                    include: {
                        owner: {
                            select: {
                                id: true,
                                username: true,
                                nickname: true,
                            },
                        },
                    },
                });
                // 清除配额缓存（恢复节点会增加已用空间）
                if (node.ownerId) {
                    await this.storageInfoService.invalidateQuotaCache(node.ownerId, node.projectId || undefined);
                }
                this.logger.log(`${nodeType}恢复成功: ${nodeId}`);
                return restoredNode;
            }
            catch (error) {
                this.logger.error(`节点恢复失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async restoreProject(projectId) {
            const project = await this.prisma.fileSystemNode.findFirst({
                where: { id: projectId, isRoot: true, deletedAt: { not: null } },
                select: {
                    id: true,
                    name: true,
                    ownerId: true,
                },
            });
            if (!project) {
                throw new NotFoundException('回收站中不存在该项目');
            }
            // 检查项目名称是否冲突，如果冲突则生成唯一名称
            const existingProject = await this.prisma.fileSystemNode.findFirst({
                where: {
                    name: {
                        equals: project.name,
                        mode: 'insensitive',
                    },
                    ownerId: project.ownerId,
                    isRoot: true,
                    deletedAt: null,
                    id: { not: project.id },
                },
                select: { id: true },
            });
            if (existingProject) {
                // 生成唯一项目名称
                const existingProjects = await this.prisma.fileSystemNode.findMany({
                    where: {
                        ownerId: project.ownerId,
                        isRoot: true,
                        deletedAt: null,
                    },
                    select: { name: true },
                });
                const existingNames = new Set(existingProjects.map((p) => p.name));
                let counter = 1;
                let newName;
                do {
                    newName = `${project.name} (${counter})`;
                    counter++;
                } while (existingNames.has(newName));
                // 更新项目名称
                await this.prisma.fileSystemNode.update({
                    where: { id: project.id },
                    data: { name: newName },
                });
            }
            await this.restoreNode(projectId);
            return { message: '项目已从回收站恢复' };
        }
        async getProjectTrash(projectId, userId, query) {
            const { search, nodeType, extension, page = 1, limit = 50, sortBy, sortOrder, } = query || {};
            const safePage = Number(page) || 1;
            const safeLimit = Number(limit) || 50;
            const skip = (safePage - 1) * safeLimit;
            const where = {
                deletedAt: { not: null },
            };
            const projectRoot = await this.prisma.fileSystemNode.findUnique({
                where: { id: projectId, isRoot: true },
                select: { id: true, ownerId: true },
            });
            if (!projectRoot) {
                throw new NotFoundException('项目不存在');
            }
            const allProjectNodeIds = await this.getAllProjectNodeIds(projectId);
            where.id = { in: allProjectNodeIds };
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
            try {
                const [nodes, total] = await Promise.all([
                    this.prisma.fileSystemNode.findMany({
                        where,
                        skip,
                        take: safeLimit,
                        orderBy: sortBy ? { [sortBy]: sortOrder } : { deletedAt: 'desc' },
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
                this.logger.error(`查询项目回收站失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async clearProjectTrash(projectId, userId) {
            try {
                // 获取项目信息用于缓存清除
                const project = await this.prisma.fileSystemNode.findUnique({
                    where: { id: projectId },
                    select: { ownerId: true },
                });
                // 1. 收集所有需要删除的文件信息
                const filesToDelete = [];
                const nodesToDelete = [];
                // 2. 递归收集文件信息（不执行删除操作）
                await this.collectFilesToDelete(projectId, filesToDelete, nodesToDelete);
                // 3. 在事务中执行数据库操作（快速完成）
                await this.prisma.$transaction(async (tx) => {
                    // 更新子文件节点状态
                    for (const file of filesToDelete) {
                        if (file.path) {
                            await tx.fileSystemNode.update({
                                where: { id: file.nodeId },
                                data: { deletedFromStorage: new Date() },
                            });
                        }
                    }
                    // 批量删除子节点
                    if (nodesToDelete.length > 0) {
                        await tx.fileSystemNode.deleteMany({
                            where: { id: { in: nodesToDelete } },
                        });
                    }
                }, {
                    timeout: 30000, // 增加事务超时时间到30秒
                });
                // 4. 在事务外部执行耗时的文件系统操作
                for (const file of filesToDelete) {
                    if (file.path) {
                        await this.deleteFileFromStorage(file.path, file.fileHash, true);
                    }
                }
                // 清除配额缓存
                if (project?.ownerId) {
                    await this.storageInfoService.invalidateQuotaCache(project.ownerId, projectId);
                }
                this.logger.log(`项目回收站已清空: ${projectId}`);
                return { message: '项目回收站已清空' };
            }
            catch (error) {
                this.logger.error(`清空项目回收站失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async getAllProjectNodeIds(projectId) {
            const nodeIds = [];
            const traverse = async (parentId) => {
                const children = await this.prisma.fileSystemNode.findMany({
                    where: { parentId },
                    select: { id: true },
                });
                for (const child of children) {
                    nodeIds.push(child.id);
                    await traverse(child.id);
                }
            };
            await traverse(projectId);
            return nodeIds;
        }
        async moveNode(nodeId, targetParentId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: {
                        isRoot: true,
                        parentId: true,
                        name: true,
                        isFolder: true,
                        ownerId: true,
                        projectId: true,
                    },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                if (node.isRoot) {
                    throw new BadRequestException('不能移动根节点');
                }
                const targetParent = await this.prisma.fileSystemNode.findUnique({
                    where: { id: targetParentId },
                    select: { isFolder: true, isRoot: true, projectId: true },
                });
                if (!targetParent) {
                    throw new NotFoundException('目标父节点不存在');
                }
                if (!targetParent.isFolder && !targetParent.isRoot) {
                    throw new BadRequestException('目标父节点必须是文件夹或项目根目录');
                }
                if (nodeId === targetParentId) {
                    throw new BadRequestException('不能将节点移动到自身');
                }
                // 检查是否存在命名冲突，如果存在则生成唯一名称
                const uniqueName = await this.generateUniqueName(targetParentId, node.name, node.isFolder);
                // 计算新的projectId
                const newProjectId = await this.fileTreeService.getProjectId(targetParentId);
                const movedNode = await this.prisma.fileSystemNode.update({
                    where: { id: nodeId },
                    data: {
                        parentId: targetParentId,
                        projectId: newProjectId,
                        name: uniqueName,
                    },
                    include: {
                        owner: {
                            select: {
                                id: true,
                                username: true,
                                nickname: true,
                            },
                        },
                    },
                });
                // 清除配额缓存（源项目和目标项目可能不同）
                if (node.ownerId) {
                    // 清除源项目缓存
                    await this.storageInfoService.invalidateQuotaCache(node.ownerId, node.projectId || undefined);
                    // 清除目标项目缓存（如果不同）
                    if (newProjectId !== node.projectId) {
                        await this.storageInfoService.invalidateQuotaCache(node.ownerId, newProjectId || undefined);
                    }
                }
                this.logger.log(`节点移动成功: ${nodeId} -> ${targetParentId}`);
                return movedNode;
            }
            catch (error) {
                this.logger.error(`节点移动失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async copyNode(nodeId, targetParentId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: {
                        id: true,
                        name: true,
                        isRoot: true,
                        isFolder: true,
                        originalName: true,
                        path: true,
                        size: true,
                        mimeType: true,
                        extension: true,
                        fileStatus: true,
                        fileHash: true,
                        description: true,
                        ownerId: true,
                    },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                if (node.isRoot) {
                    throw new BadRequestException('不能拷贝根节点');
                }
                const targetParent = await this.prisma.fileSystemNode.findUnique({
                    where: { id: targetParentId },
                    select: { isFolder: true, isRoot: true },
                });
                if (!targetParent) {
                    throw new NotFoundException('目标父节点不存在');
                }
                if (!targetParent.isFolder && !targetParent.isRoot) {
                    throw new BadRequestException('目标父节点必须是文件夹或项目根目录');
                }
                if (nodeId === targetParentId) {
                    throw new BadRequestException('不能将节点拷贝到自身');
                }
                const uniqueName = await this.generateUniqueName(targetParentId, node.name, node.isFolder);
                const copiedNode = await this.copyNodeRecursive(nodeId, targetParentId, uniqueName, node.ownerId);
                // 清除配额缓存（复制会增加目标项目的存储使用量）
                const projectId = await this.fileTreeService.getProjectId(targetParentId);
                if (node.ownerId) {
                    await this.storageInfoService.invalidateQuotaCache(node.ownerId, projectId || undefined);
                }
                this.logger.log(`节点拷贝成功: ${nodeId} -> ${copiedNode.id}`);
                return copiedNode;
            }
            catch (error) {
                this.logger.error(`节点拷贝失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async copyNodeRecursive(sourceNodeId, targetParentId, newName, ownerId) {
            const sourceNode = await this.prisma.fileSystemNode.findUnique({
                where: { id: sourceNodeId },
                include: {
                    children: {
                        select: {
                            id: true,
                            name: true,
                            isFolder: true,
                        },
                    },
                },
            });
            if (!sourceNode) {
                throw new NotFoundException('源节点不存在');
            }
            // 获取目标父节点的projectId
            const projectId = await this.fileTreeService.getProjectId(targetParentId);
            // 先创建新节点
            const newNode = await this.prisma.fileSystemNode.create({
                data: {
                    name: newName,
                    originalName: sourceNode.originalName || newName,
                    isFolder: sourceNode.isFolder,
                    isRoot: false,
                    parentId: targetParentId,
                    path: sourceNode.path,
                    size: sourceNode.size,
                    mimeType: sourceNode.mimeType,
                    extension: sourceNode.extension,
                    fileStatus: sourceNode.fileStatus,
                    fileHash: sourceNode.fileHash,
                    description: sourceNode.description,
                    ownerId,
                    projectId,
                },
                include: {
                    owner: {
                        select: {
                            id: true,
                            username: true,
                            nickname: true,
                        },
                    },
                },
            });
            // 如果是文件且有路径，需要复制文件及其相关文件
            if (!sourceNode.isFolder && sourceNode.path) {
                try {
                    // 获取源节点的目录路径
                    const sourceDirRelativePath = this.storageManager.getNodeDirectoryRelativePath(sourceNode.path);
                    const fileName = path.basename(sourceNode.path);
                    // 复制整个目录（包括所有相关文件，如外部参照、缩略图等）
                    const newFilePath = await this.storageManager.copyNodeDirectory(sourceDirRelativePath, newNode.id, fileName);
                    // 更新新节点的路径
                    await this.prisma.fileSystemNode.update({
                        where: { id: newNode.id },
                        data: { path: newFilePath },
                    });
                }
                catch (error) {
                    this.logger.error(`复制文件失败: ${sourceNodeId}`, error.stack);
                    // 继续执行，不阻止节点创建
                }
            }
            if (sourceNode.isFolder && sourceNode.children.length > 0) {
                // 维护一个已使用的名称集合，确保子节点名称唯一性
                const usedNames = new Set();
                for (const child of sourceNode.children) {
                    let childUniqueName = child.name;
                    let counter = 1;
                    // 检查名称是否已被使用（包括数据库中已存在的和当前复制过程中已使用的）
                    const existingNames = await this.prisma.fileSystemNode.findMany({
                        where: {
                            parentId: newNode.id,
                            deletedAt: null,
                        },
                        select: { name: true },
                    });
                    const existingNamesSet = new Set(existingNames.map((n) => n.name));
                    // 生成唯一名称
                    while (existingNamesSet.has(childUniqueName) || usedNames.has(childUniqueName)) {
                        const lastDotIndex = child.name.lastIndexOf('.');
                        if (lastDotIndex === -1) {
                            childUniqueName = `${child.name} (${counter})`;
                        }
                        else {
                            const nameWithoutExt = child.name.substring(0, lastDotIndex);
                            const extension = child.name.substring(lastDotIndex);
                            childUniqueName = `${nameWithoutExt} (${counter})${extension}`;
                        }
                        counter++;
                    }
                    // 将生成的名称添加到已使用集合中
                    usedNames.add(childUniqueName);
                    await this.copyNodeRecursive(child.id, newNode.id, childUniqueName, ownerId);
                }
            }
            return newNode;
        }
        async softDeleteDescendants(tx, nodeId) {
            const children = await tx.fileSystemNode.findMany({
                where: { parentId: nodeId },
                select: { id: true, isFolder: true },
            });
            for (const child of children) {
                await this.softDeleteDescendants(tx, child.id);
            }
            if (children.length > 0) {
                const childIds = children.map((c) => c.id);
                await tx.fileSystemNode.updateMany({
                    where: { id: { in: childIds } },
                    data: {
                        deletedAt: new Date(),
                        fileStatus: FileStatus.DELETED,
                        deletedByCascade: true,
                    },
                });
            }
        }
        async deleteDescendantsWithFiles(tx, nodeId) {
            const children = await tx.fileSystemNode.findMany({
                where: { parentId: nodeId },
                select: { id: true, isFolder: true, path: true, fileHash: true },
            });
            for (const child of children) {
                await this.deleteDescendantsWithFiles(tx, child.id);
            }
            if (children.length > 0) {
                for (const child of children) {
                    if (!child.isFolder && child.path) {
                        await this.deleteFileIfNotReferenced(tx, child.path, child.fileHash);
                        await tx.fileSystemNode.update({
                            where: { id: child.id },
                            data: { deletedFromStorage: new Date() },
                        });
                    }
                }
                const childIds = children.map((c) => c.id);
                await tx.fileSystemNode.deleteMany({
                    where: { id: { in: childIds } },
                });
            }
        }
        async deleteFileIfNotReferenced(tx, nodePath, fileHash) {
            if (!nodePath)
                return;
            const pathParts = nodePath.split('/');
            if (pathParts.length < 3) {
                this.logger.warn(`nodePath 格式不正确，跳过删除: ${nodePath} (期望格式: YYYYMM[/N]/nodeId/文件名)`);
                return;
            }
            this.logger.log(`准备删除节点物理目录: ${nodePath}`);
            try {
                const filesDataPath = this.configService.get('filesDataPath', { infer: true });
                const nodeDirectory = path.join(filesDataPath, path.dirname(nodePath));
                if (this.versionControlService.isReady()) {
                    try {
                        const deleteResult = await this.versionControlService.deleteNodeDirectory(nodeDirectory);
                        if (deleteResult.success) {
                            this.logger.log(`节点目录已从 SVN 标记删除: ${nodeDirectory}`);
                        }
                        else {
                            this.logger.warn(`节点目录从 SVN 标记删除失败: ${nodeDirectory}, 原因: ${deleteResult.message}`);
                        }
                    }
                    catch (svnError) {
                        this.logger.error(`节点目录从 SVN 标记删除失败: ${nodeDirectory}, 错误: ${svnError.message}`);
                    }
                }
                const fullPath = this.storageManager.getFullPath(nodePath);
                const nodeDirectoryPath = path.dirname(fullPath);
                const nodeId = pathParts[pathParts.length - 2];
                if (!nodeDirectoryPath.endsWith(nodeId)) {
                    this.logger.error(`路径验证失败，拒绝删除: ${nodeDirectoryPath} (期望以 ${nodeId} 结尾)`);
                    throw new BadRequestException(`路径验证失败，无法安全删除`);
                }
                await fsPromises.rm(nodeDirectoryPath, { recursive: true, force: true });
                this.logger.log(`节点目录已删除: ${nodeDirectoryPath}`);
            }
            catch (error) {
                this.logger.error(`删除物理文件失败: ${nodePath} - ${error.message}`, error.stack);
            }
        }
        // 收集需要删除的文件信息
        async collectFilesToDelete(nodeId, filesToDelete, nodesToDelete) {
            const children = await this.prisma.fileSystemNode.findMany({
                where: { parentId: nodeId },
                select: { id: true, isFolder: true, path: true, fileHash: true },
            });
            for (const child of children) {
                await this.collectFilesToDelete(child.id, filesToDelete, nodesToDelete);
            }
            for (const child of children) {
                if (!child.isFolder && child.path) {
                    filesToDelete.push({ path: child.path, fileHash: child.fileHash, nodeId: child.id });
                }
                nodesToDelete.push(child.id);
            }
        }
        // 从存储中删除文件（事务外执行）
        async deleteFileFromStorage(nodePath, fileHash, commitSvn) {
            if (!nodePath)
                return;
            try {
                const filesDataPath = this.configService.get('filesDataPath', { infer: true });
                const nodeDirectory = path.join(filesDataPath, path.dirname(nodePath));
                if (commitSvn && this.versionControlService.isReady()) {
                    try {
                        const deleteResult = await this.versionControlService.deleteNodeDirectory(nodeDirectory);
                        if (deleteResult.success) {
                            this.logger.log(`节点目录已从 SVN 标记删除: ${nodeDirectory}`);
                        }
                    }
                    catch (svnError) {
                        this.logger.error(`节点目录从 SVN 标记删除失败: ${nodeDirectory}`, svnError);
                    }
                }
                const fullPath = this.storageManager.getFullPath(nodePath);
                const nodeDirectoryPath = path.dirname(fullPath);
                const pathParts = nodePath.split('/');
                const nodeId = pathParts[pathParts.length - 2];
                if (!nodeDirectoryPath.endsWith(nodeId)) {
                    this.logger.error(`路径验证失败，拒绝删除: ${nodeDirectoryPath}`);
                    return;
                }
                await fsPromises.rm(nodeDirectoryPath, { recursive: true, force: true });
                this.logger.log(`节点目录已删除: ${nodeDirectoryPath}`);
            }
            catch (error) {
                this.logger.error(`删除物理文件失败: ${nodePath}`, error);
            }
        }
        async permanentlyDeleteProject(projectId, commitSvn = true) {
            try {
                const project = await this.prisma.fileSystemNode.findUnique({
                    where: { id: projectId },
                    select: {
                        isFolder: true,
                        path: true,
                        fileHash: true,
                        name: true,
                        ownerId: true,
                    },
                });
                if (!project) {
                    throw new NotFoundException('项目不存在');
                }
                // 1. 收集所有需要删除的文件信息
                const filesToDelete = [];
                const nodesToDelete = [];
                // 2. 递归收集文件信息（不执行删除操作）
                await this.collectFilesToDelete(projectId, filesToDelete, nodesToDelete);
                // 3. 在事务中执行数据库操作（快速完成）
                await this.prisma.$transaction(async (tx) => {
                    // 更新子文件节点状态
                    for (const file of filesToDelete) {
                        if (file.path) {
                            await tx.fileSystemNode.update({
                                where: { id: file.nodeId },
                                data: { deletedFromStorage: new Date() },
                            });
                        }
                    }
                    // 批量删除子节点
                    if (nodesToDelete.length > 0) {
                        await tx.fileSystemNode.deleteMany({
                            where: { id: { in: nodesToDelete } },
                        });
                    }
                    // 更新并删除主节点
                    if (!project.isFolder && project.path) {
                        await tx.fileSystemNode.update({
                            where: { id: projectId },
                            data: { deletedFromStorage: new Date() },
                        });
                    }
                    await tx.fileSystemNode.delete({
                        where: { id: projectId, isRoot: true, deletedAt: { not: null } },
                    });
                }, {
                    timeout: 30000, // 增加事务超时时间到30秒
                });
                // 4. 在事务外部执行耗时的文件系统操作
                for (const file of filesToDelete) {
                    if (file.path) {
                        await this.deleteFileFromStorage(file.path, file.fileHash, commitSvn);
                    }
                }
                // 5. 处理主节点的文件删除（如果是文件）
                if (!project.isFolder && project.path) {
                    await this.deleteFileFromStorage(project.path, project.fileHash, commitSvn);
                }
                // 清除配额缓存
                if (project.ownerId) {
                    await this.storageInfoService.invalidateQuotaCache(project.ownerId);
                }
                if (commitSvn && this.versionControlService.isReady()) {
                    try {
                        const commitResult = await this.versionControlService.commitWorkingCopy(`删除项目: ${project.name} (${projectId})`);
                        if (commitResult.success) {
                            this.logger.log(`删除项目的 SVN 更改已提交: ${project.name}`);
                        }
                        else {
                            this.logger.warn(`删除项目的 SVN 更改提交失败: ${project.name}, 原因: ${commitResult.message}`);
                        }
                    }
                    catch (svnError) {
                        this.logger.error(`删除项目的 SVN 更改提交失败: ${project.name}, 错误: ${svnError.message}`);
                    }
                }
                this.logger.log(`项目已从回收站彻底删除: ${projectId}`);
                return { message: '项目已彻底删除' };
            }
            catch (error) {
                this.logger.error(`项目彻底删除失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async permanentlyDeleteNode(nodeId, commitSvn = true) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: {
                        isFolder: true,
                        path: true,
                        fileHash: true,
                        name: true,
                        ownerId: true,
                        projectId: true,
                    },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                // 1. 收集所有需要删除的文件信息
                const filesToDelete = [];
                const nodesToDelete = [];
                // 2. 递归收集文件信息（不执行删除操作）
                await this.collectFilesToDelete(nodeId, filesToDelete, nodesToDelete);
                // 3. 在事务中执行数据库操作（快速完成）
                await this.prisma.$transaction(async (tx) => {
                    // 更新子文件节点状态
                    for (const file of filesToDelete) {
                        if (file.path) {
                            await tx.fileSystemNode.update({
                                where: { id: file.nodeId },
                                data: { deletedFromStorage: new Date() },
                            });
                        }
                    }
                    // 批量删除子节点
                    if (nodesToDelete.length > 0) {
                        await tx.fileSystemNode.deleteMany({
                            where: { id: { in: nodesToDelete } },
                        });
                    }
                    // 更新并删除主节点
                    if (!node.isFolder && node.path) {
                        await tx.fileSystemNode.update({
                            where: { id: nodeId },
                            data: { deletedFromStorage: new Date() },
                        });
                    }
                    await tx.fileSystemNode.delete({ where: { id: nodeId } });
                }, {
                    timeout: 30000, // 增加事务超时时间到30秒
                });
                // 4. 在事务外部执行耗时的文件系统操作
                for (const file of filesToDelete) {
                    if (file.path) {
                        await this.deleteFileFromStorage(file.path, file.fileHash, commitSvn);
                    }
                }
                // 5. 处理主节点的文件删除（如果是文件）
                if (!node.isFolder && node.path) {
                    await this.deleteFileFromStorage(node.path, node.fileHash, commitSvn);
                }
                // 清除配额缓存
                if (node.ownerId) {
                    await this.storageInfoService.invalidateQuotaCache(node.ownerId, node.projectId || undefined);
                }
                if (commitSvn && this.versionControlService.isReady()) {
                    try {
                        const commitResult = await this.versionControlService.commitWorkingCopy(`删除节点: ${node.name} (${nodeId})`);
                        if (commitResult.success) {
                            this.logger.log(`删除节点的 SVN 更改已提交: ${node.name}`);
                        }
                        else {
                            this.logger.warn(`删除节点的 SVN 更改提交失败: ${node.name}, 原因: ${commitResult.message}`);
                        }
                    }
                    catch (svnError) {
                        this.logger.error(`删除节点的 SVN 更改提交失败: ${node.name}, 错误: ${svnError.message}`);
                    }
                }
                this.logger.log(`节点已从回收站彻底删除: ${nodeId}`);
                return { message: '已彻底删除' };
            }
            catch (error) {
                this.logger.error(`节点彻底删除失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async restoreTrashItems(itemIds) {
            try {
                if (!itemIds || itemIds.length === 0) {
                    return { message: '请选择要恢复的项目' };
                }
                const items = await this.prisma.fileSystemNode.findMany({
                    where: {
                        id: { in: itemIds },
                        deletedAt: { not: null },
                    },
                    select: { id: true, isRoot: true, isFolder: true, parentId: true },
                });
                if (items.length === 0) {
                    throw new NotFoundException('未找到要恢复的项目');
                }
                for (const item of items) {
                    if (item.isRoot) {
                        await this.restoreProject(item.id);
                    }
                    else {
                        await this.restoreNode(item.id);
                    }
                }
                this.logger.log(`批量恢复成功: ${items.length} 个项目`);
                return { message: `已恢复 ${items.length} 个项目` };
            }
            catch (error) {
                this.logger.error(`批量恢复失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async permanentlyDeleteTrashItems(itemIds) {
            try {
                if (!itemIds || itemIds.length === 0) {
                    return { message: '请选择要删除的项目' };
                }
                const items = await this.prisma.fileSystemNode.findMany({
                    where: {
                        id: { in: itemIds },
                        deletedAt: { not: null },
                    },
                    select: { id: true, isRoot: true },
                });
                if (items.length === 0) {
                    throw new NotFoundException('未找到要删除的项目');
                }
                for (const item of items) {
                    if (item.isRoot) {
                        await this.permanentlyDeleteProject(item.id, false);
                    }
                    else {
                        await this.permanentlyDeleteNode(item.id, false);
                    }
                }
                if (this.versionControlService.isReady()) {
                    try {
                        const commitResult = await this.versionControlService.commitWorkingCopy(`批量删除 ${items.length} 个项目/节点`);
                        if (commitResult.success) {
                            this.logger.log(`批量删除的 SVN 更改已提交: ${items.length} 个项目/节点`);
                        }
                        else {
                            this.logger.warn(`批量删除的 SVN 更改提交失败: ${items.length} 个项目/节点, 原因: ${commitResult.message}`);
                        }
                    }
                    catch (svnError) {
                        this.logger.error(`批量删除的 SVN 更改提交失败: ${items.length} 个项目/节点, 错误: ${svnError.message}`);
                    }
                }
                this.logger.log(`批量彻底删除成功: ${items.length} 个项目`);
                return { message: `已彻底删除 ${items.length} 个项目` };
            }
            catch (error) {
                this.logger.error(`批量彻底删除失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async clearTrash(userId) {
            try {
                const projects = await this.prisma.fileSystemNode.findMany({
                    where: {
                        isRoot: true,
                        deletedAt: { not: null },
                        projectMembers: { some: { userId } },
                    },
                    select: { id: true },
                });
                const nodes = await this.prisma.fileSystemNode.findMany({
                    where: {
                        deletedAt: { not: null },
                        ownerId: userId,
                    },
                    select: { id: true, isFolder: true, path: true, fileHash: true },
                });
                for (const project of projects) {
                    await this.permanentlyDeleteProject(project.id, false);
                }
                for (const node of nodes) {
                    if (!node.isFolder && node.path) {
                        await this.deleteFileIfNotReferenced(this.prisma, node.path, node.fileHash);
                    }
                }
                await this.prisma.fileSystemNode.deleteMany({
                    where: {
                        id: { in: nodes.map((n) => n.id) },
                    },
                });
                // 清除用户配额缓存
                await this.storageInfoService.invalidateQuotaCache(userId);
                if (this.versionControlService.isReady()) {
                    try {
                        const commitResult = await this.versionControlService.commitWorkingCopy(`清空用户回收站: ${userId}`);
                        if (commitResult.success) {
                            this.logger.log(`清空回收站的 SVN 更改已提交: ${userId}`);
                        }
                        else {
                            this.logger.warn(`清空回收站的 SVN 更改提交失败: ${userId}, 原因: ${commitResult.message}`);
                        }
                    }
                    catch (svnError) {
                        this.logger.error(`清空回收站的 SVN 更改提交失败: ${userId}, 错误: ${svnError.message}`);
                    }
                }
                this.logger.log(`用户回收站已清空: ${userId}`);
                return { message: '回收站已清空' };
            }
            catch (error) {
                this.logger.error(`清空回收站失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async updateNode(nodeId, dto) {
            try {
                const currentNode = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: {
                        name: true,
                        isFolder: true,
                        extension: true,
                        isRoot: true,
                        parentId: true,
                        ownerId: true,
                    },
                });
                if (!currentNode) {
                    throw new NotFoundException('节点不存在');
                }
                if (dto.name && dto.name !== currentNode.name) {
                    if (!currentNode.isFolder && currentNode.extension) {
                        const newExtension = path.extname(dto.name).toLowerCase();
                        const currentExtension = currentNode.extension.toLowerCase();
                        if (newExtension && newExtension !== currentExtension) {
                            throw new BadRequestException(`不允许修改文件扩展名。文件扩展名必须保持为 ${currentExtension}`);
                        }
                        if (!newExtension && currentExtension) {
                            dto.name = `${dto.name}${currentExtension}`;
                        }
                    }
                    await this.checkNameUniqueness(dto.name, currentNode.ownerId, currentNode.isRoot ? null : currentNode.parentId, nodeId);
                }
                const node = await this.prisma.fileSystemNode.update({
                    where: { id: nodeId },
                    data: {
                        name: dto.name,
                        description: dto.description,
                    },
                    include: {
                        owner: {
                            select: {
                                id: true,
                                username: true,
                                nickname: true,
                            },
                        },
                    },
                });
                this.logger.log(`节点更新成功: ${node.name}`);
                return node;
            }
            catch (error) {
                this.logger.error(`节点更新失败: ${error.message}`, error.stack);
                throw error;
            }
        }
    };
    __setFunctionName(_classThis, "FileOperationsService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileOperationsService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileOperationsService = _classThis;
})();
export { FileOperationsService };
//# sourceMappingURL=file-operations.service.js.map