import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { UserStatus } from '../common/enums/user-status.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let emailVerificationService: jest.Mocked<EmailVerificationService>;

  const mockAuthResponse = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: {
      id: 'user-id',
      email: 'test@example.com',
      username: 'testuser',
      nickname: 'Test User',
      avatar: null,
      role: 'USER',
      status: UserStatus.ACTIVE,
    },
  };

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    password: 'hashed-password',
    nickname: 'Test User',
    avatar: null,
    roleId: 'role-id',
    role: 'USER' as const,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      verifyEmailAndActivate: jest.fn(),
    } as any;

    const mockEmailVerificationService = {
      sendVerificationEmail: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerificationEmail: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    emailVerificationService = module.get(EmailVerificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
      nickname: 'Test User',
    };

    it('should register user successfully', async () => {
      authService.register.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(registerDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should handle conflict exception', async () => {
      authService.register.mockRejectedValue(
        new ConflictException('邮箱已存在')
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should handle validation errors', async () => {
      const invalidDto = { ...registerDto, email: 'invalid-email' };

      // Validation is handled by NestJS validation pipe
      // This test ensures the controller passes the DTO to the service
      authService.register.mockResolvedValue(mockAuthResponse);

      await controller.register(invalidDto as any);

      expect(authService.register).toHaveBeenCalledWith(invalidDto);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      account: 'test@example.com',
      password: 'password123',
    };

    it('should login user successfully', async () => {
      authService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });

    it('should handle unauthorized exception', async () => {
      authService.login.mockRejectedValue(
        new UnauthorizedException('账号或密码错误')
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should login with username', async () => {
      const loginWithUsername = { ...loginDto, account: 'testuser' };
      authService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginWithUsername);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginWithUsername);
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto = {
      refreshToken: 'refresh-token',
    };

    it('should refresh token successfully', async () => {
      authService.refreshToken.mockResolvedValue(mockAuthResponse);

      const result = await controller.refreshToken(refreshTokenDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.refreshToken).toHaveBeenCalledWith(
        refreshTokenDto.refreshToken
      );
    });

    it('should handle invalid refresh token', async () => {
      authService.refreshToken.mockRejectedValue(
        new UnauthorizedException('无效的刷新Token')
      );

      await expect(controller.refreshToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should handle expired refresh token', async () => {
      authService.refreshToken.mockRejectedValue(
        new UnauthorizedException('Token已过期')
      );

      await expect(controller.refreshToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('logout', () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      username: 'testuser',
    };

    it('should logout user successfully', async () => {
      authService.logout.mockResolvedValue(undefined);

      const mockRequest = { user: mockUser };
      const result = await controller.logout(mockRequest);

      expect(result).toEqual({ message: '登出成功' });
      expect(authService.logout).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle logout errors gracefully', async () => {
      authService.logout.mockRejectedValue(new Error('Logout error'));
      const mockRequest = { user: mockUser };

      await expect(controller.logout(mockRequest)).rejects.toThrow(
        'Logout error'
      );
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockRequest = { user: mockUser };
      const result = await controller.getProfile(mockRequest);

      expect(result).toEqual(mockUser);
    });

    it('should handle user with undefined avatar', async () => {
      const userWithUndefinedAvatar = { ...mockUser, avatar: undefined };
      const mockRequest = { user: userWithUndefinedAvatar };

      const result = await controller.getProfile(mockRequest);

      expect(result.avatar).toBeUndefined();
    });

    it('should handle user with null nickname', async () => {
      const userWithoutNickname = { ...mockUser, nickname: null };
      const mockRequest = { user: userWithoutNickname };

      const result = await controller.getProfile(mockRequest);

      expect(result.nickname).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        nickname: 'Test User',
      };

      authService.register.mockRejectedValue(new Error('Service error'));

      await expect(controller.register(registerDto)).rejects.toThrow(
        'Service error'
      );
    });

    it('should handle database connection errors', async () => {
      const loginDto: LoginDto = {
        account: 'test@example.com',
        password: 'password123',
      };

      authService.login.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('input validation edge cases', () => {
    it('should handle empty email', async () => {
      const registerDto: RegisterDto = {
        email: '',
        username: 'testuser',
        password: 'password123',
        nickname: 'Test User',
      };

      authService.register.mockResolvedValue(mockAuthResponse);

      await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should handle very long username', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        username: 'a'.repeat(100),
        password: 'password123',
        nickname: 'Test User',
      };

      authService.register.mockResolvedValue(mockAuthResponse);

      await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should handle special characters in password', async () => {
      const loginDto: LoginDto = {
        account: 'test@example.com',
        password: 'p@$$w0rd!#$%',
      };

      authService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });

    it('should handle numeric account for login', async () => {
      const loginDto: LoginDto = {
        account: '123456',
        password: 'password123',
      };

      authService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('response format consistency', () => {
    it('should always return consistent auth response format', async () => {
      authService.register.mockResolvedValue(mockAuthResponse);
      authService.login.mockResolvedValue(mockAuthResponse);
      authService.refreshToken.mockResolvedValue(mockAuthResponse);

      const registerResult = await controller.register({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        nickname: 'Test User',
      });

      const loginResult = await controller.login({
        account: 'test@example.com',
        password: 'password123',
      });

      const refreshResult = await controller.refreshToken({
        refreshToken: 'refresh-token',
      });

      expect(registerResult).toHaveProperty('accessToken');
      expect(registerResult).toHaveProperty('refreshToken');
      expect(registerResult).toHaveProperty('user');

      expect(loginResult).toHaveProperty('accessToken');
      expect(loginResult).toHaveProperty('refreshToken');
      expect(loginResult).toHaveProperty('user');

      expect(refreshResult).toHaveProperty('accessToken');
      expect(refreshResult).toHaveProperty('refreshToken');
      expect(refreshResult).toHaveProperty('user');
    });

    it('should return consistent user profile format', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        nickname: 'Test User',
        avatar: 'avatar-url',
        role: 'USER',
        status: 'ACTIVE',
      };

      const mockRequest = { user };
      const profile = await controller.getProfile(mockRequest);

      expect(profile).toEqual({
        id: user.id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshTokenDto = {
        refreshToken: 'refresh-token',
      };
      authService.refreshToken.mockResolvedValue(mockAuthResponse);

      const result = await controller.refreshToken(refreshTokenDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.refreshToken).toHaveBeenCalledWith(
        refreshTokenDto.refreshToken
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockRequest = { user: { id: 'user-id' } };
      authService.logout.mockResolvedValue(undefined);

      await controller.logout(mockRequest);

      expect(authService.logout).toHaveBeenCalledWith('user-id');
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        nickname: 'Test User',
        avatar: 'avatar-url',
        role: 'USER',
        status: 'ACTIVE',
      };
      const mockRequest = { user };

      const result = await controller.getProfile(mockRequest);

      expect(result).toEqual(user);
    });
  });
});
