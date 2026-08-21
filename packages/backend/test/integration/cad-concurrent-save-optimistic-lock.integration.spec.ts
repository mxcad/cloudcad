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

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MxcadSaveService } from '../../src/mxcad/save/mxcad-save.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import { VERSION_CONTROL_TOKEN } from '../../src/version-control/interfaces/version-control.interface';
import { DatabaseService } from '../../src/database/database.service';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { NodeMutationGuard } from '../../src/file-operations/node-mutation.guard';
import { NodeStatusTransitioner } from '../../src/file-system/file-status/node-status-transitioner';
import { MXCAD_CONVERSION_SERVICE } from '../../src/mxcad/interfaces/mxcad-service-tokens';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

// 模拟版本控制服务
const mockVersionControl = {
  isReady: jest.fn().mockReturnValue(true),
  ensureInitialized: jest.fn().mockResolvedValue(undefined),
  isFirstCommit: jest.fn().mockResolvedValue(true),
  commitNodeDirectory: jest.fn().mockResolvedValue({
    success: true,
    message: '提交成功',
    revision: 1,
  }),
};

// 模拟文件系统节点服务
const mockFileSystemNodeService = {
  findById: jest.fn(),
  getMimeType: jest.fn().mockReturnValue('application/dwg'),
};

// 模拟存储管理器
const mockStorageManager = {
  getFullPath: jest.fn(),
  allocateNodeStorage: jest.fn(),
};

// 模拟文件转换服务
const mockMxcadConversionService = {
  generateBinFiles: jest.fn(),
};

// 模拟文件树服务
const mockFileTreeService = {
  getProjectId: jest.fn().mockResolvedValue('project-456'),
  getNode: jest.fn(),
  createFileNode: jest.fn(),
  updateNodePath: jest.fn(),
};

// 模拟配额限制引擎
const mockRestrictionEngine = {
  checkQuota: jest.fn().mockResolvedValue(undefined),
  reserveConversionCountOrThrow: jest.fn().mockResolvedValue(undefined),
  releaseConversionCount: jest.fn().mockResolvedValue(undefined),
};

// 模拟数据库服务
const mockDatabaseService = {
  fileSystemNode: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    create: jest.fn(),
  },
};

const mockConfigService = {
  get: jest.fn((key: string, opts?: Record<string, unknown>) => {
    if (key === 'mxcadUploadPath') return '/fake/upload';
    if (opts?.infer) {
      if (key === 'mxcadUploadPath') return '/fake/upload';
    }
    return undefined;
  }),
};

