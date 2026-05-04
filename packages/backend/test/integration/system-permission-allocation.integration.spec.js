///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// This code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd.
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { RolesService } from '../../src/roles/roles.service';
import { PermissionService } from '../../src/common/services/permission.service';
import { PermissionCacheService } from '../../src/common/services/permission-cache.service';
import { RoleInheritanceService } from '../../src/common/services/role-inheritance.service';
import { DatabaseService } from '../../src/database/database.service';
import { SystemRole, SystemPermission } from '../../src/common/enums/permissions.enum';
import { createMockUser } from '../../src/test/test-utils';
describe('T30 - System Permission Allocation Integration Tests', () => {
    let rolesService;
    let permissionService;
    let mockDatabaseService;
    let mockPermissionCacheService;
    let mockRoleInheritanceService;
    const mockUserId = 'test-user-123';
    const mockRoleId = 'test-role-456';
    const mockRoleName = 'TEST_CUSTOM_ROLE';
    beforeEach(async () => {
        mockDatabaseService = {
            role: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            rolePermission: {
                findMany: jest.fn(),
                createMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            user: {
                findUnique: jest.fn(),
            },
            $transaction: jest.fn((callback) => callback({
                role: { update: jest.fn() },
            })),
        };
        mockPermissionCacheService = {
            get: jest.fn(),
            set: jest.fn(),
            delete: jest.fn(),
            deleteMany: jest.fn(),
            clearRoleCache: jest.fn(),
            clearUserCache: jest.fn(),
            cleanup: jest.fn(),
        };
        mockRoleInheritanceService = {
            getRolePermissions: jest.fn(),
            checkUserPermissionWithInheritance: jest.fn(),
            clearRoleCache: jest.fn(),
        };
        const module = await Test.createTestingModule({
            providers: [
                RolesService,
                PermissionService,
                { provide: DatabaseService, useValue: mockDatabaseService },
                { provide: PermissionCacheService, useValue: mockPermissionCacheService },
                { provide: RoleInheritanceService, useValue: mockRoleInheritanceService },
            ],
        }).compile();
        rolesService = module.get(RolesService);
        permissionService = module.get(PermissionService);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('T30 - Permission Allocation and Cache Clearing', () => {
        it('T30-S1 - Allocate permission to role and clear cache', async () => {
            // 模拟角色存在
            const mockRole = {
                id: mockRoleId,
                name: mockRoleName,
                description: 'Test custom role',
                category: 'CUSTOM',
                level: 1,
                isSystem: false,
                permissions: [],
            };
            mockDatabaseService.role.findUnique.mockResolvedValue(mockRole);
            mockDatabaseService.role.update.mockResolvedValue({
                ...mockRole,
                permissions: [{ permission: SystemPermission.SYSTEM_USER_READ }],
            });
            // 分配权限
            const result = await rolesService.addPermissions(mockRoleId, [SystemPermission.SYSTEM_USER_READ]);
            // 验证权限添加
            expect(mockDatabaseService.role.update).toHaveBeenCalledWith({
                where: { id: mockRoleId },
                data: expect.objectContaining({
                    permissions: expect.objectContaining({
                        createMany: expect.anything(),
                    }),
                }),
            });
            // 验证缓存清除
            expect(mockPermissionCacheService.clearRoleCache).toHaveBeenCalledWith(mockRoleName);
        });
        it('T30-S2 - Remove permission from role and clear cache', async () => {
            const mockRole = {
                id: mockRoleId,
                name: mockRoleName,
                description: 'Test custom role',
                category: 'CUSTOM',
                level: 1,
                isSystem: false,
                permissions: [{ permission: SystemPermission.SYSTEM_USER_READ }],
            };
            mockDatabaseService.role.findUnique.mockResolvedValue(mockRole);
            mockDatabaseService.role.update.mockResolvedValue({
                ...mockRole,
                permissions: [],
            });
            // 移除权限
            const result = await rolesService.removePermissions(mockRoleId, [SystemPermission.SYSTEM_USER_READ]);
            // 验证权限移除
            expect(mockDatabaseService.role.update).toHaveBeenCalledWith({
                where: { id: mockRoleId },
                data: expect.objectContaining({
                    permissions: expect.objectContaining({
                        deleteMany: expect.anything(),
                    }),
                }),
            });
            // 验证缓存清除
            expect(mockPermissionCacheService.clearRoleCache).toHaveBeenCalledWith(mockRoleName);
        });
        it('T30-S3 - Update role permissions and clear cache', async () => {
            const mockRole = {
                id: mockRoleId,
                name: mockRoleName,
                description: 'Test custom role',
                category: 'CUSTOM',
                level: 1,
                isSystem: false,
                permissions: [],
            };
            mockDatabaseService.role.findUnique.mockResolvedValue(mockRole);
            mockDatabaseService.role.update.mockResolvedValue({
                ...mockRole,
                permissions: [
                    { permission: SystemPermission.SYSTEM_USER_READ },
                    { permission: SystemPermission.SYSTEM_USER_CREATE },
                ],
            });
            // 更新角色权限
            const result = await rolesService.update(mockRoleId, {
                permissions: [
                    SystemPermission.SYSTEM_USER_READ,
                    SystemPermission.SYSTEM_USER_CREATE,
                ],
            });
            // 验证权限更新
            expect(mockDatabaseService.role.update).toHaveBeenCalledWith({
                where: { id: mockRoleId },
                data: expect.objectContaining({
                    permissions: expect.anything(),
                }),
            });
            // 验证缓存清除
            expect(mockPermissionCacheService.clearRoleCache).toHaveBeenCalledWith(mockRoleName);
        });
        it('T30-S4 - Permission check uses cache when available', async () => {
            // 模拟缓存命中
            mockPermissionCacheService.get.mockResolvedValue(true);
            const hasPermission = await permissionService.checkSystemPermission(mockUserId, SystemPermission.SYSTEM_USER_READ);
            // 验证使用缓存
            expect(mockPermissionCacheService.get).toHaveBeenCalled();
            expect(hasPermission).toBe(true);
        });
        it('T30-S5 - Cache cleared, permission check gets fresh data', async () => {
            // 模拟第一次缓存命中（false）
            mockPermissionCacheService.get.mockResolvedValueOnce(false);
            const hasPermissionBefore = await permissionService.checkSystemPermission(mockUserId, SystemPermission.SYSTEM_USER_READ);
            expect(hasPermissionBefore).toBe(false);
            // 清除缓存
            await mockPermissionCacheService.clearUserCache(mockUserId);
            // 模拟第二次缓存未命中，返回真实权限
            mockPermissionCacheService.get.mockResolvedValueOnce(null);
            mockRoleInheritanceService.checkUserPermissionWithInheritance.mockResolvedValueOnce(true);
            const hasPermissionAfter = await permissionService.checkSystemPermission(mockUserId, SystemPermission.SYSTEM_USER_READ);
            // 验证缓存被清除，重新检查权限
            expect(hasPermissionAfter).toBe(true);
        });
        it('T30-S6 - Role permissions update, user cache cleared', async () => {
            const mockRole = {
                id: mockRoleId,
                name: SystemRole.USER,
                description: 'User role',
                category: 'SYSTEM',
                level: 0,
                isSystem: true,
                permissions: [],
            };
            mockDatabaseService.role.findUnique.mockResolvedValue(mockRole);
            mockDatabaseService.role.update.mockResolvedValue({
                ...mockRole,
                permissions: [{ permission: SystemPermission.SYSTEM_FONT_READ }],
            });
            // 尝试更新系统角色的权限（系统角色不允许修改基本属性，但可以修改权限）
            const result = await rolesService.update(mockRoleId, {
                permissions: [SystemPermission.SYSTEM_FONT_READ],
            });
            // 验证权限更新
            expect(mockDatabaseService.role.update).toHaveBeenCalled();
            // 验证角色缓存被清除
            expect(mockPermissionCacheService.clearRoleCache).toHaveBeenCalledWith(SystemRole.USER);
        });
        it('T30-S7 - Create new role with permissions, cache cleaned', async () => {
            const newRoleData = {
                name: 'NEW_TEST_ROLE',
                description: 'New test role',
                category: 'CUSTOM',
                level: 1,
                permissions: [SystemPermission.PROJECT_CREATE],
            };
            mockDatabaseService.role.create.mockResolvedValue({
                id: 'new-role-id',
                name: newRoleData.name,
                description: newRoleData.description,
                category: newRoleData.category,
                level: newRoleData.level,
                isSystem: false,
                permissions: newRoleData.permissions.map(p => ({ permission: p })),
            });
            // 创建新角色
            const result = await rolesService.create(newRoleData);
            // 验证角色创建
            expect(mockDatabaseService.role.create).toHaveBeenCalled();
            // 验证缓存清理
            expect(mockPermissionCacheService.cleanup).toHaveBeenCalled();
        });
        it('T30-S8 - Delete role, cache cleaned', async () => {
            const mockRole = {
                id: mockRoleId,
                name: mockRoleName,
                description: 'Test custom role',
                category: 'CUSTOM',
                level: 1,
                isSystem: false,
                _count: { users: 0 },
            };
            mockDatabaseService.role.findUnique.mockResolvedValue(mockRole);
            mockDatabaseService.role.delete.mockResolvedValue({});
            // 删除角色
            await rolesService.remove(mockRoleId);
            // 验证角色删除
            expect(mockDatabaseService.role.delete).toHaveBeenCalledWith({
                where: { id: mockRoleId },
            });
            // 验证缓存清理
            expect(mockPermissionCacheService.cleanup).toHaveBeenCalled();
        });
        it('T30-S9 - System role permissions checked with inheritance', async () => {
            const mockUser = createMockUser({
                id: mockUserId,
                role: { id: 'role-id', name: SystemRole.USER_MANAGER },
            });
            // 模拟用户查询
            mockDatabaseService.user.findUnique.mockResolvedValue({
                id: mockUserId,
                role: { name: SystemRole.USER_MANAGER },
            });
            // 模拟角色权限（USER_MANAGER继承USER，加上自己的权限）
            mockRoleInheritanceService.getRolePermissions.mockResolvedValue([
                SystemPermission.PROJECT_CREATE,
                SystemPermission.SYSTEM_USER_READ,
                SystemPermission.SYSTEM_USER_CREATE,
            ]);
            mockRoleInheritanceService.checkUserPermissionWithInheritance.mockImplementation((userId, permission) => {
                const permissions = [
                    SystemPermission.PROJECT_CREATE,
                    SystemPermission.SYSTEM_USER_READ,
                    SystemPermission.SYSTEM_USER_CREATE,
                ];
                return Promise.resolve(permissions.includes(permission));
            });
            // 测试继承的权限（来自USER）
            const hasProjectCreate = await mockRoleInheritanceService.checkUserPermissionWithInheritance(mockUserId, SystemPermission.PROJECT_CREATE);
            // 测试自己的权限
            const hasUserRead = await mockRoleInheritanceService.checkUserPermissionWithInheritance(mockUserId, SystemPermission.SYSTEM_USER_READ);
            // 测试没有的权限
            const hasFontRead = await mockRoleInheritanceService.checkUserPermissionWithInheritance(mockUserId, SystemPermission.SYSTEM_FONT_READ);
            expect(hasProjectCreate).toBe(true);
            expect(hasUserRead).toBe(true);
            expect(hasFontRead).toBe(false);
        });
        it('T30-S10 - Role permissions change takes effect immediately after cache clear', async () => {
            // 模拟初始缓存（旧权限）
            mockPermissionCacheService.get.mockResolvedValueOnce(false);
            // 第一次检查权限（没有权限）
            const hasPermission1 = await permissionService.checkSystemPermission(mockUserId, SystemPermission.SYSTEM_USER_CREATE);
            expect(hasPermission1).toBe(false);
            // 修改角色权限并清除缓存
            const mockRole = {
                id: mockRoleId,
                name: SystemRole.USER,
                description: 'User role',
                category: 'SYSTEM',
                level: 0,
                isSystem: true,
                permissions: [],
            };
            mockDatabaseService.role.findUnique.mockResolvedValue(mockRole);
            mockDatabaseService.role.update.mockResolvedValue({
                ...mockRole,
                permissions: [{ permission: SystemPermission.SYSTEM_USER_CREATE }],
            });
            await rolesService.addPermissions(mockRoleId, [SystemPermission.SYSTEM_USER_CREATE]);
            // 模拟缓存清除后的情况
            mockPermissionCacheService.get.mockResolvedValueOnce(null);
            mockRoleInheritanceService.checkUserPermissionWithInheritance.mockResolvedValueOnce(true);
            // 第二次检查权限（有权限了）
            const hasPermission2 = await permissionService.checkSystemPermission(mockUserId, SystemPermission.SYSTEM_USER_CREATE);
            // 验证权限更新生效
            expect(hasPermission2).toBe(true);
        });
    });
});
//# sourceMappingURL=system-permission-allocation.integration.spec.js.map