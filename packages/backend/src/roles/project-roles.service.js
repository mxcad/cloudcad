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
import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException, } from '@nestjs/common';
import { ProjectRole, DEFAULT_PROJECT_ROLE_PERMISSIONS, } from '../common/enums/permissions.enum';
/**
 * 项目角色服务
 * 管理项目角色和权限分配
 */
let ProjectRolesService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectRolesService = _classThis = class {
        constructor(prisma) {
            this.prisma = prisma;
            this.logger = new Logger(ProjectRolesService.name);
        }
        /**
         * 创建系统默认角色（仅在系统初始化时调用一次）
         */
        async createSystemDefaultRoles() {
            try {
                const defaultRoles = [
                    { name: ProjectRole.OWNER, isSystem: true },
                    { name: ProjectRole.ADMIN, isSystem: true },
                    { name: ProjectRole.EDITOR, isSystem: true },
                    { name: ProjectRole.MEMBER, isSystem: true },
                    { name: ProjectRole.VIEWER, isSystem: true },
                ];
                for (const role of defaultRoles) {
                    try {
                        await this.create({
                            name: role.name,
                            description: `系统默认角色: ${role.name}`,
                            permissions: DEFAULT_PROJECT_ROLE_PERMISSIONS[role.name] || [],
                        });
                    }
                    catch (error) {
                        // 如果角色已存在，跳过
                        if (error instanceof ConflictException) {
                            continue;
                        }
                        throw error;
                    }
                }
                this.logger.log('系统默认项目角色创建成功');
            }
            catch (error) {
                this.logger.error(`创建系统默认角色失败: ${error.message}`, error.stack);
                throw new BadRequestException(`创建系统默认角色失败: ${error.message}`);
            }
        }
        /**
         * 创建项目角色
         */
        async create(dto, userId) {
            try {
                // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行
                // 检查角色名称是否已存在（项目内唯一）
                const existingRole = await this.prisma.projectRole.findFirst({
                    where: {
                        name: dto.name,
                        projectId: dto.projectId ?? null,
                    },
                });
                if (existingRole) {
                    throw new ConflictException(dto.projectId
                        ? `项目内角色名称 "${dto.name}" 已存在`
                        : `全局角色名称 "${dto.name}" 已存在`);
                }
                // 创建角色
                const role = await this.prisma.projectRole.create({
                    data: {
                        projectId: dto.projectId || null,
                        name: dto.name,
                        description: dto.description,
                    },
                });
                // 分配权限
                if (dto.permissions && dto.permissions.length > 0) {
                    await this.assignPermissions(role.id, dto.permissions);
                }
                return role;
            }
            catch (error) {
                if (error instanceof ConflictException ||
                    error instanceof ForbiddenException) {
                    throw error;
                }
                this.logger.error(`创建项目角色失败: ${error.message}`, error.stack);
                throw new BadRequestException(`创建项目角色失败: ${error.message}`);
            }
        }
        /**
         * 更新项目角色
         */
        async update(roleId, dto, userId) {
            try {
                const role = await this.prisma.projectRole.findUnique({
                    where: { id: roleId },
                });
                if (!role) {
                    throw new NotFoundException('项目角色不存在');
                }
                // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行
                // 系统默认角色不能修改名称
                if (role.isSystem && dto.name && dto.name !== role.name) {
                    throw new BadRequestException('无法修改系统默认角色的名称');
                }
                // 更新角色信息
                const updatedRole = await this.prisma.projectRole.update({
                    where: { id: roleId },
                    data: {
                        name: dto.name,
                        description: dto.description,
                    },
                });
                // 更新权限
                if (dto.permissions !== undefined) {
                    await this.updatePermissions(roleId, dto.permissions);
                }
                return updatedRole;
            }
            catch (error) {
                if (error instanceof NotFoundException ||
                    error instanceof BadRequestException ||
                    error instanceof ForbiddenException) {
                    throw error;
                }
                this.logger.error(`更新项目角色失败: ${error.message}`, error.stack);
                throw new BadRequestException('更新项目角色失败');
            }
        }
        /**
         * 删除项目角色
         */
        async delete(roleId, userId) {
            try {
                const role = await this.prisma.projectRole.findUnique({
                    where: { id: roleId },
                    include: {
                        members: true,
                    },
                });
                if (!role) {
                    throw new NotFoundException('项目角色不存在');
                }
                // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行
                // 系统默认角色不能删除
                if (role.isSystem) {
                    throw new BadRequestException('无法删除系统默认角色');
                }
                // 检查是否有成员使用此角色
                if (role.members.length > 0) {
                    throw new BadRequestException('角色正在使用中，无法删除');
                }
                // 删除角色（级联删除权限关联）
                await this.prisma.projectRole.delete({
                    where: { id: roleId },
                });
                this.logger.log(`项目角色 ${roleId} 删除成功`);
            }
            catch (error) {
                if (error instanceof NotFoundException ||
                    error instanceof BadRequestException ||
                    error instanceof ForbiddenException) {
                    throw error;
                }
                this.logger.error(`删除项目角色失败: ${error.message}`, error.stack);
                throw new BadRequestException('删除项目角色失败');
            }
        }
        /**
         * 获取所有项目角色
         */
        async findAll() {
            try {
                const roles = await this.prisma.projectRole.findMany({
                    include: {
                        project: {
                            select: { id: true, name: true },
                        },
                        permissions: true,
                        _count: {
                            select: { members: true },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                });
                return roles;
            }
            catch (error) {
                this.logger.error(`获取项目角色失败: ${error.message}`, error.stack);
                throw new BadRequestException(`获取项目角色失败`);
            }
        }
        /**
         * 获取项目角色详情
         */
        async findOne(roleId) {
            try {
                const role = await this.prisma.projectRole.findUnique({
                    where: { id: roleId },
                    include: {
                        permissions: true,
                        _count: {
                            select: { members: true },
                        },
                    },
                });
                if (!role) {
                    throw new NotFoundException('项目角色不存在');
                }
                return role;
            }
            catch (error) {
                if (error instanceof NotFoundException) {
                    throw error;
                }
                this.logger.error(`获取项目角色详情失败: ${error.message}`, error.stack);
                throw new BadRequestException('获取项目角色详情失败');
            }
        }
        /**
         * 获取特定项目的角色列表
         */
        async findByProject(projectId) {
            try {
                const roles = await this.prisma.projectRole.findMany({
                    where: {
                        OR: [
                            { projectId: projectId }, // 项目自定义角色
                            { isSystem: true }, // 系统角色（全局共享）
                        ],
                    },
                    include: {
                        permissions: true,
                        _count: {
                            select: { members: true },
                        },
                    },
                    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
                });
                return roles;
            }
            catch (error) {
                this.logger.error(`获取项目角色列表失败: ${error.message}`, error.stack);
                throw new BadRequestException(`获取项目角色列表失败`);
            }
        }
        /**
         * 获取系统默认项目角色列表（仅返回 isSystem=true 的角色）
         */
        async findSystemRoles() {
            try {
                const roles = await this.prisma.projectRole.findMany({
                    where: {
                        isSystem: true,
                    },
                    include: {
                        permissions: true,
                        _count: {
                            select: { members: true },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                });
                return roles;
            }
            catch (error) {
                this.logger.error(`获取系统项目角色失败: ${error.message}`, error.stack);
                throw new BadRequestException(`获取系统项目角色失败`);
            }
        }
        /**
         * 获取角色的所有权限
         */
        async getRolePermissions(roleId) {
            try {
                const rolePermissions = await this.prisma.projectRolePermission.findMany({
                    where: { projectRoleId: roleId },
                    select: { permission: true },
                });
                // 将 Prisma ProjectPermission 转换为 TypeScript ProjectPermission
                // 两者使用相同的字符串值，所以可以直接使用 as 进行类型断言
                return rolePermissions.map((rp) => rp.permission);
            }
            catch (error) {
                this.logger.error(`获取角色权限失败: ${error.message}`, error.stack);
                throw new BadRequestException('获取角色权限失败');
            }
        }
        /**
         * 为角色分配权限
         */
        async assignPermissions(roleId, permissions, // 接受 string[]，内部转换
        userId) {
            try {
                // 检查角色是否存在
                const role = await this.prisma.projectRole.findUnique({
                    where: { id: roleId },
                });
                if (!role) {
                    throw new NotFoundException('项目角色不存在');
                }
                // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行
                // 转换为 ProjectPermission 类型
                const typedPermissions = permissions;
                // 创建权限关联（直接使用枚举值）
                const data = typedPermissions.map((permission) => ({
                    projectRoleId: roleId,
                    permission: permission,
                }));
                await this.prisma.projectRolePermission.createMany({
                    data,
                    skipDuplicates: true,
                });
                this.logger.log(`角色 ${roleId} 的权限分配成功`);
            }
            catch (error) {
                if (error instanceof NotFoundException ||
                    error instanceof ForbiddenException) {
                    throw error;
                }
                this.logger.error(`分配角色权限失败: ${error.message}`, error.stack);
                throw new BadRequestException(`分配角色权限失败: ${error.message}`);
            }
        }
        /**
         * 移除角色权限
         */
        async removePermissions(roleId, permissions, // 接受 string[]，内部转换
        userId) {
            try {
                // 检查角色是否存在
                const role = await this.prisma.projectRole.findUnique({
                    where: { id: roleId },
                });
                if (!role) {
                    throw new NotFoundException('项目角色不存在');
                }
                // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行
                // 转换为 ProjectPermission 类型
                const typedPermissions = permissions;
                await this.prisma.projectRolePermission.deleteMany({
                    where: {
                        projectRoleId: roleId,
                        permission: {
                            in: typedPermissions,
                        },
                    },
                });
                this.logger.log(`角色 ${roleId} 的权限移除成功`);
            }
            catch (error) {
                if (error instanceof NotFoundException ||
                    error instanceof ForbiddenException) {
                    throw error;
                }
                this.logger.error(`移除角色权限失败: ${error.message}`, error.stack);
                throw new BadRequestException('移除角色权限失败');
            }
        }
        /**
         * 更新角色权限（替换所有权限）
         */
        async updatePermissions(roleId, permissions // 接受 string[]，内部转换
        ) {
            try {
                // 先删除所有现有权限
                await this.prisma.projectRolePermission.deleteMany({
                    where: { projectRoleId: roleId },
                });
                // 然后重新分配权限
                await this.assignPermissions(roleId, permissions);
            }
            catch (error) {
                this.logger.error(`更新角色权限失败: ${error.message}`, error.stack);
                throw new BadRequestException('更新角色权限失败');
            }
        }
    };
    __setFunctionName(_classThis, "ProjectRolesService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ProjectRolesService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ProjectRolesService = _classThis;
})();
export { ProjectRolesService };
//# sourceMappingURL=project-roles.service.js.map