import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { NodeType } from '@cloudcad/db';
import type { OwnershipNode } from '../interfaces/ownership-permission-strategy.interface';
import { PersonalPermissionStrategy } from './personal-permission.strategy';

describe('PersonalPermissionStrategy', () => {
  let strategy: PersonalPermissionStrategy;

  const node = (overrides: Partial<OwnershipNode> = {}): OwnershipNode => ({
    id: 'space-1',
    nodeType: NodeType.PERSONAL_SPACE,
    projectId: null,
    ownerId: 'user-1',
    parentId: null,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PersonalPermissionStrategy],
    }).compile();

    strategy = module.get(PersonalPermissionStrategy);
  });

  describe('when 操作者为个人空间 owner', () => {
    it('任意动作放行', async () => {
      await expect(
        strategy.assertCan('user-1', 'upload', node())
      ).resolves.toBeUndefined();
    });
  });

  describe('when 操作者非 owner', () => {
    it('抛 ForbiddenException', async () => {
      await expect(
        strategy.assertCan('user-2', 'upload', node())
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('when ownerId 为空', () => {
    it('放行（原 guard 语义）', async () => {
      await expect(
        strategy.assertCan('user-2', 'upload', node({ ownerId: null }))
      ).resolves.toBeUndefined();
    });
  });
});
