///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { RolesService } from './roles.service';
import { DatabaseService } from '../database/database.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RoleCategory } from '../common/enums/permissions.enum';
describe('RolesService', () => {
    let service;
    const mockPrisma = {
        role: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
    };
    const mockCacheService = {
        cleanup: jest.fn(),
        clearRoleCache: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                RolesService,
                { provide: DatabaseService, useValue: mockPrisma },
                { provide: PermissionCacheService, useValue: mockCacheService },
            ],
        }).compile();
        service = module.get(RolesService);
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    describe('findAll', () => {
        it('should return all roles', async () => {
            const mockRoles = [
                {
                    id: 'role1',
                    name: 'ADMIN',
                    description: 'Administrator',
                    category: 'SYSTEM',
                    level: 100,
                    isSystem: true,
                    permissions: [{ permission: 'SYSTEM_ADMIN' }],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];
            mockPrisma.role.findMany.mockResolvedValue(mockRoles);
            const result = await service.findAll();
            expect(mockPrisma.role.findMany).toHaveBeenCalled();
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('ADMIN');
        });
    });
    describe('findByCategory', () => {
        it('should return roles by category', async () => {
            const mockRoles = [
                {
                    id: 'role1',
                    name: 'ADMIN',
                    description: 'Administrator',
                    category: 'SYSTEM',
                    level: 100,
                    isSystem: true,
                    permissions: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];
            mockPrisma.role.findMany.mockResolvedValue(mockRoles);
            const result = await service.findByCategory(RoleCategory.SYSTEM);
            expect(mockPrisma.role.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { category: RoleCategory.SYSTEM },
            }));
            expect(result).toHaveLength(1);
        });
    });
    describe('findOne', () => {
        it('should return role by id', async () => {
            const mockRole = {
                id: 'role1',
                name: 'ADMIN',
                description: 'Administrator',
                category: 'SYSTEM',
                level: 100,
                isSystem: true,
                permissions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.findUnique.mockResolvedValue(mockRole);
            const result = await service.findOne('role1');
            expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
                where: { id: 'role1' },
                include: expect.any(Object),
            });
            expect(result.id).toBe('role1');
        });
        it('should throw NotFoundException when role not found', async () => {
            mockPrisma.role.findUnique.mockResolvedValue(null);
            await expect(service.findOne('invalid')).rejects.toThrow(NotFoundException);
        });
    });
    describe('create', () => {
        it('should create a new role', async () => {
            const createDto = {
                name: 'CUSTOM_ROLE',
                description: 'Custom role',
                category: RoleCategory.CUSTOM,
                level: 50,
                permissions: ['SYSTEM_USER_READ'],
            };
            const mockRole = {
                id: 'role1',
                ...createDto,
                isSystem: false,
                permissions: [{ permission: 'SYSTEM_USER_READ' }],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.create.mockResolvedValue(mockRole);
            const result = await service.create(createDto);
            expect(mockPrisma.role.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    name: 'CUSTOM_ROLE',
                    isSystem: false,
                }),
            }));
            expect(mockCacheService.cleanup).toHaveBeenCalled();
            expect(result.name).toBe('CUSTOM_ROLE');
        });
    });
    describe('update', () => {
        it('should update a role', async () => {
            const updateDto = {
                description: 'Updated description',
                permissions: ['SYSTEM_USER_READ', 'SYSTEM_USER_UPDATE'],
            };
            const existingRole = {
                id: 'role1',
                name: 'CUSTOM_ROLE',
                description: 'Custom role',
                category: 'CUSTOM',
                level: 50,
                isSystem: false,
                permissions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const updatedRole = {
                ...existingRole,
                description: 'Updated description',
                permissions: [
                    { permission: 'SYSTEM_USER_READ' },
                    { permission: 'SYSTEM_USER_UPDATE' },
                ],
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            mockPrisma.role.update.mockResolvedValue(updatedRole);
            const result = await service.update('role1', updateDto);
            expect(mockPrisma.role.update).toHaveBeenCalled();
            expect(mockCacheService.clearRoleCache).toHaveBeenCalled();
            expect(result.description).toBe('Updated description');
        });
        it('should throw NotFoundException when role not found', async () => {
            mockPrisma.role.findUnique.mockResolvedValue(null);
            await expect(service.update('invalid', {})).rejects.toThrow(NotFoundException);
        });
        it('should throw BadRequestException when updating system role name', async () => {
            const existingRole = {
                id: 'role1',
                name: 'ADMIN',
                description: 'Administrator',
                category: 'SYSTEM',
                level: 100,
                isSystem: true,
                permissions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            await expect(service.update('role1', { name: 'NEW_ADMIN' })).rejects.toThrow(BadRequestException);
        });
    });
    describe('remove', () => {
        it('should delete a role', async () => {
            const existingRole = {
                id: 'role1',
                name: 'CUSTOM_ROLE',
                description: 'Custom role',
                category: 'CUSTOM',
                level: 50,
                isSystem: false,
                permissions: [],
                _count: { users: 0 },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            mockPrisma.role.delete.mockResolvedValue(existingRole);
            await service.remove('role1');
            expect(mockPrisma.role.delete).toHaveBeenCalledWith({
                where: { id: 'role1' },
            });
            expect(mockCacheService.cleanup).toHaveBeenCalled();
        });
        it('should throw NotFoundException when role not found', async () => {
            mockPrisma.role.findUnique.mockResolvedValue(null);
            await expect(service.remove('invalid')).rejects.toThrow(NotFoundException);
        });
        it('should throw BadRequestException when deleting system role', async () => {
            const existingRole = {
                id: 'role1',
                name: 'ADMIN',
                description: 'Administrator',
                category: 'SYSTEM',
                level: 100,
                isSystem: true,
                permissions: [],
                _count: { users: 0 },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            await expect(service.remove('role1')).rejects.toThrow(BadRequestException);
        });
        it('should throw BadRequestException when role is in use', async () => {
            const existingRole = {
                id: 'role1',
                name: 'CUSTOM_ROLE',
                description: 'Custom role',
                category: 'CUSTOM',
                level: 50,
                isSystem: false,
                permissions: [],
                _count: { users: 5 },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            await expect(service.remove('role1')).rejects.toThrow(BadRequestException);
        });
    });
    describe('addPermissions', () => {
        it('should add permissions to role', async () => {
            const existingRole = {
                id: 'role1',
                name: 'CUSTOM_ROLE',
                description: 'Custom role',
                category: 'CUSTOM',
                level: 50,
                isSystem: false,
                permissions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const updatedRole = {
                ...existingRole,
                permissions: [{ permission: 'SYSTEM_USER_READ' }],
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            mockPrisma.role.update.mockResolvedValue(updatedRole);
            await service.addPermissions('role1', ['SYSTEM_USER_READ']);
            expect(mockPrisma.role.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'role1' },
                data: expect.objectContaining({
                    permissions: expect.objectContaining({
                        createMany: expect.any(Object),
                    }),
                }),
            }));
        });
    });
    describe('removePermissions', () => {
        it('should remove permissions from role', async () => {
            const existingRole = {
                id: 'role1',
                name: 'CUSTOM_ROLE',
                description: 'Custom role',
                category: 'CUSTOM',
                level: 50,
                isSystem: false,
                permissions: [{ permission: 'SYSTEM_USER_READ' }],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            await service.removePermissions('role1', ['SYSTEM_USER_READ']);
            expect(mockPrisma.role.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'role1' },
                data: expect.objectContaining({
                    permissions: expect.objectContaining({
                        deleteMany: expect.any(Object),
                    }),
                }),
            }));
        });
    });
    describe('getRolePermissions', () => {
        it('should return permissions for role', async () => {
            const existingRole = {
                id: 'role1',
                name: 'CUSTOM_ROLE',
                description: 'Custom role',
                category: 'CUSTOM',
                level: 50,
                isSystem: false,
                permissions: [
                    { permission: 'SYSTEM_USER_READ' },
                    { permission: 'SYSTEM_USER_UPDATE' },
                ],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrisma.role.findUnique.mockResolvedValue(existingRole);
            const result = await service.getRolePermissions('role1');
            expect(result).toEqual(['SYSTEM_USER_READ', 'SYSTEM_USER_UPDATE']);
        });
        it('should throw NotFoundException when role not found', async () => {
            mockPrisma.role.findUnique.mockResolvedValue(null);
            await expect(service.getRolePermissions('invalid')).rejects.toThrow(NotFoundException);
        });
    });
});
//# sourceMappingURL=roles.service.spec.js.map