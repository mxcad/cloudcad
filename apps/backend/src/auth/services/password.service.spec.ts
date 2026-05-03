///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';
import { DatabaseService } from '../../database/database.service';
import { EmailVerificationService } from './email-verification.service';
import { SmsVerificationService } from './sms';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

describe('PasswordService', () => {
  let service: PasswordService;

  // Mock dependencies
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEmailVerificationService = {
    verifyEmail: jest.fn(),
    sendVerificationEmail: jest.fn(),
  };

  const mockSmsVerificationService = {
    verifyCode: jest.fn(),
    sendVerificationCode: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: EmailVerificationService, useValue: mockEmailVerificationService },
        { provide: SmsVerificationService, useValue: mockSmsVerificationService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user without password when valid', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        role: { permissions: [] },
        status: 'ACTIVE',
        password: 'hashed-password',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password123');

      expect(result).not.toHaveProperty('password');
      expect(result.id).toBe('user123');
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('test@example.com', 'password123');

      expect(result).toBeNull();
    });

    it('should return null when user not active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        status: 'SUSPENDED',
        password: 'hashed-password',
      });

      const result = await service.validateUser('test@example.com', 'password123');

      expect(result).toBeNull();
    });

    it('should return null when password invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        status: 'ACTIVE',
        password: 'hashed-password',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@example.com', 'password123');

      expect(result).toBeNull();
    });
  });

  describe('forgotPassword', () => {
    describe('when both email and phone are empty', () => {
      it('should throw BadRequestException', async () => {
        await expect(service.forgotPassword()).rejects.toThrow(BadRequestException);
      });
    });

    describe('when neither mail nor sms enabled', () => {
      it('should return support info', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(false);
          if (key === 'smsEnabled') return Promise.resolve(false);
          if (key === 'supportEmail') return Promise.resolve('support@example.com');
          if (key === 'supportPhone') return Promise.resolve('13800000000');
          return Promise.resolve('');
        });

        const result = await service.forgotPassword('test@example.com');

        expect(result.message).toContain('邮件服务和短信服务均未启用');
        expect(result.mailEnabled).toBe(false);
        expect(result.smsEnabled).toBe(false);
        expect(result.supportEmail).toBe('support@example.com');
      });
    });

    describe('with email', () => {
      it('should throw when mail disabled', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(false);
          if (key === 'smsEnabled') return Promise.resolve(true);
          return Promise.resolve('');
        });

        const result = await service.forgotPassword('test@example.com');

        expect(result.message).toContain('邮件服务未启用');
      });

      it('should throw when user not found', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(true);
          return Promise.resolve('');
        });
        mockPrisma.user.findUnique.mockResolvedValue(null);

        await expect(service.forgotPassword('test@example.com')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw when user not active', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(true);
          return Promise.resolve('');
        });
        mockPrisma.user.findUnique.mockResolvedValue({ status: 'SUSPENDED' });

        await expect(service.forgotPassword('test@example.com')).rejects.toThrow(UnauthorizedException);
      });

      it('should send verification email when valid', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(true);
          if (key === 'smsEnabled') return Promise.resolve(false);
          return Promise.resolve('');
        });
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user123', status: 'ACTIVE' });
        mockEmailVerificationService.sendVerificationEmail.mockResolvedValue(undefined);

        const result = await service.forgotPassword('test@example.com');

        expect(mockEmailVerificationService.sendVerificationEmail).toHaveBeenCalledWith('test@example.com');
        expect(result.message).toContain('密码重置验证码已发送');
      });
    });

    describe('with phone', () => {
      it('should throw when sms disabled', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(false);
          if (key === 'smsEnabled') return Promise.resolve(false);
          return Promise.resolve('');
        });

        const result = await service.forgotPassword(undefined, '13812345678');

        expect(result.message).toContain('短信服务未启用');
      });

      it('should throw when user not found', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'smsEnabled') return Promise.resolve(true);
          return Promise.resolve('');
        });
        mockPrisma.user.findUnique.mockResolvedValue(null);

        await expect(service.forgotPassword(undefined, '13812345678')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw when user not active', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'smsEnabled') return Promise.resolve(true);
          return Promise.resolve('');
        });
        mockPrisma.user.findUnique.mockResolvedValue({ status: 'SUSPENDED' });

        await expect(service.forgotPassword(undefined, '13812345678')).rejects.toThrow(UnauthorizedException);
      });

      it('should send verification sms when valid', async () => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(false);
          if (key === 'smsEnabled') return Promise.resolve(true);
          return Promise.resolve('');
        });
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user123', status: 'ACTIVE' });
        mockSmsVerificationService.sendVerificationCode.mockResolvedValue(undefined);

        const result = await service.forgotPassword(undefined, '13812345678');

        expect(mockSmsVerificationService.sendVerificationCode).toHaveBeenCalledWith('13812345678');
        expect(result.message).toContain('密码重置验证码已发送');
      });
    });
  });

  describe('resetPassword', () => {
    describe('with email', () => {
      it('should throw when verification code invalid', async () => {
        mockEmailVerificationService.verifyEmail.mockResolvedValue({ valid: false, message: '验证码错误' });

        await expect(service.resetPassword('test@example.com', undefined, '123456', 'newpass')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw when user not found', async () => {
        mockEmailVerificationService.verifyEmail.mockResolvedValue({ valid: true, message: '验证成功' });
        mockPrisma.user.findUnique.mockResolvedValue(null);

        await expect(service.resetPassword('test@example.com', undefined, '123456', 'newpass')).rejects.toThrow(UnauthorizedException);
      });

      it('should reset password successfully', async () => {
        mockEmailVerificationService.verifyEmail.mockResolvedValue({ valid: true, message: '验证成功' });
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user123' });
        (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

        const result = await service.resetPassword('test@example.com', undefined, '123456', 'newpass');

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user123' },
          data: { password: 'new-hashed-password' },
        });
        expect(mockAuthTokenService.deleteAllRefreshTokens).toHaveBeenCalledWith('user123');
        expect(mockTokenBlacklistService.removeUserFromBlacklist).toHaveBeenCalledWith('user123');
        expect(result.message).toContain('密码重置成功');
      });
    });

    describe('with phone', () => {
      it('should throw when verification code invalid', async () => {
        mockSmsVerificationService.verifyCode.mockResolvedValue({ valid: false, message: '验证码错误' });

        await expect(service.resetPassword(undefined, '13812345678', '123456', 'newpass')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw when user not found', async () => {
        mockSmsVerificationService.verifyCode.mockResolvedValue({ valid: true, message: '验证成功' });
        mockPrisma.user.findUnique.mockResolvedValue(null);

        await expect(service.resetPassword(undefined, '13812345678', '123456', 'newpass')).rejects.toThrow(UnauthorizedException);
      });

      it('should reset password successfully', async () => {
        mockSmsVerificationService.verifyCode.mockResolvedValue({ valid: true, message: '验证成功' });
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user123' });
        (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

        const result = await service.resetPassword(undefined, '13812345678', '123456', 'newpass');

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user123' },
          data: { password: 'new-hashed-password' },
        });
        expect(mockAuthTokenService.deleteAllRefreshTokens).toHaveBeenCalledWith('user123');
        expect(mockTokenBlacklistService.removeUserFromBlacklist).toHaveBeenCalledWith('user123');
        expect(result.message).toContain('密码重置成功');
      });
    });
  });
});
