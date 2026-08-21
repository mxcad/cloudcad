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
  };
  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const mockIpWhitelistService = {
    isAllowed: jest.fn().mockResolvedValue(true),
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
    mockIpWhitelistService.isAllowed.mockResolvedValue(true);

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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: AccountRateLimitService, useValue: mockAccountRateLimitService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: IpWhitelistService, useValue: mockIpWhitelistService },
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

    it('用户不存在同样返回统一 Unauthorized', async () => {
      mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(null);
      await expect(
        service.login(dto, undefined, '127.0.0.1')
      ).rejects.toThrow(UnauthorizedException);
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
});
