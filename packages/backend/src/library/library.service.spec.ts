// //////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// //////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import { IPERMISSION_SERVICE } from '../permission/interfaces/permission-service.interface';
import { NodeTrashService } from '../file-operations/node-trash.service';
import { NodeMutationGuard } from '../file-operations/node-mutation.guard';
import { NodeCopyMoveService } from '../file-operations/node-copy-move.service';
import { NodeUpdateService } from '../file-operations/file-operations.service';
import { ProjectCrudService } from '../file-operations/project-crud.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { FileDownloadHandlerService } from '../file-system/file-download/file-download-handler.service';
import { MxcadFileHandlerService } from '../mxcad/core/mxcad-file-handler.service';
import { MXCAD_SAVE_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';
import { LibraryService } from './library.service';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const { EventEmitter } = require('events');
  return {
    ...actual,
    existsSync: jest.fn(() => true),
    copyFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    statSync: jest.fn(() => ({ size: 1024 })),
    createReadStream: jest.fn(() => {
      const stream = new EventEmitter();
      process.nextTick(() => {
        stream.emit('data', Buffer.from('mock mxweb content'));
        stream.emit('end');
      });
      return stream;
    }),
  };
});

const uploadFile = {
  path: '/tmp/upload-1',
  size: 1024,
  mimetype: 'application/octet-stream',
  originalname: 'test.mxweb',
};

const mxCadSaveService = { saveMxwebFile: jest.fn() };

