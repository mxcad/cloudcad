///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, ConflictException, HttpException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { AuthFacadeService } from './auth-facade.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailVerificationService } from './services/email-verification.service';
import { SmsVerificationService } from './services/sms';
import { WechatService, WechatUserInfo } from './services/wechat.service';
import { InitializationService } from '../common/services/initialization.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { USER_SERVICE, IUserService } from '../common/interfaces/user-service.interface';
import { RegistrationService } from './services/registration.service';
import { LoginService } from './services/login.service';
import { PasswordService } from './services/password.service';
import { AccountBindingService } from './services/account-binding.service';
import { AuthTokenService } from './services/auth-token.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import { WechatLoginResponseDto, WechatBindResponseDto, WechatUnbindResponseDto } from './dto/wechat.dto';
import { SessionRequest } from './interfaces/jwt-payload.interface';
import Redis from 'ioredis';

describe('AuthFacadeService', () => {
  let service: AuthFacadeService;

  // Mock dependencies
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
    runtimeConfig: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
    verify: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockTokenBlacklistService = {
    addToBlacklist: jest.fn(),
    isBlacklisted: jest.fn(),
  };

  const mockEmailVerificationService = {
    verifyEmail: jest.fn(),
    sendVerificationEmail: jest.fn(),
  };

  const mockSmsVerificationService = {
    verifyCode: jest.fn(),
    sendVerificationCode: jest.fn(),
  };

  const mockWechatService = {
    validateState: jest.fn(),
    getAccessToken: jest.fn(),
    getUserInfo: jest.fn(),
  };

  const mockInitializationService = {
    ensureDefaultRoles: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };

  const mockUserService = {
    create: jest.fn(),
  };

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mockRegistrationService = {
    register: jest.fn(),
    verifyEmailAndActivate: jest.fn(),
  };

  const mockLoginService = {
    login: jest.fn(),
  };

  const mockPasswordService = {
    validateUser: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  const mockAccountBindingService = {
    sendBindEmailCode: jest.fn(),
    verifyBindEmail: jest.fn(),
    bindPhone: jest.fn(),
    sendUnbindPhoneCode: jest.fn(),
    verifyUnbindPhoneCode: jest.fn(),
    rebindPhone: jest.fn(),
    sendUnbindEmailCode: jest.fn(),
    verifyUnbindEmailCode: jest.fn(),
    rebindEmail: jest.fn(),
    bindWechat: jest.fn(),
    unbindWechat: jest.fn(),
    checkFieldUniqueness: jest.fn(),
  };

  const mockAuthTokenService = {
    generateTokens: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    revokeToken: jest.fn(),
    deleteAllRefreshTokens: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthFacadeService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
        { provide: EmailVerificationService, useValue: mockEmailVerificationService },
        { provide: SmsVerificationService, useValue: mockSmsVerificationService },
        { provide: WechatService, useValue: mockWechatService },
        { provide: InitializationService, useValue: mockInitializationService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
        { provide: USER_SERVICE, useValue: mockUserService },
        { provide: 'Redis', useValue: mockRedis },
        { provide: RegistrationService, useValue: mockRegistrationService },
        { provide: LoginService, useValue: mockLoginService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: AccountBindingService, useValue: mockAccountBindingService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
      ],
    }).compile();

    service = module.get<AuthFacadeService>(AuthFacadeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should delegate to registrationService.register', async () => {
      const registerDto: RegisterDto = {
        username: 'testuser',
        password: 'password123',
        email: 'test@example.com',
        nickname: 'Test User',
      };
      const req: SessionRequest = { session: {} } as any;
      const expectedResult: AuthResponseDto = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: {
          id: 'user123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          avatar: null,
          phone: null,
          phoneVerified: false,
          role: {
            id: 'role1',
            name: 'USER',
            description: 'User role',
            isSystem: true,
            permissions: [{ permission: 'read' }],
          },
          status: 'ACTIVE',
        },
      };

      mockRegistrationService.register.mockResolvedValue(expectedResult);

      const result = await service.register(registerDto, req);

      expect(result).toEqual(expectedResult);
      expect(mockRegistrationService.register).toHaveBeenCalledWith(registerDto, req);
    });
  });

  describe('verifyEmailAndActivate', () => {
    it('should delegate to registrationService.verifyEmailAndActivate', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const req: SessionRequest = { session: {} } as any;
      const expectedResult: AuthResponseDto = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: {
          id: 'user123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          avatar: null,
          phone: null,
          phoneVerified: false,
          role: {
            id: 'role1',
            name: 'USER',
            description: 'User role',
            isSystem: true,
            permissions: [{ permission: 'read' }],
          },
          status: 'ACTIVE',
        },
      };

      mockRegistrationService.verifyEmailAndActivate.mockResolvedValue(expectedResult);

      const result = await service.verifyEmailAndActivate(email, code, req);

      expect(result).toEqual(expectedResult);
      expect(mockRegistrationService.verifyEmailAndActivate).toHaveBeenCalledWith(email, code, req);
    });
  });

  describe('login', () => {
    it('should delegate to loginService.login', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const req: SessionRequest = { session: {} } as any;
      const expectedResult: AuthResponseDto = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: {
          id: 'user123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          avatar: null,
          phone: null,
          phoneVerified: false,
          role: {
            id: 'role1',
            name: 'USER',
            description: 'User role',
            isSystem: true,
            permissions: [{ permission: 'read' }],
          },
          status: 'ACTIVE',
        },
      };

      mockLoginService.login.mockResolvedValue(expectedResult);

      const result = await service.login(loginDto, req);

      expect(result).toEqual(expectedResult);
      expect(mockLoginService.login).toHaveBeenCalledWith(loginDto, req);
    });
  });

  describe('loginByPhone', () => {
    const phone = '+8613812345678';
    const code = '123456';
    const formattedPhone = '13812345678';
    const req: SessionRequest = { session: { save: jest.fn() } } as any;

    beforeEach(() => {
      mockSmsVerificationService.verifyCode.mockResolvedValue({ valid: true, message: '验证成功' });
    });

    describe('when verification code is invalid', () => {
      it('should throw BadRequestException', async () => {
        mockSmsVerificationService.verifyCode.mockResolvedValue({ valid: false, message: '验证码错误' });

        await expect(service.loginByPhone(phone, code, req)).rejects.toThrow(BadRequestException);
        expect(mockSmsVerificationService.verifyCode).toHaveBeenCalledWith(phone, code);
      });
    });

    describe('when user exists', () => {
      it('should return tokens and user info', async () => {
        const mockUser = {
          id: 'user123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          avatar: null,
          phone: formattedPhone,
          phoneVerified: true,
          role: {
            id: 'role1',
            name: 'USER',
            description: 'User role',
            isSystem: true,
            permissions: [{ permission: 'read' }],
          },
          status: 'ACTIVE',
        };

        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        mockAuthTokenService.generateTokens.mockResolvedValue({
          accessToken: 'access_token',
          refreshToken: 'refresh_token',
        });

        const result = await service.loginByPhone(phone, code, req);

        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
          where: { phone: formattedPhone },
          select: expect.any(Object),
        });
        expect(mockAuthTokenService.generateTokens).toHaveBeenCalledWith(mockUser);
        expect(req.session.save).toHaveBeenCalled();
        expect(result).toEqual({
          accessToken: 'access_token',
          refreshToken: 'refresh_token',
          user: {
            ...mockUser,
            nickname: mockUser.nickname,
            avatar: mockUser.avatar,
            role: mockUser.role,
            status: mockUser.status,
          },
        });
      });

      it('should throw UnauthorizedException when user status is not ACTIVE', async () => {
        const mockUser = {
          id: 'user123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          avatar: null,
          phone: formattedPhone,
          phoneVerified: true,
          role: { id: 'role1', name: 'USER', description: 'User role', isSystem: true, permissions: [{ permission: 'read' }] },
          status: 'SUSPENDED',
        };

        mockPrisma.user.findUnique.mockResolvedValue(mockUser);

        await expect(service.loginByPhone(phone, code, req)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when user does not exist', () => {
      beforeEach(() => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
      });

      describe('when auto register is enabled', () => {
        beforeEach(() => {
          mockRuntimeConfigService.getValue.mockImplementation((key: string, defaultValue: any) => {
            if (key === 'allowAutoRegisterOnPhoneLogin') return Promise.resolve(true);
            if (key === 'allowRegister') return Promise.resolve(true);
            return Promise.resolve(defaultValue);
          });
        });

        it('should create new user and return tokens', async () => {
          const newUser = {
            id: 'newuser123',
            email: null,
            username: 'u_2345678',
            nickname: '用户5678',
            avatar: null,
            phone: formattedPhone,
            phoneVerified: true,
            role: {
              id: 'role1',
              name: 'USER',
              description: 'User role',
              isSystem: true,
              permissions: [{ permission: 'read' }],
            },
            status: 'ACTIVE',
          };

          mockPrisma.user.findUnique
            .mockResolvedValueOnce(null) // First call for user check
            .mockResolvedValueOnce(null) // Call for username uniqueness check
            .mockResolvedValueOnce(newUser); // Second call after creation

          mockUserService.create.mockResolvedValue({ id: 'newuser123' });
          mockAuthTokenService.generateTokens.mockResolvedValue({
            accessToken: 'access_token',
            refreshToken: 'refresh_token',
          });

          const result = await service.loginByPhone(phone, code, req);

          expect(mockUserService.create).toHaveBeenCalledWith({
            username: expect.stringMatching(/^u_2345678(_\d+)?$/),
            password: expect.stringMatching(/^[a-zA-Z0-9!Aa]+$/),
            nickname: '用户5678',
            phone: formattedPhone,
            phoneVerified: true,
          });
          expect(mockAuthTokenService.generateTokens).toHaveBeenCalledWith(newUser);
          expect(result.user.id).toBe('newuser123');
        });

        it('should handle username collisions by adding suffix', async () => {
          mockPrisma.user.findUnique
            .mockResolvedValueOnce(null) // First call for user check
            .mockResolvedValueOnce({ id: 'existing' }) // First username check returns existing
            .mockResolvedValueOnce(null) // Second username check returns null
            .mockResolvedValueOnce({ id: 'newuser123' }); // After creation

          mockUserService.create.mockResolvedValue({ id: 'newuser123' });
          mockAuthTokenService.generateTokens.mockResolvedValue({
            accessToken: 'access_token',
            refreshToken: 'refresh_token',
          });

          await service.loginByPhone(phone, code, req);

          // Should call findUnique for username 'u_2345678' and then 'u_2345678_1'
          expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'u_2345678' } });
          expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'u_2345678_1' } });
        });
      });

      describe('when auto register is disabled', () => {
        it('should throw HttpException with PHONE_NOT_REGISTERED', async () => {
          mockRuntimeConfigService.getValue.mockImplementation((key: string, defaultValue: any) => {
            if (key === 'allowAutoRegisterOnPhoneLogin') return Promise.resolve(false);
            if (key === 'allowRegister') return Promise.resolve(true);
            return Promise.resolve(defaultValue);
          });

          await expect(service.loginByPhone(phone, code, req)).rejects.toThrow(HttpException);
          await expect(service.loginByPhone(phone, code, req)).rejects.toMatchObject({
            response: { code: 'PHONE_NOT_REGISTERED' },
            status: HttpStatus.PRECONDITION_FAILED,
          });
        });
      });

      describe('when global registration is disabled', () => {
        it('should throw HttpException with PHONE_NOT_REGISTERED', async () => {
          mockRuntimeConfigService.getValue.mockImplementation((key: string, defaultValue: any) => {
            if (key === 'allowAutoRegisterOnPhoneLogin') return Promise.resolve(true);
            if (key === 'allowRegister') return Promise.resolve(false);
            return Promise.resolve(defaultValue);
          });

          await expect(service.loginByPhone(phone, code, req)).rejects.toThrow(HttpException);
        });
      });
    });

    describe('when user creation fails', () => {
      it('should throw InternalServerErrorException', async () => {
        mockRuntimeConfigService.getValue.mockResolvedValue(true);
        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockUserService.create.mockResolvedValue({ id: 'newuser123' });
        mockPrisma.user.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null) // username check
          .mockResolvedValueOnce(null); // after creation returns null

        await expect(service.loginByPhone(phone, code, req)).rejects.toThrow(InternalServerErrorException);
      });
    });
  });
});