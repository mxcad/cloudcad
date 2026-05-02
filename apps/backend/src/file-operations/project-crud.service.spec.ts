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
    it('should create a project when no parentId provided', async () => {
      // TODO: Implement test
    });

    it('should create a folder when parentId provided', async () => {
      // TODO: Implement test
    });

    it('should throw when parent node does not exist', async () => {
      // TODO: Implement test
    });

    it('should throw when parent is not a folder', async () => {
      // TODO: Implement test
    });

    it('should throw when PROJECT_OWNER role does not exist', async () => {
      // TODO: Implement test
    });

    it('should throw when project name is not unique', async () => {
      // TODO: Implement test
    });

    it('should throw when folder name is not unique', async () => {
      // TODO: Implement test
    });
  });

  describe('createProject', () => {
    it('should create a project with name and description', async () => {
      // TODO: Implement test
    });

    it('should create a project with only name', async () => {
      // TODO: Implement test
    });
  });

  describe('createFolder', () => {
    it('should create a new folder', async () => {
      // TODO: Implement test
    });

    it('should skip creation and return existing folder when skipIfExists is true', async () => {
      // TODO: Implement test
    });

    it('should check uniqueness when skipIfExists is false', async () => {
      // TODO: Implement test
    });

    it('should check uniqueness when folder does not exist even with skipIfExists', async () => {
      // TODO: Implement test
    });
  });

  describe('getUserProjects', () => {
    it('should return projects owned by user when filter is owned', async () => {
      // TODO: Implement test
    });

    it('should return joined projects when filter is joined', async () => {
      // TODO: Implement test
    });

    it('should return all projects when filter is all', async () => {
      // TODO: Implement test
    });

    it('should return all projects when filter is undefined', async () => {
      // TODO: Implement test
    });

    it('should filter by search term', async () => {
      // TODO: Implement test
    });

    it('should filter by project status', async () => {
      // TODO: Implement test
    });

    it('should return paginated results', async () => {
      // TODO: Implement test
    });

    it('should return correct total page count', async () => {
      // TODO: Implement test
    });

    it('should sort by specified field and order', async () => {
      // TODO: Implement test
    });

    it('should sort by updatedAt desc by default', async () => {
      // TODO: Implement test
    });

    it('should exclude personal space and library projects', async () => {
      // TODO: Implement test
    });
  });

  describe('getUserDeletedProjects', () => {
    it('should return deleted projects for user', async () => {
      // TODO: Implement test
    });

    it('should filter by search term', async () => {
      // TODO: Implement test
    });

    it('should return paginated results', async () => {
      // TODO: Implement test
    });

    it('should sort by deletedAt desc by default', async () => {
      // TODO: Implement test
    });

    it('should exclude personal space and library projects', async () => {
      // TODO: Implement test
    });
  });

  describe('getPersonalSpace', () => {
    it('should return personal space from personalSpaceService', async () => {
      // TODO: Implement test
    });
  });

  describe('getProject', () => {
    it('should return project with members and children', async () => {
      // TODO: Implement test
    });

    it('should throw when project does not exist', async () => {
      // TODO: Implement test
    });

    it('should throw when project is deleted', async () => {
      // TODO: Implement test
    });

    it('should exclude library projects', async () => {
      // TODO: Implement test
    });

    it('should only return non-deleted children', async () => {
      // TODO: Implement test
    });

    it('should sort children by createdAt desc', async () => {
      // TODO: Implement test
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      // TODO: Implement test
    });

    it('should update project description', async () => {
      // TODO: Implement test
    });

    it('should update project status', async () => {
      // TODO: Implement test
    });

    it('should check name uniqueness when name changes', async () => {
      // TODO: Implement test
    });

    it('should skip uniqueness check when name is unchanged', async () => {
      // TODO: Implement test
    });

    it('should throw when project does not exist', async () => {
      // TODO: Implement test
    });
  });

  describe('getStoragePath', () => {
    it('should return full path for node with path', () => {
      // TODO: Implement test
    });

    it('should throw when node has no path', () => {
      // TODO: Implement test
    });
  });

  describe('getFullPath', () => {
    it('should return full path for valid nodePath', () => {
      // TODO: Implement test
    });

    it('should throw when nodePath is empty', () => {
      // TODO: Implement test
    });

    it('should throw when nodePath is null', () => {
      // TODO: Implement test
    });
  });

  describe('getStorageManager', () => {
    it('should return the storage manager instance', () => {
      // TODO: Implement test
    });
  });
});