describe('LibraryService.saveLibraryAs', () => {
  let service: LibraryService;

  const prisma = {
    fileSystemNode: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const fileTreeService = {
    getNodeType: jest.fn(),
    createFileNode: jest.fn(),
    updateNodePath: jest.fn(),
  };
  const treeWalker = {
    resolveProjectId: jest.fn().mockResolvedValue(null),
  };
  const nodeMutationGuard = { assertByteQuota: jest.fn() };
  const storageManager = {
    getFullPath: jest.fn().mockReturnValue('/tmp/node/path'),
    allocateNodeStorage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks 会清空实现，重新挂默认值
    treeWalker.resolveProjectId.mockResolvedValue(null);
    storageManager.getFullPath.mockReturnValue('/tmp/node/path');
    storageManager.allocateNodeStorage.mockResolvedValue({
      nodeId: 'new-node',
      nodeDirectoryRelativePath: '202608/new-node',
      fileRelativePath: '202608/new-node/new-node.mxweb',
      filePath: '/tmp/node/new-node.mxweb',
    });
    fileTreeService.updateNodePath.mockResolvedValue({ id: 'new-node' });
    prisma.fileSystemNode.update.mockResolvedValue({ id: 'new-node' });
    // resetMocks 会清空 jest.mock 工厂里 fs 的实现，需重新挂
    const mockedFs = require('fs') as {
      statSync: jest.Mock;
      existsSync: jest.Mock;
      createReadStream: jest.Mock;
    };
    mockedFs.statSync.mockReturnValue({ size: 1024 } as never);
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.createReadStream.mockImplementation(() => {
      const stream = new (require('events').EventEmitter)();
      process.nextTick(() => {
        stream.emit('data', Buffer.from('mock mxweb content'));
        stream.emit('end');
      });
      return stream;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: DatabaseService, useValue: prisma },
        { provide: FileTreeService, useValue: fileTreeService },
        { provide: TreeWalker, useValue: treeWalker },
        {
          provide: IPERMISSION_SERVICE,
          useValue: { checkSystemPermission: jest.fn() },
        },
        { provide: NodeTrashService, useValue: {} },
        { provide: NodeMutationGuard, useValue: nodeMutationGuard },
        { provide: NodeCopyMoveService, useValue: {} },
        { provide: NodeUpdateService, useValue: {} },
        { provide: ProjectCrudService, useValue: {} },
        { provide: StorageManager, useValue: storageManager },
        { provide: FileDownloadHandlerService, useValue: {} },
        { provide: MxcadFileHandlerService, useValue: {} },
        { provide: MXCAD_SAVE_SERVICE, useValue: mxCadSaveService },
      ],
    }).compile();

    service = module.get(LibraryService);
  });

  it('allows saving to the block library root', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue({
      id: 'lib-root',
      nodeType: NodeType.LIBRARY_BLOCK,
    });
    fileTreeService.getNodeType.mockResolvedValue(NodeType.LIBRARY_BLOCK);
    fileTreeService.createFileNode.mockResolvedValue({
      id: 'new-node',
      name: 'test.mxweb',
      path: '/lib/test.mxweb',
      parentId: 'lib-root',
    });

    const result = await service.saveLibraryAs(
      uploadFile as any,
      { targetParentId: 'lib-root', fileName: 'test.mxweb' },
      { user: { id: 'user-1' } },
      'block'
    );

    expect(result.nodeId).toBe('new-node');
    // P0 回归：skipFileCopy 路径下 path 必须由 saveLibraryAs 落盘后回填，不可为 null
    expect(result.path).toBe('202608/new-node/new-node.mxweb');
    expect(prisma.fileSystemNode.update).toHaveBeenCalledWith({
      where: { id: 'new-node' },
      data: expect.objectContaining({ size: 1024 }),
    });
    // diskStorage 语义：从 file.path 拷贝，不再走 file.buffer；成功后清理临时文件
    const mockedFs = require('fs') as {
      copyFileSync: jest.Mock;
      unlinkSync: jest.Mock;
      createReadStream: jest.Mock;
    };
    expect(mockedFs.copyFileSync).toHaveBeenCalledWith(
      '/tmp/upload-1',
      '/tmp/node/new-node.mxweb'
    );
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith('/tmp/upload-1');
    expect(mockedFs.createReadStream).toHaveBeenCalledWith(
      '/tmp/node/new-node.mxweb'
    );
  });

  it('allows saving to a folder inside the drawing library', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue({
      id: 'lib-folder',
      nodeType: NodeType.FOLDER,
    });
    fileTreeService.getNodeType
      .mockResolvedValueOnce(NodeType.FOLDER)
      .mockResolvedValueOnce(NodeType.LIBRARY_DRAWING);
    treeWalker.resolveProjectId.mockResolvedValue('lib-root');
    fileTreeService.createFileNode.mockResolvedValue({
      id: 'new-node',
      name: 'test.mxweb',
      path: '/lib/test.mxweb',
      parentId: 'lib-folder',
    });

    const result = await service.saveLibraryAs(
      uploadFile as any,
      { targetParentId: 'lib-folder', fileName: 'test.mxweb' },
      { user: { id: 'user-1' } },
      'drawing'
    );

    expect(result.nodeId).toBe('new-node');
    expect(treeWalker.resolveProjectId).toHaveBeenCalledWith('lib-folder');
  });

  it('rejects non-library targets with 400', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue({
      id: 'proj-folder',
      nodeType: NodeType.FOLDER,
    });
    fileTreeService.getNodeType
      .mockResolvedValueOnce(NodeType.FOLDER)
      .mockResolvedValueOnce(NodeType.PROJECT);
    treeWalker.resolveProjectId.mockResolvedValue('proj-1');

    await expect(
      service.saveLibraryAs(
        uploadFile as any,
        { targetParentId: 'proj-folder', fileName: 'test.mxweb' },
        { user: { id: 'user-1' } },
        'drawing'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects block library root when saving as drawing with 400', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue({
      id: 'block-root',
      nodeType: NodeType.LIBRARY_BLOCK,
    });
    fileTreeService.getNodeType.mockResolvedValue(NodeType.LIBRARY_BLOCK);

    await expect(
      service.saveLibraryAs(
        uploadFile as any,
        { targetParentId: 'block-root', fileName: 'test.mxweb' },
        { user: { id: 'user-1' } },
        'drawing'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a library file node as target with 400', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue({
      id: 'lib-file',
      nodeType: NodeType.FILE,
    });
    fileTreeService.getNodeType
      .mockResolvedValueOnce(NodeType.FILE)
      .mockResolvedValueOnce(NodeType.LIBRARY_DRAWING);
    treeWalker.resolveProjectId.mockResolvedValue('lib-root');

    await expect(
      service.saveLibraryAs(
        uploadFile as any,
        { targetParentId: 'lib-file', fileName: 'test.mxweb' },
        { user: { id: 'user-1' } },
        'drawing'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound and skips quota assertion when target does not exist', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(null);

    await expect(
      service.saveLibraryAs(
        uploadFile as any,
        { targetParentId: 'missing', fileName: 'test.mxweb' },
        { user: { id: 'user-1' } },
        'drawing'
      )
    ).rejects.toThrow('Target folder does not exist');
    expect(nodeMutationGuard.assertByteQuota).not.toHaveBeenCalled();
  });

  it('rejects unsupported extension and cleans up the temp file', async () => {
    const badFile = { ...uploadFile, originalname: 'test.dwg' };

    await expect(
      service.saveLibraryAs(
        badFile as any,
        { targetParentId: 'lib-root', fileName: 'test' },
        { user: { id: 'user-1' } },
        'drawing'
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    // diskStorage 临时文件必须在失败路径也清理
    const mockedFs = require('fs') as { unlinkSync: jest.Mock };
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith('/tmp/upload-1');
  });
});

describe('LibraryService.saveLibraryNode', () => {
  let service: LibraryService;

  const fileTreeService = {
    getNodeType: jest.fn(),
  };
  const storageManager = {
    getFullPath: jest.fn().mockReturnValue('/tmp/node/path'),
    allocateNodeStorage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    storageManager.getFullPath.mockReturnValue('/tmp/node/path');

    const mockedFs = require('fs') as {
      statSync: jest.Mock;
      existsSync: jest.Mock;
    };
    mockedFs.statSync.mockReturnValue({ size: 1024 } as never);
    mockedFs.existsSync.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: DatabaseService, useValue: { fileSystemNode: {} } },
        { provide: FileTreeService, useValue: fileTreeService },
        { provide: TreeWalker, useValue: { resolveProjectId: jest.fn() } },
        {
          provide: IPERMISSION_SERVICE,
          useValue: { checkSystemPermission: jest.fn() },
        },
        { provide: NodeTrashService, useValue: {} },
        { provide: NodeMutationGuard, useValue: {} },
        { provide: NodeCopyMoveService, useValue: {} },
        { provide: NodeUpdateService, useValue: {} },
        { provide: ProjectCrudService, useValue: {} },
        { provide: StorageManager, useValue: storageManager },
        { provide: FileDownloadHandlerService, useValue: {} },
        { provide: MxcadFileHandlerService, useValue: {} },
        { provide: MXCAD_SAVE_SERVICE, useValue: mxCadSaveService },
      ],
    }).compile();

    service = module.get(LibraryService);
  });

  it('delegates to mxCadSaveService with the uploaded file (path 语义)', async () => {
    mxCadSaveService.saveMxwebFile.mockResolvedValue({
      success: true,
      message: 'ok',
      path: '202608/node/node.mxweb',
    });

    const result = await service.saveLibraryNode(
      'node-1',
      uploadFile as any,
      'user-1',
      'User'
    );

    expect(result).toEqual({
      nodeId: 'node-1',
      path: '202608/node/node.mxweb',
    });
    expect(mxCadSaveService.saveMxwebFile).toHaveBeenCalledWith(
      'node-1',
      uploadFile,
      'user-1',
      'User',
      'Overwrite save library file',
      true
    );
    // 成功路径由 mxCadSaveService 清理临时文件，本服务不重复删除
    const mockedFs = require('fs') as { unlinkSync: jest.Mock };
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('rejects unsupported extension and cleans up the temp file', async () => {
    const badFile = { ...uploadFile, originalname: 'test.dwg' };

    await expect(
      service.saveLibraryNode('node-1', badFile as any, 'user-1', 'User')
    ).rejects.toBeInstanceOf(BadRequestException);

    const mockedFs = require('fs') as { unlinkSync: jest.Mock };
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith('/tmp/upload-1');
  });
});
