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
import { Injectable, Logger, NotFoundException, } from '@nestjs/common';
import { ProjectRole, } from '../common/enums/permissions.enum';
/**
 * 文件系统权限服务
 *
 * 功能：
 * 1. 检查文件系统节点权限
 * 2. 管理项目成员权限
 * 3. 使用项目权限系统进行权限检查
 */
let FileSystemPermissionService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileSystemPermissionService = _classThis = class {
        constructor(prisma, projectPermissionService, fileTreeService) {
            this.prisma = prisma;
            this.projectPermissionService = projectPermissionService;
            this.fileTreeService = fileTreeService;
            this.logger = new Logger(FileSystemPermissionService.name);
        }
        /**
         * 检查节点权限
         *
         * @param userId 用户 ID
         * @param nodeId 节点 ID
         * @param requiredPermission 所需权限
         * @returns 是否具有权限
         */
        async checkNodePermission(userId, nodeId, requiredPermission) {
            // 验证节点存在
            const node = await this.prisma.fileSystemNode.findUnique({
                where: { id: nodeId },
                select: { id: true, deletedAt: true, isRoot: true, parentId: true },
            });
            if (!node || node.deletedAt) {
                throw new NotFoundException('节点不存在');
            }
            // 找到项目根节点 ID
            let projectId;
            if (node.isRoot) {
                projectId = nodeId;
            }
            else {
                projectId = await this.fileTreeService.getProjectId(nodeId);
                if (!projectId) {
                    return false;
                }
            }
            // 使用项目权限服务检查权限
            return await this.projectPermissionService.checkPermission(userId, projectId, requiredPermission);
        }
        /**
         * 获取用户在节点上的访问角色
         *
         * @param userId 用户 ID
         * @param nodeId 节点 ID
         * @returns 访问角色
         */
        async getNodeAccessRole(userId, nodeId) {
            // 1. 获取节点信息
            const node = await this.prisma.fileSystemNode.findUnique({
                where: { id: nodeId },
                select: { ownerId: true, isRoot: true, parentId: true },
            });
            if (!node) {
                return null;
            }
            // 2. 检查是否是公共资源库（新增）
            const isLibrary = await this.isLibraryNode(nodeId);
            if (isLibrary) {
                // 公共资源库允许任何人访问，返回 VIEWER 角色
                return ProjectRole.VIEWER;
            }
            // 3. 找到项目根节点 ID
            let projectId;
            if (node.isRoot) {
                projectId = nodeId;
            }
            else {
                projectId = await this.fileTreeService.getProjectId(nodeId);
                if (!projectId) {
                    return null;
                }
            }
            // 4. 检查是否是项目所有者
            const project = await this.prisma.fileSystemNode.findUnique({
                where: { id: projectId },
                select: { ownerId: true },
            });
            if (project?.ownerId === userId) {
                return ProjectRole.OWNER;
            }
            // 5. 检查是否是项目成员
            const member = await this.prisma.projectMember.findUnique({
                where: {
                    projectId_userId: {
                        projectId,
                        userId,
                    },
                },
                include: {
                    projectRole: true,
                },
            });
            return member?.projectRole?.name || null;
        }
        /**
         * 检查节点是否属于公共资源库
         * @param nodeId 节点 ID
         * @returns 是否属于公共资源库
         */
        async isLibraryNode(nodeId) {
            const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
            return libraryKey !== null;
        }
        /**
         * 检查用户是否具有指定角色之一
         *
         * @param userId 用户 ID
         * @param nodeId 节点 ID
         * @param roles 角色列表
         * @returns 是否具有指定角色
         */
        async hasNodeAccessRole(userId, nodeId, roles) {
            const role = await this.getNodeAccessRole(userId, nodeId);
            return role ? roles.includes(role) : false;
        }
        /**
         * 设置项目成员权限
         *
         * @param projectId 项目 ID
         * @param userId 用户 ID
         * @param projectRoleId 项目角色 ID
         */
        async setProjectMemberRole(projectId, userId, projectRoleId) {
            await this.prisma.projectMember.upsert({
                where: {
                    projectId_userId: {
                        projectId,
                        userId,
                    },
                },
                update: {
                    projectRoleId,
                },
                create: {
                    projectId,
                    userId,
                    projectRoleId,
                },
            });
            // 清除缓存
            this.projectPermissionService.clearUserCache(userId, projectId);
        }
        /**
         * 移除项目成员
         *
         * @param projectId 项目 ID
         * @param userId 用户 ID
         */
        async removeProjectMember(projectId, userId) {
            await this.prisma.projectMember.deleteMany({
                where: {
                    projectId,
                    userId,
                },
            });
            // 清除缓存
            this.projectPermissionService.clearUserCache(userId, projectId);
        }
        /**
         * 获取项目成员列表
         *
         * @param projectId 项目 ID
         * @returns 项目成员列表
         */
        async getProjectMembers(projectId) {
            return await this.prisma.projectMember.findMany({
                where: {
                    projectId,
                },
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
                        },
                    },
                },
                orderBy: {
                    createdAt: 'asc',
                },
            });
        }
        /**
         * 批量添加项目成员
         *
         * @param projectId 项目 ID
         * @param members 成员列表
         */
        async batchAddProjectMembers(projectId, members) {
            await this.prisma.$transaction(members.map((member) => this.prisma.projectMember.upsert({
                where: {
                    projectId_userId: {
                        projectId,
                        userId: member.userId,
                    },
                },
                update: {
                    projectRoleId: member.projectRoleId,
                },
                create: {
                    projectId,
                    userId: member.userId,
                    projectRoleId: member.projectRoleId,
                },
            })));
            // 清除缓存
            members.forEach((member) => {
                this.projectPermissionService.clearUserCache(member.userId, projectId);
            });
        }
        /**
         * 批量更新项目成员角色
         *
         * @param projectId 项目 ID
         * @param updates 更新列表
         */
        async batchUpdateProjectMembers(projectId, updates) {
            await this.prisma.$transaction(updates.map((update) => this.prisma.projectMember.update({
                where: {
                    projectId_userId: {
                        projectId,
                        userId: update.userId,
                    },
                },
                data: {
                    projectRoleId: update.projectRoleId,
                },
            })));
            // 清除缓存
            updates.forEach((update) => {
                this.projectPermissionService.clearUserCache(update.userId, projectId);
            });
        }
        /**
         * 清除节点权限缓存
         * 注意：此方法会清除项目中所有成员的缓存
         *
         * @param nodeId 节点 ID（项目根节点 ID）
         */
        async clearNodeCache(nodeId) {
            // 获取项目的所有成员
            const members = await this.prisma.projectMember.findMany({
                where: { projectId: nodeId },
                select: { userId: true },
            });
            // 清除每个成员的缓存
            for (const member of members) {
                await this.projectPermissionService.clearUserCache(member.userId, nodeId);
            }
            // 还需要清除项目所有者的缓存
            const project = await this.prisma.fileSystemNode.findUnique({
                where: { id: nodeId },
                select: { ownerId: true },
            });
            if (project?.ownerId) {
                await this.projectPermissionService.clearUserCache(project.ownerId, nodeId);
            }
        }
        /**
         * 清除特定用户在特定项目的缓存
         *
         * @param userId 用户 ID
         * @param projectId 项目 ID
         */
        async clearUserProjectCache(userId, projectId) {
            await this.projectPermissionService.clearUserCache(userId, projectId);
        }
        /**
         * 清除用户权限缓存
         *
         * @param userId 用户 ID
         * @param projectId 项目 ID（可选）
         */
        async clearUserCache(userId, projectId) {
            if (projectId) {
                await this.projectPermissionService.clearUserCache(userId, projectId);
            }
            // TODO: 如果没有 projectId，需要清除用户在所有项目中的缓存
            // 这需要查询用户参与的所有项目，然后逐个清除
        }
    };
    __setFunctionName(_classThis, "FileSystemPermissionService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileSystemPermissionService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileSystemPermissionService = _classThis;
})();
export { FileSystemPermissionService };
//# sourceMappingURL=file-system-permission.service.js.map