import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { NodeType } from '@cloudcad/db';
import { IPROJECT_PERMISSION_SERVICE } from '../../roles/interfaces/project-permission-service.interface';
import {
  PROJECT_ACTION_PERMISSION,
  type MutationAction,
  type OwnershipNode,
} from '../interfaces/ownership-permission-strategy.interface';
import { ProjectPermissionStrategy } from './project-permission.strategy';

describe('ProjectPermissionStrategy', () => {
  let strategy: ProjectPermissionStrategy;
  let projectPermissionService: Record<string, jest.Mock>;

  const node = (overrides: Partial<OwnershipNode> = {}): OwnershipNode => ({
    id: 'node-1',
    nodeType: NodeType.FILE,
    projectId: 'project-1',
    ownerId: 'user-1',
    parentId: null,
    ...overrides,
  });

  beforeEach(async () => {
    projectPermissionService = {
      isProjectOwner: jest.fn().mockResolvedValue(false),
      checkPermission: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPermissionStrategy,
        {
          provide: IPROJECT_PERMISSION_SERVICE,
          useValue: projectPermissionService,
        },
      ],
    }).compile();

    strategy = module.get(ProjectPermissionStrategy);
  });

  describe('项目成员按动作映射检查项目权限', () => {
    it.each(
      Object.entries(PROJECT_ACTION_PERMISSION) as [
        MutationAction,
        (typeof PROJECT_ACTION_PERMISSION)[MutationAction],
      ][]
    )('动作 %s → %s', async (action, expectedPermission) => {
      await expect(
        strategy.assertCan('user-2', action, node())
      ).resolves.toBeUndefined();
      expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
        'user-2',
        'project-1',
        expectedPermission
      );
    });
  });

  describe('when 项目内 FILE/FOLDER', () => {
    it('文件 owner 不直接放行，仍走项目权限（防绕过）', async () => {
      await strategy.assertCan('user-1', 'delete', node());
      expect(projectPermissionService.isProjectOwner).toHaveBeenCalledWith(
        'user-1',
        'project-1'
      );
      expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        PROJECT_ACTION_PERMISSION.delete
      );
    });

    it('folder 节点同样强制走项目权限', async () => {
      await strategy.assertCan(
        'user-1',
        'trash',
        node({ nodeType: NodeType.FOLDER })
      );
      expect(projectPermissionService.checkPermission).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        PROJECT_ACTION_PERMISSION.trash
      );
    });
  });

  describe('when 项目所有者', () => {
    it('直接放行且不检查动作权限', async () => {
      projectPermissionService.isProjectOwner.mockResolvedValue(true);
      await expect(
        strategy.assertCan('user-1', 'delete', node())
      ).resolves.toBeUndefined();
      expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
    });
  });

  describe('when 根类型节点', () => {
    it('节点 owner 直接放行（不调任何 service）', async () => {
      await expect(
        strategy.assertCan(
          'user-1',
          'project-update',
          node({ nodeType: NodeType.PROJECT, projectId: null, ownerId: 'user-1' })
        )
      ).resolves.toBeUndefined();
      expect(projectPermissionService.isProjectOwner).not.toHaveBeenCalled();
      expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
    });

    it('非 owner 且无 projectId 时拒绝', async () => {
      await expect(
        strategy.assertCan(
          'user-2',
          'project-update',
          node({ nodeType: NodeType.PROJECT, projectId: null, ownerId: 'user-1' })
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('when 无 projectId', () => {
    it('ownerId 为空时放行', async () => {
      await expect(
        strategy.assertCan('user-2', 'update', node({ projectId: null, ownerId: null }))
      ).resolves.toBeUndefined();
    });

    it('ownerId 与 userId 相同且非根类型时放行', async () => {
      await expect(
        strategy.assertCan('user-1', 'update', node({ projectId: null }))
      ).resolves.toBeUndefined();
    });
  });

  describe('when 成员缺少动作权限', () => {
    it('抛 ForbiddenException', async () => {
      projectPermissionService.checkPermission.mockResolvedValue(false);
      await expect(
        strategy.assertCan('user-2', 'delete', node())
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
