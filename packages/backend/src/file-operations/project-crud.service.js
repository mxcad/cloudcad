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
import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException, } from '@nestjs/common';
import { ProjectStatus, } from '@prisma/client';
let ProjectCrudService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectCrudService = _classThis = class {
        constructor(prisma, storageManager, personalSpaceService, fileOperationsService, fileTreeService) {
            this.prisma = prisma;
            this.storageManager = storageManager;
            this.personalSpaceService = personalSpaceService;
            this.fileOperationsService = fileOperationsService;
            this.fileTreeService = fileTreeService;
            this.logger = new Logger(ProjectCrudService.name);
        }
        async createNode(userId, name, options) {
            const { parentId, description } = options || {};
            const isProject = !parentId;
            try {
                if (isProject) {
                    await this.fileOperationsService.checkNameUniqueness(name, userId, null);
                    const ownerRole = await this.prisma.projectRole.findFirst({
                        where: { name: 'PROJECT_OWNER', isSystem: true },
                    });
                    if (!ownerRole) {
                        throw new InternalServerErrorException('PROJECT_OWNER 角色不存在，请检查系统初始化');
                    }
                    const node = await this.prisma.fileSystemNode.create({
                        data: {
                            name,
                            description,
                            isFolder: true,
                            isRoot: true,
                            projectStatus: ProjectStatus.ACTIVE,
                            ownerId: userId,
                            projectMembers: {
                                create: {
                                    userId,
                                    projectRoleId: ownerRole.id,
                                },
                            },
                        },
                    });
                    this.logger.log(`项目创建成功: ${node.name} by user ${userId}`);
                    return node;
                }
                const parent = await this.prisma.fileSystemNode.findUnique({
                    where: { id: parentId },
                    select: { id: true, isFolder: true, isRoot: true, projectId: true },
                });
                if (!parent) {
                    throw new NotFoundException('父节点不存在');
                }
                if (!parent.isFolder) {
                    throw new BadRequestException('只能在文件夹下创建子文件夹');
                }
                // 检查文件夹名称唯一性
                await this.fileOperationsService.checkNameUniqueness(name, userId, parentId);
                // 获取正确的projectId
                const projectId = await this.fileTreeService.getProjectId(parentId);
                const node = await this.prisma.fileSystemNode.create({
                    data: {
                        name,
                        description,
                        isFolder: true,
                        isRoot: false,
                        parentId,
                        ownerId: userId,
                        projectId,
                    },
                });
                this.logger.log(`文件夹创建成功: ${node.name} by user ${userId}`);
                return node;
            }
            catch (error) {
                this.logger.error(`节点创建失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async createProject(userId, dto) {
            return this.createNode(userId, dto.name, { description: dto.description });
        }
        async createFolder(userId, parentId, dto) {
            // 如果 skipIfExists 为 true，先检查同名文件夹是否存在
            const shouldSkip = dto.skipIfExists === true;
            if (shouldSkip) {
                const existingFolder = await this.prisma.fileSystemNode.findFirst({
                    where: {
                        name: {
                            equals: dto.name,
                            mode: 'insensitive',
                        },
                        parentId: parentId || null,
                        isFolder: true,
                        deletedAt: null,
                    },
                    select: { id: true },
                });
                // 如果存在，直接返回现有文件夹ID
                if (existingFolder) {
                    this.logger.log(`文件夹已存在，跳过创建: ${dto.name} (ID: ${existingFolder.id})`);
                    return await this.prisma.fileSystemNode.findUnique({
                        where: { id: existingFolder.id },
                    });
                }
            }
            // 非 skipIfExists 模式或文件夹不存在时，检查名称唯一性后再创建
            await this.fileOperationsService.checkNameUniqueness(dto.name, userId, parentId);
            return this.createNode(userId, dto.name, { parentId });
        }
        async getUserProjects(userId, query) {
            const { search, projectStatus, page = 1, limit = 20, sortBy, sortOrder, filter, } = query || {};
            // HTTP 查询参数是字符串，确保转为数字
            const pageNum = Number(page) || 1;
            const limitNum = Number(limit) || 20;
            const skip = (pageNum - 1) * limitNum;
            let ownerCondition;
            switch (filter) {
                case 'owned':
                    ownerCondition = { ownerId: userId };
                    break;
                case 'joined':
                    ownerCondition = {
                        projectMembers: {
                            some: { userId },
                        },
                        ownerId: { not: userId },
                    };
                    break;
                case 'all':
                default:
                    ownerCondition = {
                        OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
                    };
                    break;
            }
            const where = {
                isRoot: true,
                deletedAt: null,
                personalSpaceKey: null,
                libraryKey: null,
                ...ownerCondition,
            };
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ];
            }
            if (projectStatus) {
                where.projectStatus = projectStatus;
            }
            try {
                const [nodes, total] = await Promise.all([
                    this.prisma.fileSystemNode.findMany({
                        where,
                        skip,
                        take: limitNum,
                        orderBy: sortBy ? { [sortBy]: sortOrder } : { updatedAt: 'desc' },
                        include: {
                            _count: {
                                select: {
                                    children: {
                                        where: { deletedAt: null },
                                    },
                                    projectMembers: true,
                                },
                            },
                        },
                    }),
                    this.prisma.fileSystemNode.count({ where }),
                ]);
                const nodeList = nodes.map((node) => ({
                    id: node.id,
                    name: node.name,
                    description: node.description,
                    isFolder: node.isFolder,
                    isRoot: node.isRoot,
                    parentId: node.parentId,
                    path: node.path,
                    size: node.size,
                    mimeType: node.mimeType,
                    fileHash: node.fileHash,
                    fileStatus: node.fileStatus,
                    createdAt: node.createdAt,
                    updatedAt: node.updatedAt,
                    deletedAt: node.deletedAt,
                    ownerId: node.ownerId,
                    personalSpaceKey: node.personalSpaceKey,
                    libraryKey: node.libraryKey,
                    childrenCount: node._count?.children,
                    projectId: node.projectId,
                }));
                return {
                    nodes: nodeList,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                };
            }
            catch (error) {
                this.logger.error(`查询项目列表失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async getUserDeletedProjects(userId, query) {
            const { search, page = 1, limit = 20, sortBy, sortOrder } = query || {};
            const pageNum = Number(page) || 1;
            const limitNum = Number(limit) || 20;
            const skip = (pageNum - 1) * limitNum;
            const where = {
                isRoot: true,
                deletedAt: { not: null },
                personalSpaceKey: null,
                libraryKey: null,
                OR: [
                    { ownerId: userId },
                    {
                        projectMembers: {
                            some: { userId },
                        },
                    },
                ],
            };
            this.logger.log(`查询已删除项目 - 用户ID: ${userId}, 查询条件: ${JSON.stringify(where)}`);
            if (search) {
                where.AND = [
                    {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            { description: { contains: search, mode: 'insensitive' } },
                        ],
                    },
                ];
            }
            try {
                const [nodes, total] = await Promise.all([
                    this.prisma.fileSystemNode.findMany({
                        where,
                        skip,
                        take: limitNum,
                        orderBy: sortBy ? { [sortBy]: sortOrder } : { deletedAt: 'desc' },
                        include: {
                            _count: {
                                select: {
                                    children: {
                                        where: { deletedAt: null },
                                    },
                                    projectMembers: true,
                                },
                            },
                        },
                    }),
                    this.prisma.fileSystemNode.count({ where }),
                ]);
                this.logger.log(`查询已删除项目结果 - 找到 ${nodes.length} 个项目，总计 ${total} 个`);
                const nodeList = nodes.map((node) => ({
                    id: node.id,
                    name: node.name,
                    description: node.description,
                    isFolder: node.isFolder,
                    isRoot: node.isRoot,
                    parentId: node.parentId,
                    path: node.path,
                    size: node.size,
                    mimeType: node.mimeType,
                    fileHash: node.fileHash,
                    fileStatus: node.fileStatus,
                    createdAt: node.createdAt,
                    updatedAt: node.updatedAt,
                    deletedAt: node.deletedAt,
                    ownerId: node.ownerId,
                    personalSpaceKey: node.personalSpaceKey,
                    libraryKey: node.libraryKey,
                    childrenCount: node._count?.children,
                    projectId: node.projectId,
                }));
                return {
                    nodes: nodeList,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                };
            }
            catch (error) {
                this.logger.error(`查询已删除项目列表失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async getPersonalSpace(userId) {
            return this.personalSpaceService.getPersonalSpace(userId);
        }
        async getProject(projectId) {
            try {
                const project = await this.prisma.fileSystemNode.findFirst({
                    where: {
                        id: projectId,
                        isRoot: true,
                        deletedAt: null,
                        libraryKey: null,
                    },
                    include: {
                        projectMembers: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        email: true,
                                        username: true,
                                        nickname: true,
                                        avatar: true,
                                        role: true,
                                    },
                                },
                                projectRole: {
                                    select: {
                                        id: true,
                                        name: true,
                                        description: true,
                                        isSystem: true,
                                    },
                                },
                            },
                        },
                        children: {
                            where: {
                                deletedAt: null,
                            },
                            select: {
                                id: true,
                                name: true,
                                isFolder: true,
                                size: true,
                                extension: true,
                                fileStatus: true,
                                createdAt: true,
                                owner: {
                                    select: {
                                        id: true,
                                        username: true,
                                        nickname: true,
                                    },
                                },
                            },
                            orderBy: {
                                createdAt: 'desc',
                            },
                        },
                    },
                });
                if (!project) {
                    throw new NotFoundException(`项目不存在或已被删除: ${projectId}`);
                }
                return project;
            }
            catch (error) {
                this.logger.error(`查询项目失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async updateProject(projectId, dto) {
            try {
                const currentProject = await this.prisma.fileSystemNode.findUnique({
                    where: { id: projectId, isRoot: true },
                    select: {
                        id: true,
                        name: true,
                        ownerId: true,
                        isRoot: true,
                    },
                });
                if (!currentProject) {
                    throw new NotFoundException('项目不存在');
                }
                if (dto.name && dto.name !== currentProject.name) {
                    await this.fileOperationsService.checkNameUniqueness(dto.name, currentProject.ownerId, null, projectId);
                }
                const project = await this.prisma.fileSystemNode.update({
                    where: { id: projectId, isRoot: true },
                    data: {
                        name: dto.name,
                        description: dto.description,
                        projectStatus: dto.status,
                    },
                    include: {
                        projectMembers: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        email: true,
                                        username: true,
                                        nickname: true,
                                        avatar: true,
                                    },
                                },
                                projectRole: {
                                    select: {
                                        id: true,
                                        name: true,
                                        description: true,
                                        isSystem: true,
                                    },
                                },
                            },
                        },
                    },
                });
                this.logger.log(`项目更新成功: ${project.name}`);
                return project;
            }
            catch (error) {
                this.logger.error(`项目更新失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        getStoragePath(node) {
            if (!node.path) {
                throw new NotFoundException('文件路径不存在');
            }
            return this.storageManager.getFullPath(node.path);
        }
        getFullPath(nodePath) {
            if (!nodePath) {
                throw new NotFoundException('文件路径不存在');
            }
            return this.storageManager.getFullPath(nodePath);
        }
        getStorageManager() {
            return this.storageManager;
        }
    };
    __setFunctionName(_classThis, "ProjectCrudService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ProjectCrudService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ProjectCrudService = _classThis;
})();
export { ProjectCrudService };
//# sourceMappingURL=project-crud.service.js.map