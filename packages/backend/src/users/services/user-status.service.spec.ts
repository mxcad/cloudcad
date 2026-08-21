import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserStatusService } from './user-status.service';
import { UserCleanupService } from '../../user-cleanup/user-cleanup.service';
import { DatabaseService } from '../../database/database.service';
import { VERIFICATION_STRATEGIES } from '../interfaces/account-verification-strategy.interface';
import { AuditLogService } from '../../audit/audit-log.service';

/**
 * UserStatusService 注销/恢复行为：
 * - 自助注销保留绑定信息（冷静期内任意渠道登录可自动恢复）+ 标记 deactivatedBy='SELF'
 * - 管理员软删标记 deactivatedBy='ADMIN'（不自动恢复）
 * - 自助恢复仅限冷静期内（读运行时配置 userCancelGraceDays）且仅 SELF 来源
 */
describe('UserStatusService（注销/恢复）', () => {
  let service: UserStatusService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const mockCleanupService = {
    deleteUserCompletely: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn().mockResolvedValue(7),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const passwordStrategy = {
    type: 'password',
    canHandle: jest.fn().mockReturnValue(true),
    validateUser: jest.fn().mockReturnValue(true),
    verify: jest.fn().mockResolvedValue({ valid: true }),
  };

  const baseUser = {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    password: 'hashed',
    phone: '13800138000',
    phoneVerified: true,
    wechatId: 'wx-openid',
    status: 'ACTIVE',
    deletedAt: null,
    deactivatedBy: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // resetMocks:true 会清空 jest.fn 实现，这里重设策略 mock
    passwordStrategy.canHandle.mockReturnValue(true);
    passwordStrategy.validateUser.mockReturnValue(true);
    passwordStrategy.verify.mockResolvedValue({ valid: true });
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: { name: 'USER' } });
    mockPrisma.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...baseUser,
      ...data,
      role: { name: 'USER' },
    }));
    mockRuntimeConfigService.getValue.mockResolvedValue(7);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserStatusService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: UserCleanupService, useValue: mockCleanupService },
        { provide: 'CONFIG', useValue: mockRuntimeConfigService },
        { provide: VERIFICATION_STRATEGIES, useValue: [passwordStrategy] },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();
    service = module.get<UserStatusService>(UserStatusService);
  });

  it('自助注销：保留手机/邮箱/微信绑定，写 deactivatedBy=SELF，删除刷新令牌', async () => {
    await service.deactivate('user-1', 'password123');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        deletedAt: expect.any(Date),
        status: 'INACTIVE',
        deactivatedBy: 'SELF',
      },
    });
    // 不得清空绑定信息（冷静期内需支持任意渠道登录自动恢复）
    const updateData = mockPrisma.user.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData).not.toHaveProperty('phone', null);
    expect(updateData).not.toHaveProperty('email', null);
    expect(updateData).not.toHaveProperty('wechatId', null);
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('user.deactivated', expect.any(Object));
    // 账号安全审计：自助注销成功（操作者=目标用户本人）
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      'USER_DEACTIVATE',
      'USER',
      'user-1',
      'user-1',
      true,
      undefined,
      undefined,
      undefined,
      'test@example.com',
      { deactivatedBy: 'SELF' }
    );
  });

  it('自助注销失败（验证未通过）时记失败审计', async () => {
    passwordStrategy.verify.mockResolvedValue({ valid: false, message: '密码不正确' });

    await expect(service.deactivate('user-1', 'wrong-password')).rejects.toThrow(
      BadRequestException
    );

    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      'USER_DEACTIVATE',
      'USER',
      'user-1',
      'user-1',
      false,
      expect.stringContaining('密码不正确'),
      undefined,
      undefined,
      'user-1',
      { deactivatedBy: 'SELF' }
    );
  });

  it('管理员软删：写 deactivatedBy=ADMIN（登录不自动恢复）', async () => {
    await service.softDelete('user-1', 'admin-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        deletedAt: expect.any(Date),
        status: 'INACTIVE',
        deactivatedBy: 'ADMIN',
      },
    });
    // 账号安全审计：操作者=管理员，resourceName=目标用户邮箱（名称快照）
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      'USER_DEACTIVATE',
      'USER',
      'user-1',
      'admin-1',
      true,
      undefined,
      undefined,
      undefined,
      'test@example.com',
      { deactivatedBy: 'ADMIN' }
    );
  });

  it('管理员软删失败：记失败审计', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null); // 用户不存在

    await expect(service.softDelete('user-1', 'admin-1')).rejects.toThrow();

    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      'USER_DEACTIVATE',
      'USER',
      'user-1',
      'admin-1',
      false,
      expect.any(String),
      undefined,
      undefined,
      'user-1',
      { deactivatedBy: 'ADMIN' }
    );
  });

  it('自助恢复：冷静期内（默认 7 天）允许，恢复后清除 deactivatedBy', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      deletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 天前注销
      deactivatedBy: 'SELF',
    });

    const result = await service.restoreAccount('user-1', 'password', 'password123');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { deletedAt: null, status: 'ACTIVE', deactivatedBy: null },
    });
    expect(result.message).toBeTruthy();
  });

  it('自助恢复：超过冷静期（userCancelGraceDays）拒绝', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      deletedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 天前注销
      deactivatedBy: 'SELF',
    });

    await expect(service.restoreAccount('user-1', 'password', 'password123')).rejects.toThrow(
      BadRequestException
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('自助恢复：管理员软删账户拒绝自助恢复（需管理员/客服处理）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      deletedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      deactivatedBy: 'ADMIN',
    });

    await expect(service.restoreAccount('user-1', 'password', 'password123')).rejects.toThrow(
      BadRequestException
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
