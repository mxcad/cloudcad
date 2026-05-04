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
import { ProjectPermission, } from '../common/enums/permissions.enum';
import { CACHE_TTL } from '../common/constants/cache.constants';
/**
 * 项目权限检查服务
 * 与系统权限完全解耦，专注于项目内的权限控制
 */
let ProjectPermissionService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectPermissionService = _classThis = class {
        constructor(prisma, projectRolesService, cacheService, permissionStore) {
            this.prisma = prisma;
            this.projectRolesService = projectRolesService;
            this.cacheService = cacheService;
            this.permissionStore = permissionStore;
            this.logger = new Logger(ProjectPermissionService.name);
        }
        /**
         * 检查用户在项目中的权限
         *
         * @param userId 用户ID
         * @param projectId 项目ID
         * @param permission 需要检查的项目权限
         * @returns 是否具有权限
         */
        async checkPermission(userId, projectId, permission) {
            try {
                if (this.permissionStore) {
                    return this.permissionStore.checkProjectPermission(userId, projectId, permission);
                }
                // 1. 检查缓存
                const cacheKey = `project:permission:${userId}:${projectId}:${permission}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                // 2. 检查用户的项目权限（所有用户都基于权限验证，包括项目所有者）
                const hasPermission = await this.checkRolePermission(userId, projectId, permission);
                // 3. 缓存结果
                this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.PROJECT_PERMISSION); // 5分钟
                // 权限检查不记录审计日志（避免日志过多）
                return hasPermission;
            }
            catch (error) {
                this.logger.error(`检查项目权限失败: ${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 检查用户是否为项目所有者
         */
        async isProjectOwner(userId, projectId) {
            try {
                if (this.permissionStore) {
                    return this.permissionStore.isProjectOwner(userId, projectId);
                }
                const cacheKey = `project:owner:${userId}:${projectId}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const project = await this.prisma.fileSystemNode.findUnique({
                    where: { id: projectId },
                    select: { ownerId: true },
                });
                const isOwner = project?.ownerId === userId && project?.ownerId !== undefined;
                if (isOwner) {
                    this.logger.debug(`项目所有者检查通过: userId=${userId}, projectId=${projectId}`);
                }
                else {
                    this.logger.warn(`项目所有者检查失败: userId=${userId}, projectId=${projectId}`);
                }
                this.cacheService.set(cacheKey, isOwner, CACHE_TTL.PROJECT_OWNER); // 10分钟
                return isOwner;
            }
            catch (error) {
                this.logger.error(`检查项目所有者失败: ${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 检查用户的项目角色权限
         * 优化后：先从缓存获取用户所有权限，避免 N+1 查询
         */
        async checkRolePermission(userId, projectId, permission) {
            try {
                // 先获取用户的所有权限（从缓存或数据库）
                const userPermissions = await this.getUserPermissions(userId, projectId);
                return userPermissions.includes(permission);
            }
            catch (error) {
                this.logger.error(`检查角色权限失败: ${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 获取用户在项目中的所有权限
         * 所有用户都基于实际权限查询，包括项目所有者
         */
        async getUserPermissions(userId, projectId) {
            try {
                if (this.permissionStore) {
                    return this.permissionStore.getUserProjectPermissions(userId, projectId);
                }
                // 查询用户的项目角色权限
                const member = await this.prisma.projectMember.findUnique({
                    where: {
                        projectId_userId: {
                            projectId,
                            userId,
                        },
                    },
                    include: {
                        projectRole: {
                            include: {
                                permissions: true,
                            },
                        },
                    },
                });
                if (!member?.projectRole) {
                    return [];
                }
                return member.projectRole.permissions.map((rp) => rp.permission);
            }
            catch (error) {
                this.logger.error(`获取用户项目权限失败: ${error.message}`, error.stack);
                return [];
            }
        }
        /**
         * 获取用户在项目中的角色
         */
        async getUserRole(userId, projectId) {
            try {
                if (this.permissionStore) {
                    const role = await this.permissionStore.getUserProjectRole(userId, projectId);
                    return role || null;
                }
                const cacheKey = `project:role:${userId}:${projectId}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
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
                const role = member?.projectRole?.name || null;
                if (role) {
                    this.cacheService.set(cacheKey, role, CACHE_TTL.PROJECT_MEMBER_ROLE); // 5分钟
                }
                return role;
            }
            catch (error) {
                this.logger.error(`获取用户项目角色失败: ${error.message}`, error.stack);
                return null;
            }
        }
        /**
         * 检查用户是否具有指定角色
         */
        async hasRole(userId, projectId, roleNames) {
            const userRole = await this.getUserRole(userId, projectId);
            return userRole !== null && roleNames.includes(userRole);
        }
        /**
         * 检查用户是否为项目成员
         */
        async isProjectMember(userId, projectId) {
            try {
                const isOwner = await this.isProjectOwner(userId, projectId);
                if (isOwner) {
                    return true;
                }
                const member = await this.prisma.projectMember.findUnique({
                    where: {
                        projectId_userId: {
                            projectId,
                            userId,
                        },
                    },
                });
                return member !== null;
            }
            catch (error) {
                this.logger.error(`检查项目成员失败: ${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 清除用户的项目权限缓存
         *
         * 缓存键命名规范：
         * - project:owner:${userId}:${projectId} - 项目所有者缓存
         * - project:role:${userId}:${projectId} - 项目成员角色缓存（与系统角色缓存 role:user:${userId} 保持一致）
         * - project:permission:${userId}:${projectId}:${permission} - 项目权限缓存
         */
        async clearUserCache(userId, projectId) {
            if (this.permissionStore) {
                await this.permissionStore.clearProjectCache(projectId);
                return;
            }
            // 清除项目所有者缓存
            this.cacheService.delete(`project:owner:${userId}:${projectId}`);
            // 清除用户角色缓存
            this.cacheService.delete(`project:role:${userId}:${projectId}`);
            // 清除所有权限缓存
            const permissions = Object.values(ProjectPermission);
            for (const permission of permissions) {
                this.cacheService.delete(`project:permission:${userId}:${projectId}:${permission}`);
            }
        }
        /**
         * 批量检查权限（多个权限，OR 逻辑）
         * 只要有一个权限就返回 true
         * 优化后：使用并行检查提升性能
         * 所有用户都基于权限验证，包括项目所有者
         */
        async checkAnyPermission(userId, projectId, permissions) {
            const startTime = Date.now();
            try {
                // 并行检查所有权限（所有用户都基于权限验证）
                const results = await Promise.all(permissions.map((permission) => this.checkPermission(userId, projectId, permission)));
                const hasAnyPermission = results.some((result) => result === true);
                this.logger.debug(`批量权限检查${hasAnyPermission ? '通过' : '失败'}: userId=${userId}, projectId=${projectId}, permissions=${permissions.length}个, 耗时=${Date.now() - startTime}ms`);
                return hasAnyPermission;
            }
            catch (error) {
                this.logger.error(`批量权限检查失败: ${error.message}, 耗时=${Date.now() - startTime}ms`, error.stack);
                return false;
            }
        }
        /**
         * 批量检查权限（多个权限，AND 逻辑）
         * 必须所有权限都满足才返回 true
         * 优化后：使用并行检查提升性能
         * 所有用户都基于权限验证，包括项目所有者
         */
        async checkAllPermissions(userId, projectId, permissions) {
            const startTime = Date.now();
            try {
                // 并行检查所有权限（所有用户都基于权限验证）
                const results = await Promise.all(permissions.map((permission) => this.checkPermission(userId, projectId, permission)));
                const hasAllPermissions = results.every((result) => result === true);
                this.logger.debug(`批量权限检查${hasAllPermissions ? '通过' : '失败'}: userId=${userId}, projectId=${projectId}, permissions=${permissions.length}个, 耗时=${Date.now() - startTime}ms`);
                return hasAllPermissions;
            }
            catch (error) {
                this.logger.error(`批量权限检查失败: ${error.message}, 耗时=${Date.now() - startTime}ms`, error.stack);
                return false;
            }
        }
    };
    __setFunctionName(_classThis, "ProjectPermissionService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ProjectPermissionService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ProjectPermissionService = _classThis;
})();
export { ProjectPermissionService };
//# sourceMappingURL=project-permission.service.js.map