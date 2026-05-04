///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
import { ProjectRole } from '../../common/enums/permissions.enum';
import { ProjectRoleMapper } from '../utils/project-role.mapper';
/**
 * 角色预热策略
 * 预热项目成员的角色权限
 */
let RoleStrategy = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RoleStrategy = _classThis = class {
        constructor(prisma, redisCache) {
            this.prisma = prisma;
            this.redisCache = redisCache;
            this.name = 'roles';
            this.logger = new Logger(RoleStrategy.name);
            this.maxProjectsToWarmup = 50;
        }
        /**
         * 执行角色预热
         */
        async warmup() {
            const startTime = Date.now();
            try {
                // 获取最近更新的活跃项目
                const activeProjects = await this.prisma.fileSystemNode.findMany({
                    where: {
                        isRoot: true,
                        deletedAt: null,
                        libraryKey: null, // 排除公共资源库
                    },
                    orderBy: {
                        updatedAt: 'desc',
                    },
                    take: this.maxProjectsToWarmup,
                    select: {
                        id: true,
                        ownerId: true,
                    },
                });
                this.logger.log(`开始预热 ${activeProjects.length} 个活跃项目的成员角色`);
                let totalMembersCount = 0;
                for (const project of activeProjects) {
                    try {
                        // 获取项目的所有成员
                        const members = await this.prisma.projectMember.findMany({
                            where: {
                                projectId: project.id,
                            },
                            include: {
                                projectRole: true,
                                user: {
                                    select: {
                                        id: true,
                                    },
                                },
                            },
                        });
                        // 预热每个成员的访问角色
                        for (const member of members) {
                            const accessRole = ProjectRoleMapper.mapRoleToAccessRole(member.projectRole.name);
                            await this.redisCache.cacheNodeAccessRole(member.user.id, project.id, accessRole);
                        }
                        // 预热项目所有者的访问角色
                        await this.redisCache.cacheNodeAccessRole(project.ownerId, project.id, ProjectRole.OWNER);
                        totalMembersCount += members.length;
                    }
                    catch (error) {
                        this.logger.error(`预热项目 ${project.id} 的成员角色失败: ${error.message}`);
                    }
                }
                const duration = Date.now() - startTime;
                this.logger.log(`活跃项目成员角色预热完成: ${totalMembersCount} 个成员，耗时 ${duration}ms`);
                return {
                    success: true,
                    count: totalMembersCount,
                    duration,
                };
            }
            catch (error) {
                const duration = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                this.logger.error(`角色预热失败: ${errorMessage}`, error.stack);
                return {
                    success: false,
                    count: 0,
                    duration,
                    error: errorMessage,
                };
            }
        }
    };
    __setFunctionName(_classThis, "RoleStrategy");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RoleStrategy = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RoleStrategy = _classThis;
})();
export { RoleStrategy };
//# sourceMappingURL=role.strategy.js.map