/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ProjectCrudService } from './project-crud.service';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { FileSystemPermissionService } from '../file-system-permission.service';
import { PersonalSpaceService } from '../../personal-space/personal-space.service';
import { FileOperationsService } from './file-operations.service';
import { FileTreeService } from './file-tree.service';

describe('ProjectCrudService', () => {
  let service: ProjectCrudService;
  let prisma: jest.Mocked<DatabaseService>;
  let storageManager: jest.Mocked<StorageManager>;
  let permissionService: jest.Mocked<FileSystemPermissionService>;
  let personalSpaceService: jest.Mocked<PersonalSpaceService>;
  let fileOperationsService: jest.Mocked<FileOperationsService>;
  let fileTreeService: jest.Mocked<FileTreeService>;

  beforeEach(async () => {
    const mockPrisma = {
      fileSystemNode: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      projectRole: {
        findFirst: jest.fn(),
      },
    };

    const mockStorageManager = {
      getFullPath: jest.fn(),
    };

    const mockPermissionService = {};

    const mockPersonalSpaceService = {
      getPersonalSpace: jest.fn(),
    };

    const mockFileOperationsService = {
      checkNameUniqueness: jest.fn(),
    };

    const mockFileTreeService = {
      getProjectId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectCrudService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: StorageManager,
          useValue: mockStorageManager,
        },
        {
          provide: FileSystemPermissionService,
          useValue: mockPermissionService,
        },
        {
          provide: PersonalSpaceService,
          useValue: mockPersonalSpaceService,
        },
        {
          provide: FileOperationsService,
          useValue: mockFileOperationsService,
        },
        {
          provide: FileTreeService,
          useValue: mockFileTreeService,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    service = module.get<ProjectCrudService>(ProjectCrudService);
    prisma = module.get(DatabaseService);
    storageManager = module.get(StorageManager);
    permissionService = module.get(FileSystemPermissionService);
    personalSpaceService = module.get(PersonalSpaceService);
    fileOperationsService = module.get(FileOperationsService);
    fileTreeService = module.get(FileTreeService);
  });

  describe('createNode', () => {
    const userId = 'user-123';
    const projectName = 'Test Project';

    it('should create a project when no parentId provided', async () => {
      const mockProject = {
        id: 'project-1',
        name: projectName,
        isFolder: true,
        isRoot: true,
        projectStatus: 'ACTIVE',
        ownerId: userId,
      };

      prisma.projectRole.findFirst.mockResolvedValue({ id: 'role-owner' });
      prisma.fileSystemNode.create.mockResolvedValue(mockProject);

      const result = await service.createNode(userId, projectName);

      expect(result).toEqual(mockProject);
      expect(prisma.projectRole.findFirst).toHaveBeenCalledWith({
        where: { name: 'PROJECT_OWNER', isSystem: true },
      });
      expect(prisma.fileSystemNode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: projectName,
          isFolder: true,
          isRoot: true,
          ownerId: userId,
        }),
      });
    });

    it('should create a folder when parentId provided', async () => {
      const parentId = 'parent-1';
      const folderName = 'Test Folder';
      const mockParent = {
        id: parentId,
        isFolder: true,
        isRoot: false,
        projectId: 'project-1',
      };
      const mockFolder = {
        id: 'folder-1',
        name: folderName,
        isFolder: true,
        parentId,
      };

      prisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      fileTreeService.getProjectId.mockResolvedValue('project-1');
      prisma.fileSystemNode.create.mockResolvedValue(mockFolder);

      const result = await service.createNode(userId, folderName, { parentId });

      expect(result).toEqual(mockFolder);
      expect(prisma.fileSystemNode.findUnique).toHaveBeenCalledWith({
        where: { id: parentId },
        select: { id: true, isFolder: true, isRoot: true, projectId: true },
      });
    });

    it('should throw when parent node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.createNode(userId, 'Test', { parentId: 'invalid-id' })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when parent is not a folder', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        isFolder: false,
        isRoot: false,
        projectId: 'project-1',
      });

      await expect(
        service.createNode(userId, 'Test', { parentId: 'node-1' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when PROJECT_OWNER role does not exist', async () => {
      prisma.projectRole.findFirst.mockResolvedValue(null);

      await expect(
        service.createNode(userId, projectName)
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw when project name is not unique', async () => {
      fileOperationsService.checkNameUniqueness.mockRejectedValue(
        new BadRequestException('项目名称已存在')
      );

      await expect(
        service.createNode(userId, projectName)
      ).rejects.toThrow('项目名称已存在');
    });

    it('should throw when folder name is not unique', async () => {
      const parentId = 'parent-1';
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: parentId,
        isFolder: true,
        isRoot: false,
        projectId: 'project-1',
      });
      fileOperationsService.checkNameUniqueness.mockRejectedValue(
        new BadRequestException('文件夹名称已存在')
      );

      await expect(
        service.createNode(userId, 'Folder', { parentId })
      ).rejects.toThrow('文件夹名称已存在');
    });
  });

  describe('createProject', () => {
    it('should create a project with name and description', async () => {
      const userId = 'user-123';
      const dto = { name: 'New Project', description: 'Project description' };
      const mockProject = {
        id: 'project-1',
        name: dto.name,
        description: dto.description,
      };

      jest.spyOn(service, 'createNode').mockResolvedValue(mockProject);

      const result = await service.createProject(userId, dto);

      expect(result).toEqual(mockProject);
      expect(service.createNode).toHaveBeenCalledWith(userId, dto.name, {
        description: dto.description,
      });
    });

    it('should create a project with only name', async () => {
      const userId = 'user-123';
      const dto = { name: 'Another Project' };
      const mockProject = { id: 'project-2', name: dto.name };

      jest.spyOn(service, 'createNode').mockResolvedValue(mockProject);

      const result = await service.createProject(userId, dto);

      expect(result).toEqual(mockProject);
      expect(service.createNode).toHaveBeenCalledWith(userId, dto.name, {
        description: undefined,
      });
    });
  });

  describe('createFolder', () => {
    const userId = 'user-123';
    const parentId = 'parent-1';
    const folderName = 'New Folder';

    it('should create a new folder', async () => {
      const mockFolder = { id: 'folder-1', name: folderName, isFolder: true };
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'createNode').mockResolvedValue(mockFolder);

      const result = await service.createFolder(userId, parentId, {
        name: folderName,
      });

      expect(result).toEqual(mockFolder);
      expect(prisma.fileSystemNode.findFirst).toHaveBeenCalledWith({
        where: {
          name: { equals: folderName, mode: 'insensitive' },
          parentId: parentId || null,
          isFolder: true,
          deletedAt: null,
        },
        select: { id: true },
      });
    });

    it('should skip creation and return existing folder when skipIfExists is true', async () => {
      const existingFolder = { id: 'existing-folder', name: folderName };
      prisma.fileSystemNode.findFirst.mockResolvedValue(existingFolder);
      prisma.fileSystemNode.findUnique.mockResolvedValue(existingFolder);

      const result = await service.createFolder(userId, parentId, {
        name: folderName,
        skipIfExists: true,
      });

      expect(result).toEqual(existingFolder);
      expect(service.createNode).not.toHaveBeenCalled();
    });

    it('should check uniqueness when skipIfExists is false', async () => {
      const mockFolder = { id: 'folder-2', name: folderName };
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      fileOperationsService.checkNameUniqueness.mockResolvedValue(undefined);
      jest.spyOn(service, 'createNode').mockResolvedValue(mockFolder);

      await service.createFolder(userId, parentId, {
        name: folderName,
        skipIfExists: false,
      });

      expect(fileOperationsService.checkNameUniqueness).toHaveBeenCalledWith(
        folderName,
        userId,
        parentId
      );
    });

    it('should check uniqueness when folder does not exist even with skipIfExists', async () => {
      const mockFolder = { id: 'folder-3', name: folderName };
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      fileOperationsService.checkNameUniqueness.mockResolvedValue(undefined);
      jest.spyOn(service, 'createNode').mockResolvedValue(mockFolder);

      await service.createFolder(userId, parentId, {
        name: folderName,
        skipIfExists: true,
      });

      expect(service.createNode).toHaveBeenCalled();
    });
  });

  describe('getUserProjects', () => {
    const userId = 'user-123';
    const mockProjects = [
      { id: 'project-1', name: 'Project 1', _count: { children: 3, projectMembers: 2 } },
      { id: 'project-2', name: 'Project 2', _count: { children: 0, projectMembers: 1 } },
    ];

    beforeEach(() => {
      prisma.fileSystemNode.findMany.mockResolvedValue(mockProjects);
      prisma.fileSystemNode.count.mockResolvedValue(2);
    });

    it('should return projects owned by user when filter is owned', async () => {
      const result = await service.getUserProjects(userId, { filter: 'owned' });

      expect(result.nodes).toHaveLength(2);
      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: userId }),
        })
      );
    });

    it('should return joined projects when filter is joined', async () => {
      const result = await service.getUserProjects(userId, { filter: 'joined' });

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectMembers: { some: { userId } },
            ownerId: { not: userId },
          }),
        })
      );
    });

    it('should return all projects when filter is all', async () => {
      const result = await service.getUserProjects(userId, { filter: 'all' });

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
          }),
        })
      );
    });

    it('should return all projects when filter is undefined', async () => {
      await service.getUserProjects(userId);

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ ownerId: userId }, { projectMembers: { some: { userId } }],
          }),
        })
      );
    });

    it('should filter by search term', async () => {
      await service.getUserProjects(userId, { search: 'test' });

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });

    it('should filter by project status', async () => {
      await service.getUserProjects(userId, { projectStatus: 'ACTIVE' });

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectStatus: 'ACTIVE' }),
        })
      );
    });

    it('should return paginated results', async () => {
      const result = await service.getUserProjects(userId, { page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it('should return correct total page count', async () => {
      prisma.fileSystemNode.count.mockResolvedValue(25);
      const result = await service.getUserProjects(userId, { limit: 10 });

      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it('should sort by specified field and order', async () => {
      await service.getUserProjects(userId, {
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } })
      );
    });

    it('should sort by updatedAt desc by default', async () => {
      await service.getUserProjects(userId);

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } })
      );
    });

    it('should exclude personal space and library projects', async () => {
      await service.getUserProjects(userId);

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            personalSpaceKey: null,
            libraryKey: null,
          }),
        })
      );
    });
  });

  describe('getUserDeletedProjects', () => {
    const userId = 'user-123';
    const mockDeletedProjects = [
      { id: 'project-1', deletedAt: new Date('2024-01-02'), _count: { children: 0, projectMembers: 1 } },
      { id: 'project-2', deletedAt: new Date('2024-01-01'), _count: { children: 2, projectMembers: 3 } },
    ];

    beforeEach(() => {
      prisma.fileSystemNode.findMany.mockResolvedValue(mockDeletedProjects);
      prisma.fileSystemNode.count.mockResolvedValue(2);
    });

    it('should return deleted projects for user', async () => {
      const result = await service.getUserDeletedProjects(userId);

      expect(result.nodes).toHaveLength(2);
      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRoot: true,
            deletedAt: { not: null },
          }),
        })
      );
    });

    it('should filter by search term', async () => {
      await service.getUserDeletedProjects(userId, { search: 'test' });

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ AND: expect.any(Array) }),
        })
      );
    });

    it('should return paginated results', async () => {
      const result = await service.getUserDeletedProjects(userId, { page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it('should sort by deletedAt desc by default', async () => {
      await service.getUserDeletedProjects(userId);

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { deletedAt: 'desc' } })
      );
    });

    it('should exclude personal space and library projects', async () => {
      await service.getUserDeletedProjects(userId);

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            personalSpaceKey: null,
            libraryKey: null,
          }),
        })
      );
    });
  });

  describe('getPersonalSpace', () => {
    it('should return personal space from personalSpaceService', async () => {
      const userId = 'user-123';
      const mockPersonalSpace = { id: 'space-1', name: 'Personal Space' };

      personalSpaceService.getPersonalSpace.mockResolvedValue(mockPersonalSpace);

      const result = await service.getPersonalSpace(userId);

      expect(result).toEqual(mockPersonalSpace);
      expect(personalSpaceService.getPersonalSpace).toHaveBeenCalledWith(userId);
    });
  });

  describe('getProject', () => {
    it('should return project with members and children', async () => {
      const mockProj = { id: 'p1', name: 'Project', projectMembers: [], children: [] };
      prisma.fileSystemNode.findFirst.mockResolvedValue(mockProj);
      const r = await service.getProject('p1');
      expect(r).toEqual(mockProj);
    });

    it('should throw when project does not exist', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      await expect(service.getProject('x')).rejects.toThrow(NotFoundException);
    });

    it('should exclude library projects', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      await expect(service.getProject('lib')).rejects.toThrow(NotFoundException);
      expect(prisma.fileSystemNode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ libraryKey: null }) }),
      );
    });

    it('should only return non-deleted children', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'p1', children: [] });
      await service.getProject('p1');
      const call = prisma.fileSystemNode.findFirst.mock.calls[0][0] as any;
      expect(call.include.children.where.deletedAt).toBeNull();
    });

    it('should sort children by createdAt desc', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'p1', children: [] });
      await service.getProject('p1');
      const call = prisma.fileSystemNode.findFirst.mock.calls[0][0] as any;
      expect(call.include.children.orderBy.createdAt).toBe('desc');
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', name: 'Old', ownerId: 'u1', isRoot: true });
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'p1', name: 'New' });
      const r = await service.updateProject('p1', { name: 'New' });
      expect(r.name).toBe('New');
    });

    it('should update project description', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', name: 'P', ownerId: 'u1', isRoot: true });
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'p1', description: 'new desc' });
      const r = await service.updateProject('p1', { description: 'new desc' });
      expect(r.description).toBe('new desc');
    });

    it('should update project status', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', name: 'P', ownerId: 'u1', isRoot: true });
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'p1', projectStatus: 'ARCHIVED' });
      await service.updateProject('p1', { status: 'ARCHIVED' as any });
      expect(prisma.fileSystemNode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectStatus: 'ARCHIVED' }) }),
      );
    });

    it('should check name uniqueness when name changes', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', name: 'Old', ownerId: 'u1', isRoot: true });
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'p1', name: 'New' });
      await service.updateProject('p1', { name: 'New' });
      expect(fileOperationsService.checkNameUniqueness).toHaveBeenCalledWith('New', 'u1', null, 'p1');
    });

    it('should skip uniqueness check when name is unchanged', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', name: 'Same', ownerId: 'u1', isRoot: true });
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'p1', name: 'Same' });
      await service.updateProject('p1', { name: 'Same' });
      expect(fileOperationsService.checkNameUniqueness).not.toHaveBeenCalled();
    });

    it('should throw when project does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.updateProject('x', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStoragePath', () => {
    it('should return full path for node with path', () => {
      storageManager.getFullPath.mockReturnValue('/abs/path');
      expect(service.getStoragePath({ path: 'rel/path' } as any)).toBe('/abs/path');
    });

    it('should throw when node has no path', () => {
      expect(() => service.getStoragePath({ path: null } as any)).toThrow(NotFoundException);
    });
  });

  describe('getFullPath', () => {
    it('should return full path for valid nodePath', () => {
      storageManager.getFullPath.mockReturnValue('/abs/path');
      expect(service.getFullPath('rel/path')).toBe('/abs/path');
    });

    it('should throw when nodePath is empty', () => {
      expect(() => service.getFullPath('')).toThrow(NotFoundException);
    });

    it('should throw when nodePath is null', () => {
      expect(() => service.getFullPath(null as any)).toThrow(NotFoundException);
    });
  });

  describe('getStorageManager', () => {
    it('should return the storage manager instance', () => {
      expect(service.getStorageManager()).toBeDefined();
    });
  });
});
