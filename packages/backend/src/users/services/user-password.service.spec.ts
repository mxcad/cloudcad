import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { UserPasswordService } from './user-password.service';
import { DatabaseService } from '../../database/database.service';
import { PASSWORD_HASHER } from '../interfaces/password-hasher.interface';
import { AuditLogService } from '../../audit/audit-log.service';
import { PasswordPolicyService } from '../../auth/services/password-policy.service';

/**
 * UserPasswordService 账号安全审计：
 * - 修改/设置密码成功记 USER_CHANGE_PASSWORD 成功记录（操作者=目标用户本人）
 * - 失败（旧密码错误等）也记失败记录（有审查价值）
 */
describe('UserPasswordService（修改密码审计）', () => {
  let service: UserPasswordService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const mockPasswordHasher = {
    compare: jest.fn(),
    hash: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockPasswordPolicyService = {
    assertPasswordPolicy: jest.fn(),
    getPasswordChangeStatus: jest
      .fn()
      .mockReturnValue({ required: undefined, expiringSoon: false }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPasswordPolicyService.assertPasswordPolicy.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPasswordService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: PASSWORD_HASHER, useValue: mockPasswordHasher },
        { provide: AuditLogService, useValue: mockAuditLogService },
        {
          provide: PasswordPolicyService,
          useValue: mockPasswordPolicyService,
        },
      ],
    }).compile();
    service = module.get(UserPasswordService);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: '<PASSWORD_STUB_OLD>',
    });
    mockPasswordHasher.compare.mockResolvedValue(true);
    mockPasswordHasher.hash.mockResolvedValue('<PASSWORD_STUB_NEW>');
  });

  it('修改密码成功：删除刷新令牌并记成功审计', async () => {
    const result = await service.changePassword(
      'user-1',
      '<PASSWORD_STUB_OLD>',
      '<PASSWORD_STUB_NEW>'
    );

    expect(result.message).toContain('修改');
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      'USER_CHANGE_PASSWORD',
      'USER',
      'user-1',
      'user-1',
      true,
      undefined,
      undefined,
      undefined,
      'test@example.com',
      { changeType: 'change' }
    );
  });

  it('旧密码错误：抛 ConflictException 并记失败审计', async () => {
    mockPasswordHasher.compare.mockResolvedValue(false);

    await expect(
      service.changePassword(
        'user-1',
        '<PASSWORD_STUB_WRONG>',
        '<PASSWORD_STUB_NEW>'
      )
    ).rejects.toThrow(ConflictException);

    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      'USER_CHANGE_PASSWORD',
      'USER',
      'user-1',
      'user-1',
      false,
      expect.stringContaining('当前密码不正确'),
      undefined,
      undefined,
      'user-1',
      { changeType: 'change' }
    );
  });

  it('未设置密码的用户直接设置密码：changeType=set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: null,
    });

    await service.changePassword('user-1', undefined, '<PASSWORD_STUB_NEW>');

    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      'USER_CHANGE_PASSWORD',
      'USER',
      'user-1',
      'user-1',
      true,
      undefined,
      undefined,
      undefined,
      'test@example.com',
      { changeType: 'set' }
    );
  });
});
