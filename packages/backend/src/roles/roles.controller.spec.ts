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

import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { ProjectRolesService } from './project-roles.service';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';

describe('RolesController (legacy system endpoints, #298 isSystem)', () => {
  let controller: RolesController;
  let mockRolesService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    getRolePermissions: jest.Mock;
    addPermissions: jest.Mock;
    removePermissions: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let mockProjectRolesService: {
    findAll: jest.Mock;
    findSystemRoles: jest.Mock;
    findByProject: jest.Mock;
    getRolePermissions: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    assignPermissions: jest.Mock;
    removePermissions: jest.Mock;
    findOne: jest.Mock;
  };

  const mockReq = (userId = 'user-1') => ({ user: { id: userId } }) as never;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRolesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      getRolePermissions: jest.fn(),
      addPermissions: jest.fn(),
      removePermissions: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    mockProjectRolesService = {
      findAll: jest.fn(),
      findSystemRoles: jest.fn(),
      findByProject: jest.fn(),
      getRolePermissions: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      assignPermissions: jest.fn(),
      removePermissions: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        { provide: RolesService, useValue: mockRolesService },
        { provide: ProjectRolesService, useValue: mockProjectRolesService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideGuard(RequireProjectPermissionGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile();

    controller = module.get<RolesController>(RolesController);
  });

  describe('createProjectRole (POST /roles/project-roles)', () => {
    it('should throw ForbiddenException when creating custom role with projectId (#298 isSystem)', async () => {
      await expect(
        controller.createProjectRole(
          {
            projectId: 'project-1',
            name: '项目经理',
            permissions: [ProjectPermission.FILE_OPEN],
          } as never,
          mockReq()
        )
      ).rejects.toThrow(ForbiddenException);

      expect(mockProjectRolesService.create).not.toHaveBeenCalled();
    });

    it('should delegate to service when creating system role without projectId', async () => {
      mockProjectRolesService.create.mockResolvedValue({ id: 'role-1' });

      const result = await controller.createProjectRole(
        {
          name: 'CUSTOM_SYSTEM_ROLE',
          description: '系统级自定义角色',
          permissions: [ProjectPermission.FILE_OPEN],
        } as never,
        mockReq()
      );

      expect(mockProjectRolesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'CUSTOM_SYSTEM_ROLE' }),
        'user-1',
        true // 系统端点创建的 projectId=null 角色即模板，isSystem=true
      );
      expect(result).toEqual({ id: 'role-1' });
    });

    it('should treat empty string projectId as not provided, not 403 (#298 empty-string bypass)', async () => {
      mockProjectRolesService.create.mockResolvedValue({ id: 'role-1' });

      const result = await controller.createProjectRole(
        {
          projectId: '',
          name: 'CUSTOM_SYSTEM_ROLE',
          description: '系统级自定义角色',
          permissions: [ProjectPermission.FILE_OPEN],
        } as never,
        mockReq()
      );

      expect(mockProjectRolesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: '',
          name: 'CUSTOM_SYSTEM_ROLE',
        }),
        'user-1',
        true // 系统端点创建的 projectId=null 角色即模板，isSystem=true
      );
      expect(result).toEqual({ id: 'role-1' });
    });
  });

  describe('updateProjectRole (PATCH /roles/project-roles/:id)', () => {
    it('should delegate without projectId so service enforces isSystem guard (#298)', async () => {
      mockProjectRolesService.update.mockResolvedValue({ id: 'role-1' });

      const result = await controller.updateProjectRole(
        'role-1',
        { name: '新名称' } as never,
        mockReq()
      );

      expect(mockProjectRolesService.update).toHaveBeenCalledWith(
        'role-1',
        { name: '新名称' },
        'user-1'
      );
      expect(result).toEqual({ id: 'role-1' });
    });
  });

  describe('deleteProjectRole (DELETE /roles/project-roles/:id)', () => {
    it('should delegate without projectId so service enforces isSystem guard (#298)', async () => {
      mockProjectRolesService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteProjectRole('role-1', mockReq());

      expect(mockProjectRolesService.delete).toHaveBeenCalledWith(
        'role-1',
        'user-1'
      );
      expect(result).toEqual({ message: '项目角色已删除' });
    });
  });

  describe('addProjectRolePermissions (POST /roles/project-roles/:id/permissions)', () => {
    it('should delegate without projectId so service enforces isSystem guard (#298)', async () => {
      mockProjectRolesService.assignPermissions.mockResolvedValue(undefined);
      mockProjectRolesService.findOne.mockResolvedValue({ id: 'role-1' });

      const result = await controller.addProjectRolePermissions(
        'role-1',
        { permissions: [ProjectPermission.FILE_OPEN] },
        mockReq()
      );

      expect(mockProjectRolesService.assignPermissions).toHaveBeenCalledWith(
        'role-1',
        [ProjectPermission.FILE_OPEN],
        'user-1'
      );
      expect(result).toEqual({ id: 'role-1' });
    });
  });

  describe('removeProjectRolePermissions (DELETE /roles/project-roles/:id/permissions)', () => {
    it('should delegate without projectId so service enforces isSystem guard (#298)', async () => {
      mockProjectRolesService.removePermissions.mockResolvedValue(undefined);
      mockProjectRolesService.findOne.mockResolvedValue({ id: 'role-1' });

      const result = await controller.removeProjectRolePermissions(
        'role-1',
        { permissions: [ProjectPermission.FILE_OPEN] },
        mockReq()
      );

      expect(mockProjectRolesService.removePermissions).toHaveBeenCalledWith(
        'role-1',
        [ProjectPermission.FILE_OPEN],
        'user-1'
      );
      expect(result).toEqual({ id: 'role-1' });
    });
  });
});
