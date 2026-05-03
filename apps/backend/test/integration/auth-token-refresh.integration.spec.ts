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
import { AuthTokenService } from '../../src/auth/services/auth-token.service';
import { DatabaseService } from '../../src/database/database.service';
import { TokenBlacklistService } from '../../src/auth/services/token-blacklist.service';
import { LocalAuthProvider } from '../../src/auth/providers/local-auth.provider';
import { RegistrationService } from '../../src/auth/services/registration.service';
import { LoginService } from '../../src/auth/services/login.service';
import { SmsVerificationService } from '../../src/auth/services/sms';
import { WechatService } from '../../src/auth/services/wechat.service';
import { RuntimeConfigService } from '../../src/runtime-config/runtime-config.service';
import { USER_SERVICE } from '../../src/common/interfaces/user-service.interface';
import { createMockUser, testPermissions } from '../../src/test/test-utils';

describe('Auth Token Refresh Integration Tests', () => {
  let authTokenService: AuthTokenService;
  let localAuthProvider: LocalAuthProvider;
  let jwtService: jest.Mocked<JwtService>;
  let mockDatabaseService: any;
  let mockTokenBlacklistService: any;
  let mockConfigService: any;
  let mockUserService: any;
  let mockRegistrationService: any;
  let mockLoginService: any;
  let mockSmsVerificationService: any;
  let mockWechatService: any;
  let mockRuntimeConfigService: any;

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
    mockDatabaseService = {
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockTokenBlacklistService = {
      addToBlacklist: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const configs = {
          'jwt.secret': 'test-jwt-secret',
          'jwt.expiresIn': '1h',
          'jwt.refreshExpiresIn': '7d',
        };
        return configs[key as keyof typeof configs];
      }),
    };

    jwtService = {
      signAsync: jest.fn(),
      verify: jest.fn(),
      sign: jest.fn(),
    } as any;

    mockUserService = {
      create: jest.fn(),
    };

    mockRegistrationService = {
      register: jest.fn(),
    };

    mockLoginService = {
      login: jest.fn(),
    };

    mockSmsVerificationService = {
      verifyCode: jest.fn(),
    };

    mockWechatService = {
      validateState: jest.fn(),
      getAccessToken: jest.fn(),
      getUserInfo: jest.fn(),
    };

    mockRuntimeConfigService = {
      getValue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        LocalAuthProvider,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
        { provide: USER_SERVICE, useValue: mockUserService },
        { provide: RegistrationService, useValue: mockRegistrationService },
        { provide: LoginService, useValue: mockLoginService },
        { provide: SmsVerificationService, useValue: mockSmsVerificationService },
        { provide: WechatService, useValue: mockWechatService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
      ],
    }).compile();

    authTokenService = module.get<AuthTokenService>(AuthTokenService);
    localAuthProvider = module.get<LocalAuthProvider>(LocalAuthProvider);
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

      mockDatabaseService.refreshToken.findFirst.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockDatabaseService.user.findUnique.mockResolvedValue(mockUser);

      jwtService.signAsync
        .mockResolvedValueOnce(newAccessToken)
        .mockResolvedValueOnce(newRefreshToken);

      mockDatabaseService.refreshToken.deleteMany.mockResolvedValue(undefined);
      mockDatabaseService.refreshToken.create.mockResolvedValue(undefined);

      const result = await authTokenService.refreshToken(mockRefreshToken);

      expect(result.accessToken).toBe(newAccessToken);
      expect(result.refreshToken).toBe(newRefreshToken);
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.hasPassword).toBe(true);
      expect(mockDatabaseService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
      expect(mockDatabaseService.refreshToken.create).toHaveBeenCalled();
    });

    it('T23-S2: 使用过期RefreshToken刷新失败', async () => {
      const expiredRefreshToken = 'expired-refresh-token';

      jwtService.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await expect(
        authTokenService.refreshToken(expiredRefreshToken)
      ).rejects.toThrow();

      expect(mockDatabaseService.refreshToken.findFirst).not.toHaveBeenCalled();
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

      mockDatabaseService.refreshToken.findFirst.mockResolvedValue(null);

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

      mockDatabaseService.refreshToken.findFirst.mockResolvedValue(null);

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

      mockDatabaseService.refreshToken.findFirst.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockDatabaseService.user.findUnique.mockResolvedValue(mockUser);

      jwtService.signAsync
        .mockResolvedValueOnce(newAccessToken)
        .mockResolvedValueOnce(newRefreshToken);

      mockDatabaseService.refreshToken.deleteMany.mockResolvedValue(undefined);
      mockDatabaseService.refreshToken.create.mockResolvedValue(undefined);

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

      mockDatabaseService.refreshToken.findFirst.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockDatabaseService.user.findUnique.mockResolvedValue(disabledUser);

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

      mockDatabaseService.refreshToken.findFirst.mockResolvedValue({
        token: mockRefreshToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      mockDatabaseService.user.findUnique.mockResolvedValue(mockUser);

      jwtService.signAsync
        .mockResolvedValueOnce(newAccessToken)
        .mockResolvedValueOnce(newRefreshToken);

      await authTokenService.refreshToken(mockRefreshToken);

      expect(mockDatabaseService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
      expect(mockDatabaseService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          token: newRefreshToken,
          userId: mockUser.id,
        }),
      });
    });
  });

  describe('Token生成验证', () => {
    it('生成Token时验证JWT配置', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      mockDatabaseService.refreshToken.deleteMany.mockResolvedValue(undefined);
      mockDatabaseService.refreshToken.create.mockResolvedValue(undefined);

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
