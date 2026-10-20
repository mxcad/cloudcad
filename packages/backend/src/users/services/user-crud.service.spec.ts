import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserCrudService } from './user-crud.service';
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { DatabaseService } from '../../database/database.service';
import { MembershipService } from '../../vip/membership.service';
import { StorageInfoService } from '../../file-system/storage-quota/storage-info.service';
import { StorageUsageService } from '../../vip/storage-usage/storage-usage.service';
import { PASSWORD_HASHER } from '../interfaces/password-hasher.interface';
import { PasswordPolicyService } from '../../auth/services/password-policy.service';
import { PiiCryptoService } from '../../common/pii/pii-crypto.service';
import { ACCOUNT_EVENTS_CHANNEL } from '../account-events-sse.constants';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';

describe('UserCrudService.updateMembership', () => {
  let service: UserCrudService;
  let prisma: any;
  let storageInfoService: { invalidateQuotaCache: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      userMembership: {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      vipTier: {
        aggregate: jest.fn().mockResolvedValue({ _max: { level: 2 } }),
      },
    };

    storageInfoService = {
      invalidateQuotaCache: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UserCrudService,
        { provide: DatabaseService, useValue: prisma },
        { provide: PermissionCacheService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: RuntimeConfigService, useValue: {} },
        { provide: PASSWORD_HASHER, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: MembershipService,
          useValue: { hasValidExternalWatermark: jest.fn().mockResolvedValue(false) },
        },
        { provide: StorageInfoService, useValue: storageInfoService },
        {
          provide: StorageUsageService,
          useValue: { usageSize: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: PasswordPolicyService,
          useValue: {
            assertPasswordPolicy: jest.fn(),
            getPasswordChangeStatus: jest.fn(),
          },
        },
        {
          provide: PiiCryptoService,
          useValue: {
            emailHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            phoneHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            derivePiiFields: jest.fn(() => ({})),
          },
        },
      ],
    }).compile();

    service = module.get(UserCrudService);
    eventEmitter = module.get(EventEmitter2) as { emit: jest.Mock };
  });

  it('should throw NotFoundException when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.updateMembership('user-1', 1, '2026-12-31')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should reject active membership without expiry time', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(service.updateMembership('user-1', 1, undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.userMembership.upsert).not.toHaveBeenCalled();
  });

  it('should reject tier above max configured level', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(
      service.updateMembership('user-1', 3, '2026-12-31'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should upsert membership with parsed expiry date', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.userMembership.upsert.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await service.updateMembership('user-1', 1, '2026-12-31T00:00:00.000Z');

    expect(prisma.userMembership.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      },
      update: {
        tierLevel: 1,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      },
    });
    expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
      'user-1'
    );
    // 写库后向该用户通道推送账户事件，已登录端（PC/移动）经 SSE 收到即刷新会员态
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      ACCOUNT_EVENTS_CHANNEL('user-1'),
      { type: 'membership-changed' }
    );
  });

  it('should remove membership when tier is 0', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await service.updateMembership('user-1', 0, undefined);

    expect(prisma.userMembership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
      'user-1'
    );
    // 移除分支同样推送（已登录端需立即感知会员被取消）
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      ACCOUNT_EVENTS_CHANNEL('user-1'),
      { type: 'membership-changed' }
    );
  });
});

/**
 * UserCrudService.update 的三条不变量接线验证（判定逻辑见 admin-privilege-guard.spec.ts）：
 * - 操作者不得改自己的角色 / 状态（自我降权会把账户锁死在用户管理页之外）
 * - 不得让「持有 SYSTEM_USER_UPDATE 的账号」归零（换角色与改状态两条路径都要拦）
 */
