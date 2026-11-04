///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { SaveAsService } from './save-as.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { DatabaseService } from '../../database/database.service';
import { ConfigService } from '@nestjs/config';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
import { I_EXTERNAL_REF_FACADE } from '../external-ref/interfaces/ext-ref-facade.interface';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { IPERMISSION_SERVICE } from '../../permission/interfaces/permission-service.interface';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    statSync: jest.fn().mockReturnValue({ size: 1024 }),
    existsSync: jest.fn().mockReturnValue(false),
    readdirSync: jest.fn().mockReturnValue([]),
    promises: {
      ...actual.promises,
      copyFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(Buffer.from('test mxweb content')),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

describe('SaveAsService', () => {
  let service: SaveAsService;

  const mockFileTreeService = {
    getNode: jest.fn(),
    createFileNode: jest.fn(),
    updateNodePath: jest.fn(),
    getChildren: jest.fn(),
  };

  const mockFileSystemNodeService = {
    findById: jest.fn(),
    findByIdWithDeletedAt: jest.fn(),
  };

  const mockStorageManager = {
    allocateNodeStorage: jest.fn(),
  };

  const mockTreeWalker = {
    resolveRootContext: jest.fn(),
  };

  const mockPermissionService = {
    checkNodePermission: jest.fn(),
  };

  const mockSystemPermissionService = {
    checkSystemPermission: jest.fn(),
  };

  const mockFileConversionService = {
    convertFile: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  const mockPrisma = {
    fileSystemNode: {
      update: jest
        .fn()
        .mockResolvedValue({ id: 'node1', size: 1024, fileHash: 'abc123' }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });
    (fs.promises.copyFile as jest.Mock).mockResolvedValue(undefined);
    (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.promises.readFile as jest.Mock).mockResolvedValue(
      Buffer.from('test mxweb content')
    );
    (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);

    // 默认：父节点为本人 FOLDER、三态权限均通过（各用例按需覆盖）
    (mockFileSystemNodeService.findByIdWithDeletedAt as jest.Mock).mockResolvedValue({
      id: 'parent1',
      nodeType: 'FOLDER',
      ownerId: 'user1',
    });
    (mockTreeWalker.resolveRootContext as jest.Mock).mockResolvedValue({
      ownerId: 'user1',
    });
    (mockPermissionService.checkNodePermission as jest.Mock).mockResolvedValue(true);
    (mockSystemPermissionService.checkSystemPermission as jest.Mock).mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveAsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: FileConversionService, useValue: mockFileConversionService },
        { provide: DatabaseService, useValue: mockPrisma },
        {
          provide: RestrictionEngine,
          useValue: {
            checkQuota: jest.fn().mockResolvedValue(undefined),
            incrementConversionCount: jest.fn().mockResolvedValue(undefined),
          },
        },
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
          provide: I_EXTERNAL_REF_FACADE,
          useValue: {
            readPreloadingData: jest.fn().mockResolvedValue(undefined),
            writePreloading: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: TreeWalker, useValue: mockTreeWalker },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
        { provide: IPERMISSION_SERVICE, useValue: mockSystemPermissionService },
      ],
    }).compile();

    service = module.get<SaveAsService>(SaveAsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveMxwebAs', () => {
    it('should save mxweb file successfully', async () => {
      const mockFile = {
        path: path.join(os.tmpdir(), 'test.mxweb'),
        originalname: 'test.mxweb',
      } as Express.Multer.File;

      const mockParentNode = {
        id: 'parent1',
        nodeType: 'FOLDER',
      };

      const mockNewNode = {
        id: 'node1',
      };

      mockFileTreeService.getNode.mockResolvedValue(mockParentNode);
      mockFileTreeService.createFileNode.mockResolvedValue(mockNewNode);
      mockStorageManager.allocateNodeStorage.mockResolvedValue({
        nodeDirectoryPath: '/storage/node1',
        nodeDirectoryRelativePath: '2026/04/node1',
      });
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, message: 'success' },
      });
      mockFileSystemNodeService.findById.mockResolvedValue({ id: 'node1' });
      mockFileTreeService.getChildren.mockResolvedValue({ nodes: [] });

      const result = await service.saveMxwebAs({
        file: mockFile,
        targetType: 'personal',
        targetParentId: 'parent1',
        projectId: undefined,
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
      });

      expect(result.success).toBe(true);
    });

    it('should return error when file is missing', async () => {
      const result = await service.saveMxwebAs({
        file: null as unknown as Express.Multer.File,
        targetType: 'personal',
        targetParentId: 'parent1',
        projectId: undefined,
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('缺少文件');
    });

    it('should return error when file format is not supported', async () => {
      const mockFile = {
        path: path.join(os.tmpdir(), 'test.txt'),
        originalname: 'test.txt',
      } as Express.Multer.File;

      const result = await service.saveMxwebAs({
        file: mockFile,
        targetType: 'personal',
        targetParentId: 'parent1',
        projectId: undefined,
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('不支持的文件格式');
    });

    it('should return error when parent node does not exist', async () => {
      const mockFile = {
        path: path.join(os.tmpdir(), 'test.mxweb'),
        originalname: 'test.mxweb',
      } as Express.Multer.File;

      (mockFileSystemNodeService.findByIdWithDeletedAt as jest.Mock).mockResolvedValue(
        null
      );

      const result = await service.saveMxwebAs({
        file: mockFile,
        targetType: 'personal',
        targetParentId: 'parent1',
        projectId: undefined,
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('目标文件夹不存在');
    });

    it('should return error when parent is not a folder', async () => {
      const mockFile = {
        path: path.join(os.tmpdir(), 'test.mxweb'),
        originalname: 'test.mxweb',
      } as Express.Multer.File;

      (mockFileSystemNodeService.findByIdWithDeletedAt as jest.Mock).mockResolvedValue({
        id: 'parent1',
        nodeType: 'FILE',
      });

      const result = await service.saveMxwebAs({
        file: mockFile,
        targetType: 'personal',
        targetParentId: 'parent1',
        projectId: undefined,
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('目标必须是文件夹');
    });

    describe('落库文件名归一（回归：叠扩展名 plan.dwg.mxweb.dwg）', () => {
      const prepareSuccessMocks = () => {
        mockFileTreeService.getNode.mockResolvedValue({
          id: 'parent1',
          nodeType: 'FOLDER',
        });
        mockFileTreeService.createFileNode.mockResolvedValue({ id: 'node1' });
        mockStorageManager.allocateNodeStorage.mockResolvedValue({
          nodeDirectoryPath: '/storage/node1',
          nodeDirectoryRelativePath: '2026/04/node1',
        });
        mockFileSystemNodeService.findById.mockResolvedValue({ id: 'node1' });
        mockFileTreeService.getChildren.mockResolvedValue({ nodes: [] });
      };

      const saveWithFileName = async (fileName: string) => {
        prepareSuccessMocks();
        const result = await service.saveMxwebAs({
          file: {
            path: path.join(os.tmpdir(), 'test.mxweb'),
            originalname: 'test.mxweb',
          } as Express.Multer.File,
          targetType: 'personal',
          targetParentId: 'parent1',
          projectId: undefined,
          format: 'dwg',
          userId: 'user1',
          userName: 'Test User',
          fileName,
        });
        expect(result.success).toBe(true);
        return mockFileTreeService.createFileNode.mock.calls.at(-1)![0].name;
      };

      it('历史双层节点名当基名传入时剥掉容器层与重复格式后缀', async () => {
        // 客户端（旧版本/移动端）把节点名原样当基名传上来
        await expect(saveWithFileName('plan.dwg.mxweb')).resolves.toBe(
          'plan.dwg'
        );
      });

      it('基名已带同格式后缀时不重复追加', async () => {
        await expect(saveWithFileName('plan.dwg')).resolves.toBe('plan.dwg');
      });

      it('多层容器后缀一次剥净，保留用户的真实基名', async () => {
        await expect(
          saveWithFileName('111122 41.dwg.mxweb.mxweb')
        ).resolves.toBe('111122 41.dwg');
      });

      it('空基名回落 untitled（不产出只有扩展名的节点）', async () => {
        await expect(saveWithFileName('   ')).resolves.toBe('untitled.dwg');
      });

      it('剥后缀后只剩尾点也不拼出双点', async () => {
        await expect(saveWithFileName('plan..mxweb')).resolves.toBe('plan.dwg');
      });
    });
  });

  describe('assertSavePermission 三态权限分派', () => {
    const validFile = {
      path: path.join(os.tmpdir(), 'test.mxweb'),
      originalname: 'test.mxweb',
    } as Express.Multer.File;

    it('personal：非本人私人空间 → 无权限', async () => {
      (mockTreeWalker.resolveRootContext as jest.Mock).mockResolvedValue({
        ownerId: 'other',
      });
      const result = await service.saveMxwebAs({
        file: validFile,
        targetType: 'personal',
        targetParentId: 'parent1',
        projectId: undefined,
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
      });
      expect(result.success).toBe(false);
      expect(result.message).toBe('您没有权限保存到此位置');
    });

    it('library：无资源库管理权限 → 无权限', async () => {
      (mockSystemPermissionService.checkSystemPermission as jest.Mock).mockResolvedValue(
        false
      );
      const result = await service.saveMxwebAs({
        file: validFile,
        targetType: 'library',
        targetParentId: 'parent1',
        projectId: undefined,
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
        libraryType: 'drawing',
      });
      expect(result.success).toBe(false);
      expect(result.message).toBe('您没有资源库管理权限');
    });

    it('project：无 CAD_SAVE 权限 → 无权限', async () => {
      (mockPermissionService.checkNodePermission as jest.Mock).mockResolvedValue(
        false
      );
      const result = await service.saveMxwebAs({
        file: validFile,
        targetType: 'project',
        targetParentId: 'parent1',
        projectId: 'proj1',
        format: 'dwg',
        userId: 'user1',
        userName: 'Test User',
      });
      expect(result.success).toBe(false);
      expect(result.message).toBe('您没有权限保存到此项目');
    });
  });

  describe('copyPreloadingData — sourceFileHash 路径遍历防护', () => {
    it('应拒绝非十六进制 sourceFileHash（含路径分隔符），不触文件系统/复制', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const copySpy = jest
        .spyOn(service as any, 'copyDirectoryContents')
        .mockResolvedValue(undefined);

      await (service as any).copyPreloadingData({
        newNodeId: 'node1',
        nodeDirectory: '/storage/node1',
        sourceFileHash: '../../etc',
      });

      // 恶意 hash 被十六进制门禁拦截，未进入 uploads 查找分支
      expect(copySpy).not.toHaveBeenCalled();
      // 未用恶意 hash 拼接任何含 .. 的路径做 existsSync
      const calledPaths = (fs.existsSync as jest.Mock).mock.calls.map((c) =>
        String(c[0])
      );
      expect(calledPaths.some((p) => p.includes('..'))).toBe(false);
    });

    it('合法十六进制 hash 正常进入 uploads 查找分支（勿过度拦截）', async () => {
      // preloading.json 不存在（readdirSync 扫不到匹配）——只验证合法 hash 进入了扫描分支
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      const copySpy = jest
        .spyOn(service as any, 'copyDirectoryContents')
        .mockResolvedValue(undefined);

      await (service as any).copyPreloadingData({
        newNodeId: 'node1',
        nodeDirectory: '/storage/node1',
        sourceFileHash: 'abc123def456',
      });

      // 合法 hash 进入分支：按 hash 前缀扫描 uploads 目录定位 preloading（不再硬拼单名）
      const calledDirs = (fs.readdirSync as jest.Mock).mock.calls.map((c) =>
        String(c[0])
      );
      expect(calledDirs.some((d) => d.includes('uploads'))).toBe(true);
      expect(copySpy).not.toHaveBeenCalled();
    });

    it('preloading 文件名带源扩展名（<hash>.dwg.mxweb_preloading.json）时仍能定位并复制 xref', async () => {
      // 回归：引擎产物名按 src_file_md5 带源扩展名，preloading.json 实际落位为
      // <hash>.dwg.mxweb_preloading.json；此前硬拼 <hash>.mxweb_preloading.json 永远 existsSync
      // 失败，外部参照静默丢失。现走 hash 前缀 + 后缀降级查找，须能定位并复制 xref 物理目录。
      const srcHash = '4b298dd48355af1202b532fc4d051658';
      (fs.readdirSync as jest.Mock).mockImplementation((dir: any) => {
        if (String(dir).includes('uploads')) {
          return [`${srcHash}.dwg.mxweb`, `${srcHash}.dwg.mxweb_preloading.json`];
        }
        return [];
      });
      // 只有 xref 物理目录 existsSync 为真（preloading 文件本身走 readdirSync 定位，不依赖 existsSync）
      (fs.existsSync as jest.Mock).mockImplementation(
        (p: any) => !String(p).endsWith('_preloading.json')
      );
      (fs.promises.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          images: [],
          externalReference: ['A1.dwg'],
          tz: false,
          src_file_md5: srcHash,
        })
      );
      const copySpy = jest
        .spyOn(service as any, 'copyDirectoryContents')
        .mockResolvedValue(undefined);

      await (service as any).copyPreloadingData({
        newNodeId: 'node1',
        nodeDirectory: '/storage/node1',
        sourceFileHash: srcHash,
      });

      // 命中带源扩展名的 preloading，读出 src_file_md5 并复制 xref 物理目录到新节点
      expect(copySpy).toHaveBeenCalledTimes(1);
      const [srcDir, destDir] = copySpy.mock.calls[0];
      expect(String(srcDir).includes(srcHash)).toBe(true);
      expect(String(destDir).includes(srcHash)).toBe(true);
    });
  });
});
