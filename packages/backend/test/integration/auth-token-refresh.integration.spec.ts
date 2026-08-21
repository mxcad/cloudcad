///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// This code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd.
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  USER_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  ROLE_REPOSITORY,
  TOKEN_BLACKLIST,
} from '@cloudcad/contracts';
import { AuthTokenService } from '../../src/auth/impl/services/auth-token.service';
import { OssAuthProvider } from '../../src/auth/impl/providers/local-auth.provider';
import { RegistrationService } from '../../src/auth/impl/services/registration.service';
import { LoginService } from '../../src/auth/impl/services/login.service';
import { PasswordService } from '../../src/auth/impl/services/password.service';
import { WechatService } from '../../src/auth/impl/services/wechat.service';
import { AccountRateLimitService } from '../../src/auth/services/account-rate-limit.service';
import { USER_SERVICE } from '../../src/common/interfaces/user-service.interface';
import { createMockUser } from '../../src/test/test-utils';

describe('Auth Token Refresh Integration Tests', () => {
  let authTokenService: AuthTokenService;
  let localAuthProvider: OssAuthProvider;
  let jwtService: jest.Mocked<JwtService>;
  let mockUserRepo: any;
  let mockRefreshTokenRepo: any;
  let mockRoleRepo: any;
  let mockTokenBlacklistService: any;
  let mockConfigService: any;
  let mockUserService: any;
  let mockRegistrationService: any;
  let mockLoginService: any;
  let mockPasswordService: any;
  let mockSmsVerificationService: any;
  let mockEmailVerificationService: any;
  let mockWechatService: any;
  let mockRuntimeConfigService: any;
  let mockAccountRateLimitService: any;

  const mockUser = createMockUser({
    id: 'test-user-123',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    role: { id: 'role-1', name: 'USER' },
    status: 'ACTIVE',
    password: 'hashedpassword',
  });

  beforeEach(async () => {
    mockUserRepo = {
      findById: jest.fn(),
    };

    mockRefreshTokenRepo = {
      findValid: jest.fn(),
      storeRefreshToken: jest.fn(),
    };

    mockRoleRepo = {
      findByName: jest.fn(),
    };

    mockTokenBlacklistService = {
      addToBlacklist: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const configs: Record<string, unknown> = {
          'jwt.secret': 'test-jwt-secret',
          'jwt.refreshSecret': 'test-jwt-refresh-secret',
          'jwt.expiresIn': '1h',
          'jwt.refreshExpiresIn': '7d',
        };
        return configs[key];
      }),
    };

    jwtService = {
      signAsync: jest.fn(),
      verify: jest.fn(),
      sign: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    mockUserService = {
      create: jest.fn(),
    };

    mockRegistrationService = {
      register: jest.fn(),
    };

    mockLoginService = {
      login: jest.fn(),
    };

    mockPasswordService = {
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      validateUser: jest.fn(),
    };

    mockSmsVerificationService = {
      verifyCode: jest.fn(),
    };

    mockEmailVerificationService = {
      verifyEmail: jest.fn(),
      sendVerificationEmail: jest.fn(),
    };

    mockWechatService = {
      validateState: jest.fn(),
      getAccessToken: jest.fn(),
      getUserInfo: jest.fn(),
    };

    mockRuntimeConfigService = {
      getValue: jest.fn(),
    };

    mockAccountRateLimitService = {
      checkLimit: jest.fn(),
      reset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        OssAuthProvider,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: mockRefreshTokenRepo },
        { provide: ROLE_REPOSITORY, useValue: mockRoleRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TOKEN_BLACKLIST, useValue: mockTokenBlacklistService },
        { provide: 'SMS', useValue: mockSmsVerificationService },
        { provide: 'EMAIL', useValue: mockEmailVerificationService },
        { provide: 'CONFIG', useValue: mockRuntimeConfigService },
        { provide: USER_SERVICE, useValue: mockUserService },
        { provide: RegistrationService, useValue: mockRegistrationService },
        { provide: LoginService, useValue: mockLoginService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: WechatService, useValue: mockWechatService },
        {
          provide: AccountRateLimitService,
          useValue: mockAccountRateLimitService,
        },
      ],
    }).compile();

    authTokenService = module.get<AuthTokenService>(AuthTokenService);
    localAuthProvider = module.get<OssAuthProvider>(OssAuthProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('T23: Token过期刷新流程', () => {
    it('T23-S1: 使用有效RefreshToken成功刷新Token', async () => {
      const mockRefreshToken = 'valid-refresh-token';
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });

      mockRefreshTokenRepo.findValid.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockUserRepo.findById.mockResolvedValue(mockUser);

      jwtService.signAsync
        .mockResolvedValueOnce(newAccessToken)
        .mockResolvedValueOnce(newRefreshToken);

      mockRefreshTokenRepo.storeRefreshToken.mockResolvedValue(undefined);

      const result = await authTokenService.refreshToken(mockRefreshToken);

      expect(result.accessToken).toBe(newAccessToken);
      expect(result.refreshToken).toBe(newRefreshToken);
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.hasPassword).toBe(true);
      expect(mockRefreshTokenRepo.storeRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: newRefreshToken,
          userId: mockUser.id,
        }),
        mockRefreshToken,
      );
    });

    it('T23-S2: 使用过期RefreshToken刷新失败', async () => {
      const expiredRefreshToken = 'expired-refresh-token';

      jwtService.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await expect(
        authTokenService.refreshToken(expiredRefreshToken)
      ).rejects.toThrow();

      expect(mockRefreshTokenRepo.findValid).not.toHaveBeenCalled();
    });

    it('T23-S3: 使用无效RefreshToken刷新失败', async () => {
      const invalidRefreshToken = 'invalid-refresh-token';

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'access',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await expect(
        authTokenService.refreshToken(invalidRefreshToken)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T23-S4: 使用数据库中不存在的RefreshToken刷新失败', async () => {
      const nonExistentRefreshToken = 'non-existent-refresh-token';

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });

      mockRefreshTokenRepo.findValid.mockResolvedValue(null);

      await expect(
        authTokenService.refreshToken(nonExistentRefreshToken)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T23-S5: RefreshToken过期但签名有效但数据库中已过期', async () => {
      const expiredButSignedToken = 'expired-but-signed-token';

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });

      mockRefreshTokenRepo.findValid.mockResolvedValue(null);

      await expect(
        authTokenService.refreshToken(expiredButSignedToken)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T23-S6: LocalAuthProvider刷新Token成功', async () => {
      const mockRefreshToken = 'valid-refresh-token';
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });

      mockRefreshTokenRepo.findValid.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockUserRepo.findById.mockResolvedValue(mockUser);

      jwtService.signAsync
        .mockResolvedValueOnce(newAccessToken)
        .mockResolvedValueOnce(newRefreshToken);

      mockRefreshTokenRepo.storeRefreshToken.mockResolvedValue(undefined);

      const result = await localAuthProvider.refreshToken(mockRefreshToken);

      expect(result.accessToken).toBe(newAccessToken);
      expect(result.refreshToken).toBe(newRefreshToken);
      expect(result.user.id).toBe(mockUser.id);
    });

    it('T23-S7: 用户被禁用后刷新Token失败', async () => {
      const mockRefreshToken = 'valid-refresh-token';
      const disabledUser = { ...mockUser, status: 'INACTIVE' };

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });

      mockRefreshTokenRepo.findValid.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockUserRepo.findById.mockResolvedValue(disabledUser);

      await expect(
        authTokenService.refreshToken(mockRefreshToken)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T23-S8: 刷新后旧的RefreshToken应该被删除', async () => {
      const mockRefreshToken = 'valid-refresh-token';
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });

      mockRefreshTokenRepo.findValid.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockUserRepo.findById.mockResolvedValue(mockUser);

      jwtService.signAsync
        .mockResolvedValueOnce(newAccessToken)
        .mockResolvedValueOnce(newRefreshToken);

      mockRefreshTokenRepo.storeRefreshToken.mockResolvedValue(undefined);

      await authTokenService.refreshToken(mockRefreshToken);

      expect(mockRefreshTokenRepo.storeRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: newRefreshToken,
          userId: mockUser.id,
        }),
        mockRefreshToken,
      );
    });
  });

  describe('Token生成验证', () => {
    it('生成Token时验证JWT配置', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      mockRefreshTokenRepo.storeRefreshToken.mockResolvedValue(undefined);

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });

      await authTokenService.generateTokens(mockUser);

      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
      expect(mockConfigService.get).toHaveBeenCalledWith('jwt.secret');
    });
  });
});