describe('UserCrudService.update（自我降权 / 最后一个管理员）', () => {
  let service: UserCrudService;
  let prisma: any;
  let permissionCacheService: { clearUserCache: jest.Mock };
  let auditLogService: { log: jest.Mock };

  const adminUser = {
    id: 'user-1',
    email: 'admin@x.com',
    username: 'admin',
    roleId: 'role-admin',
    status: 'ACTIVE',
  };

  const updatedUser = {
    ...adminUser,
    role: {
      id: 'role-admin',
      name: 'ADMIN',
      description: null,
      isSystem: true,
      permissions: [],
    },
    membership: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      rolePermission: { count: jest.fn() },
    };
    permissionCacheService = { clearUserCache: jest.fn() };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        UserCrudService,
        { provide: DatabaseService, useValue: prisma },
        { provide: PermissionCacheService, useValue: permissionCacheService },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: RuntimeConfigService, useValue: {} },
        { provide: PASSWORD_HASHER, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: MembershipService,
          useValue: { hasValidExternalWatermark: jest.fn().mockResolvedValue(false) },
        },
        { provide: StorageInfoService, useValue: {} },
        {
          provide: StorageUsageService,
          useValue: { usageSize: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: PasswordPolicyService,
          useValue: {
            assertPasswordPolicy: jest.fn(),
            getPasswordChangeStatus: jest.fn(),
          },
        },
        {
          provide: PiiCryptoService,
          useValue: {
            emailHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            phoneHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            derivePiiFields: jest.fn(() => ({})),
          },
        },
      ],
    }).compile();

    service = module.get(UserCrudService);
  });

  // clearMocks/restoreMocks/resetMocks 全 true 会在每个用例前清掉实现，
  // 故默认值必须在用例内显式重建（beforeEach 里设的 jest.fn 实现会被重置）
  const defineMocks = (overrides: {
    otherAdmins?: number;
    grants?: Record<string, boolean>;
  } = {}) => {
    prisma.user.findUnique.mockResolvedValue(adminUser);
    prisma.user.update.mockResolvedValue(updatedUser);
    prisma.user.count.mockResolvedValue(overrides.otherAdmins ?? 0);
    const grants = overrides.grants ?? {};
    prisma.rolePermission.count.mockImplementation(
      async ({ where }: { where: { roleId: string } }) =>
        (grants[where.roleId] ? 1 : 0)
    );
  };

  it('操作者改自己的角色 → 403 且不写库', async () => {
    defineMocks();

    await expect(
      service.update('user-1', { roleId: 'role-user' } as never, 'user-1')
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('管理员改自己的账户状态 → 403 且不写库', async () => {
    defineMocks();

    await expect(
      service.update('user-1', { status: 'SUSPENDED' } as never, 'user-1')
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('改别人的角色 → 放行并清权限缓存', async () => {
    defineMocks();

    await service.update('user-1', { roleId: 'role-user' } as never, 'admin-1');

    expect(prisma.user.update).toHaveBeenCalled();
    expect(permissionCacheService.clearUserCache).toHaveBeenCalledWith('user-1');
  });

  it('把唯一持用户管理权的账号换成非管理员角色 → 409', async () => {
    defineMocks({ grants: { 'role-admin': true }, otherAdmins: 0 });

    await expect(
      service.update('user-1', { roleId: 'role-user' } as never, 'admin-1')
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('降级但仍有其他管理员 → 放行', async () => {
    defineMocks({ grants: { 'role-admin': true }, otherAdmins: 2 });

    await service.update('user-1', { roleId: 'role-user' } as never, 'admin-1');

    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('把唯一管理员的状态改为非 ACTIVE → 409', async () => {
    defineMocks({ grants: { 'role-admin': true }, otherAdmins: 0 });

    await expect(
      service.update('user-1', { status: 'INACTIVE' } as never, 'admin-1')
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('角色与状态均未变（幂等保存自己的行）→ 放行', async () => {
    defineMocks();

    await service.update(
      'user-1',
      { roleId: 'role-admin', status: 'ACTIVE' } as never,
      'user-1'
    );

    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('#487 改角色 → 记 USER_ROLE_CHANGE 审计（resourceType=USER，params 记 old/new）', async () => {
    defineMocks();

    await service.update('user-1', { roleId: 'role-user' } as never, 'admin-1');

    expect(auditLogService.log).toHaveBeenCalledWith({
      action: AuditAction.USER_ROLE_CHANGE,
      resourceType: ResourceType.USER,
      resourceId: 'user-1',
      userId: 'admin-1',
      success: true,
      resourceName: 'admin@x.com',
      params: { oldRoleId: 'role-admin', newRoleId: 'role-user' },
    });
  });

  it('#487 改状态 → 记 USER_STATUS_CHANGE 审计', async () => {
    defineMocks();

    await service.update('user-1', { status: 'SUSPENDED' } as never, 'admin-1');

    expect(auditLogService.log).toHaveBeenCalledWith({
      action: AuditAction.USER_STATUS_CHANGE,
      resourceType: ResourceType.USER,
      resourceId: 'user-1',
      userId: 'admin-1',
      success: true,
      resourceName: 'admin@x.com',
      params: { oldStatus: 'ACTIVE', newStatus: 'SUSPENDED' },
    });
  });

  it('#487 角色与状态均未变 → 不记审计（避免幂等保存灌噪音）', async () => {
    defineMocks();

    await service.update(
      'user-1',
      { roleId: 'role-admin', status: 'ACTIVE' } as never,
      'user-1'
    );

    expect(prisma.user.update).toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });
});
