///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { PolicyFactoryService } from './policy-factory.service';
import {
  PolicyConfigService,
  PermissionPolicyConfig,
} from './policy-config.service';
import { PolicyType } from '../enums/policy-type.enum';

describe('PolicyConfigService', () => {
  let service: PolicyConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockPrisma = {
    permissionPolicy: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    policyPermission: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    clearPattern: jest.fn(),
  };

  const mockPolicyFactory = {
    createPolicyUnsafe: jest.fn(),
  };

  const mockPolicyRecord = {
    id: 'policy-1',
    type: PolicyType.TIME,
    name: 'test-policy',
    description: null,
    config: {},
    enabled: true,
    priority: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const expectBothPatternsCleared = () => {
    expect(mockCacheService.clearPattern).toHaveBeenCalledTimes(2);
    expect(mockCacheService.clearPattern).toHaveBeenNthCalledWith(
      1,
      'policy_config:*'
    );
    expect(mockCacheService.clearPattern).toHaveBeenNthCalledWith(
      2,
      'policy:*'
    );
  };

  beforeEach(async () => {
    // resetMocks: true 会清除 mock 实现，构造函数读取 cacheTTL，需重新设置
    mockConfigService.get.mockReturnValue({ policy: 600 });
    mockPolicyFactory.createPolicyUnsafe.mockReturnValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyConfigService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockCacheService },
        { provide: PolicyFactoryService, useValue: mockPolicyFactory },
      ],
    }).compile();

    service = module.get<PolicyConfigService>(PolicyConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // createPolicyConfig
  // =========================================================================

  describe('createPolicyConfig', () => {
    const config: PermissionPolicyConfig = {
      type: PolicyType.TIME,
      name: 'test-policy',
      description: '测试策略',
      config: { start: '09:00', end: '18:00' },
      permissions: [Permission.SYSTEM_ROLE_PERMISSION_MANAGE],
      enabled: true,
      priority: 1,
    };

    describe('when creation succeeds', () => {
      it('should clear policy_config and policy caches by pattern', async () => {
        mockPrisma.permissionPolicy.create.mockResolvedValue(mockPolicyRecord);
        mockPrisma.policyPermission.create.mockResolvedValue({});

        await service.createPolicyConfig(config, 'user-1');

        expectBothPatternsCleared();
      });
    });
  });

  // =========================================================================
  // updatePolicyConfig
  // =========================================================================

  describe('updatePolicyConfig', () => {
    describe('when update succeeds', () => {
      it('should clear policy_config and policy caches by pattern', async () => {
        mockPrisma.permissionPolicy.findUnique.mockResolvedValue({
          ...mockPolicyRecord,
          permissions: [
            { policyId: 'policy-1', permission: Permission.SYSTEM_ROLE_READ },
          ],
        });
        mockPrisma.permissionPolicy.update.mockResolvedValue(mockPolicyRecord);

        await service.updatePolicyConfig(
          'policy-1',
          { name: 'updated-policy' },
          'user-1'
        );

        expectBothPatternsCleared();
      });

      it('should clear caches when permissions are updated', async () => {
        mockPrisma.permissionPolicy.findUnique.mockResolvedValue({
          ...mockPolicyRecord,
          permissions: [],
        });
        mockPrisma.permissionPolicy.update.mockResolvedValue(mockPolicyRecord);
        mockPrisma.policyPermission.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.policyPermission.create.mockResolvedValue({});

        await service.updatePolicyConfig(
          'policy-1',
          { permissions: [Permission.SYSTEM_ROLE_PERMISSION_MANAGE] },
          'user-1'
        );

        expectBothPatternsCleared();
      });
    });
  });

  // =========================================================================
  // deletePolicyConfig
  // =========================================================================

  describe('deletePolicyConfig', () => {
    describe('when deletion succeeds', () => {
      it('should clear policy_config and policy caches by pattern', async () => {
        mockPrisma.policyPermission.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.permissionPolicy.delete.mockResolvedValue(mockPolicyRecord);

        await service.deletePolicyConfig('policy-1', 'user-1');

        expectBothPatternsCleared();
      });
    });
  });

  // =========================================================================
  // togglePolicyConfig
  // =========================================================================

  describe('togglePolicyConfig', () => {
    describe('when toggle succeeds', () => {
      it('should clear caches via updatePolicyConfig', async () => {
        mockPrisma.permissionPolicy.findUnique.mockResolvedValue({
          ...mockPolicyRecord,
          permissions: [],
        });
        mockPrisma.permissionPolicy.update.mockResolvedValue({
          ...mockPolicyRecord,
          enabled: false,
        });

        await service.togglePolicyConfig('policy-1', false, 'user-1');

        expectBothPatternsCleared();
      });
    });
  });
});
