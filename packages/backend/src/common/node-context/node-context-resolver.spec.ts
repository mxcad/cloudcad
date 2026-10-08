// //////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// //////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';
import { NodeContextResolver } from './node-context-resolver';

describe('NodeContextResolver', () => {
  let resolver: NodeContextResolver;
  let fileTreeService: Record<string, jest.Mock>;
  let treeWalker: Record<string, jest.Mock>;

  beforeEach(async () => {
    fileTreeService = {
      getNodeTypeAndOwner: jest.fn(),
    };
    treeWalker = {
      resolveRootContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeContextResolver,
        { provide: FileTreeService, useValue: fileTreeService },
        { provide: TreeWalker, useValue: treeWalker },
      ],
    }).compile();

    resolver = module.get(NodeContextResolver);
  });

  /** 表驱动：6 种节点类型 → 期望的 NodeContext.kind */
  const CASES: Array<{
    name: string;
    nodeType: NodeType;
    root: { rootId: string; rootType: NodeType; ownerId: string | null } | null;
    expect: (ctx: Awaited<ReturnType<NodeContextResolver['resolve']>>) => void;
  }> = [
    {
      name: 'PROJECT 根：kind=project，projectId 为自身',
      nodeType: NodeType.PROJECT,
      root: { rootId: 'proj-1', rootType: NodeType.PROJECT, ownerId: 'owner-1' },
      expect: (ctx) => {
        expect(ctx.kind).toBe('project');
        if (ctx.kind === 'project') {
          expect(ctx.projectId).toBe('proj-1');
        }
      },
    },
    {
      name: 'PERSONAL_SPACE 根：kind=personalSpace（projectId 不解析）',
      nodeType: NodeType.PERSONAL_SPACE,
      root: { rootId: 'ps-1', rootType: NodeType.PERSONAL_SPACE, ownerId: 'owner-1' },
      expect: (ctx) => {
        expect(ctx.kind).toBe('personalSpace');
        if (ctx.kind === 'personalSpace') {
          expect(ctx.ownerId).toBe('owner-1');
        }
      },
    },
    {
      name: 'LIBRARY_DRAWING 根：kind=library，rootType 为自身类型',
      nodeType: NodeType.LIBRARY_DRAWING,
      root: { rootId: 'lib-d-1', rootType: NodeType.LIBRARY_DRAWING, ownerId: 'admin-1' },
      expect: (ctx) => {
        expect(ctx.kind).toBe('library');
        if (ctx.kind === 'library') {
          expect(ctx.rootType).toBe(NodeType.LIBRARY_DRAWING);
        }
      },
    },
    {
      name: 'LIBRARY_BLOCK 根：kind=library，rootType 为自身类型',
      nodeType: NodeType.LIBRARY_BLOCK,
      root: { rootId: 'lib-b-1', rootType: NodeType.LIBRARY_BLOCK, ownerId: 'admin-1' },
      expect: (ctx) => {
        expect(ctx.kind).toBe('library');
        if (ctx.kind === 'library') {
          expect(ctx.rootType).toBe(NodeType.LIBRARY_BLOCK);
        }
      },
    },
    {
      name: 'FILE 子节点（项目内）：kind=project，projectId=项目根',
      nodeType: NodeType.FILE,
      root: { rootId: 'proj-1', rootType: NodeType.PROJECT, ownerId: 'owner-1' },
      expect: (ctx) => {
        expect(ctx.kind).toBe('project');
        if (ctx.kind === 'project') {
          expect(ctx.projectId).toBe('proj-1');
        }
      },
    },
    {
      name: 'FOLDER 子节点（个人空间内）：kind=project，projectId=个人空间根',
      nodeType: NodeType.FOLDER,
      root: { rootId: 'ps-1', rootType: NodeType.PERSONAL_SPACE, ownerId: 'owner-1' },
      expect: (ctx) => {
        expect(ctx.kind).toBe('project');
        if (ctx.kind === 'project') {
          expect(ctx.projectId).toBe('ps-1');
        }
      },
    },
  ];

  it.each(CASES)('$name', async ({ nodeType, root, expect: assertCtx }) => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType,
      ownerId: root?.ownerId ?? null,
    });
    treeWalker.resolveRootContext.mockResolvedValue(root);

    const ctx = await resolver.resolve({ body: { nodeId: 'node-1' } });

    assertCtx(ctx);
  });

  it('库内 FOLDER 子节点：kind=library，rootType=库根类型（上溯判定）', async () => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType: NodeType.FOLDER,
      ownerId: 'admin-1',
    });
    treeWalker.resolveRootContext.mockResolvedValue({
      rootId: 'lib-d-1',
      rootType: NodeType.LIBRARY_DRAWING,
      ownerId: 'admin-1',
    });

    const ctx = await resolver.resolve({ body: { nodeId: 'lib-folder-1' } });

    expect(ctx.kind).toBe('library');
    if (ctx.kind === 'library') {
      expect(ctx.rootType).toBe(NodeType.LIBRARY_DRAWING);
    }
  });

  it('孤立节点（存在但上溯不到根）：kind=nodeOwner，按 owner 兜底', async () => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType: NodeType.FILE,
      ownerId: 'owner-1',
    });
    treeWalker.resolveRootContext.mockResolvedValue(null);

    const ctx = await resolver.resolve({ body: { nodeId: 'orphan-1' } });

    expect(ctx.kind).toBe('nodeOwner');
    if (ctx.kind === 'nodeOwner') {
      expect(ctx.ownerId).toBe('owner-1');
    }
  });

  it('孤立节点但请求带 projectId：kind=project（请求参数兜底）', async () => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType: NodeType.FILE,
      ownerId: 'owner-1',
    });
    treeWalker.resolveRootContext
      .mockResolvedValueOnce(null) // 节点上溯无根
      .mockResolvedValue({
        rootId: 'proj-9',
        rootType: NodeType.PROJECT,
        ownerId: 'owner-9',
      }); // 请求 projectId 解析

    const ctx = await resolver.resolve({
      body: { nodeId: 'orphan-1', projectId: 'proj-9' },
    });

    expect(ctx.kind).toBe('project');
    if (ctx.kind === 'project') {
      expect(ctx.projectId).toBe('proj-9');
    }
  });

  it('节点缺失（元数据查询失败）：kind=none', async () => {
    fileTreeService.getNodeTypeAndOwner.mockRejectedValue(new Error('boom'));
    treeWalker.resolveRootContext.mockResolvedValue(null);

    const ctx = await resolver.resolve({ body: { nodeId: 'missing-1' } });

    expect(ctx.kind).toBe('none');
  });

  it('无 nodeId：kind=none', async () => {
    const ctx = await resolver.resolve({ body: {} });

    expect(ctx.kind).toBe('none');
    expect(ctx.nodeId).toBeNull();
  });
});
