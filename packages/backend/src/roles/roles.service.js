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
import { Injectable, NotFoundException, BadRequestException, Logger, } from '@nestjs/common';
import { RoleCategory } from '../common/enums/permissions.enum';
import { isValidPermission } from '../common/utils/permission.utils';
/**
 * 角色管理服务
 *
 * 功能：
 * 1. 角色的增删改查
 * 2. 支持自定义角色
 * 3. 权限分配和移除
 * 4. 角色类别和级别管理
 */
let RolesService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RolesService = _classThis = class {
        constructor(prisma, cacheService) {
            this.prisma = prisma;
            this.cacheService = cacheService;
            this.logger = new Logger(RolesService.name);
        }
        /**
         * 获取所有角色
         */
        async findAll() {
            const roles = await this.prisma.role.findMany({
                include: {
                    permissions: {
                        select: {
                            permission: true,
                        },
                    },
                },
                orderBy: [{ category: 'asc' }, { level: 'desc' }, { createdAt: 'asc' }],
            });
            return roles.map((role) => this.mapToRoleDto(role));
        }
        /**
         * 根据类别获取角色
         */
        async findByCategory(category) {
            const roles = await this.prisma.role.findMany({
                where: { category },
                include: {
                    permissions: {
                        select: {
                            permission: true,
                        },
                    },
                },
                orderBy: [{ level: 'desc' }, { createdAt: 'asc' }],
            });
            return roles.map((role) => this.mapToRoleDto(role));
        }
        /**
         * 根据 ID 获取角色
         */
        async findOne(id) {
            const role = await this.prisma.role.findUnique({
                where: { id },
                include: {
                    permissions: {
                        select: {
                            permission: true,
                        },
                    },
                },
            });
            if (!role) {
                throw new NotFoundException(`角色 ID ${id} 不存在`);
            }
            return this.mapToRoleDto(role);
        }
        /**
         * 创建角色
         */
        async create(createRoleDto) {
            // 验证权限是否有效
            this.validatePermissions(createRoleDto.permissions);
            // 创建角色和权限
            const role = await this.prisma.role.create({
                data: {
                    name: createRoleDto.name,
                    description: createRoleDto.description,
                    category: createRoleDto.category || RoleCategory.CUSTOM,
                    level: createRoleDto.level || 0,
                    isSystem: false, // 新创建的角色都不是系统角色
                    permissions: {
                        create: createRoleDto.permissions.map((permission) => ({
                            permission: permission,
                        })),
                    },
                },
                include: {
                    permissions: {
                        select: {
                            permission: true,
                        },
                    },
                },
            });
            this.logger.log(`创建角色成功: ${role.name} (${role.id})`);
            // 清理所有用户的角色缓存（因为新角色可能影响权限检查）
            this.cacheService.cleanup();
            return this.mapToRoleDto(role);
        }
        /**
         * 更新角色
         */
        async update(id, updateRoleDto) {
            // 检查角色是否存在
            const role = await this.prisma.role.findUnique({
                where: { id },
            });
            if (!role) {
                throw new NotFoundException(`角色 ID ${id} 不存在`);
            }
            // 系统角色不允许修改名称、描述、类别和级别（仅当值真正改变时才阻止）
            if (role.isSystem) {
                if ((updateRoleDto.name !== undefined &&
                    updateRoleDto.name !== role.name) ||
                    (updateRoleDto.description !== undefined &&
                        updateRoleDto.description !== role.description) ||
                    (updateRoleDto.category !== undefined &&
                        updateRoleDto.category !== role.category) ||
                    (updateRoleDto.level !== undefined &&
                        updateRoleDto.level !== role.level)) {
                    throw new BadRequestException('系统角色不允许修改名称、描述、类别和级别');
                }
            }
            // 验证权限是否有效
            if (updateRoleDto.permissions) {
                this.validatePermissions(updateRoleDto.permissions);
            }
            // 更新角色
            const updatedRole = await this.prisma.role.update({
                where: { id },
                data: {
                    ...(updateRoleDto.name && { name: updateRoleDto.name }),
                    ...(updateRoleDto.description !== undefined && {
                        description: updateRoleDto.description,
                    }),
                    ...(updateRoleDto.category && { category: updateRoleDto.category }),
                    ...(updateRoleDto.level !== undefined && {
                        level: updateRoleDto.level,
                    }),
                    ...(updateRoleDto.permissions && {
                        permissions: {
                            deleteMany: {}, // 删除所有旧权限
                            create: updateRoleDto.permissions.map((permission) => ({
                                permission: permission,
                            })), // 创建新权限
                        },
                    }),
                },
                include: {
                    permissions: {
                        select: {
                            permission: true,
                        },
                    },
                },
            });
            this.logger.log(`更新角色成功: ${updatedRole.name} (${updatedRole.id})`);
            // 如果修改了权限，立即清除该角色的所有用户缓存
            if (updateRoleDto.permissions) {
                await this.cacheService.clearRoleCache(role.name);
                this.logger.log(`已清除角色 ${role.name} 的权限缓存`);
            }
            return this.mapToRoleDto(updatedRole);
        }
        /**
         * 删除角色
         */
        async remove(id) {
            // 检查角色是否存在
            const role = await this.prisma.role.findUnique({
                where: { id },
                include: {
                    _count: {
                        select: {
                            users: true,
                        },
                    },
                },
            });
            if (!role) {
                throw new NotFoundException(`角色 ID ${id} 不存在`);
            }
            // 系统角色不允许删除
            if (role.isSystem) {
                throw new BadRequestException('系统角色不允许删除');
            }
            // 检查是否有用户正在使用该角色
            const userCount = role._count.users;
            if (userCount > 0) {
                throw new BadRequestException(`该角色正在被 ${userCount} 个用户使用，无法删除。请先将这些用户分配到其他角色。`);
            }
            // 删除角色（级联删除角色权限）
            await this.prisma.role.delete({
                where: { id },
            });
            this.logger.log(`删除角色成功: ${role.name} (${role.id})`);
            // 清理所有用户的角色缓存
            this.cacheService.cleanup();
        }
        /**
         * 为角色分配权限
         */
        async addPermissions(roleId, permissions) {
            // 检查角色是否存在
            const role = await this.prisma.role.findUnique({
                where: { id: roleId },
            });
            if (!role) {
                throw new NotFoundException(`角色 ID ${roleId} 不存在`);
            }
            // 验证权限是否有效
            this.validatePermissions(permissions);
            // 添加权限
            await this.prisma.role.update({
                where: { id: roleId },
                data: {
                    permissions: {
                        createMany: {
                            data: permissions.map((permission) => ({
                                permission: permission,
                            })),
                            skipDuplicates: true, // 跳过已存在的权限
                        },
                    },
                },
            });
            this.logger.log(`为角色添加权限成功: ${role.name} (${roleId}), 权限数: ${permissions.length}`);
            // 立即清除该角色的所有用户缓存
            await this.cacheService.clearRoleCache(role.name);
            this.logger.log(`已清除角色 ${role.name} 的权限缓存`);
            return this.findOne(roleId);
        }
        /**
         * 从角色移除权限
         */
        async removePermissions(roleId, permissions) {
            // 检查角色是否存在
            const role = await this.prisma.role.findUnique({
                where: { id: roleId },
            });
            if (!role) {
                throw new NotFoundException(`角色 ID ${roleId} 不存在`);
            }
            // 移除权限
            await this.prisma.role.update({
                where: { id: roleId },
                data: {
                    permissions: {
                        deleteMany: {
                            permission: {
                                in: permissions,
                            },
                        },
                    },
                },
            });
            this.logger.log(`从角色移除权限成功: ${role.name} (${roleId}), 权限数: ${permissions.length}`);
            // 立即清除该角色的所有用户缓存
            await this.cacheService.clearRoleCache(role.name);
            this.logger.log(`已清除角色 ${role.name} 的权限缓存`);
            return this.findOne(roleId);
        }
        /**
         * 获取角色的所有权限（返回数据库存储的原始值：大写格式）
         */
        async getRolePermissions(roleId) {
            const role = await this.prisma.role.findUnique({
                where: { id: roleId },
                include: {
                    permissions: {
                        select: {
                            permission: true,
                        },
                    },
                },
            });
            if (!role) {
                throw new NotFoundException(`角色 ID ${roleId} 不存在`);
            }
            return role.permissions.map((p) => p.permission);
        }
        /**
         * 验证权限是否有效（支持大写和小写格式）
         */
        validatePermissions(permissions) {
            const invalidPermissions = permissions.filter((perm) => !isValidPermission(perm));
            if (invalidPermissions.length > 0) {
                throw new BadRequestException(`无效的权限: ${invalidPermissions.join(', ')}`);
            }
        }
        /**
         * 将 Prisma Role 对象映射到 RoleDto
         * 返回数据库存储的原始权限值（大写格式）
         */
        mapToRoleDto(role) {
            return {
                id: role.id,
                name: role.name,
                description: role.description ?? undefined,
                category: RoleCategory[role.category],
                level: role.level,
                isSystem: role.isSystem,
                permissions: role.permissions.map((p) => p.permission), // 直接返回数据库存储的原始值（大写）
                createdAt: role.createdAt,
                updatedAt: role.updatedAt,
            };
        }
    };
    __setFunctionName(_classThis, "RolesService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RolesService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RolesService = _classThis;
})();
export { RolesService };
//# sourceMappingURL=roles.service.js.map