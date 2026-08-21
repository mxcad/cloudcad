// //////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// //////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { NodeContextResolver } from './node-context-resolver';

describe('NodeContextResolver', () => {
  let resolver: NodeContextResolver;
  let prisma: any;
  let fileTreeService: Record<string, jest.Mock>;

  const nodeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'node-1',
    nodeType: NodeType.FILE,
    projectId: null,
    ownerId: 'user-1',
    parentId: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      fileSystemNode: {
        findUnique: jest.fn(),
      },
    };
    fileTreeService = {
      getNodeTypeAndOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeContextResolver,
        { provide: DatabaseService, useValue: prisma },
        { provide: FileTreeService, useValue: fileTreeService },
      ],
    }).compile();

    resolver = module.get(NodeContextResolver);
  });

  it('library root: isLibraryNode=true and libraryRootType=its own type', async () => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType: NodeType.LIBRARY_DRAWING,
      ownerId: 'admin-1',
    });

    const ctx = await resolver.resolve({ body: { nodeId: 'lib-1' } });

    expect(ctx.isLibraryNode).toBe(true);
    expect(ctx.libraryRootType).toBe(NodeType.LIBRARY_DRAWING);
  });

  it('folder inside library: resolved to library root type', async () => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType: NodeType.FOLDER,
      ownerId: 'admin-1',
    });
    prisma.fileSystemNode.findUnique
      .mockResolvedValueOnce(
        nodeRow({
          id: 'folder-1',
          nodeType: NodeType.FOLDER,
          parentId: 'lib-1',
        })
      )
      .mockResolvedValueOnce(
        nodeRow({
          id: 'lib-1',
          nodeType: NodeType.LIBRARY_DRAWING,
          parentId: null,
        })
      );

    const ctx = await resolver.resolve({ body: { nodeId: 'folder-1' } });

    expect(ctx.isLibraryNode).toBe(true);
    expect(ctx.libraryRootType).toBe(NodeType.LIBRARY_DRAWING);
  });

  it('file inside library: resolved to library root type, projectId=library root id', async () => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType: NodeType.FILE,
      ownerId: 'admin-1',
    });
    prisma.fileSystemNode.findUnique
      .mockResolvedValueOnce(
        nodeRow({ id: 'file-1', nodeType: NodeType.FILE, parentId: 'lib-1' })
      )
      .mockResolvedValueOnce(
        nodeRow({
          id: 'lib-1',
          nodeType: NodeType.LIBRARY_DRAWING,
          parentId: null,
        })
      );

    const ctx = await resolver.resolve({ body: { nodeId: 'file-1' } });

    expect(ctx.isLibraryNode).toBe(true);
    expect(ctx.libraryRootType).toBe(NodeType.LIBRARY_DRAWING);
  });

  it('folder inside regular project: not a library, projectId=project root', async () => {
    fileTreeService.getNodeTypeAndOwner.mockResolvedValue({
      nodeType: NodeType.FOLDER,
      ownerId: 'user-1',
    });
    prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === 'folder-1') {
        return Promise.resolve(
          nodeRow({
            id: 'folder-1',
            nodeType: NodeType.FOLDER,
            parentId: 'proj-1',
          })
        );
      }
      if (where.id === 'proj-1') {
        return Promise.resolve(
          nodeRow({ id: 'proj-1', nodeType: NodeType.PROJECT, parentId: null })
        );
      }
      return Promise.resolve(null);
    });

    const ctx = await resolver.resolve({ body: { nodeId: 'folder-1' } });

    expect(ctx.isLibraryNode).toBe(false);
    expect(ctx.libraryRootType).toBeNull();
    expect(ctx.projectId).toBe('proj-1');
  });

  it('no nodeId: not a library context', async () => {
    const ctx = await resolver.resolve({ body: {} });

    expect(ctx.isLibraryNode).toBe(false);
    expect(ctx.libraryRootType).toBeNull();
    expect(ctx.nodeId).toBeNull();
  });
});
