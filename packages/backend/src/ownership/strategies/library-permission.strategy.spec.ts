import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { NodeType } from '@cloudcad/db';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { IPERMISSION_SERVICE } from '../../permission/interfaces/permission-service.interface';
import type { OwnershipNode } from '../interfaces/ownership-permission-strategy.interface';
import { LibraryPermissionStrategy } from './library-permission.strategy';

describe('LibraryPermissionStrategy', () => {
  let strategy: LibraryPermissionStrategy;
  let systemPermissionService: Record<string, jest.Mock>;

  const node = (overrides: Partial<OwnershipNode> = {}): OwnershipNode => ({
    id: 'lib-1',
    nodeType: NodeType.LIBRARY_DRAWING,
    projectId: null,
    ownerId: null,
    parentId: null,
    ...overrides,
  });

  beforeEach(async () => {
    systemPermissionService = {
      checkSystemPermission: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryPermissionStrategy,
        {
          provide: IPERMISSION_SERVICE,
          useValue: systemPermissionService,
        },
      ],
    }).compile();

    strategy = module.get(LibraryPermissionStrategy);
  });

  describe('when 图纸库节点', () => {
    it('要求 LIBRARY_DRAWING_MANAGE 系统权限', async () => {
      await strategy.assertCan('user-1', 'upload', node());
      expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'user-1',
        SystemPermission.LIBRARY_DRAWING_MANAGE
      );
    });

    it('无权限时抛 ForbiddenException', async () => {
      systemPermissionService.checkSystemPermission.mockResolvedValue(false);
      await expect(
        strategy.assertCan('user-1', 'upload', node())
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('when 图块库节点', () => {
    it('要求 LIBRARY_BLOCK_MANAGE 系统权限', async () => {
      await strategy.assertCan(
        'user-1',
        'upload',
        node({ nodeType: NodeType.LIBRARY_BLOCK })
      );
      expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'user-1',
        SystemPermission.LIBRARY_BLOCK_MANAGE
      );
    });

    it('无权限时抛 ForbiddenException', async () => {
      systemPermissionService.checkSystemPermission.mockResolvedValue(false);
      await expect(
        strategy.assertCan(
          'user-1',
          'upload',
          node({ nodeType: NodeType.LIBRARY_BLOCK })
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('when 库内 FILE/FOLDER 节点（按归属根类型判定）', () => {
    it('归属图纸库：要求 LIBRARY_DRAWING_MANAGE 而非 LIBRARY_BLOCK_MANAGE', async () => {
      await strategy.assertCan(
        'user-1',
        'create',
        node({
          id: 'folder-1',
          nodeType: NodeType.FOLDER,
          projectId: 'lib-1',
          parentId: 'lib-1',
          rootNodeType: NodeType.LIBRARY_DRAWING,
        })
      );
      expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'user-1',
        SystemPermission.LIBRARY_DRAWING_MANAGE
      );
    });

    it('归属图块库：要求 LIBRARY_BLOCK_MANAGE', async () => {
      await strategy.assertCan(
        'user-1',
        'create',
        node({
          id: 'folder-1',
          nodeType: NodeType.FOLDER,
          projectId: 'lib-2',
          parentId: 'lib-2',
          rootNodeType: NodeType.LIBRARY_BLOCK,
        })
      );
      expect(systemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'user-1',
        SystemPermission.LIBRARY_BLOCK_MANAGE
      );
    });
  });
});
