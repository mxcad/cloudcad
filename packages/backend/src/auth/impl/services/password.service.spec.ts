import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PasswordService } from './password.service';
import { AuthTokenService } from './auth-token.service';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { PasswordPolicyService } from '../../services/password-policy.service';
import { USER_REPOSITORY } from '@cloudcad/contracts';

describe('PasswordService（认证加固：防账号枚举 + 限流）', () => {
  let service: PasswordService;

  const mockUserRepo = {
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailVerificationService = {
    sendVerificationEmail: jest.fn(),
    verifyEmail: jest.fn(),
  };

  const mockSmsVerificationService = {
    sendVerificationCode: jest.fn(),
    verifyCode: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };

  const mockAuthTokenService = {
    deleteAllRefreshTokens: jest.fn(),
  };

  const mockTokenBlacklistService = {
    removeUserFromBlacklist: jest.fn(),
  };

  const mockAccountRateLimitService = {
    checkLimit: jest.fn(),
    reset: jest.fn(),
  };

  const mockPasswordPolicyService = {
    assertPasswordPolicy: jest.fn(),
    getPasswordChangeStatus: jest
      .fn()
      .mockReturnValue({ required: undefined, expiringSoon: false }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRuntimeConfigService.getValue.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'mailEnabled') return true;
      if (key === 'smsEnabled') return true;
      return fallback;
    });
    mockAccountRateLimitService.checkLimit.mockResolvedValue(undefined);
    mockEmailVerificationService.sendVerificationEmail.mockResolvedValue(undefined);
    mockSmsVerificationService.sendVerificationCode.mockResolvedValue({ success: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: 'EMAIL', useValue: mockEmailVerificationService },
        { provide: 'SMS', useValue: mockSmsVerificationService },
        { provide: 'CONFIG', useValue: mockRuntimeConfigService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: 'TOKEN_BLACKLIST', useValue: mockTokenBlacklistService },
        { provide: AccountRateLimitService, useValue: mockAccountRateLimitService },
        {
          provide: PasswordPolicyService,
          useValue: mockPasswordPolicyService,
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  describe('forgotPassword — 邮箱找回', () => {
    it('账号存在且 ACTIVE：发送验证码并返回成功消息', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ id: 'u1', status: 'ACTIVE' });

      const result = await service.forgotPassword('user@example.com');

      expect(mockEmailVerificationService.sendVerificationEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(result.message).toBe('密码重置验证码已发送到您的邮箱');
      expect(result.mailEnabled).toBe(true);
    });

    it('账号不存在：不发送验证码，但返回相同的成功消息（防枚举）', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('ghost@example.com');

      expect(mockEmailVerificationService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(result.message).toBe('密码重置验证码已发送到您的邮箱');
    });

    it('账号已禁用：不发送验证码，但返回相同的成功消息（防枚举）', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ id: 'u2', status: 'SUSPENDED' });

      const result = await service.forgotPassword('disabled@example.com');

      expect(mockEmailVerificationService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(result.message).toBe('密码重置验证码已发送到您的邮箱');
    });
  });

  describe('forgotPassword — 手机号找回', () => {
    it('账号存在且 ACTIVE：发送验证码并返回成功消息', async () => {
      mockUserRepo.findByPhone.mockResolvedValue({ id: 'u3', status: 'ACTIVE' });

      const result = await service.forgotPassword(undefined, '13800138000');

      expect(mockSmsVerificationService.sendVerificationCode).toHaveBeenCalledWith('13800138000');
      expect(result.message).toBe('密码重置验证码已发送到您的手机');
      expect(result.smsEnabled).toBe(true);
    });

    it('账号不存在：不发送验证码，但返回相同的成功消息（防枚举）', async () => {
      mockUserRepo.findByPhone.mockResolvedValue(null);

      const result = await service.forgotPassword(undefined, '13900139000');

      expect(mockSmsVerificationService.sendVerificationCode).not.toHaveBeenCalled();
      expect(result.message).toBe('密码重置验证码已发送到您的手机');
    });

    it('账号已禁用：不发送验证码，但返回相同的成功消息（防枚举）', async () => {
      mockUserRepo.findByPhone.mockResolvedValue({ id: 'u4', status: 'INACTIVE' });

      const result = await service.forgotPassword(undefined, '13700137000');

      expect(mockSmsVerificationService.sendVerificationCode).not.toHaveBeenCalled();
      expect(result.message).toBe('密码重置验证码已发送到您的手机');
    });
  });

  describe('forgotPassword — 限流', () => {
    it('按邮箱触发账号维度限流', async () => {
      await service.forgotPassword('user@example.com');

      expect(mockAccountRateLimitService.checkLimit).toHaveBeenCalledWith(
        'password_reset',
        'user@example.com',
      );
    });

    it('按手机号触发账号维度限流', async () => {
      await service.forgotPassword(undefined, '13800138000');

      expect(mockAccountRateLimitService.checkLimit).toHaveBeenCalledWith(
        'password_reset',
        '13800138000',
      );
    });

    it('缺少 email 与 phone 时抛出参数错误', async () => {
      await expect(service.forgotPassword()).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateUser（无密码账号防 500）', () => {
    it('ACTIVE 但 password=null（微信注册）：返回 null 而非抛 500，且不调用 bcrypt.compare', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'wx@example.com',
        username: 'wxuser',
        password: null,
        status: 'ACTIVE',
      });

      const result = await service.validateUser('wx@example.com', 'anything');

      expect(result).toBeNull();
      // bcryptjs 对 null hash 会 reject（→ 500），修复后不得调用 compare
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('ACTIVE 且有密码：密码正确返回用户（不含 password 字段）', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        id: 'user-2',
        email: 'ok@example.com',
        username: 'okuser',
        password: 'hashed-password',
        status: 'ACTIVE',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('ok@example.com', 'password123');

      expect(result).not.toBeNull();
      expect((result as Record<string, unknown>).password).toBeUndefined();
      expect((result as Record<string, unknown>).id).toBe('user-2');
    });
  });
});
