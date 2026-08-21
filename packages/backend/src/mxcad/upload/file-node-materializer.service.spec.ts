///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { NodeType } from '@cloudcad/db';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { ThumbnailGenerationService } from '../infra/thumbnail-generation.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { I_EXTERNAL_REF_FACADE } from '../external-ref/interfaces/ext-ref-facade.interface';
import {
  FileNodeMaterializer,
  MaterializeInput,
} from './file-node-materializer.service';
import * as os from 'os';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

describe('FileNodeMaterializer', () => {
  let service: FileNodeMaterializer;
  let tmpDir: string;

  const mockFileTreeService = {
    getNode: jest.fn(),
    createFileNode: jest.fn(),
    updateNodePath: jest.fn(),
  };

  const mockStorageManager = {
    allocateNodeStorage: jest.fn(),
  };

  const mockStorageService = {
    copyFromFs: jest.fn(),
  };

  const mockThumbnailGenerationService = {
    isEnabled: jest.fn().mockReturnValue(false),
    generateThumbnail: jest.fn(),
  };

  const mockExternalRefFacade = {
    handleExternalReferenceFile: jest.fn(),
    handleExternalReferenceImage: jest.fn(),
    updateAfterUpload: jest.fn(),
  };

  const mockFileSystemNodeService = {
    getMimeType: jest.fn(),
  };

  function buildStorageInfo(overrides?: Record<string, unknown>) {
    return {
      nodeId: 'node1',
      directory: '202608',
      nodeDirectoryPath: path.join(tmpDir, 'node1'),
      nodeDirectoryRelativePath: '202608/node1',
      fileRelativePath: '202608/node1/file.txt',
      filePath: path.join(tmpDir, 'node1', 'file.txt'),
      ...overrides,
    };
  }

  function baseInput(overrides?: Partial<MaterializeInput>): MaterializeInput {
    return {
      parentId: 'parent1',
      ownerId: 'user1',
      name: 'drawing.dwg',
      fileHash: 'hash1',
      size: 1024,
      source: { kind: 'single', path: path.join(tmpDir, 'src.txt') },
      ...overrides,
    };
  }

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'file-node-materializer-')
    );
    // 真实 allocateNodeStorage 会创建节点目录；mock 场景需预先创建
    await fsPromises.mkdir(path.join(tmpDir, 'node1'), { recursive: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileNodeMaterializer,
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: IStorageService, useValue: mockStorageService },
        {
          provide: ThumbnailGenerationService,
          useValue: mockThumbnailGenerationService,
        },
        { provide: I_EXTERNAL_REF_FACADE, useValue: mockExternalRefFacade },
        {
          provide: FileSystemNodeService,
          useValue: mockFileSystemNodeService,
        },
      ],
    }).compile();
    service = module.get<FileNodeMaterializer>(FileNodeMaterializer);

    mockFileTreeService.createFileNode.mockResolvedValue({ id: 'node1' });
    mockStorageManager.allocateNodeStorage.mockResolvedValue(
      buildStorageInfo()
    );
    mockFileSystemNodeService.getMimeType.mockReturnValue(
      'application/octet-stream'
    );
  });

  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('resolveParentId', () => {
    it('should return the container id directly when node is a container', async () => {
      mockFileTreeService.getNode.mockResolvedValue({
        id: 'folder1',
        nodeType: NodeType.FOLDER,
      });

      await expect(service.resolveParentId('folder1')).resolves.toBe(
        'folder1'
      );
    });

    it('should return the parent id when node is a FILE', async () => {
      mockFileTreeService.getNode.mockResolvedValue({
        id: 'file1',
        nodeType: NodeType.FILE,
        parentId: 'folder1',
      });

      await expect(service.resolveParentId('file1')).resolves.toBe('folder1');
    });

    it('should return null when node does not exist', async () => {
      mockFileTreeService.getNode.mockResolvedValue(null);

      await expect(service.resolveParentId('missing')).resolves.toBeNull();
    });
  });

  describe('materialize with single source (单拷)', () => {
    it('should create node, copy file and update node path', async () => {
      const result = await service.materialize(
        baseInput({ source: { kind: 'single', path: '/tmp/src.txt' } })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(mockFileTreeService.createFileNode).toHaveBeenCalledWith({
        name: 'drawing.dwg',
        fileHash: 'hash1',
        size: 1024,
        mimeType: 'application/octet-stream',
        extension: '.dwg',
        parentId: 'parent1',
        ownerId: 'user1',
        skipFileCopy: true,
      });
      expect(mockStorageManager.allocateNodeStorage).toHaveBeenCalledWith(
        'node1',
        'drawing.dwg'
      );
      expect(mockStorageService.copyFromFs).toHaveBeenCalledWith(
        '/tmp/src.txt',
        '202608/node1/file.txt'
      );
      expect(mockFileTreeService.updateNodePath).toHaveBeenCalledWith(
        'node1',
        '202608/node1/file.txt'
      );
    });

    it('should write backup {nodeId}.mxweb when writeBackup=true (双写备份)', async () => {
      const result = await service.materialize(
        baseInput({
          name: 'drawing.mxweb',
          source: { kind: 'single', path: '/tmp/src.mxweb', writeBackup: true },
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(mockStorageManager.allocateNodeStorage).toHaveBeenCalledWith(
        'node1',
        'node1.mxweb.mxweb'
      );
      expect(mockStorageService.copyFromFs).toHaveBeenCalledTimes(2);
      expect(mockStorageService.copyFromFs).toHaveBeenNthCalledWith(
        1,
        '/tmp/src.mxweb',
        '202608/node1/file.txt'
      );
      expect(mockStorageService.copyFromFs).toHaveBeenNthCalledWith(
        2,
        '/tmp/src.mxweb',
        '202608/node1/node1.mxweb'
      );
    });
  });

  describe('materialize with artifacts source (多产物)', () => {
    it('should copy all files matching hash prefix and update node path to mxweb file', async () => {
      await fsPromises.writeFile(path.join(tmpDir, 'hash1.dwg'), 'src');
      await fsPromises.writeFile(
        path.join(tmpDir, 'hash1.dwg.mxweb'),
        'mxweb'
      );

      const result = await service.materialize(
        baseInput({
          source: { kind: 'artifacts', uploadPath: tmpDir, suffix: 'dwg' },
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(
        await fsPromises.readFile(
          path.join(tmpDir, 'node1', 'node1.dwg'),
          'utf8'
        )
      ).toBe('src');
      expect(
        await fsPromises.readFile(
          path.join(tmpDir, 'node1', 'node1.dwg.mxweb'),
          'utf8'
        )
      ).toBe('mxweb');
      expect(mockFileTreeService.updateNodePath).toHaveBeenCalledWith(
        'node1',
        '202608/node1/node1.dwg.mxweb'
      );
    });

    it('should copy thumbnail from cache when isCadFile and cache exists', async () => {
      await fsPromises.writeFile(
        path.join(tmpDir, 'hash1.dwg.jpg'),
        'thumb'
      );

      const result = await service.materialize(
        baseInput({
          source: { kind: 'artifacts', uploadPath: tmpDir, suffix: 'dwg' },
          isCadFile: true,
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(mockStorageService.copyFromFs).toHaveBeenCalledWith(
        path.join(tmpDir, 'hash1.dwg.jpg'),
        '202608/node1/thumbnail.jpg'
      );
    });

    it('should generate thumbnail when cache missing and generation enabled', async () => {
      mockThumbnailGenerationService.isEnabled.mockReturnValue(true);
      mockThumbnailGenerationService.generateThumbnail.mockResolvedValue({
        success: false,
        error: 'boom',
      });

      const result = await service.materialize(
        baseInput({
          source: { kind: 'artifacts', uploadPath: tmpDir, suffix: 'dwg' },
          isCadFile: true,
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(
        mockThumbnailGenerationService.generateThumbnail
      ).toHaveBeenCalledWith(
        path.join(tmpDir, 'hash1.dwg'),
        tmpDir,
        'node1',
        'hash1.dwg.jpg'
      );
    });

    it('should write original backup {nodeId}{ext} when originalFilePath provided', async () => {
      const originalPath = path.join(tmpDir, 'orig.dwg');
      await fsPromises.writeFile(originalPath, 'original');

      const result = await service.materialize(
        baseInput({
          source: {
            kind: 'artifacts',
            uploadPath: tmpDir,
            suffix: 'dwg',
            originalFilePath: originalPath,
          },
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(
        await fsPromises.readFile(path.join(tmpDir, 'node1', 'node1.dwg'), 'utf8')
      ).toBe('original');
    });
  });

  describe('materialize with existing node', () => {
    it('should reuse the existing node without creating a new one', async () => {
      const result = await service.materialize(
        baseInput({
          existingNodeId: 'existing1',
          source: { kind: 'single', path: '/tmp/src.txt' },
        })
      );

      expect(result).toEqual({ nodeId: 'existing1' });
      expect(mockFileTreeService.createFileNode).not.toHaveBeenCalled();
      expect(mockStorageManager.allocateNodeStorage).toHaveBeenCalledWith(
        'existing1',
        'drawing.dwg'
      );
    });
  });

  describe('materialize ext-ref callback', () => {
    it('should call handleExternalReferenceImage when isImage=true', async () => {
      const context = { userId: 'u1', userRole: 'USER', nodeId: 'parent1' };
      const result = await service.materialize(
        baseInput({
          source: { kind: 'single', path: '/tmp/img.png' },
          extRef: {
            srcDwgNodeId: 'src1',
            isImage: true,
            context,
            sourcePath: '/tmp/img.png',
          },
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(
        mockExternalRefFacade.handleExternalReferenceImage
      ).toHaveBeenCalledWith('hash1', 'src1', 'drawing.dwg', '/tmp/img.png', context);
    });

    it('should call handleExternalReferenceFile when isImage is falsy', async () => {
      const result = await service.materialize(
        baseInput({
          source: { kind: 'single', path: '/tmp/src.txt' },
          extRef: { srcDwgNodeId: 'src1', sourcePath: '/tmp/src.txt' },
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(
        mockExternalRefFacade.handleExternalReferenceFile
      ).toHaveBeenCalledWith('hash1', 'src1', 'drawing.dwg', '/tmp/src.txt');
    });

    it('should call updateAfterUpload when updateAfterUploadNodeId provided', async () => {
      const context = { userId: 'u1', userRole: 'USER', nodeId: 'parent1' };
      const result = await service.materialize(
        baseInput({
          source: { kind: 'single', path: '/tmp/src.txt' },
          extRef: { context, updateAfterUploadNodeId: 'parent1' },
        })
      );

      expect(result).toEqual({ nodeId: 'node1' });
      expect(mockExternalRefFacade.updateAfterUpload).toHaveBeenCalledWith(
        'parent1'
      );
    });
  });

  describe('materialize failure semantics', () => {
    it('should return null when node creation throws', async () => {
      mockFileTreeService.createFileNode.mockRejectedValue(
        new Error('parent not found')
      );

      await expect(
        service.materialize(baseInput())
      ).resolves.toBeNull();
    });

    it('should return null when parentId missing and no existing node', async () => {
      await expect(
        service.materialize(baseInput({ parentId: undefined }))
      ).resolves.toBeNull();
      expect(mockFileTreeService.createFileNode).not.toHaveBeenCalled();
    });
  });

  describe('handleExtRef (纯回调，不建节点不落盘)', () => {
    it('should call handleExternalReferenceImage for image', async () => {
      const context = { userId: 'u1', userRole: 'USER', nodeId: 'src1' };
      await service.handleExtRef({
        srcDwgNodeId: 'src1',
        isImage: true,
        name: 'img.png',
        fileHash: 'hash1',
        sourcePath: '/tmp/img.png',
        context,
      });

      expect(
        mockExternalRefFacade.handleExternalReferenceImage
      ).toHaveBeenCalledWith('hash1', 'src1', 'img.png', '/tmp/img.png', context);
    });

    it('should call handleExternalReferenceFile for non-image', async () => {
      await service.handleExtRef({
        srcDwgNodeId: 'src1',
        name: 'ref.dwg',
        fileHash: 'hash1',
        sourcePath: '/tmp/ref.dwg',
      });

      expect(mockExternalRefFacade.handleExternalReferenceFile).toHaveBeenCalledWith(
        'hash1',
        'src1',
        'ref.dwg',
        '/tmp/ref.dwg'
      );
    });

    it('should not throw when callback fails', async () => {
      mockExternalRefFacade.handleExternalReferenceFile.mockRejectedValue(
        new Error('copy failed')
      );

      await expect(
        service.handleExtRef({
          srcDwgNodeId: 'src1',
          name: 'ref.dwg',
          fileHash: 'hash1',
          sourcePath: '/tmp/ref.dwg',
        })
      ).resolves.toBeUndefined();
    });
  });
});
