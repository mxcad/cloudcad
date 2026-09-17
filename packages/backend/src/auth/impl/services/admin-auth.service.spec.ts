/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminAuthService } from './admin-auth.service';
import { AuthTokenService } from './auth-token.service';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { AuditLogService } from '../../../audit/audit-log.service';
import { IpWhitelistService } from '../../../ip-whitelist/ip-whitelist.service';
import { IpBlacklistService } from '../../../ip-blacklist/ip-blacklist.service';
import { SecurityAccessAttemptService } from '../../../security/security-access-attempt.service';
import { MfaService } from '../../services/mfa.service';
import { PasswordPolicyService } from '../../services/password-policy.service';
import { RuntimeConfigService } from '../../../runtime-config/runtime-config.service';
import { USER_REPOSITORY } from '@cloudcad/contracts';

beforeEach(() => {
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
});

describe('AdminAuthService（管理员专用登录）', () => {
  let service: AdminAuthService;

  const mockUserRepo = {
    findLoginUserIncludingDeleted: jest.fn(),
  };
  const mockAuthTokenService = {
    generateTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  };
  const mockAccountRateLimitService = {
    checkLimit: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    // #416 失败锁定
    checkAccountLock: jest.fn().mockResolvedValue(undefined),
    recordLoginFailure: jest.fn().mockResolvedValue(undefined),
    clearLoginFailures: jest.fn().mockResolvedValue(undefined),
  };
  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const mockIpWhitelistService = {
    isAllowed: jest.fn().mockResolvedValue(true),
  };
  const mockIpBlacklistService = {
    isBlocked: jest.fn().mockResolvedValue(false),
  };
  const mockSecurityAccessAttemptService = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const mockMfaService = {
    verifyCode: jest.fn().mockResolvedValue(true),
    isTotpEnabled: jest.fn().mockResolvedValue(false),
  };
  const mockPasswordPolicyService = {
    // 默认：新鲜口令（无需强改、未到期）
    getPasswordChangeStatus: jest
      .fn()
      .mockReturnValue({ required: undefined, expiringSoon: false }),
  };
  // 总闸默认关闭（与生产默认一致）：mfaEnforceEnabled=false → TOTP 完全不生效
  const mockRuntimeConfigService = {
    getValue: jest.fn().mockImplementation((_key: string, def: unknown) =>
      Promise.resolve(def)
    ),
  };

  let adminUser: Record<string, unknown>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockAuthTokenService.generateTokens.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    mockAccountRateLimitService.checkLimit.mockResolvedValue(undefined);
    mockAccountRateLimitService.reset.mockResolvedValue(undefined);
    mockAccountRateLimitService.checkAccountLock.mockResolvedValue(undefined);
    mockAccountRateLimitService.recordLoginFailure.mockResolvedValue(
      undefined
    );
    mockAccountRateLimitService.clearLoginFailures.mockResolvedValue(
      undefined
    );
    mockPasswordPolicyService.getPasswordChangeStatus.mockReturnValue({
      required: undefined,
      expiringSoon: false,
    });
    mockIpWhitelistService.isAllowed.mockResolvedValue(true);
    mockIpBlacklistService.isBlocked.mockResolvedValue(false);
    mockSecurityAccessAttemptService.record.mockResolvedValue(undefined);
    mockMfaService.verifyCode.mockResolvedValue(true);
    mockMfaService.isTotpEnabled.mockResolvedValue(false);
    // 默认关闭总闸（getValue 返回传入的 defaultValue，mfaEnforceEnabled 默认 false）
    mockRuntimeConfigService.getValue.mockImplementation(
      (_key: string, def: unknown) => Promise.resolve(def)
    );

    adminUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      username: 'admin',
      password: 'hashed-password',
      phone: null,
      phoneVerified: true,
      emailVerified: true,
      status: 'ACTIVE',
      role: { id: 'role-admin', name: 'ADMIN' },
      nickname: 'System Admin',
      avatar: null,
      deletedAt: null,
      totpEnabled: false,
      // 默认新鲜口令（1 天前修改）：无需强改、未到期
      passwordChangedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: AccountRateLimitService, useValue: mockAccountRateLimitService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: IpWhitelistService, useValue: mockIpWhitelistService },
        { provide: IpBlacklistService, useValue: mockIpBlacklistService },
        {
          provide: SecurityAccessAttemptService,
          useValue: mockSecurityAccessAttemptService,
        },
        { provide: MfaService, useValue: mockMfaService },
        {
          provide: PasswordPolicyService,
          useValue: mockPasswordPolicyService,
        },
        {
          provide: RuntimeConfigService,
          useValue: mockRuntimeConfigService,
        },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
  });

  const dto = { account: 'admin', password: 'admin-password' };

  describe('IP 白名单前置校验（fail-close）', () => {
    it('白名单外的 IP 直接 403，且不触发账号查询（不消耗信息）', async () => {
      mockIpWhitelistService.isAllowed.mockResolvedValue(false);
      await expect(
        service.login(dto, undefined, '203.0.113.7')
      ).rejects.toThrow(ForbiddenException);
      expect(mockUserRepo.findLoginUserIncludingDeleted).not.toHaveBeenCalled();
      expect(mockAccountRateLimitService.checkLimit).not.toHaveBeenCalled();
    });

    it('白名单拒绝时应记录高危访问尝试（写 SecurityAccessAttempt），且不写 audit_logs 占位', async () => {
      mockIpWhitelistService.isAllowed.mockResolvedValue(false);
      await expect(
        service.login(dto, undefined, '203.0.113.7')
      ).rejects.toThrow(ForbiddenException);

      // 核心回归：认证前无合法 userId，必须记入独立安全尝试表
      expect(mockSecurityAccessAttemptService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '203.0.113.7',
          endpoint: '/api/v1/admin/auth/login',
          reason: 'ip_not_allowed',
          account: 'admin',
        })
      );
      // 未认证成功，不应以 'unknown' 占位写 audit_logs（避免 audit_logs_userId_fkey 外键噪音）
      expect(mockAuditLogService.log).not.toHaveBeenCalled();
    });
  });

  describe('IP 黑名单拦截（前置）', () => {
    it('被拉黑的 IP 直接 403 并记录黑名单原因，即使白名单已放行', async () => {
      mockIpBlacklistService.isBlocked.mockResolvedValue(true);
      mockIpWhitelistService.isAllowed.mockResolvedValue(true);
      await expect(
        service.login(dto, undefined, '203.0.113.9')
      ).rejects.toThrow(ForbiddenException);

      expect(mockSecurityAccessAttemptService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '203.0.113.9',
          reason: 'blacklisted',
          account: 'admin',
        })
      );
      // 黑名单拦截发生在账号查询之前
      expect(mockUserRepo.findLoginUserIncludingDeleted).not.toHaveBeenCalled();
      expect(mockAuditLogService.log).not.toHaveBeenCalled();
    });

    it('IP 未被拉黑时不触发黑名单记录', async () => {
      mockIpBlacklistService.isBlocked.mockResolvedValue(false);
      mockIpWhitelistService.isAllowed.mockResolvedValue(true);
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(adminUser);
      await service.login(dto, undefined, '127.0.0.1');
      expect(mockSecurityAccessAttemptService.record).not.toHaveBeenCalled();
    });
  });

  describe('ADMIN 角色校验', () => {
    it('非管理员账号返回统一防枚举 Unauthorized（不暴露账号是否管理员）', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        role: { id: 'role-user', name: 'USER' },
      });
      await expect(
        service.login(dto, undefined, '127.0.0.1')
      ).rejects.toThrow(UnauthorizedException);
      // 密码比对不应执行（非管理员直接拒绝，避免无谓计算）
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('用户不存在同样返回统一 Unauthorized，并记录高危访问尝试（user_not_found）', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(null);
      await expect(
        service.login(dto, undefined, '127.0.0.1')
      ).rejects.toThrow(UnauthorizedException);
      expect(mockSecurityAccessAttemptService.record).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'user_not_found' })
      );
      // 用户不存在同样无合法 userId，不应写 audit_logs 占位
      expect(mockAuditLogService.log).not.toHaveBeenCalled();
    });

    it('账号不可用（非 ACTIVE/已删除）返回统一 Unauthorized', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        status: 'SUSPENDED',
      });
      await expect(
        service.login(dto, undefined, '127.0.0.1')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('密码错误返回统一 Unauthorized 且不发 token', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(adminUser);
      await expect(
        service.login(dto, undefined, '127.0.0.1')
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuthTokenService.generateTokens).not.toHaveBeenCalled();
    });
  });

  describe('成功路径', () => {
    it('ADMIN + 白名单命中 + 密码正确则签发 token 并写审计', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(adminUser);
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.accessToken).toBe('at');
      expect(result.refreshToken).toBe('rt');
      expect(result.user).toMatchObject({ id: 'admin-1' });
      expect(mockAuditLogService.log).toHaveBeenCalled();
    });
  });

  describe('TOTP 双因素（#415，总闸开启 mfaEnforceEnabled=true）', () => {
    // 总闸开启时才走 TOTP 逻辑；这些用例验证开启态
    beforeEach(() => {
      mockRuntimeConfigService.getValue.mockResolvedValue(true);
    });

    it('未绑定 TOTP：签发 token 且响应带 mfaSetupRequired（前端锁定至绑定页）', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(adminUser);
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.mfaSetupRequired).toBe(true);
      expect(mockMfaService.verifyCode).not.toHaveBeenCalled();
    });

    it('已绑定 TOTP 且缺码：抛 MFA_REQUIRED 且不发 token', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        totpEnabled: true,
      });
      await expect(service.login(dto, undefined, '127.0.0.1')).rejects.toMatchObject({
        status: 401,
        response: { code: 'MFA_REQUIRED' },
      });
      expect(mockAuthTokenService.generateTokens).not.toHaveBeenCalled();
      expect(mockSecurityAccessAttemptService.record).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'mfa_code_missing' })
      );
    });

    it('已绑定 TOTP 且错码：抛 MFA_CODE_INVALID + 计入限流 + 失败审计', async () => {
      mockMfaService.verifyCode.mockResolvedValue(false);
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        totpEnabled: true,
      });
      await expect(
        service.login(
          { ...dto, totpCode: '000000' },
          undefined,
          '127.0.0.1'
        )
      ).rejects.toMatchObject({
        status: 401,
        response: { code: 'MFA_CODE_INVALID' },
      });
      // 错码尝试计入登录维度限流（与密码错误共享计数窗口）
      expect(mockAccountRateLimitService.checkLimit).toHaveBeenCalledWith(
        'login',
        'admin'
      );
      expect(mockSecurityAccessAttemptService.record).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'mfa_code_invalid' })
      );
      expect(mockAuthTokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('已绑定 TOTP 且码正确：签发 token 且响应不带 mfaSetupRequired', async () => {
      mockMfaService.verifyCode.mockResolvedValue(true);
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        totpEnabled: true,
      });
      const result = await service.login(
        { ...dto, totpCode: '123456' },
        undefined,
        '127.0.0.1'
      );
      expect(result.accessToken).toBe('at');
      expect(result.mfaSetupRequired).toBeUndefined();
      expect(mockMfaService.verifyCode).toHaveBeenCalledWith('admin-1', '123456');
    });
  });

  describe('TOTP 总闸关闭（mfaEnforceEnabled=false，默认）', () => {
    it('未绑定管理员：签发 token 且响应不带 mfaSetupRequired（不锁定）', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(adminUser);
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.accessToken).toBe('at');
      expect(result.mfaSetupRequired).toBeUndefined();
      expect(mockMfaService.verifyCode).not.toHaveBeenCalled();
    });

    it('已绑定管理员：无需动态码即签发 token（开关关闭时 totpCode 被忽略）', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        totpEnabled: true,
      });
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.accessToken).toBe('at');
      expect(result.mfaSetupRequired).toBeUndefined();
      expect(mockMfaService.verifyCode).not.toHaveBeenCalled();
    });
  });

  describe('口令到期状态（#416 等保 8.1.4.1 b)，仅管理员）', () => {
    it('首登未改密（passwordChangedAt=null）→ 响应带 passwordChangeRequired=first_login', async () => {
      mockPasswordPolicyService.getPasswordChangeStatus.mockReturnValue({
        required: 'first_login',
        expiringSoon: false,
      });
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        passwordChangedAt: null,
      });
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.accessToken).toBe('at');
      expect(result.passwordChangeRequired).toBe('first_login');
      expect(result.passwordExpiringSoon).toBeUndefined();
    });

    it('超 180 天 → 响应带 passwordChangeRequired=expired', async () => {
      mockPasswordPolicyService.getPasswordChangeStatus.mockReturnValue({
        required: 'expired',
        expiringSoon: false,
      });
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        passwordChangedAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1000),
      });
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.passwordChangeRequired).toBe('expired');
    });

    it('即将到期（14 天内）→ 响应带 passwordExpiringSoon=true（软提示）', async () => {
      mockPasswordPolicyService.getPasswordChangeStatus.mockReturnValue({
        required: undefined,
        expiringSoon: true,
      });
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
        ...adminUser,
        passwordChangedAt: new Date(Date.now() - 167 * 24 * 60 * 60 * 1000),
      });
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.passwordChangeRequired).toBeUndefined();
      expect(result.passwordExpiringSoon).toBe(true);
    });

    it('新鲜口令 → 响应不带 passwordChangeRequired / passwordExpiringSoon', async () => {
      mockPasswordPolicyService.getPasswordChangeStatus.mockReturnValue({
        required: undefined,
        expiringSoon: false,
      });
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(adminUser);
      const result = await service.login(dto, undefined, '127.0.0.1');
      expect(result.passwordChangeRequired).toBeUndefined();
      expect(result.passwordExpiringSoon).toBeUndefined();
    });
  });
});
