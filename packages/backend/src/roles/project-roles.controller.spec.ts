///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ProjectRolesController } from './project-roles.controller';
import { ProjectRolesService } from './project-roles.service';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { REQUIRE_PROJECT_PERMISSION_KEY } from '../common/decorators/require-project-permission.decorator';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';

describe('ProjectRolesController', () => {
  let controller: ProjectRolesController;
  let mockProjectRolesService: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    assignPermissions: jest.Mock;
    removePermissions: jest.Mock;
    findOne: jest.Mock;
  };

  const mockReq = (userId = 'user-1') =>
    ({ user: { id: userId } }) as never;

  const createDto = {
    name: '项目经理',
    description: '负责项目管理',
    permissions: [ProjectPermission.FILE_OPEN],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProjectRolesService = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      assignPermissions: jest.fn(),
      removePermissions: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectRolesController],
      providers: [
        { provide: ProjectRolesService, useValue: mockProjectRolesService },
      ],
    })
      .overrideGuard(RequireProjectPermissionGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile();

    controller = module.get<ProjectRolesController>(ProjectRolesController);
  });

  describe('createProjectRole', () => {
    it('should force projectId from URL path and delegate to service', async () => {
      mockProjectRolesService.create.mockResolvedValue({ id: 'role-1' });

      await controller.createProjectRole(
        'project-1',
        { ...createDto, projectId: 'evil-project' },
        mockReq()
      );

      expect(mockProjectRolesService.create).toHaveBeenCalledWith(
        { ...createDto, projectId: 'project-1' },
        'user-1'
      );
    });
  });

  describe('updateProjectRole', () => {
    it('should pass projectId to service for project-scoped check', async () => {
      mockProjectRolesService.update.mockResolvedValue({ id: 'role-1' });

      await controller.updateProjectRole(
        'project-1',
        'role-1',
        { name: '新名称' },
        mockReq()
      );

      expect(mockProjectRolesService.update).toHaveBeenCalledWith(
        'role-1',
        { name: '新名称' },
        'user-1',
        'project-1'
      );
    });
  });

  describe('deleteProjectRole', () => {
    it('should pass projectId to service for project-scoped check', async () => {
      mockProjectRolesService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteProjectRole(
        'project-1',
        'role-1',
        mockReq()
      );

      expect(mockProjectRolesService.delete).toHaveBeenCalledWith(
        'role-1',
        'user-1',
        'project-1'
      );
      expect(result).toEqual({ message: '项目角色已删除' });
    });
  });

  describe('addProjectRolePermissions', () => {
    it('should assign permissions with project-scoped check and return role', async () => {
      mockProjectRolesService.assignPermissions.mockResolvedValue(undefined);
      mockProjectRolesService.findOne.mockResolvedValue({ id: 'role-1' });

      const result = await controller.addProjectRolePermissions(
        'project-1',
        'role-1',
        { permissions: [ProjectPermission.FILE_OPEN] },
        mockReq()
      );

      expect(mockProjectRolesService.assignPermissions).toHaveBeenCalledWith(
        'role-1',
        [ProjectPermission.FILE_OPEN],
        'user-1',
        'project-1'
      );
      expect(mockProjectRolesService.findOne).toHaveBeenCalledWith('role-1');
      expect(result).toEqual({ id: 'role-1' });
    });
  });

  describe('removeProjectRolePermissions', () => {
    it('should remove permissions with project-scoped check and return role', async () => {
      mockProjectRolesService.removePermissions.mockResolvedValue(undefined);
      mockProjectRolesService.findOne.mockResolvedValue({ id: 'role-1' });

      const result = await controller.removeProjectRolePermissions(
        'project-1',
        'role-1',
        { permissions: [ProjectPermission.FILE_OPEN] },
        mockReq()
      );

      expect(mockProjectRolesService.removePermissions).toHaveBeenCalledWith(
        'role-1',
        [ProjectPermission.FILE_OPEN],
        'user-1',
        'project-1'
      );
      expect(result).toEqual({ id: 'role-1' });
    });
  });

  describe('permission metadata', () => {
    it('should require PROJECT_ROLE_MANAGE for create and delete endpoints', () => {
      const reflector = new Reflector();
      expect(
        reflector.getAllAndOverride<ProjectPermission[]>(
          REQUIRE_PROJECT_PERMISSION_KEY,
          [
            ProjectRolesController.prototype.createProjectRole,
            ProjectRolesController,
          ]
        )
      ).toEqual([ProjectPermission.PROJECT_ROLE_MANAGE]);
      expect(
        reflector.getAllAndOverride<ProjectPermission[]>(
          REQUIRE_PROJECT_PERMISSION_KEY,
          [
            ProjectRolesController.prototype.deleteProjectRole,
            ProjectRolesController,
          ]
        )
      ).toEqual([ProjectPermission.PROJECT_ROLE_MANAGE]);
    });

    it('should require PROJECT_ROLE_MANAGE + PROJECT_ROLE_PERMISSION_MANAGE for update (full replace)', () => {
      const reflector = new Reflector();
      expect(
        reflector.getAllAndOverride<ProjectPermission[]>(
          REQUIRE_PROJECT_PERMISSION_KEY,
          [
            ProjectRolesController.prototype.updateProjectRole,
            ProjectRolesController,
          ]
        )
      ).toEqual([
        ProjectPermission.PROJECT_ROLE_MANAGE,
        ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
      ]);
    });

    it('should require PROJECT_ROLE_PERMISSION_MANAGE for permission endpoints', () => {
      const reflector = new Reflector();
      expect(
        reflector.getAllAndOverride<ProjectPermission[]>(
          REQUIRE_PROJECT_PERMISSION_KEY,
          [
            ProjectRolesController.prototype.addProjectRolePermissions,
            ProjectRolesController,
          ]
        )
      ).toEqual([ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE]);
      expect(
        reflector.getAllAndOverride<ProjectPermission[]>(
          REQUIRE_PROJECT_PERMISSION_KEY,
          [
            ProjectRolesController.prototype.removeProjectRolePermissions,
            ProjectRolesController,
          ]
        )
      ).toEqual([ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE]);
    });
  });
});
