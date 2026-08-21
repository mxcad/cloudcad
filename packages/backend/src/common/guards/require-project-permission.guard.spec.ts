// //////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// //////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../../database/database.service';
import { NodeContextResolver } from '../node-context/node-context-resolver';
import { NodeContext } from '../node-context/node-context.types';
import { IPROJECT_PERMISSION_SERVICE } from '../../roles/interfaces/project-permission-service.interface';
import { IPERMISSION_SERVICE } from '../../permission/interfaces/permission-service.interface';
import {
  SystemPermission,
  ProjectPermission,
} from '../enums/permissions.enum';
import {
  REQUIRE_PROJECT_PERMISSION_KEY,
  REQUIRE_PROJECT_PERMISSION_MODE_KEY,
  ProjectPermissionCheckMode,
} from '../decorators/require-project-permission.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../../auth/decorators/optional-auth.decorator';
import { IS_LIBRARY_PUBLIC_KEY } from '../decorators/library-public.decorator';
import { RequireProjectPermissionGuard } from './require-project-permission.guard';

describe('RequireProjectPermissionGuard — 公共资源库', () => {
  let guard: RequireProjectPermissionGuard;
  let reflector: Record<string, jest.Mock>;
  let nodeContextResolver: Record<string, jest.Mock>;
  let systemPermissionService: Record<string, jest.Mock>;
  let projectPermissionService: Record<string, jest.Mock>;
  let prisma: any;

  const libraryCtx = (overrides: Partial<NodeContext> = {}): NodeContext => ({
    nodeId: 'folder-1',
    projectId: null,
    nodeType: NodeType.FOLDER,
    ownerId: 'admin-a',
    isLibraryNode: true,
    isPersonalSpace: false,
    libraryRootType: NodeType.LIBRARY_DRAWING,
    ...overrides,
  });

  beforeEach(async () => {
    reflector = {
      get: jest.fn(),
      getAllAndOverride: jest.fn(),
    };
    nodeContextResolver = { resolve: jest.fn() };
    systemPermissionService = { checkSystemPermission: jest.fn() };
    projectPermissionService = {
      isProjectOwner: jest.fn(),
      checkPermission: jest.fn(),
    };
    prisma = { fileSystemNode: { findUnique: jest.fn() } };

    // 默认：要求 FILE_CREATE，ALL 模式，非 OptionalAuth，非 LibraryPublic
    const meta = (key: string) => {
      if (key === REQUIRE_PROJECT_PERMISSION_KEY) {
        return ['FILE_CREATE'];
      }
      if (key === REQUIRE_PROJECT_PERMISSION_MODE_KEY) {
        return ProjectPermissionCheckMode.ALL;
      }
      return undefined;
    };
    reflector.get.mockImplementation(meta);
    reflector.getAllAndOverride.mockImplementation(meta);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequireProjectPermissionGuard,
        { provide: Reflector, useValue: reflector },
        {
          provide: IPROJECT_PERMISSION_SERVICE,
          useValue: projectPermissionService,
        },
        { provide: IPERMISSION_SERVICE, useValue: systemPermissionService },
        { provide: NodeContextResolver, useValue: nodeContextResolver },
        { provide: DatabaseService, useValue: prisma },
      ],
    }).compile();

    guard = module.get(RequireProjectPermissionGuard);
  });

  const buildRequest = (ctx: NodeContext, userId = 'admin-b') => {
    nodeContextResolver.resolve.mockResolvedValue(ctx);
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: userId } }),
      }),
    } as any;
  };

  it('upload to folder inside library requires LIBRARY_DRAWING_MANAGE (not BLOCK)', async () => {
    systemPermissionService.checkSystemPermission.mockResolvedValue(true);

    const result = await guard.canActivate(buildRequest(libraryCtx()));

    expect(result).toBe(true);
    expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
      'admin-b',
      SystemPermission.LIBRARY_DRAWING_MANAGE
    );
  });

  it('upload to folder inside block library requires LIBRARY_BLOCK_MANAGE', async () => {
    systemPermissionService.checkSystemPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      buildRequest(
        libraryCtx({
          nodeType: NodeType.FOLDER,
          libraryRootType: NodeType.LIBRARY_BLOCK,
        })
      )
    );

    expect(result).toBe(true);
    expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
      'admin-b',
      SystemPermission.LIBRARY_BLOCK_MANAGE
    );
  });

  it('allowed with permission even when not the folder owner (no more ownerId misjudgement)', async () => {
    systemPermissionService.checkSystemPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      buildRequest(libraryCtx({ ownerId: 'admin-a' }), 'admin-b')
    );

    expect(result).toBe(true);
  });

  it('rejects with 403 when LIBRARY_DRAWING_MANAGE is missing', async () => {
    systemPermissionService.checkSystemPermission.mockResolvedValue(false);

    await expect(
      guard.canActivate(buildRequest(libraryCtx()))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('library root: judged directly by its own type', async () => {
    systemPermissionService.checkSystemPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      buildRequest(
        libraryCtx({
          nodeId: 'lib-1',
          nodeType: NodeType.LIBRARY_DRAWING,
          libraryRootType: NodeType.LIBRARY_DRAWING,
        })
      )
    );

    expect(result).toBe(true);
    expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
      'admin-b',
      SystemPermission.LIBRARY_DRAWING_MANAGE
    );
  });

  // ============ 下载分支（架构切片 T6）：库节点下载查 LIBRARY_*_MANAGE，项目节点查 FILE_DOWNLOAD ============

  /** 按下载端点的装饰器（@RequireProjectPermission(FILE_DOWNLOAD)）解析元数据 */
  const requireDownloadPermission = () => {
    const meta = (key: string) => {
      if (key === REQUIRE_PROJECT_PERMISSION_KEY) {
        return [ProjectPermission.FILE_DOWNLOAD];
      }
      if (key === REQUIRE_PROJECT_PERMISSION_MODE_KEY) {
        return ProjectPermissionCheckMode.ALL;
      }
      return undefined;
    };
    reflector.get.mockImplementation(meta);
    reflector.getAllAndOverride.mockImplementation(meta);
  };

  it('库节点下载（FILE_DOWNLOAD 装饰器）分派到 LIBRARY_DRAWING_MANAGE，而非项目权限', async () => {
    requireDownloadPermission();
    systemPermissionService.checkSystemPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      buildRequest(
        libraryCtx({
          nodeId: 'lib-file-1',
          nodeType: NodeType.FILE,
          libraryRootType: NodeType.LIBRARY_DRAWING,
        })
      )
    );

    expect(result).toBe(true);
    expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
      'admin-b',
      SystemPermission.LIBRARY_DRAWING_MANAGE
    );
    expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
  });

  it('图块库节点下载（FILE_DOWNLOAD 装饰器）分派到 LIBRARY_BLOCK_MANAGE', async () => {
    requireDownloadPermission();
    systemPermissionService.checkSystemPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      buildRequest(
        libraryCtx({
          nodeId: 'lib-file-2',
          nodeType: NodeType.FILE,
          libraryRootType: NodeType.LIBRARY_BLOCK,
        })
      )
    );

    expect(result).toBe(true);
    expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
      'admin-b',
      SystemPermission.LIBRARY_BLOCK_MANAGE
    );
  });

  it('库节点下载缺少 LIBRARY_DRAWING_MANAGE 时拒绝 403', async () => {
    requireDownloadPermission();
    systemPermissionService.checkSystemPermission.mockResolvedValue(false);

    await expect(
      guard.canActivate(buildRequest(libraryCtx()))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('项目节点下载（非所有者）按 FILE_DOWNLOAD 项目权限校验', async () => {
    requireDownloadPermission();
    projectPermissionService.isProjectOwner.mockResolvedValue(false);
    projectPermissionService.checkPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      buildRequest({
        nodeId: 'proj-file-1',
        projectId: 'proj-1',
        nodeType: NodeType.FILE,
        ownerId: 'owner-a',
        isLibraryNode: false,
        isPersonalSpace: false,
        libraryRootType: null,
      })
    );

    expect(result).toBe(true);
    expect(projectPermissionService.isProjectOwner).toHaveBeenCalledWith(
      'admin-b',
      'proj-1'
    );
    expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
      'admin-b',
      'proj-1',
      ProjectPermission.FILE_DOWNLOAD
    );
    expect(systemPermissionService.checkSystemPermission).not.toHaveBeenCalled();
  });

  it('项目所有者下载直接放行，不查项目权限', async () => {
    requireDownloadPermission();
    projectPermissionService.isProjectOwner.mockResolvedValue(true);

    const result = await guard.canActivate(
      buildRequest({
        nodeId: 'proj-file-2',
        projectId: 'proj-1',
        nodeType: NodeType.FILE,
        ownerId: 'owner-a',
        isLibraryNode: false,
        isPersonalSpace: false,
        libraryRootType: null,
      })
    );

    expect(result).toBe(true);
    expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
  });

  it('项目节点下载缺少 FILE_DOWNLOAD 时拒绝 403', async () => {
    requireDownloadPermission();
    projectPermissionService.isProjectOwner.mockResolvedValue(false);
    projectPermissionService.checkPermission.mockResolvedValue(false);

    await expect(
      guard.canActivate(
        buildRequest({
          nodeId: 'proj-file-3',
          projectId: 'proj-1',
          nodeType: NodeType.FILE,
          ownerId: 'owner-a',
          isLibraryNode: false,
          isPersonalSpace: false,
          libraryRootType: null,
        })
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
