import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { FileSystemService } from './file-system.service';
import { DatabaseService } from '../database/database.service';
import { FileHashService } from './file-hash.service';
import { LocalStorageProvider } from '../storage/local-storage.provider';
import { FileSystemPermissionService } from './file-system-permission.service';
import { AuditLogService } from '../audit/audit-log.service';
import { StorageManager } from '../common/services/storage-manager.service';
import { FileCopyService } from '../common/services/file-copy.service';
import { DiskMonitorService } from '../common/services/disk-monitor.service';
import { FileLockService } from '../common/services/file-lock.service';
import { VersionControlService } from '../version-control/version-control.service';
import { ConfigService } from '@nestjs/config';
import { FileStatus, ProjectStatus } from '@prisma/client';

describe('FileSystemService', () => {
  let service: FileSystemService;

  const mockPrisma = {
    fileSystemNode: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    projectRole: {
      findFirst: jest.fn(),
    },
    nodeAccess: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: () => unknown) => callback()),
  };

  const mockStorage = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    getFileStream: jest.fn(),
    fileExists: jest.fn(),
  };

  const mockFileHashService = {
    calculateHash: jest.fn(),
  };

  const mockPermissionService = {
    checkNodePermission: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn(),
  };

  const mockStorageManager = {
    getStoragePath: jest.fn(),
    ensureDirectory: jest.fn(),
  };

  const mockFileCopyService = {
    copyFile: jest.fn(),
  };

  const mockDiskMonitorService = {
    checkDiskSpace: jest.fn(),
    checkDiskStatus: jest.fn(),
  };

  const mockFileLockService = {
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
    withLock: jest.fn().mockImplementation(async (_lockName: string, callback: () => Promise<unknown>) => callback()),
  };

  const mockVersionControlService = {
    initializeRepository: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'FILES_DATA_PATH') return '../filesData';
      if (key === 'FILES_NODE_LIMIT') return 1000;
      return undefined;
    }),
  };

  const mockModuleRef = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // 重置所有 mock
    jest.clearAllMocks();

    // 设置默认 mock 返回值
    mockPrisma.projectRole.findFirst.mockResolvedValue({ id: 'role-1', name: 'PROJECT_OWNER' });
    mockDiskMonitorService.checkDiskStatus.mockReturnValue({ critical: false, warning: false, message: '' });
    mockDiskMonitorService.checkDiskSpace.mockResolvedValue({ available: 1024 * 1024 * 1024 });
    mockPermissionService.checkNodePermission.mockResolvedValue(true);
    mockAuditLogService.log.mockResolvedValue(undefined);
    mockStorageManager.getStoragePath.mockReturnValue('files/test');
    mockStorageManager.ensureDirectory.mockResolvedValue(undefined);
    mockPrisma.$transaction.mockImplementation((callback: () => unknown) => callback());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSystemService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: LocalStorageProvider, useValue: mockStorage },
        { provide: FileHashService, useValue: mockFileHashService },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: FileCopyService, useValue: mockFileCopyService },
        { provide: DiskMonitorService, useValue: mockDiskMonitorService },
        { provide: FileLockService, useValue: mockFileLockService },
        { provide: VersionControlService, useValue: mockVersionControlService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ModuleRef, useValue: mockModuleRef },
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

    service = module.get<FileSystemService>(FileSystemService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('服务初始化', () => {
    it('应该成功创建服务实例', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getChildren', () => {
    it('应该返回子节点列表', async () => {
      const nodeId = 'node-123';
      const mockChildren = [
        { id: 'child-1', name: '子节点', isFolder: true },
        { id: 'child-2', name: '子节点', isFolder: false },
      ];

      mockPrisma.fileSystemNode.findMany.mockResolvedValueOnce(mockChildren);

      const result = await service.getChildren(nodeId);

      expect(result.data).toBeDefined();
      expect(result.meta).toBeDefined();
    });
  });

  describe('updateNode', () => {
    it('应该成功更新节点', async () => {
      const nodeId = 'node-123';
      const dto = { name: '新名称' };
      const mockNode = { id: nodeId, name: '旧名称', isFolder: true };
      const mockUpdated = { id: nodeId, name: dto.name };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(mockNode);
      mockPrisma.fileSystemNode.update.mockResolvedValueOnce(mockUpdated);

      const result = await service.updateNode(nodeId, dto);

      expect(result.name).toBe(dto.name);
    });
  });

  describe('getNodeTree', () => {
    it('应该返回节点树结构', async () => {
      const nodeId = 'node-123';
      const mockNode = {
        id: nodeId,
        name: '节点',
        children: [],
        owner: { id: 'user-123', username: 'test' },
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(mockNode);

      const result = await service.getNodeTree(nodeId);

      expect(result).toEqual(mockNode);
    });

    it('应该在节点不存在时抛出异常', async () => {
      const nodeId = 'nonexistent';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);

      await expect(service.getNodeTree(nodeId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProject', () => {
    it('应该在项目不存在时抛出异常', async () => {
      const projectId = 'nonexistent';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);

      await expect(service.getProject(projectId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRootNode', () => {
    it('应该返回根节点', async () => {
      const nodeId = 'child-123';
      const mockNode = { id: nodeId, isRoot: false, parentId: 'parent-123' };
      const mockParent = { id: 'parent-123', isRoot: false, parentId: 'root-123' };
      const mockRoot = { id: 'root-123', isRoot: true, parentId: null };

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(mockNode)
        .mockResolvedValueOnce(mockParent)
        .mockResolvedValueOnce(mockRoot);

      const result = await service.getRootNode(nodeId);

      expect(result).toEqual(mockRoot);
    });

    it('应该在节点不存在时抛出异常', async () => {
      const nodeId = 'nonexistent';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);

      await expect(service.getRootNode(nodeId)).rejects.toThrow(NotFoundException);
    });

    it('应该处理节点本身就是根节点的情况', async () => {
      const nodeId = 'root-123';
      const mockRoot = { id: nodeId, isRoot: true, parentId: null };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(mockRoot);

      const result = await service.getRootNode(nodeId);

      expect(result).toEqual(mockRoot);
    });
  });

  describe('createFolder', () => {
    it('应该在父节点不存在时抛出异常', async () => {
      const userId = 'user-123';
      const parentId = 'nonexistent';
      const dto = { name: '新文件夹' };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);

      await expect(service.createFolder(userId, parentId, dto)).rejects.toThrow(NotFoundException);
    });

    it('应该在父节点不是文件夹时抛出异常', async () => {
      const userId = 'user-123';
      const parentId = 'file-123';
      const dto = { name: '新文件夹' };
      const mockParent = { isFolder: false };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(mockParent);

      await expect(service.createFolder(userId, parentId, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('createNode - 名称唯一性检查', () => {
    it('创建项目时应该检查同名项目', async () => {
      const userId = 'user-123';
      const name = '已存在的项目';

      // 模拟已存在同名项目
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce({ id: 'existing-project' });

      await expect(service.createNode(userId, name)).rejects.toThrow('已存在同名项目');
    });

    it('创建项目时应该允许不存在的名称', async () => {
      const userId = 'user-123';
      const name = '新项目';

      // 模拟不存在同名项目
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce(null);
      // 模拟 PROJECT_OWNER 角色存在
      mockPrisma.projectRole.findFirst.mockResolvedValueOnce({ id: 'role-1', name: 'PROJECT_OWNER' });
      mockPrisma.fileSystemNode.create.mockResolvedValueOnce({
        id: 'new-project',
        name,
        isRoot: true,
        isFolder: true,
      });

      const result = await service.createNode(userId, name);

      expect(result.name).toBe(name);
    });

    it('创建文件夹时应该检查同级目录同名节点', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const name = '已存在的文件夹';

      // 模拟父节点存在
      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        isFolder: true,
        isRoot: false,
      });
      // 模拟同级目录已存在同名节点
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce({ id: 'existing-folder', isFolder: true });

      await expect(service.createNode(userId, name, { parentId })).rejects.toThrow('同级目录已存在同名文件夹');
    });

    it('创建文件夹时应该允许不存在的名称', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const name = '新文件夹';

      // 模拟父节点存在
      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        isFolder: true,
        isRoot: false,
      });
      // 模拟同级目录不存在同名节点
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce(null);
      mockPrisma.fileSystemNode.create.mockResolvedValueOnce({
        id: 'new-folder',
        name,
        isRoot: false,
        isFolder: true,
        parentId,
        owner: { id: userId, username: 'test', nickname: 'Test' },
      });

      const result = await service.createNode(userId, name, { parentId });

      expect(result.name).toBe(name);
    });
  });

  describe('updateNode - 名称唯一性检查', () => {
    it('重命名时应该检查同级目录同名节点', async () => {
      const nodeId = 'node-123';
      const dto = { name: '已存在的名称' };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        id: nodeId,
        name: '旧名称',
        isFolder: true,
        extension: null,
        isRoot: false,
        parentId: 'parent-123',
        ownerId: 'user-123',
      });
      // 模拟同级目录已存在同名节点
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce({ id: 'other-node', isFolder: true });

      await expect(service.updateNode(nodeId, dto)).rejects.toThrow('同级目录已存在同名文件夹');
    });

    it('重命名时应该允许不冲突的名称', async () => {
      const nodeId = 'node-123';
      const dto = { name: '新名称' };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        id: nodeId,
        name: '旧名称',
        isFolder: true,
        extension: null,
        isRoot: false,
        parentId: 'parent-123',
        ownerId: 'user-123',
      });
      // 模拟同级目录不存在同名节点
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce(null);
      mockPrisma.fileSystemNode.update.mockResolvedValueOnce({
        id: nodeId,
        name: dto.name,
        owner: { id: 'user-123', username: 'test', nickname: 'Test' },
      });

      const result = await service.updateNode(nodeId, dto);

      expect(result.name).toBe(dto.name);
    });

    it('重命名时应该允许与自身相同的名称', async () => {
      const nodeId = 'node-123';
      const dto = { name: '当前名称' };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        id: nodeId,
        name: '当前名称',
        isFolder: true,
        extension: null,
        isRoot: false,
        parentId: 'parent-123',
        ownerId: 'user-123',
      });
      // 不会调用 findFirst，因为名称没有变化
      mockPrisma.fileSystemNode.update.mockResolvedValueOnce({
        id: nodeId,
        name: dto.name,
        owner: { id: 'user-123', username: 'test', nickname: 'Test' },
      });

      const result = await service.updateNode(nodeId, dto);

      expect(result.name).toBe(dto.name);
    });
  });

  describe('moveNode', () => {
    it('应该在节点不存在时抛出异常', async () => {
      const nodeId = 'nonexistent';
      const targetParentId = 'target-123';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow(NotFoundException);
    });

    it('应该禁止移动根节点', async () => {
      const nodeId = 'root-123';
      const targetParentId = 'target-123';
      const mockNode = { isRoot: true };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(mockNode);

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow(BadRequestException);
    });

    it('移动时应该检查目标目录同名节点', async () => {
      const nodeId = 'node-123';
      const targetParentId = 'target-123';

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          id: nodeId,
          isRoot: false,
          parentId: 'old-parent',
          name: '要移动的文件夹',
          ownerId: 'user-123',
        })
        .mockResolvedValueOnce({ isFolder: true });
      // 模拟目标目录已存在同名节点
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce({ id: 'existing-node', isFolder: true });

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow('同级目录已存在同名文件夹');
    });

    it('移动时应该允许目标目录无同名节点', async () => {
      const nodeId = 'node-123';
      const targetParentId = 'target-123';

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          id: nodeId,
          isRoot: false,
          parentId: 'old-parent',
          name: '要移动的文件夹',
          ownerId: 'user-123',
        })
        .mockResolvedValueOnce({ isFolder: true });
      // 模拟目标目录不存在同名节点
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce(null);
      mockPrisma.fileSystemNode.update.mockResolvedValueOnce({
        id: nodeId,
        parentId: targetParentId,
        owner: { id: 'user-123', username: 'test', nickname: 'Test' },
      });

      const result = await service.moveNode(nodeId, targetParentId);

      expect(result.parentId).toBe(targetParentId);
    });
  });

  describe('deleteNode', () => {
    it('应该允许软删除根节点（项目）到回收站', async () => {
      const nodeId = 'root-123';
      const mockNode = { isRoot: true, isFolder: true, path: null, fileHash: null, deletedAt: null };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(mockNode);
      mockPrisma.fileSystemNode.update.mockResolvedValueOnce({ id: nodeId, deletedAt: new Date() });

      const result = await service.deleteNode(nodeId);

      expect(result.message).toBe('项目已移至回收站');
    });
  });

  describe('getUserStorageInfo', () => {
    it('应该返回用户存储信息', async () => {
      const userId = 'user-123';
      const mockFiles = [{ size: 1024 }, { size: 2048 }, { size: 0 }];

      mockPrisma.fileSystemNode.findMany.mockResolvedValueOnce(mockFiles);

      const result = await service.getUserStorageInfo(userId);

      expect(result.totalUsed).toBe(3072);
      expect(result.totalLimit).toBe(5 * 1024 * 1024 * 1024);
      expect(result.formatted.totalUsed).toBe('3 KB');
    });

    it('应该处理用户没有文件的情况', async () => {
      const userId = 'user-123';

      mockPrisma.fileSystemNode.findMany.mockResolvedValueOnce([]);

      const result = await service.getUserStorageInfo(userId);

      expect(result.totalUsed).toBe(0);
      expect(result.formatted.totalUsed).toBe('0 B');
    });
  });

  describe('updateProject - 名称唯一性检查', () => {
    it('重命名项目时应该检查同名项目', async () => {
      const projectId = 'project-123';
      const dto = { name: '已存在的项目' };

      // 模拟当前项目存在
      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        id: projectId,
        name: '旧项目名称',
        ownerId: 'user-123',
        isRoot: true,
      });
      // 模拟已存在同名项目
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce({ id: 'existing-project' });

      await expect(service.updateProject(projectId, dto)).rejects.toThrow('已存在同名项目');
    });

    it('重命名项目时应该允许不冲突的名称', async () => {
      const projectId = 'project-123';
      const dto = { name: '新项目名称' };

      // 模拟当前项目存在
      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        id: projectId,
        name: '旧项目名称',
        ownerId: 'user-123',
        isRoot: true,
      });
      // 模拟不存在同名项目
      mockPrisma.fileSystemNode.findFirst.mockResolvedValueOnce(null);
      mockPrisma.fileSystemNode.update.mockResolvedValueOnce({
        id: projectId,
        name: dto.name,
        projectMembers: [],
      });

      const result = await service.updateProject(projectId, dto);

      expect(result.name).toBe(dto.name);
    });

    it('重命名项目时应该允许与自身相同的名称', async () => {
      const projectId = 'project-123';
      const dto = { name: '当前项目名称' };

      // 模拟当前项目存在，且名称相同
      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce({
        id: projectId,
        name: '当前项目名称',
        ownerId: 'user-123',
        isRoot: true,
      });
      // 不会调用 findFirst，因为名称没有变化
      mockPrisma.fileSystemNode.update.mockResolvedValueOnce({
        id: projectId,
        name: dto.name,
        projectMembers: [],
      });

      const result = await service.updateProject(projectId, dto);

      expect(result.name).toBe(dto.name);
    });

    it('更新项目时如果项目不存在应该抛出异常', async () => {
      const projectId = 'nonexistent-project';
      const dto = { name: '新项目名称' };

      // 模拟项目不存在
      mockPrisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);

      await expect(service.updateProject(projectId, dto)).rejects.toThrow(NotFoundException);
    });
  });
});
