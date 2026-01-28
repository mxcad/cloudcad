import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto } from './dto/role.dto';
import {
  SystemRole,
  SystemPermission,
  RoleCategory,
} from '../common/enums/permissions.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: jest.Mocked<RolesService>;

  const mockRole: RoleDto = {
    id: 'role-id',
    name: SystemRole.USER,
    description: '普通用户',
    category: RoleCategory.SYSTEM,
    level: 1,
    isSystem: true,
    permissions: [SystemPermission.USER_READ, SystemPermission.FONT_READ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminRole: RoleDto = {
    id: 'admin-role-id',
    name: SystemRole.ADMIN,
    description: '系统管理员',
    category: RoleCategory.SYSTEM,
    level: 10,
    isSystem: true,
    permissions: [
      SystemPermission.USER_READ,
      SystemPermission.USER_CREATE,
      SystemPermission.USER_UPDATE,
      SystemPermission.USER_DELETE,
      SystemPermission.ROLE_READ,
      SystemPermission.ROLE_CREATE,
      SystemPermission.ROLE_UPDATE,
      SystemPermission.ROLE_DELETE,
      SystemPermission.ROLE_PERMISSION_MANAGE,
      SystemPermission.FONT_READ,
      SystemPermission.FONT_UPLOAD,
      SystemPermission.FONT_DELETE,
      SystemPermission.FONT_DOWNLOAD,
      SystemPermission.SYSTEM_ADMIN,
      SystemPermission.SYSTEM_MONITOR,
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRolesService = {
      findAll: jest.fn(),
      findByCategory: jest.fn(),
      findOne: jest.fn(),
      getRolePermissions: jest.fn(),
      addPermissions: jest.fn(),
      removePermissions: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        {
          provide: RolesService,
          useValue: mockRolesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    controller = module.get<RolesController>(RolesController);
    rolesService = module.get<RolesService>(
      RolesService
    ) as jest.Mocked<RolesService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all roles', async () => {
      rolesService.findAll.mockResolvedValue([mockRole, mockAdminRole]);

      const result = await controller.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockRole);
      expect(result[1]).toEqual(mockAdminRole);
      expect(rolesService.findAll).toHaveBeenCalled();
    });

    it('should handle empty role list', async () => {
      rolesService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
      expect(rolesService.findAll).toHaveBeenCalled();
    });
  });

  describe('findByCategory', () => {
    it('should return roles by category', async () => {
      rolesService.findByCategory.mockResolvedValue([mockRole, mockAdminRole]);

      const result = await controller.findByCategory('SYSTEM');

      expect(result).toHaveLength(2);
      expect(rolesService.findByCategory).toHaveBeenCalledWith('SYSTEM');
    });

    it('should handle invalid category', async () => {
      rolesService.findByCategory.mockResolvedValue([]);

      const result = await controller.findByCategory('INVALID');

      expect(result).toEqual([]);
      expect(rolesService.findByCategory).toHaveBeenCalledWith('INVALID');
    });
  });

  describe('findOne', () => {
    it('should return role by id', async () => {
      rolesService.findOne.mockResolvedValue(mockRole);

      const result = await controller.findOne('role-id');

      expect(result).toEqual(mockRole);
      expect(rolesService.findOne).toHaveBeenCalledWith('role-id');
    });

    it('should handle not found exception', async () => {
      rolesService.findOne.mockRejectedValue(
        new NotFoundException('角色不存在')
      );

      await expect(controller.findOne('invalid-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getRolePermissions', () => {
    it('should return role permissions', async () => {
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.FONT_READ,
      ];
      rolesService.getRolePermissions.mockResolvedValue(permissions);

      const result = await controller.getRolePermissions('role-id');

      expect(result).toEqual(permissions);
      expect(rolesService.getRolePermissions).toHaveBeenCalledWith('role-id');
    });

    it('should handle empty permissions', async () => {
      rolesService.getRolePermissions.mockResolvedValue([]);

      const result = await controller.getRolePermissions('role-id');

      expect(result).toEqual([]);
      expect(rolesService.getRolePermissions).toHaveBeenCalledWith('role-id');
    });
  });

  describe('addPermissions', () => {
    it('should add permissions to role', async () => {
      const newPermissions = [
        SystemPermission.USER_CREATE,
        SystemPermission.USER_UPDATE,
      ];
      const updatedRole = {
        ...mockRole,
        permissions: [...mockRole.permissions, ...newPermissions],
      };

      rolesService.addPermissions.mockResolvedValue(updatedRole);

      const result = await controller.addPermissions('role-id', {
        permissions: newPermissions,
      });

      expect(result).toEqual(updatedRole);
      expect(rolesService.addPermissions).toHaveBeenCalledWith(
        'role-id',
        newPermissions
      );
    });

    it('should handle invalid permissions', async () => {
      rolesService.addPermissions.mockRejectedValue(
        new BadRequestException('无效的权限')
      );

      await expect(
        controller.addPermissions('role-id', {
          permissions: ['INVALID_PERMISSION'],
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle duplicate permissions', async () => {
      rolesService.addPermissions.mockRejectedValue(
        new ConflictException('权限已存在')
      );

      await expect(
        controller.addPermissions('role-id', {
          permissions: mockRole.permissions,
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removePermissions', () => {
    it('should remove permissions from role', async () => {
      const permissionsToRemove = [SystemPermission.FONT_READ];
      const updatedRole = {
        ...mockRole,
        permissions: mockRole.permissions.filter(
          (p) => !permissionsToRemove.includes(p as SystemPermission)
        ),
      };

      rolesService.removePermissions.mockResolvedValue(updatedRole);

      const result = await controller.removePermissions('role-id', {
        permissions: permissionsToRemove,
      });

      expect(result).toEqual(updatedRole);
      expect(rolesService.removePermissions).toHaveBeenCalledWith(
        'role-id',
        permissionsToRemove
      );
    });

    it('should handle removing non-existent permissions', async () => {
      rolesService.removePermissions.mockResolvedValue(mockRole);

      const result = await controller.removePermissions('role-id', {
        permissions: ['NON_EXISTENT_PERMISSION'],
      });

      expect(result).toEqual(mockRole);
      expect(rolesService.removePermissions).toHaveBeenCalledWith('role-id', [
        'NON_EXISTENT_PERMISSION',
      ]);
    });
  });

  describe('create', () => {
    const createRoleDto: CreateRoleDto = {
      name: 'CUSTOM_ROLE',
      description: '自定义角色',
      category: RoleCategory.CUSTOM,
      permissions: [SystemPermission.USER_READ],
    };

    it('should create new role', async () => {
      const newRole = {
        ...mockRole,
        id: 'new-role-id',
        name: 'CUSTOM_ROLE',
        description: '自定义角色',
        category: RoleCategory.CUSTOM,
      };

      rolesService.create.mockResolvedValue(newRole);

      const result = await controller.create(createRoleDto);

      expect(result).toEqual(newRole);
      expect(rolesService.create).toHaveBeenCalledWith(createRoleDto);
    });

    it('should handle duplicate role name', async () => {
      rolesService.create.mockRejectedValue(
        new ConflictException('角色名称已存在')
      );

      await expect(controller.create(createRoleDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should handle validation errors', async () => {
      const invalidDto = { ...createRoleDto, name: '' };

      rolesService.create.mockResolvedValue(mockRole);

      await controller.create(invalidDto as any);

      expect(rolesService.create).toHaveBeenCalledWith(invalidDto);
    });
  });

  describe('update', () => {
    const updateRoleDto: UpdateRoleDto = {
      description: '更新后的描述',
    };

    it('should update role', async () => {
      const updatedRole = {
        ...mockRole,
        description: '更新后的描述',
      };

      rolesService.update.mockResolvedValue(updatedRole);

      const result = await controller.update('role-id', updateRoleDto);

      expect(result).toEqual(updatedRole);
      expect(rolesService.update).toHaveBeenCalledWith(
        'role-id',
        updateRoleDto
      );
    });

    it('should handle not found exception', async () => {
      rolesService.update.mockRejectedValue(
        new NotFoundException('角色不存在')
      );

      await expect(
        controller.update('invalid-id', updateRoleDto)
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle conflict exception', async () => {
      rolesService.update.mockRejectedValue(
        new ConflictException('角色名称已存在')
      );

      await expect(
        controller.update('role-id', { name: 'EXISTING_ROLE' })
      ).rejects.toThrow(ConflictException);
    });

    it('should handle updating system role name', async () => {
      rolesService.update.mockRejectedValue(
        new BadRequestException('无法修改系统角色名称')
      );

      await expect(
        controller.update(mockAdminRole.id, { name: 'NEW_NAME' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should remove role', async () => {
      rolesService.remove.mockResolvedValue(undefined);

      const result = await controller.remove('role-id');

      expect(result).toEqual({ message: '角色已删除' });
      expect(rolesService.remove).toHaveBeenCalledWith('role-id');
    });

    it('should handle not found exception', async () => {
      rolesService.remove.mockRejectedValue(
        new NotFoundException('角色不存在')
      );

      await expect(controller.remove('invalid-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle deleting system role', async () => {
      rolesService.remove.mockRejectedValue(
        new BadRequestException('无法删除系统角色')
      );

      await expect(controller.remove(mockAdminRole.id)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should handle role in use', async () => {
      rolesService.remove.mockRejectedValue(
        new BadRequestException('角色正在使用中，无法删除')
      );

      await expect(controller.remove('role-id')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('permission types', () => {
    it('should handle all user management permissions', async () => {
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
        SystemPermission.USER_UPDATE,
        SystemPermission.USER_DELETE,
      ];

      rolesService.addPermissions.mockResolvedValue(mockRole);

      const result = await controller.addPermissions('role-id', {
        permissions,
      });

      expect(rolesService.addPermissions).toHaveBeenCalledWith(
        'role-id',
        permissions
      );
    });

    it('should handle all role management permissions', async () => {
      const permissions = [
        SystemPermission.ROLE_READ,
        SystemPermission.ROLE_CREATE,
        SystemPermission.ROLE_UPDATE,
        SystemPermission.ROLE_DELETE,
      ];

      rolesService.addPermissions.mockResolvedValue(mockRole);

      const result = await controller.addPermissions('role-id', {
        permissions,
      });

      expect(rolesService.addPermissions).toHaveBeenCalledWith(
        'role-id',
        permissions
      );
    });

    it('should handle font management permission', async () => {
      const permissions = [
        SystemPermission.FONT_READ,
        SystemPermission.FONT_UPLOAD,
        SystemPermission.FONT_DELETE,
        SystemPermission.FONT_DOWNLOAD,
      ];

      rolesService.addPermissions.mockResolvedValue(mockRole);

      const result = await controller.addPermissions('role-id', {
        permissions,
      });

      expect(rolesService.addPermissions).toHaveBeenCalledWith(
        'role-id',
        permissions
      );
    });

    it('should handle system monitor permission', async () => {
      const permissions = [SystemPermission.SYSTEM_MONITOR];

      rolesService.addPermissions.mockResolvedValue(mockRole);

      const result = await controller.addPermissions('role-id', {
        permissions,
      });

      expect(rolesService.addPermissions).toHaveBeenCalledWith(
        'role-id',
        permissions
      );
    });
  });
});
