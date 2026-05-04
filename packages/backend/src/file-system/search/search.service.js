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
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SearchScope, SearchType } from '../dto/search.dto';
import { ProjectPermission, SystemPermission } from '../../common/enums/permissions.enum';
let SearchService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var SearchService = _classThis = class {
        constructor(prisma, permissionService, systemPermissionService) {
            this.prisma = prisma;
            this.permissionService = permissionService;
            this.systemPermissionService = systemPermissionService;
            this.logger = new Logger(SearchService.name);
        }
        async search(userId, dto) {
            const { keyword, scope = SearchScope.PROJECT_FILES, type = SearchType.ALL, filter = 'all', projectId, libraryKey, extension, fileStatus, page = 1, limit = 50, sortBy = 'updatedAt', sortOrder = 'desc', } = dto;
            const skip = (page - 1) * limit;
            switch (scope) {
                case SearchScope.PROJECT:
                    return this.searchProjects(userId, {
                        keyword,
                        filter,
                        page,
                        limit,
                        skip,
                        sortBy,
                        sortOrder,
                    });
                case SearchScope.PROJECT_FILES:
                    if (!projectId) {
                        throw new BadRequestException('搜索项目文件时必须提供 projectId');
                    }
                    return this.searchProjectFiles(userId, projectId, {
                        keyword,
                        type,
                        extension,
                        fileStatus,
                        page,
                        limit,
                        skip,
                        sortBy,
                        sortOrder,
                    });
                case SearchScope.ALL_PROJECTS:
                    return this.searchAllProjects(userId, {
                        keyword,
                        page,
                        limit,
                        skip,
                        sortBy,
                        sortOrder,
                    });
                case SearchScope.LIBRARY:
                    return this.searchLibrary(userId, {
                        keyword,
                        libraryKey,
                        type,
                        extension,
                        page,
                        limit,
                        skip,
                        sortBy,
                        sortOrder,
                    });
                default:
                    throw new BadRequestException(`不支持的搜索范围: ${scope}`);
            }
        }
        async searchProjects(userId, params) {
            const { keyword, filter, skip, limit, sortBy, sortOrder } = params;
            const safeLimit = Number(limit) || 50;
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
                OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    { description: { contains: keyword, mode: 'insensitive' } },
                ],
            };
            const [nodes, total] = await Promise.all([
                this.prisma.fileSystemNode.findMany({
                    where,
                    skip,
                    take: safeLimit,
                    orderBy: { [sortBy]: sortOrder },
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
            const results = nodes.map((node) => ({
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
                nodes: results,
                total,
                page: params.page,
                limit,
                totalPages: Math.ceil(total / safeLimit),
            };
        }
        async searchProjectFiles(userId, projectId, params) {
            const { keyword, type, extension, fileStatus, skip, limit, sortBy, sortOrder, } = params;
            const safeLimit = Number(limit) || 50;
            const hasAccess = await this.permissionService.checkNodePermission(userId, projectId, ProjectPermission.FILE_OPEN);
            if (!hasAccess) {
                return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
            }
            const projectNodeIds = await this.getAllProjectNodeIds(projectId);
            const where = {
                id: { in: projectNodeIds },
                deletedAt: null,
                personalSpaceKey: null,
                isRoot: false,
                OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    { description: { contains: keyword, mode: 'insensitive' } },
                ],
            };
            if (type === SearchType.FILE)
                where.isFolder = false;
            else if (type === SearchType.FOLDER)
                where.isFolder = true;
            if (extension)
                where.extension = extension;
            if (fileStatus)
                where.fileStatus = fileStatus;
            const [nodes, total] = await Promise.all([
                this.prisma.fileSystemNode.findMany({
                    where,
                    skip,
                    take: safeLimit,
                    orderBy: { [sortBy]: sortOrder },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        isFolder: true,
                        isRoot: true,
                        parentId: true,
                        path: true,
                        size: true,
                        mimeType: true,
                        fileHash: true,
                        fileStatus: true,
                        createdAt: true,
                        updatedAt: true,
                        deletedAt: true,
                        ownerId: true,
                        personalSpaceKey: true,
                        libraryKey: true,
                        projectId: true,
                    },
                }),
                this.prisma.fileSystemNode.count({ where }),
            ]);
            const results = nodes.map((node) => ({
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
                projectId: node.projectId || projectId,
            }));
            return {
                nodes: results,
                total,
                page: params.page,
                limit,
                totalPages: Math.ceil(total / safeLimit),
            };
        }
        async searchAllProjects(userId, params) {
            const { keyword, skip, limit, sortBy, sortOrder } = params;
            const safeLimit = Number(limit) || 50;
            const userProjects = await this.prisma.fileSystemNode.findMany({
                where: {
                    isRoot: true,
                    deletedAt: null,
                    libraryKey: null,
                    OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
                },
                select: { id: true },
            });
            const projectIds = userProjects.map((p) => p.id);
            const where = {
                projectId: { in: projectIds },
                deletedAt: null,
                OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    { description: { contains: keyword, mode: 'insensitive' } },
                ],
            };
            const [nodes, total] = await Promise.all([
                this.prisma.fileSystemNode.findMany({
                    where,
                    skip,
                    take: safeLimit,
                    orderBy: { [sortBy]: sortOrder },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        isFolder: true,
                        isRoot: true,
                        parentId: true,
                        path: true,
                        size: true,
                        mimeType: true,
                        fileHash: true,
                        fileStatus: true,
                        createdAt: true,
                        updatedAt: true,
                        deletedAt: true,
                        ownerId: true,
                        personalSpaceKey: true,
                        libraryKey: true,
                        projectId: true,
                    },
                }),
                this.prisma.fileSystemNode.count({ where }),
            ]);
            const results = nodes.map((node) => ({
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
                projectId: node.projectId,
            }));
            return {
                nodes: results,
                total,
                page: params.page,
                limit,
                totalPages: Math.ceil(total / safeLimit),
            };
        }
        async searchLibrary(userId, params) {
            const { keyword, libraryKey, type, extension, skip, limit, sortBy, sortOrder, } = params;
            const safeLimit = Number(limit) || 50;
            // ── 权限检查 ──
            // 如果指定了 libraryKey，检查对应资源库的系统权限
            // 如果未指定（搜索所有资源库），需要拥有两个权限中的一个
            if (libraryKey === 'drawing') {
                const hasPermission = await this.systemPermissionService.checkSystemPermission(userId, SystemPermission.LIBRARY_DRAWING_MANAGE);
                if (!hasPermission) {
                    this.logger.warn(`用户 ${userId} 无图纸库搜索权限`);
                    return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
                }
            }
            else if (libraryKey === 'block') {
                const hasPermission = await this.systemPermissionService.checkSystemPermission(userId, SystemPermission.LIBRARY_BLOCK_MANAGE);
                if (!hasPermission) {
                    this.logger.warn(`用户 ${userId} 无图块库搜索权限`);
                    return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
                }
            }
            else {
                // 未指定 libraryKey — 搜索所有资源库，需至少拥有一个权限
                const hasDrawingAccess = await this.systemPermissionService.checkSystemPermission(userId, SystemPermission.LIBRARY_DRAWING_MANAGE);
                const hasBlockAccess = await this.systemPermissionService.checkSystemPermission(userId, SystemPermission.LIBRARY_BLOCK_MANAGE);
                if (!hasDrawingAccess && !hasBlockAccess) {
                    this.logger.warn(`用户 ${userId} 无任何资源库搜索权限`);
                    return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
                }
            }
            this.logger.log(`[资源库搜索] 用户ID: ${userId}, 关键词: ${keyword}, libraryKey: ${libraryKey}, type: ${type}`);
            const where = {
                deletedAt: null,
                libraryKey: libraryKey ? { equals: libraryKey } : { not: null },
                isRoot: false,
                OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    { description: { contains: keyword, mode: 'insensitive' } },
                ],
            };
            this.logger.log(`[资源库搜索] 查询条件: ${JSON.stringify(where)}`);
            if (type === SearchType.FILE)
                where.isFolder = false;
            else if (type === SearchType.FOLDER)
                where.isFolder = true;
            if (extension)
                where.extension = extension;
            const [nodes, total] = await Promise.all([
                this.prisma.fileSystemNode.findMany({
                    where,
                    skip,
                    take: safeLimit,
                    orderBy: { [sortBy]: sortOrder },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        isFolder: true,
                        isRoot: true,
                        parentId: true,
                        path: true,
                        size: true,
                        mimeType: true,
                        fileHash: true,
                        fileStatus: true,
                        createdAt: true,
                        updatedAt: true,
                        deletedAt: true,
                        ownerId: true,
                        personalSpaceKey: true,
                        libraryKey: true,
                        projectId: true,
                    },
                }),
                this.prisma.fileSystemNode.count({ where }),
            ]);
            const results = nodes.map((node) => ({
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
                projectId: node.projectId,
            }));
            return {
                nodes: results,
                total,
                page: params.page,
                limit,
                totalPages: Math.ceil(total / safeLimit),
            };
        }
        async getAllProjectNodeIds(projectId) {
            const result = await this.prisma.$queryRaw `
      WITH RECURSIVE tree AS (
        SELECT id FROM file_system_nodes
        WHERE id = ${projectId} AND deleted_at IS NULL
        UNION ALL
        SELECT n.id FROM file_system_nodes n
        JOIN tree t ON n.parent_id = t.id
        WHERE n.deleted_at IS NULL
      )
      SELECT id FROM tree
    `;
            return result.map((row) => row.id);
        }
    };
    __setFunctionName(_classThis, "SearchService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        SearchService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return SearchService = _classThis;
})();
export { SearchService };
//# sourceMappingURL=search.service.js.map