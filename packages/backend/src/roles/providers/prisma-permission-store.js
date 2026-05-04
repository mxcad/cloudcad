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
import { CACHE_TTL } from '../../common/constants/cache.constants';
let PrismaPermissionStore = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PrismaPermissionStore = _classThis = class {
        constructor(prisma, cacheService, roleInheritanceService) {
            this.prisma = prisma;
            this.cacheService = cacheService;
            this.roleInheritanceService = roleInheritanceService;
            this.logger = new Logger(PrismaPermissionStore.name);
        }
        async getUserSystemPermissions(userId) {
            try {
                const cacheKey = `system_perms:${userId}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const user = await this.prisma.user.findUnique({
                    where: { id: userId },
                    select: {
                        role: {
                            select: {
                                name: true,
                            },
                        },
                    },
                });
                if (!user?.role) {
                    return [];
                }
                const permissions = await this.roleInheritanceService.getRolePermissions(user.role.name);
                this.cacheService.set(cacheKey, permissions, CACHE_TTL.SYSTEM_PERMISSION);
                return permissions;
            }
            catch (error) {
                this.logger.error(`获取用户系统权限失败: ${error.message}`, error.stack);
                return [];
            }
        }
        async checkSystemPermission(userId, permission) {
            try {
                const cacheKey = `system_perm:${userId}:${permission}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const hasPermission = await this.roleInheritanceService.checkUserPermissionWithInheritance(userId, permission);
                this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.SYSTEM_PERMISSION);
                return hasPermission;
            }
            catch (error) {
                this.logger.error(`检查系统权限失败: ${error.message}`, error.stack);
                return false;
            }
        }
        async getUserProjectPermissions(userId, projectId) {
            try {
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
        async checkProjectPermission(userId, projectId, permission) {
            try {
                const cacheKey = `project:permission:${userId}:${projectId}:${permission}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const userPermissions = await this.getUserProjectPermissions(userId, projectId);
                const hasPermission = userPermissions.includes(permission);
                this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.PROJECT_PERMISSION);
                return hasPermission;
            }
            catch (error) {
                this.logger.error(`检查项目权限失败: ${error.message}`, error.stack);
                return false;
            }
        }
        async getUserProjectRole(userId, projectId) {
            try {
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
                    this.cacheService.set(cacheKey, role, CACHE_TTL.PROJECT_MEMBER_ROLE);
                }
                return role;
            }
            catch (error) {
                this.logger.error(`获取用户项目角色失败: ${error.message}`, error.stack);
                return null;
            }
        }
        async isProjectOwner(userId, projectId) {
            try {
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
                this.cacheService.set(cacheKey, isOwner, CACHE_TTL.PROJECT_OWNER);
                return isOwner;
            }
            catch (error) {
                this.logger.error(`检查项目所有者失败: ${error.message}`, error.stack);
                return false;
            }
        }
        async clearUserCache(userId) {
            await this.cacheService.clearUserCache(userId);
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { role: { select: { name: true } } },
            });
            if (user?.role) {
                await this.roleInheritanceService.clearRoleCache(user.role.name);
            }
        }
        async clearProjectCache(projectId) {
            await this.cacheService.clearProjectCache(projectId);
        }
    };
    __setFunctionName(_classThis, "PrismaPermissionStore");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PrismaPermissionStore = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PrismaPermissionStore = _classThis;
})();
export { PrismaPermissionStore };
//# sourceMappingURL=prisma-permission-store.js.map