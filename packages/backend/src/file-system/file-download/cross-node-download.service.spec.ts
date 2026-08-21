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

import { NodeType } from '@cloudcad/db';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { DatabaseService } from '../../database/database.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { IPROJECT_PERMISSION_SERVICE } from '../../roles/interfaces/project-permission-service.interface';
import { IStorageProvider } from '../../storage/interfaces/storage-provider.interface';
import { CrossNodeDownloadService } from './cross-node-download.service';

function collectStream(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('CrossNodeDownloadService', () => {
  let service: CrossNodeDownloadService;
  let prisma: any;
  let storageProvider: Record<string, jest.Mock>;
  let projectPermissionService: Record<string, jest.Mock>;

  const fileNode = {
    id: 'node-file-1',
    name: 'file.dwg',
    path: '/files/node-file-1.dwg',
    nodeType: NodeType.FILE,
    projectId: 'proj-1',
  };

  const projectNode = {
    id: 'proj-1',
    name: 'project',
    path: '/files/proj-1.dwg',
    nodeType: NodeType.PROJECT,
    projectId: null,
  };

  beforeEach(async () => {
    prisma = {
      fileSystemNode: {
        findUnique: jest.fn(),
      },
    };
    storageProvider = {
      read: jest.fn(),
    };
    projectPermissionService = {
      isProjectOwner: jest.fn(),
      checkPermission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossNodeDownloadService,
        { provide: DatabaseService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: IStorageProvider, useValue: storageProvider },
        {
          provide: IPROJECT_PERMISSION_SERVICE,
          useValue: projectPermissionService,
        },
      ],
    }).compile();

    service = module.get(CrossNodeDownloadService);
  });

  it('should download a node when user is the project owner', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
    projectPermissionService.isProjectOwner.mockResolvedValue(true);
    storageProvider.read.mockResolvedValue(Readable.from(['content']));

    const { stream } = await service.createBatchZip([fileNode.id], 'user-1');

    await collectStream(stream);

    expect(projectPermissionService.isProjectOwner).toHaveBeenCalledWith(
      'user-1',
      'proj-1'
    );
    expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
    expect(storageProvider.read).toHaveBeenCalledWith(fileNode.path);
  });

  it('should download a node when non-owner has FILE_DOWNLOAD permission', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
    projectPermissionService.isProjectOwner.mockResolvedValue(false);
    projectPermissionService.checkPermission.mockResolvedValue(true);
    storageProvider.read.mockResolvedValue(Readable.from(['content']));

    const { stream } = await service.createBatchZip([fileNode.id], 'user-1');

    await collectStream(stream);

    expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
      'user-1',
      'proj-1',
      ProjectPermission.FILE_DOWNLOAD
    );
    expect(storageProvider.read).toHaveBeenCalledWith(fileNode.path);
  });

  it('should throw ForbiddenException when user has no permission', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
    projectPermissionService.isProjectOwner.mockResolvedValue(false);
    projectPermissionService.checkPermission.mockResolvedValue(false);

    await expect(
      service.createBatchZip([fileNode.id], 'user-1')
    ).rejects.toThrow(ForbiddenException);
    expect(storageProvider.read).not.toHaveBeenCalled();
  });

  it('should skip non-existent node without checking permission', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(null);

    const { stream } = await service.createBatchZip(['missing-node'], 'user-1');

    await collectStream(stream);

    expect(projectPermissionService.isProjectOwner).not.toHaveBeenCalled();
    expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
    expect(storageProvider.read).not.toHaveBeenCalled();
  });

  it('should check permission against the project node id for PROJECT nodes', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(projectNode);
    projectPermissionService.isProjectOwner.mockResolvedValue(false);
    projectPermissionService.checkPermission.mockResolvedValue(true);
    storageProvider.read.mockResolvedValue(Readable.from(['content']));

    const { stream } = await service.createBatchZip([projectNode.id], 'user-1');

    await collectStream(stream);

    expect(projectPermissionService.isProjectOwner).toHaveBeenCalledWith(
      'user-1',
      projectNode.id
    );
    expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
      'user-1',
      projectNode.id,
      ProjectPermission.FILE_DOWNLOAD
    );
  });
});
