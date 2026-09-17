///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ProjectMemberService } from './project-member.service';
import { DatabaseService } from '../../database/database.service';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { IPROJECT_PERMISSION_SERVICE } from '../../roles/interfaces/project-permission-service.interface';
import { AuditLogService } from '../../audit/audit-log.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';

describe('ProjectMemberService', () => {
  let service: ProjectMemberService;

  const mockPrisma = {
    fileSystemNode: { findFirst: jest.fn() },
    projectMember: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    projectRole: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  const mockPermissionService = {
    clearNodeCache: jest.fn(),
  };

  const mockProjectPermissionService = {
    isProjectOwner: jest.fn(),
    checkPermission: jest.fn(),
    clearUserCache: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMemberService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
        {
          provide: IPROJECT_PERMISSION_SERVICE,
          useValue: mockProjectPermissionService,
        },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<ProjectMemberService>(ProjectMemberService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateProjectMember', () => {
    it('should forbid a non-owner member from modifying their own role', async () => {
      const projectId = 'proj-1';
      const userId = 'user-self';
      const operatorId = 'user-self';
      const projectRoleId = 'role-viewer';

      mockProjectPermissionService.isProjectOwner.mockResolvedValue(false);
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      // ensureNotAdmin 读取目标成员（自己），角色为普通成员（非 ADMIN），放行
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: 'PROJECT_MEMBER' },
      });
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue({
        id: projectId,
        ownerId: 'user-owner',
      });

      await expect(
        service.updateProjectMember(projectId, userId, projectRoleId, operatorId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockProjectPermissionService.checkPermission).toHaveBeenCalledWith(
        operatorId,
        projectId,
        ProjectPermission.PROJECT_MEMBER_ASSIGN,
      );
      expect(mockPrisma.projectMember.update).not.toHaveBeenCalled();
    });

    it('should still block the project owner from modifying their own role (owner guard first)', async () => {
      const projectId = 'proj-1';
      const userId = 'user-owner';
      const operatorId = 'user-owner';
      const projectRoleId = 'role-other';

      mockProjectPermissionService.isProjectOwner.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue({
        id: projectId,
        ownerId: 'user-owner',
      });

      await expect(
        service.updateProjectMember(projectId, userId, projectRoleId, operatorId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.projectMember.update).not.toHaveBeenCalled();
    });
  });

  describe('removeProjectMember', () => {
    it('should forbid a non-owner member from removing themselves', async () => {
      const projectId = 'proj-1';
      const userId = 'user-self';
      const operatorId = 'user-self';

      mockProjectPermissionService.isProjectOwner.mockResolvedValue(false);
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: 'PROJECT_MEMBER' },
      });
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue({
        id: projectId,
        ownerId: 'user-owner',
      });

      await expect(
        service.removeProjectMember(projectId, userId, operatorId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockProjectPermissionService.checkPermission).toHaveBeenCalledWith(
        operatorId,
        projectId,
        ProjectPermission.PROJECT_MEMBER_MANAGE,
      );
      expect(mockPrisma.projectMember.delete).not.toHaveBeenCalled();
    });

    it('should still block removing the project owner (owner guard first)', async () => {
      const projectId = 'proj-1';
      const userId = 'user-owner';
      const operatorId = 'user-owner';

      mockProjectPermissionService.isProjectOwner.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue({
        id: projectId,
        ownerId: 'user-owner',
      });

      await expect(
        service.removeProjectMember(projectId, userId, operatorId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.projectMember.delete).not.toHaveBeenCalled();
    });
  });
});
