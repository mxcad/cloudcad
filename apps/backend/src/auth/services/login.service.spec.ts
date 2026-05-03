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
import { LoginService } from './login.service';
import { DatabaseService } from '../../database/database.service';
import { EmailVerificationService } from './email-verification.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

describe('LoginService', () => {
  let service: LoginService;

  // Mock dependencies
  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
    },
  };

  const mockEmailVerificationService = {
    verifyEmail: jest.fn(),
    sendVerificationEmail: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };

  const mockAuthTokenService = {
    generateTokens: jest.fn(),
  };

  const mockTokenBlacklistService = {
    addToBlacklist: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-jwt-secret'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.compare as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: EmailVerificationService, useValue: mockEmailVerificationService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LoginService>(LoginService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const loginDto = {
      account: 'test@example.com',
      password: 'password123',
    };

    describe('when user does not exist', () => {
      it('should throw UnauthorizedException', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);
        
        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
        expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
          where: { OR: [{ email: 'test@example.com' }, { username: 'test@example.com' }] },
          select: expect.any(Object),
        });
      });
    });

    describe('when user is not active', () => {
      it('should throw UnauthorizedException', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({
          id: 'user123',
          status: 'SUSPENDED',
        });
        
        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when password is incorrect', () => {
      it('should throw UnauthorizedException', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({
          id: 'user123',
          status: 'ACTIVE',
          password: 'hashed-password',
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        
        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when login is successful (normal case)', () => {
      it('should return tokens and user info', async () => {
        const mockUser = {
          id: 'user123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          avatar: null,
          role: { id: 'role1', name: 'USER', description: 'User role', isSystem: true, permissions: [] },
          status: 'ACTIVE',
          emailVerified: true,
          phone: null,
          phoneVerified: true,
          password: 'hashed-password',
          wechatId: null,
          provider: 'LOCAL',
        };

        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockRuntimeConfigService.getValue.mockResolvedValue(false);
        mockAuthTokenService.generateTokens.mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        });

        const req = { session: { save: jest.fn().mockResolvedValue(undefined) } } as any;
        const result = await service.login(loginDto, req);

        expect(mockAuthTokenService.generateTokens).toHaveBeenCalled();
        expect(result.accessToken).toBe('access-token');
        expect(result.refreshToken).toBe('refresh-token');
        expect(result.user.id).toBe('user123');
      });

      it('should handle login with phone number', async () => {
        const mockUser = {
          id: 'user123',
          phone: '13812345678',
          role: { id: 'role1', name: 'USER' },
          status: 'ACTIVE',
          emailVerified: true,
          phoneVerified: true,
          password: 'hashed-password',
        };

        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockRuntimeConfigService.getValue.mockResolvedValue(false);
        mockAuthTokenService.generateTokens.mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        });

        const result = await service.login({ account: '+8613812345678', password: 'password123' });

        expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: '+8613812345678' },
              { username: '+8613812345678' },
              { phone: '13812345678' },
            ]),
          }),
          select: expect.any(Object),
        });
        expect(result.accessToken).toBe('access-token');
      });
    });

    describe('when email verification is required', () => {
      beforeEach(() => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(true);
          if (key === 'requireEmailVerification') return Promise.resolve(true);
          return Promise.resolve(false);
        });
      });

      it('should throw with temp token when no email exists', async () => {
        const mockUser = {
          id: 'user123',
          email: null,
          role: { id: 'role1', name: 'USER' },
          status: 'ACTIVE',
          emailVerified: false,
          password: 'hashed-password',
        };

        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockJwtService.sign.mockReturnValue('temp-token');

        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
        expect(mockJwtService.sign).toHaveBeenCalled();
      });

      it('should throw when email exists but not verified', async () => {
        const mockUser = {
          id: 'user123',
          email: 'test@example.com',
          role: { id: 'role1', name: 'USER' },
          status: 'ACTIVE',
          emailVerified: false,
          password: 'hashed-password',
        };

        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when phone verification is required', () => {
      beforeEach(() => {
        mockRuntimeConfigService.getValue.mockImplementation((key) => {
          if (key === 'mailEnabled') return Promise.resolve(false);
          if (key === 'smsEnabled') return Promise.resolve(true);
          if (key === 'requirePhoneVerification') return Promise.resolve(true);
          return Promise.resolve(false);
        });
      });

      it('should throw with temp token when no phone exists', async () => {
        const mockUser = {
          id: 'user123',
          phone: null,
          role: { id: 'role1', name: 'USER' },
          status: 'ACTIVE',
          emailVerified: true,
          phoneVerified: false,
          password: 'hashed-password',
        };

        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockJwtService.sign.mockReturnValue('temp-token');

        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
        expect(mockJwtService.sign).toHaveBeenCalled();
      });

      it('should throw when phone exists but not verified', async () => {
        const mockUser = {
          id: 'user123',
          phone: '13812345678',
          role: { id: 'role1', name: 'USER' },
          status: 'ACTIVE',
          emailVerified: true,
          phoneVerified: false,
          password: 'hashed-password',
        };

        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('with session', () => {
      it('should save session info', async () => {
        const mockUser = {
          id: 'user123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          role: { id: 'role1', name: 'USER', permissions: [] },
          status: 'ACTIVE',
          emailVerified: true,
          phoneVerified: true,
          password: 'hashed-password',
        };

        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockRuntimeConfigService.getValue.mockResolvedValue(false);
        mockAuthTokenService.generateTokens.mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        });

        const req = { session: { save: jest.fn().mockResolvedValue(undefined) } } as any;
        await service.login(loginDto, req);

        expect(req.session.userId).toBe('user123');
        expect(req.session.userRole).toBe('USER');
        expect(req.session.save).toHaveBeenCalled();
      });
    });
  });
});
