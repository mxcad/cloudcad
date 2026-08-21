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

import { NodeType } from '@cloudcad/db';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import { StorageInfoService } from '../file-system/storage-quota/storage-info.service';
import { IPROJECT_PERMISSION_SERVICE } from '../roles/interfaces/project-permission-service.interface';
import { IPERMISSION_SERVICE } from '../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../common/enums/permissions.enum';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import { QUOTA_KEYS } from '../vip/quota-keys';
import { OwnershipPermissionFactory } from '../ownership/factories/ownership-permission.factory';
import { ProjectPermissionStrategy } from '../ownership/strategies/project-permission.strategy';
import { PersonalPermissionStrategy } from '../ownership/strategies/personal-permission.strategy';
import { LibraryPermissionStrategy } from '../ownership/strategies/library-permission.strategy';
import { NodeMutationGuard } from './node-mutation.guard';

describe('NodeMutationGuard', () => {
  let guard: NodeMutationGuard;
  let prisma: any;
  let fileTreeService: Record<string, jest.Mock>;
  let treeWalker: Record<string, jest.Mock>;
  let storageInfoService: Record<string, jest.Mock>;
  let restrictionEngine: Record<string, jest.Mock>;
  let projectPermissionService: Record<string, jest.Mock>;
  let systemPermissionService: Record<string, jest.Mock>;

  const nodeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'node-1',
    nodeType: NodeType.FILE,
    projectId: 'project-1',
    ownerId: 'user-1',
    parentId: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      fileSystemNode: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    fileTreeService = {
      getNodeType: jest.fn().mockResolvedValue(NodeType.PROJECT),
      isLibraryNode: jest.fn().mockResolvedValue(false),
    };
    treeWalker = {
      resolveProjectId: jest.fn().mockResolvedValue('project-1'),
    };
    storageInfoService = {
      invalidateQuotaCache: jest.fn().mockResolvedValue(undefined),
    };
    restrictionEngine = { checkQuota: jest.fn().mockResolvedValue(undefined) };
    projectPermissionService = {
      isProjectOwner: jest.fn().mockResolvedValue(false),
      checkPermission: jest.fn().mockResolvedValue(true),
    };
    systemPermissionService = {
      checkSystemPermission: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeMutationGuard,
        { provide: DatabaseService, useValue: prisma },
        { provide: FileTreeService, useValue: fileTreeService },
        { provide: TreeWalker, useValue: treeWalker },
        { provide: StorageInfoService, useValue: storageInfoService },
        { provide: RestrictionEngine, useValue: restrictionEngine },
        {
          provide: IPROJECT_PERMISSION_SERVICE,
          useValue: projectPermissionService,
        },
        { provide: IPERMISSION_SERVICE, useValue: systemPermissionService },
        ProjectPermissionStrategy,
        PersonalPermissionStrategy,
        LibraryPermissionStrategy,
        OwnershipPermissionFactory,
      ],
    }).compile();

    guard = module.get(NodeMutationGuard);
  });

  describe('resolveProjectContext', () => {
    it('直接返回 PROJECT 节点自身的 id 作为项目', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({
          id: 'project-1',
          nodeType: NodeType.PROJECT,
          projectId: null,
        })
      );
      treeWalker.resolveProjectId.mockResolvedValue('project-1');
      const ctx = await guard.resolveProjectContext({ id: 'project-1' });
      expect(ctx.projectId).toBe('project-1');
      expect(ctx.nodeType).toBe(NodeType.PROJECT);
    });

    it('projectId 经 resolveProjectId 沿祖先链解析（不依赖字段短路）', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      treeWalker.resolveProjectId.mockResolvedValue('project-1');
      const ctx = await guard.resolveProjectContext({ id: 'node-1' });
      expect(ctx.projectId).toBe('project-1');
      expect(treeWalker.resolveProjectId).toHaveBeenCalledWith('node-1');
    });

    it('projectId 缺失时沿祖先链向上查找（父节点 id 传入 resolveProjectId）', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({ projectId: null, parentId: 'folder-1' })
      );
      treeWalker.resolveProjectId.mockResolvedValue('project-1');
      const ctx = await guard.resolveProjectContext({ id: 'node-1' });
      expect(ctx.projectId).toBe('project-1');
      expect(treeWalker.resolveProjectId).toHaveBeenCalledWith('node-1');
    });

    it('个人空间根（projectId 字段为 null）：解析为自身 id（修复，不依赖字段）', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({
          id: 'space-1',
          nodeType: NodeType.PERSONAL_SPACE,
          projectId: null,
          parentId: null,
        })
      );
      treeWalker.resolveProjectId.mockResolvedValue('space-1');
      const ctx = await guard.resolveProjectContext({ id: 'space-1' });
      expect(ctx.projectId).toBe('space-1');
      expect(treeWalker.resolveProjectId).toHaveBeenCalledWith('space-1');
    });
  });

  describe('assertMutationAllowed — 归属分派', () => {
    it('项目成员具备动作权限时放行', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      projectPermissionService.isProjectOwner.mockResolvedValue(false);
      projectPermissionService.checkPermission.mockResolvedValue(true);
      await expect(
        guard.assertMutationAllowed('user-2', 'delete', {
          node: { id: 'node-1' },
        })
      ).resolves.toBeUndefined();
      expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
        'user-2',
        'project-1',
        expect.any(String)
      );
    });

    it('项目内 FILE 节点：owner 不直接放行，仍走项目权限', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({ ownerId: 'user-1' })
      );
      projectPermissionService.isProjectOwner.mockResolvedValue(false);
      projectPermissionService.checkPermission.mockResolvedValue(true);
      await expect(
        guard.assertMutationAllowed('user-1', 'delete', {
          node: { id: 'node-1' },
        })
      ).resolves.toBeUndefined();
      expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        expect.any(String)
      );
    });

    it('项目所有者自动通过', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      projectPermissionService.isProjectOwner.mockResolvedValue(true);
      await expect(
        guard.assertMutationAllowed('user-1', 'delete', {
          node: { id: 'node-1' },
        })
      ).resolves.toBeUndefined();
      expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
    });

    it('成员缺权限时抛 ForbiddenException', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      projectPermissionService.isProjectOwner.mockResolvedValue(false);
      projectPermissionService.checkPermission.mockResolvedValue(false);
      await expect(
        guard.assertMutationAllowed('user-2', 'delete', {
          node: { id: 'node-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('个人空间：owner 放行，非 owner 拒绝', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({
          nodeType: NodeType.PERSONAL_SPACE,
          projectId: null,
          ownerId: 'user-1',
        })
      );
      await expect(
        guard.assertMutationAllowed('user-1', 'upload', {
          node: { id: 'space-1' },
        })
      ).resolves.toBeUndefined();
      await expect(
        guard.assertMutationAllowed('user-2', 'upload', {
          node: { id: 'space-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('资源库：LIBRARY_DRAWING_MANAGE 系统权限', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({ nodeType: NodeType.LIBRARY_DRAWING, projectId: null })
      );
      await expect(
        guard.assertMutationAllowed('user-1', 'upload', {
          node: { id: 'lib-1' },
        })
      ).resolves.toBeUndefined();
      expect(
        systemPermissionService.checkSystemPermission
      ).toHaveBeenCalledWith('user-1', SystemPermission.LIBRARY_DRAWING_MANAGE);

      systemPermissionService.checkSystemPermission.mockResolvedValue(false);
      await expect(
        guard.assertMutationAllowed('user-1', 'upload', {
          node: { id: 'lib-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('资源库内目录（FOLDER）：按归属根类型走资源库策略，而非项目权限', async () => {
      // 场景：只有 LIBRARY_DRAWING_MANAGE 的管理员在图纸库一级目录内创建子目录，
      // 父节点为库内 FOLDER，不得落入项目成员权限（否则误报"没有权限"）
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({
          id: 'folder-1',
          nodeType: NodeType.FOLDER,
          projectId: null,
          parentId: 'lib-1',
        })
      );
      treeWalker.resolveProjectId.mockResolvedValue('lib-1');
      fileTreeService.getNodeType.mockResolvedValue(NodeType.LIBRARY_DRAWING);
      await expect(
        guard.assertMutationAllowed('user-1', 'create', {
          node: { id: 'folder-1' },
        })
      ).resolves.toBeUndefined();
      expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'user-1',
        SystemPermission.LIBRARY_DRAWING_MANAGE
      );
      expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();

      systemPermissionService.checkSystemPermission.mockResolvedValue(false);
      await expect(
        guard.assertMutationAllowed('user-1', 'create', {
          node: { id: 'folder-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertMutationAllowed — 配额 key 语义', () => {
    it('个人空间目标：PROJECT_SIZE + PERSONAL_STORAGE', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({ nodeType: NodeType.FOLDER, projectId: 'space-1' })
      );
      treeWalker.resolveProjectId.mockResolvedValue('space-1');
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'space-1' });
      await guard.assertMutationAllowed('user-1', 'move', {
        node: { id: 'node-1' },
        incrementBytes: 100,
      });
      expect(restrictionEngine.checkQuota).toHaveBeenCalledWith('user-1', {
        projectId: 'space-1',
        incrementBytes: 100,
        strategyKeys: [QUOTA_KEYS.PROJECT_SIZE, QUOTA_KEYS.PERSONAL_STORAGE],
      });
    });

    it('项目目标：仅 PROJECT_SIZE', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'space-1' });
      await guard.assertMutationAllowed('user-1', 'move', {
        node: { id: 'node-1' },
        incrementBytes: 100,
      });
      expect(restrictionEngine.checkQuota).toHaveBeenCalledWith('user-1', {
        projectId: 'project-1',
        incrementBytes: 100,
        strategyKeys: [QUOTA_KEYS.PROJECT_SIZE],
      });
    });

    it('提供 target 时配额按目标项目解析', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({ projectId: 'project-a' })
      );
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      treeWalker.resolveProjectId.mockResolvedValue('project-b');
      await guard.assertMutationAllowed('user-1', 'copy', {
        node: { id: 'node-1' },
        target: { id: 'target-1' },
        incrementBytes: 200,
      });
      expect(treeWalker.resolveProjectId).toHaveBeenCalledWith('target-1');
      expect(restrictionEngine.checkQuota).toHaveBeenCalledWith('user-1', {
        projectId: 'project-b',
        incrementBytes: 200,
        strategyKeys: [QUOTA_KEYS.PROJECT_SIZE],
      });
    });

    it('无增量时不触发配额检查', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      await guard.assertMutationAllowed('user-1', 'update', {
        node: { id: 'node-1' },
      });
      expect(restrictionEngine.checkQuota).not.toHaveBeenCalled();
    });

    it('公共资源库根节点：跳过字节配额', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        nodeRow({
          id: 'lib-1',
          nodeType: NodeType.LIBRARY_DRAWING,
          projectId: null,
        })
      );
      fileTreeService.isLibraryNode.mockResolvedValue(true);
      await guard.assertMutationAllowed('user-1', 'upload', {
        node: { id: 'lib-1' },
        incrementBytes: 1024 * 1024 * 100,
      });
      expect(fileTreeService.isLibraryNode).toHaveBeenCalledWith('lib-1');
      expect(restrictionEngine.checkQuota).not.toHaveBeenCalled();
    });

    it('公共资源库内文件夹：跳过字节配额', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'folder-1') {
          return Promise.resolve(
            nodeRow({
              id: 'folder-1',
              nodeType: NodeType.FOLDER,
              projectId: null,
              parentId: 'lib-1',
            })
          );
        }
        if (where.id === 'lib-1') {
          return Promise.resolve(
            nodeRow({
              id: 'lib-1',
              nodeType: NodeType.LIBRARY_DRAWING,
              projectId: null,
              parentId: null,
            })
          );
        }
        return Promise.resolve(null);
      });
      fileTreeService.isLibraryNode.mockResolvedValue(true);
      await guard.assertMutationAllowed('user-1', 'upload', {
        node: { id: 'folder-1' },
        incrementBytes: 1024 * 1024 * 100,
      });
      expect(fileTreeService.isLibraryNode).toHaveBeenCalledWith('folder-1');
      expect(restrictionEngine.checkQuota).not.toHaveBeenCalled();
    });

    it('move/copy 进库（目标父节点为库）：跳过字节配额', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      fileTreeService.isLibraryNode.mockResolvedValue(false);
      treeWalker.resolveProjectId.mockResolvedValue('lib-root');
      fileTreeService.getNodeType.mockResolvedValue(NodeType.LIBRARY_DRAWING);
      await guard.assertMutationAllowed('user-1', 'move', {
        node: { id: 'node-1' },
        target: { id: 'lib-folder' },
        incrementBytes: 1024 * 1024 * 100,
      });
      expect(treeWalker.resolveProjectId).toHaveBeenCalledWith('lib-folder');
      expect(restrictionEngine.checkQuota).not.toHaveBeenCalled();
    });

    it('项目内节点：库判断不影响原有配额检查', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(nodeRow());
      fileTreeService.isLibraryNode.mockResolvedValue(false);
      await guard.assertMutationAllowed('user-1', 'upload', {
        node: { id: 'node-1' },
        incrementBytes: 100,
      });
      expect(restrictionEngine.checkQuota).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateQuotaAfterMutation', () => {
    it('失效源项目与额外目标项目缓存', async () => {
      await guard.invalidateQuotaAfterMutation(
        'user-1',
        { projectId: 'project-a' },
        'project-b'
      );
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledTimes(2);
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
        'user-1',
        'project-a'
      );
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
        'user-1',
        'project-b'
      );
    });

    it('同项目时不重复失效', async () => {
      await guard.invalidateQuotaAfterMutation(
        'user-1',
        { projectId: 'project-a' },
        'project-a'
      );
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('assertMutationAllowed — 跨项目转移策略（6 域矩阵）', () => {
    /** 项目根行默认 6 域配置（与 schema @default 一致） */
    const projectRoot = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      nodeType: NodeType.PROJECT,
      projectId: null,
      ownerId: 'user-a',
      transferOutToProject: 'ALL',
      transferOutToPersonalSpace: 'NONE',
      transferOutToLibrary: 'COPY_ONLY',
      transferInFromProject: 'ALL',
      transferInFromPersonalSpace: 'ALL',
      transferInFromLibrary: 'ALL',
      ...overrides,
    });

    /** 按 id 分派的 findUnique mock */
    const mockNodes = (map: Record<string, Record<string, unknown>>) => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(map[where.id] ? nodeRow(map[where.id]) : null)
      );
    };

    /** 项目 A（源）→ 项目 B（目标）的标准节点矩阵 */
    const projectAToB = (
      outMode: string,
      inMode: string
    ) => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'project-a',
          parentId: 'project-a',
        },
        'project-a': projectRoot('project-a', {
          transferOutToProject: outMode,
        }),
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'project-b',
          parentId: 'project-b',
        },
        'project-b': projectRoot('project-b', {
          ownerId: 'user-b',
          transferInFromProject: inMode,
        }),
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) => {
        if (id === 'node-1') return Promise.resolve('project-a');
        if (id === 'target-1') return Promise.resolve('project-b');
        return Promise.resolve(id);
      });
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-a' || id === 'project-b')
          return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.PROJECT);
      });
    };

    it('同根内 move/copy：不触发跨项目转移策略（同项目移动不受影响）', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'project-a',
          parentId: 'folder-1',
        },
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'project-a',
          parentId: 'project-a',
        },
      });
      treeWalker.resolveProjectId.mockResolvedValue('project-a');
      fileTreeService.getNodeType.mockResolvedValue(NodeType.PROJECT);
      await expect(
        guard.assertMutationAllowed('user-1', 'move', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();
      // 仅 resolveProjectContext 的两次查询，不再查根配置字段
      expect(prisma.fileSystemNode.findUnique).toHaveBeenCalledTimes(2);
    });

    it('跨根 copy：出向 ALL + 入向 ALL 放行', async () => {
      projectAToB('ALL', 'ALL');
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();
    });

    it('跨根 copy：源项目出向 NONE 拒绝', async () => {
      projectAToB('NONE', 'ALL');
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('跨根 COPY_ONLY：copy 放行、move 拒绝', async () => {
      projectAToB('COPY_ONLY', 'ALL');
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();
      await expect(
        guard.assertMutationAllowed('user-1', 'move', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('跨根 MOVE_ONLY：move 放行、copy 拒绝', async () => {
      projectAToB('MOVE_ONLY', 'ALL');
      await expect(
        guard.assertMutationAllowed('user-1', 'move', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('入向：目标项目 transferInFromProject NONE 拒绝（源出向 ALL）', async () => {
      projectAToB('ALL', 'NONE');
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('出向→个人空间：默认 NONE 拒绝复制（防图纸私有化）', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'project-a',
          parentId: 'project-a',
        },
        'project-a': projectRoot('project-a'),
        'space-1': {
          id: 'space-1',
          nodeType: NodeType.PERSONAL_SPACE,
          projectId: null,
          ownerId: 'user-1',
        },
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.PERSONAL_SPACE,
          projectId: null,
          parentId: null,
        },
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'project-a' : 'space-1')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-a') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.PERSONAL_SPACE);
      });
      // 目标个人空间 owner 与操作者一致（本人），但仍被出向 NONE 拦截
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('出向→个人空间：ALL 时本人可复制', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'project-a',
          parentId: 'project-a',
        },
        'project-a': projectRoot('project-a', {
          transferOutToPersonalSpace: 'ALL',
        }),
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.PERSONAL_SPACE,
          projectId: null,
          parentId: null,
          ownerId: 'user-1',
        },
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'project-a' : 'space-1')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-a') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.PERSONAL_SPACE);
      });
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();
    });

    it('目标个人空间非本人：目标归属校验拒绝（即使出向 ALL）', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'project-a',
          parentId: 'project-a',
        },
        'project-a': projectRoot('project-a', {
          transferOutToPersonalSpace: 'ALL',
        }),
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.PERSONAL_SPACE,
          projectId: null,
          parentId: null,
          ownerId: 'user-2',
        },
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'project-a' : 'space-2')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-a') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.PERSONAL_SPACE);
      });
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('出向→公共库：默认 COPY_ONLY，copy 放行、move 拒绝', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'project-a',
          parentId: 'project-a',
        },
        'project-a': projectRoot('project-a'),
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'lib-root',
          parentId: 'lib-root',
        },
        'lib-root': {
          id: 'lib-root',
          nodeType: NodeType.LIBRARY_DRAWING,
          projectId: null,
          parentId: null,
        },
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'project-a' : 'lib-root')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-a') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.LIBRARY_DRAWING);
      });
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();
      await expect(
        guard.assertMutationAllowed('user-1', 'move', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('目标为库但非库管理员：目标归属校验拒绝', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'project-a',
          parentId: 'project-a',
        },
        'project-a': projectRoot('project-a'),
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'lib-root',
          parentId: 'lib-root',
        },
        'lib-root': {
          id: 'lib-root',
          nodeType: NodeType.LIBRARY_DRAWING,
          projectId: null,
          parentId: null,
        },
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'project-a' : 'lib-root')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-a') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.LIBRARY_DRAWING);
      });
      systemPermissionService.checkSystemPermission.mockResolvedValue(false);
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('源为库 copy→项目：豁免源权限（公开复制），入向按目标项目 transferInFromLibrary', async () => {
      const base = {
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'lib-root',
          parentId: 'lib-root',
        },
        'lib-root': {
          id: 'lib-root',
          nodeType: NodeType.LIBRARY_DRAWING,
          projectId: null,
          parentId: null,
        },
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'project-b',
          parentId: 'project-b',
        },
        'project-b': projectRoot('project-b', { ownerId: 'user-b' }),
      };
      // 源库、无库管理权限（systemPermissionService false），copy 仍豁免源断言
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'lib-root' : 'project-b')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-b') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.LIBRARY_DRAWING);
      });
      systemPermissionService.checkSystemPermission.mockResolvedValue(false);
      projectPermissionService.checkPermission.mockResolvedValue(true);

      mockNodes({ ...base, 'project-b': projectRoot('project-b', { ownerId: 'user-b', transferInFromLibrary: 'ALL' }) });
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();
      expect(systemPermissionService.checkSystemPermission).not.toHaveBeenCalled();

      // 入向 NONE 时拒绝
      mockNodes({ ...base, 'project-b': projectRoot('project-b', { ownerId: 'user-b', transferInFromLibrary: 'NONE' }) });
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('源为库 move：系统规则恒拒绝（破坏公共资源）', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'lib-root',
          parentId: 'lib-root',
        },
        'lib-root': {
          id: 'lib-root',
          nodeType: NodeType.LIBRARY_DRAWING,
          projectId: null,
          parentId: null,
        },
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'project-b',
          parentId: 'project-b',
        },
        'project-b': projectRoot('project-b', { ownerId: 'user-b' }),
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'lib-root' : 'project-b')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-b') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.LIBRARY_DRAWING);
      });
      await expect(
        guard.assertMutationAllowed('user-1', 'move', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('源为个人空间→项目：出向恒允许（本人文件），入向按目标项目 transferInFromPersonalSpace', async () => {
      const base = {
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'space-1',
          parentId: 'space-1',
        },
        'space-1': {
          id: 'space-1',
          nodeType: NodeType.PERSONAL_SPACE,
          projectId: null,
          parentId: null,
          ownerId: 'user-1',
        },
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'project-b',
          parentId: 'project-b',
        },
        'project-b': projectRoot('project-b', { ownerId: 'user-b' }),
      };
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'space-1' : 'project-b')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-b') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.PERSONAL_SPACE);
      });

      mockNodes({ ...base, 'project-b': projectRoot('project-b', { ownerId: 'user-b', transferInFromPersonalSpace: 'ALL' }) });
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).resolves.toBeUndefined();

      mockNodes({ ...base, 'project-b': projectRoot('project-b', { ownerId: 'user-b', transferInFromPersonalSpace: 'NONE' }) });
      await expect(
        guard.assertMutationAllowed('user-1', 'copy', {
          node: { id: 'node-1' },
          target: { id: 'target-1' },
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('跨根 copy：配额按目标根 owner 校验（而非源文件 owner）', async () => {
      projectAToB('ALL', 'ALL');
      await guard.assertMutationAllowed('user-1', 'copy', {
        node: { id: 'node-1' },
        target: { id: 'target-1' },
        incrementBytes: 500,
      });
      expect(restrictionEngine.checkQuota).toHaveBeenCalledWith('user-b', {
        projectId: 'project-b',
        incrementBytes: 500,
        strategyKeys: [QUOTA_KEYS.PROJECT_SIZE],
      });
    });

    it('源库→项目 copy：配额不再跳过（仅目标属库才跳过）', async () => {
      mockNodes({
        'node-1': {
          id: 'node-1',
          nodeType: NodeType.FILE,
          projectId: 'lib-root',
          parentId: 'lib-root',
        },
        'lib-root': {
          id: 'lib-root',
          nodeType: NodeType.LIBRARY_DRAWING,
          projectId: null,
          parentId: null,
        },
        'target-1': {
          id: 'target-1',
          nodeType: NodeType.FOLDER,
          projectId: 'project-b',
          parentId: 'project-b',
        },
        'project-b': projectRoot('project-b', { ownerId: 'user-b' }),
      });
      treeWalker.resolveProjectId.mockImplementation((id: string) =>
        Promise.resolve(id === 'node-1' ? 'lib-root' : 'project-b')
      );
      fileTreeService.getNodeType.mockImplementation((id: string) => {
        if (id === 'project-b') return Promise.resolve(NodeType.PROJECT);
        return Promise.resolve(NodeType.LIBRARY_DRAWING);
      });
      // 源是库内节点（isLibraryNode true），但目标为项目 → 必须执行配额检查
      fileTreeService.isLibraryNode.mockResolvedValue(true);
      await guard.assertMutationAllowed('user-1', 'copy', {
        node: { id: 'node-1' },
        target: { id: 'target-1' },
        incrementBytes: 100,
      });
      expect(restrictionEngine.checkQuota).toHaveBeenCalledTimes(1);
    });
  });
});
