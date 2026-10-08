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
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { DatabaseService } from '../../database/database.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
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
  let fileSystemPermissionService: Record<string, jest.Mock>;

  const fileNode = {
    id: 'node-file-1',
    name: 'file.dwg',
    path: '/files/node-file-1.dwg',
    nodeType: NodeType.FILE,
    projectId: 'proj-1',
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
    fileSystemPermissionService = {
      assertNodeAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossNodeDownloadService,
        { provide: DatabaseService, useValue: prisma },
        { provide: IStorageProvider, useValue: storageProvider },
        {
          provide: FileSystemPermissionService,
          useValue: fileSystemPermissionService,
        },
      ],
    }).compile();

    service = module.get(CrossNodeDownloadService);
  });

  it('delegates the node-level access check to assertNodeAccess and downloads on success', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
    fileSystemPermissionService.assertNodeAccess.mockResolvedValue(undefined);
    storageProvider.read.mockResolvedValue(Readable.from(['content']));

    const { stream } = await service.createBatchZip([fileNode.id], 'user-1');

    await collectStream(stream);

    expect(fileSystemPermissionService.assertNodeAccess).toHaveBeenCalledWith(
      'user-1',
      fileNode.id,
      ProjectPermission.FILE_DOWNLOAD
    );
    expect(storageProvider.read).toHaveBeenCalledWith(fileNode.path);
  });

  it('rethrows ForbiddenException from assertNodeAccess (fail-closed)', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
    fileSystemPermissionService.assertNodeAccess.mockRejectedValue(
      new ForbiddenException('no permission')
    );

    await expect(
      service.createBatchZip([fileNode.id], 'user-1')
    ).rejects.toThrow(ForbiddenException);
    expect(storageProvider.read).not.toHaveBeenCalled();
  });

  it('adds an error entry and continues for non-Forbidden failures', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
    fileSystemPermissionService.assertNodeAccess.mockRejectedValue(
      new NotFoundException('node not found')
    );

    const { stream } = await service.createBatchZip([fileNode.id], 'user-1');

    await collectStream(stream);

    expect(storageProvider.read).not.toHaveBeenCalled();
  });

  it('skips non-existent node without checking permission', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(null);

    const { stream } = await service.createBatchZip(['missing-node'], 'user-1');

    await collectStream(stream);

    expect(fileSystemPermissionService.assertNodeAccess).not.toHaveBeenCalled();
    expect(storageProvider.read).not.toHaveBeenCalled();
  });
});
