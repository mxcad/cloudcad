import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserPasswordService } from './user-password.service';
import { DatabaseService } from '../../database/database.service';
import { PASSWORD_HASHER } from '../interfaces/password-hasher.interface';
import { AuditLogService } from '../../audit/audit-log.service';
import { PasswordPolicyService } from '../../auth/services/password-policy.service';
import { MfaService } from '../../auth/services/mfa.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';

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

  const mockMfaService = {
    verifyCode: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
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
        { provide: MfaService, useValue: mockMfaService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
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
    // 默认：双因素总闸关闭（step-up 不生效）、动态码验证通过
    mockRuntimeConfigService.getValue.mockResolvedValue(false);
    mockMfaService.verifyCode.mockResolvedValue(true);
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
    expect(mockAuditLogService.log).toHaveBeenCalledWith({
      action: 'USER_CHANGE_PASSWORD',
      resourceType: 'USER',
      resourceId: 'user-1',
      userId: 'user-1',
      success: true,
      resourceName: 'test@example.com',
      params: { changeType: 'change' },
    });
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

    expect(mockAuditLogService.log).toHaveBeenCalledWith({
      action: 'USER_CHANGE_PASSWORD',
      resourceType: 'USER',
      resourceId: 'user-1',
      userId: 'user-1',
      success: false,
      errorMessage: expect.stringContaining('当前密码不正确'),
      resourceName: 'user-1',
      params: { changeType: 'change' },
    });
  });

  it('未设置密码的用户直接设置密码：changeType=set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: null,
    });

    await service.changePassword('user-1', undefined, '<PASSWORD_STUB_NEW>');

    expect(mockAuditLogService.log).toHaveBeenCalledWith({
      action: 'USER_CHANGE_PASSWORD',
      resourceType: 'USER',
      resourceId: 'user-1',
      userId: 'user-1',
      success: true,
      resourceName: 'test@example.com',
      params: { changeType: 'set' },
    });
  });

  // TOTP step-up（#415）：仅「总闸开 + 管理员 + 已绑定」三者同时成立才要求动态码。
  // 其余组合（总闸关 / 普通用户 / 未绑定）不要求，避免误伤与绑定页死锁。
  describe('TOTP step-up 改密', () => {
    const adminUser = (totpEnabled: boolean) => ({
      id: 'user-1',
      email: 'admin@example.com',
      password: '<PASSWORD_STUB_OLD>',
      totpEnabled,
      role: { name: 'ADMIN' },
    });

    it('总闸开 + 管理员 + 已绑定 + 缺码 → 401', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminUser(true));
      mockRuntimeConfigService.getValue.mockResolvedValue(true);

      await expect(
        service.changePassword(
          'user-1',
          '<PASSWORD_STUB_OLD>',
          '<PASSWORD_STUB_NEW>'
        )
      ).rejects.toThrow(UnauthorizedException);
      expect(mockMfaService.verifyCode).not.toHaveBeenCalled();
    });

    it('总闸开 + 管理员 + 已绑定 + 错码 → 401', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminUser(true));
      mockRuntimeConfigService.getValue.mockResolvedValue(true);
      mockMfaService.verifyCode.mockResolvedValue(false);

      await expect(
        service.changePassword(
          'user-1',
          '<PASSWORD_STUB_OLD>',
          '<PASSWORD_STUB_NEW>',
          '000000'
        )
      ).rejects.toThrow(UnauthorizedException);
      expect(mockMfaService.verifyCode).toHaveBeenCalledWith('user-1', '000000');
    });

    it('总闸开 + 管理员 + 已绑定 + 正确码 → 改密成功', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminUser(true));
      mockRuntimeConfigService.getValue.mockResolvedValue(true);
      mockMfaService.verifyCode.mockResolvedValue(true);

      const result = await service.changePassword(
        'user-1',
        '<PASSWORD_STUB_OLD>',
        '<PASSWORD_STUB_NEW>',
        '123456'
      );
      expect(result.message).toContain('修改');
      expect(mockMfaService.verifyCode).toHaveBeenCalledWith('user-1', '123456');
    });

    it('总闸关（默认）+ 管理员 + 已绑定 → 不要求码，直接成功', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminUser(true));
      mockRuntimeConfigService.getValue.mockResolvedValue(false);

      const result = await service.changePassword(
        'user-1',
        '<PASSWORD_STUB_OLD>',
        '<PASSWORD_STUB_NEW>'
      );
      expect(result.message).toContain('修改');
      expect(mockMfaService.verifyCode).not.toHaveBeenCalled();
    });

    it('总闸开 + 普通用户 + 已绑定 → 不要求码（TOTP 仅管理员）', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: '<PASSWORD_STUB_OLD>',
        totpEnabled: true,
        role: { name: 'USER' },
      });
      mockRuntimeConfigService.getValue.mockResolvedValue(true);

      const result = await service.changePassword(
        'user-1',
        '<PASSWORD_STUB_OLD>',
        '<PASSWORD_STUB_NEW>'
      );
      expect(result.message).toContain('修改');
      expect(mockMfaService.verifyCode).not.toHaveBeenCalled();
    });

    it('总闸开 + 管理员 + 未绑定 → 不要求码（避免与绑定页死锁）', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminUser(false));
      mockRuntimeConfigService.getValue.mockResolvedValue(true);

      const result = await service.changePassword(
        'user-1',
        '<PASSWORD_STUB_OLD>',
        '<PASSWORD_STUB_NEW>'
      );
      expect(result.message).toContain('修改');
      expect(mockMfaService.verifyCode).not.toHaveBeenCalled();
    });
  });
});