describe('CAD并发保存→乐观锁冲突(409)集成测试', () => {
  let mxCadSaveService: MxcadSaveService;
  let tempDir: string;
  let tempFilePath: string;

  beforeAll(async () => {
    tempDir = path.join(
      process.cwd(),
      'temp-test-concurrent-save-' + Date.now()
    );
    await fsPromises.mkdir(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, 'test.mxweb');
  });

  afterAll(async () => {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await fsPromises
      .writeFile(tempFilePath, 'test mxweb content')
      .catch(() => {});

    // Re-apply mock implementations (jest.config has restoreMocks: true)
    mockVersionControl.isReady.mockReturnValue(true);
    mockVersionControl.ensureInitialized.mockResolvedValue(undefined);
    mockVersionControl.isFirstCommit.mockResolvedValue(true);
    mockVersionControl.commitNodeDirectory.mockResolvedValue({
      success: true,
      message: '提交成功',
      revision: 1,
    });

    mockFileSystemNodeService.getMimeType.mockReturnValue('application/dwg');

    mockFileTreeService.getProjectId.mockResolvedValue('project-456');

    mockRestrictionEngine.checkQuota.mockResolvedValue(undefined);
    mockRestrictionEngine.reserveConversionCountOrThrow.mockResolvedValue(
      undefined
    );
    mockRestrictionEngine.releaseConversionCount.mockResolvedValue(undefined);

    mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(undefined);
    mockDatabaseService.fileSystemNode.update.mockResolvedValue(undefined);

    mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);

    mockStorageManager.getFullPath.mockReturnValue(tempFilePath);
    mockStorageManager.allocateNodeStorage.mockResolvedValue({
      nodeDirectoryPath: tempDir,
      nodeDirectoryRelativePath: 'test/node',
    });

    mockConfigService.get.mockImplementation(
      (key: string, opts?: Record<string, unknown>) => {
        if (key === 'mxcadUploadPath') return '/fake/upload';
        if (opts?.infer) {
          if (key === 'mxcadUploadPath') return '/fake/upload';
        }
        return undefined;
      }
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        MxcadSaveService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: RestrictionEngine, useValue: mockRestrictionEngine },
        {
          provide: NodeMutationGuard,
          useValue: {
            assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
            assertProjectQuota: jest.fn().mockResolvedValue(undefined),
            assertByteQuota: jest.fn().mockResolvedValue(undefined),
            invalidateQuotaAfterMutation: jest
              .fn()
              .mockResolvedValue(undefined),
            resolveProjectContext: jest.fn(),
          },
        },

        {
          provide: MXCAD_CONVERSION_SERVICE,
          useValue: mockMxcadConversionService,
        },
      ],
    }).compile();

    mxCadSaveService = moduleFixture.get<MxcadSaveService>(MxcadSaveService);
  });

  describe('T1: 正常保存流程（第一次保存，无冲突）', () => {
    it('T1-S1: 第一次保存，expectedTimestamp为空，应成功保存', async () => {
      // 设置模拟数据
      const testNode = {
        id: 'test-node-id',
        name: 'test.dwg',
        nodeType: 'FILE',
        path: 'test/path/test.dwg.mxweb',
        updatedAt: new Date(Date.now() - 10000),
      };

      mockFileSystemNodeService.findById.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.update.mockResolvedValue(testNode);

      // 创建模拟上传文件
      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from('test content'),
        stream: null as unknown as Readable,
      };

      // 执行保存操作，不提供 expectedTimestamp（首次保存）
      const result = await mxCadSaveService.saveMxwebFile(
        'test-node-id',
        mockFile,
        'test-user-id',
        'test-user',
        '首次保存',
        false,
        undefined // 不提供 expectedTimestamp
      );

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.message).toBe('保存成功');
      expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalled();
    });

    it('T1-S2: expectedTimestamp与当前updatedAt一致，应成功保存', async () => {
      const currentTimestamp = new Date(Date.now() - 5000);

      const testNode = {
        id: 'test-node-id',
        name: 'test.dwg',
        nodeType: 'FILE',
        path: 'test/path/test.dwg.mxweb',
        updatedAt: currentTimestamp,
      };

      mockFileSystemNodeService.findById.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.update.mockResolvedValue(testNode);

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from('test content'),
        stream: null as unknown as Readable,
      };

      // 执行保存操作，提供正确的 expectedTimestamp
      const result = await mxCadSaveService.saveMxwebFile(
        'test-node-id',
        mockFile,
        'test-user-id',
        'test-user',
        '覆盖保存',
        false,
        currentTimestamp.toISOString() // 提供与当前 updatedAt 一致的时间戳
      );

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.message).toBe('保存成功');
    });
  });

  describe('T2: 乐观锁冲突场景', () => {
    it('T2-S1: expectedTimestamp与实际updatedAt不一致，应抛出ConflictException(409)', async () => {
      const oldTimestamp = new Date(Date.now() - 60000); // 1分钟前
      const newTimestamp = new Date(Date.now() - 5000); // 5秒前（文件已被他人更新）

      const testNode = {
        id: 'test-node-id',
        name: 'test.dwg',
        nodeType: 'FILE',
        path: 'test/path/test.dwg.mxweb',
        updatedAt: newTimestamp, // 实际是更新后的时间
      };

      mockFileSystemNodeService.findById.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(testNode);

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from('test content'),
        stream: null as unknown as Readable,
      };

      // 尝试保存，提供过期的 expectedTimestamp
      await expect(
        mxCadSaveService.saveMxwebFile(
          'test-node-id',
          mockFile,
          'test-user-id',
          'test-user',
          '覆盖保存',
          false,
          oldTimestamp.toISOString() // 使用过期的时间戳
        )
      ).rejects.toThrow(ConflictException);

      // 验证错误信息
      try {
        await mxCadSaveService.saveMxwebFile(
          'test-node-id',
          mockFile,
          'test-user-id',
          'test-user',
          '覆盖保存',
          false,
          oldTimestamp.toISOString()
        );
      } catch (error: any) {
        expect(error.message).toContain('文件已被他人修改');
      }
    });

    it('T2-S2: 节点不存在时应返回失败结果', async () => {
      mockFileSystemNodeService.findById.mockResolvedValue(null);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(null);

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from('test content'),
        stream: null as unknown as Readable,
      };

      const result = await mxCadSaveService.saveMxwebFile(
        'non-existent-node-id',
        mockFile,
        'test-user-id',
        'test-user',
        '保存测试'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('节点不存在');
    });

    it('T2-S3: 文件格式不支持时应返回失败', async () => {
      const testNode = {
        id: 'test-node-id',
        name: 'test.dwg',
        nodeType: 'FILE',
        path: 'test/path/test.dwg.mxweb',
        updatedAt: new Date(),
      };

      mockFileSystemNodeService.findById.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(testNode);

      // 创建非 .mxweb 格式的文件
      const invalidFilePath = path.join(tempDir, 'test.txt');
      await fsPromises.writeFile(invalidFilePath, 'invalid content');

      const mockFile: Express.Multer.File = {
        path: invalidFilePath,
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.txt',
        buffer: Buffer.from('invalid content'),
        stream: null as unknown as Readable,
      };

      const result = await mxCadSaveService.saveMxwebFile(
        'test-node-id',
        mockFile,
        'test-user-id',
        'test-user'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('不支持的文件格式');
    });
  });

  describe('T3: 公共资源库场景', () => {
    it('T3-S1: 公共资源库文件保存应跳过MX提交', async () => {
      const testNode = {
        id: 'library-node-id',
        name: 'library.dwg',
        nodeType: 'LIBRARY_DRAWING',
        path: 'test/path/library.dwg.mxweb',
        updatedAt: new Date(),
      };

      mockFileSystemNodeService.findById.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(testNode);
      mockDatabaseService.fileSystemNode.update.mockResolvedValue(testNode);

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from('test content'),
        stream: null as unknown as Readable,
      };

      const result = await mxCadSaveService.saveMxwebFile(
        'library-node-id',
        mockFile,
        'test-user-id',
        'test-user',
        '保存资源库文件',
        true // 跳过生成 bin 文件
      );

      expect(result.success).toBe(true);
      // 验证没有调用 MX 提交
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
    });
  });

  describe('T4: 乐观锁冲突后的处理流程', () => {
    it('T4-S1: 用户刷新获取最新时间戳后再次保存应成功', async () => {
      const firstSaveTime = new Date(Date.now() - 30000);
      const secondSaveTime = new Date(Date.now() - 15000);

      // 第一次保存（用户A）
      const testNodeV1 = {
        id: 'test-node-id',
        name: 'test.dwg',
        nodeType: 'FILE',
        path: 'test/path/test.dwg.mxweb',
        updatedAt: firstSaveTime,
      };

      // 用户A先保存
      mockFileSystemNodeService.findById.mockResolvedValueOnce(testNodeV1);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(
        testNodeV1
      );

      const testNodeV2 = {
        ...testNodeV1,
        updatedAt: secondSaveTime,
      };

      mockDatabaseService.fileSystemNode.update.mockResolvedValueOnce(
        testNodeV2
      );

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from('test content'),
        stream: null as unknown as Readable,
      };

      await mxCadSaveService.saveMxwebFile(
        'test-node-id',
        mockFile,
        'user-a-id',
        'user-a',
        '用户A的保存'
      );

      // 用户B尝试用旧时间戳保存，应该失败
      mockFileSystemNodeService.findById.mockResolvedValueOnce(testNodeV2);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(
        testNodeV2
      );

      await expect(
        mxCadSaveService.saveMxwebFile(
          'test-node-id',
          mockFile,
          'user-b-id',
          'user-b',
          '用户B的保存',
          false,
          firstSaveTime.toISOString()
        )
      ).rejects.toThrow(ConflictException);

      // 用户B刷新获取最新时间戳后再次保存
      const latestTime = new Date();
      const testNodeV3 = { ...testNodeV2, updatedAt: latestTime };

      mockFileSystemNodeService.findById.mockResolvedValueOnce(testNodeV3);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(
        testNodeV3
      );
      mockDatabaseService.fileSystemNode.update.mockResolvedValueOnce(
        testNodeV3
      );

      // 重新创建临时文件（前一次保存已删除）
      await fsPromises.writeFile(tempFilePath, 'test mxweb content');

      const result = await mxCadSaveService.saveMxwebFile(
        'test-node-id',
        mockFile,
        'user-b-id',
        'user-b',
        '用户B刷新后的保存',
        false,
        latestTime.toISOString()
      );

      expect(result.success).toBe(true);
    });
  });
});
