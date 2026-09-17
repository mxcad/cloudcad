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

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ExternalReferenceUpdateService } from './external-reference-update.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { ExtRefPreloadingService } from './ext-ref-preloading.service';

describe('ExternalReferenceUpdateService — 路径遍历防护', () => {
  let service: ExternalReferenceUpdateService;

  const root = path.join('storage', 'root');
  const withinRoot = (p: string) => p === root || p.startsWith(root + path.sep);

  const mockConfigService = { get: jest.fn() };
  const mockFileSystemNodeService = {
    findById: jest.fn(),
    findFileByIdNotDeleted: jest.fn(),
  };
  const mockStorageManager = {
    getFullPath: jest.fn(),
  };
  const mockExtRefPreloadingService = {
    getExtRefDirName: jest.fn(),
    getPreloadingFileName: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalReferenceUpdateService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        {
          provide: ExtRefPreloadingService,
          useValue: mockExtRefPreloadingService,
        },
      ],
    }).compile();

    service = module.get<ExternalReferenceUpdateService>(
      ExternalReferenceUpdateService
    );

    // resetMocks 会在每个用例前清空模块级 mock 实现，故在此（reset 之后）重设默认值
    mockExtRefPreloadingService.getExtRefDirName.mockResolvedValue('abc123');
    mockExtRefPreloadingService.getPreloadingFileName.mockReturnValue(
      'node1.mxweb_preloading.json'
    );
    mockStorageManager.getFullPath.mockReturnValue('/full/path');
    jest.spyOn(service as any, 'getStorageRootPath').mockResolvedValue(root);
  });

  describe('getExternalRefDownloadPath', () => {
    it('遍历 fileName：候选路径不逃逸 storageRootPath（防任意文件读取）', async () => {
      const accessSpy = (fsPromises.access as jest.Mock).mockRejectedValue(
        new Error('ENOENT')
      );

      const result = await service.getExternalRefDownloadPath(
        'node1',
        '../../../etc/passwd'
      );

      expect(result).toBeNull();
      const calledPaths = accessSpy.mock.calls.map((c) => String(c[0]));
      expect(calledPaths.length).toBeGreaterThan(0);
      expect(calledPaths.every(withinRoot)).toBe(true);
      expect(calledPaths.some((p) => p.includes('..'))).toBe(false);
    });

    it('合法 fileName：正常解析出候选路径', async () => {
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);

      const result = await service.getExternalRefDownloadPath(
        'node1',
        'A1.dwg'
      );

      // A1.dwg 为 dwg → 磁盘名 A1.dwg.mxweb
      expect(result).toBe(path.join(root, 'abc123', 'A1.dwg.mxweb'));
    });
  });

  describe('checkExists', () => {
    it('遍历 fileName：目标路径不逃逸 storageRootPath', async () => {
      (mockFileSystemNodeService.findById as jest.Mock).mockResolvedValue({
        id: 'node1',
        path: '202609/node1/A1.dwg.mxweb',
      });
      const accessSpy = (fsPromises.access as jest.Mock).mockRejectedValue(
        new Error('ENOENT')
      );
      (fsPromises.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await service.checkExists('node1', '../../../etc/passwd');

      expect(result).toBe(false);
      const calledPaths = accessSpy.mock.calls.map((c) => String(c[0]));
      expect(calledPaths.length).toBeGreaterThan(0);
      expect(calledPaths.every(withinRoot)).toBe(true);
    });
  });
});
