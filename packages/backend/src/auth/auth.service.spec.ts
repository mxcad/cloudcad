import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailService } from './services/email.service';
import { EmailVerificationService } from './services/email-verification.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<DatabaseService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let tokenBlacklistService: jest.Mocked<TokenBlacklistService>;
  let mockRedis: any;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: null,
    role: 'USER',
    status: 'ACTIVE',
    emailVerified: true,
    password: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserWithoutPassword = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: null,
    role: 'USER',
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.secret') return 'test-jwt-secret';
        if (key === 'jwt.expiresIn') return '1h';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        return undefined;
      }),
    };

    const mockTokenBlacklistService = {
      addToBlacklist: jest.fn(),
      isTokenBlacklisted: jest.fn(),
      blacklistAllUserTokens: jest.fn(),
      removeFromBlacklist: jest.fn(),
    };

    const mockEmailService = {
      sendVerificationEmail: jest.fn(),
    };

    const mockEmailVerificationService = {
      generateVerificationToken: jest.fn(),
      storeVerificationInfo: jest.fn(),
      verifyCode: jest.fn(),
      getVerificationInfo: jest.fn(),
      deleteVerificationInfo: jest.fn(),
      sendVerificationEmail: jest.fn(),
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      keys: jest.fn(),
      flushdb: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklistService,
        },
        {
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
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

    service = module.get<AuthService>(AuthService);
    prisma = module.get(DatabaseService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    tokenBlacklistService = module.get(TokenBlacklistService);

    // 重置 jwtService mocks
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      exp: Date.now() / 1000 + 60,
    });
    jwtService.verify.mockResolvedValue({
      sub: 'user-id',
      exp: Date.now() / 1000 + 60,
    });
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

    it('should successfully register a new user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.register(registerDto);

      expect(result).toEqual({
        message: '验证码已发送到您的邮箱，请查收并完成验证',
        email: registerDto.email,
      });
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should throw ConflictException if username already exists', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should handle database errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.register(registerDto)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      account: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login with email', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        exp: Date.now() / 1000 + 60,
      });
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'token-id' });

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          ...mockUserWithoutPassword,
          avatar: undefined,
        },
      });
    });

    it('should successfully login with username', async () => {
      const loginWithUsername = { ...loginDto, account: 'testuser' };
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        exp: Date.now() / 1000 + 60,
      });
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'token-id' });

      const result = await service.login(loginWithUsername);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          ...mockUserWithoutPassword,
          avatar: undefined,
        },
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should handle database errors', async () => {
      prisma.user.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.login(loginDto)).rejects.toThrow('Database error');
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token', async () => {
      const mockRefreshToken = {
        id: 'token-id',
        token: 'refresh-token',
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      jwtService.verify.mockResolvedValue({ sub: 'user-id', type: 'refresh' });
      prisma.refreshToken.findFirst.mockResolvedValue(mockRefreshToken);
      tokenBlacklistService.isTokenBlacklisted.mockResolvedValue(false);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      prisma.refreshToken.create.mockResolvedValue({ id: 'new-token-id' });

      const result = await service.refreshToken('refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          avatar: null,
          role: 'USER',
          status: 'ACTIVE',
        },
      });
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if token is blacklisted', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        type: 'refresh',
      });
      tokenBlacklistService.isTokenBlacklisted.mockResolvedValue(true);

      await expect(service.refreshToken('blacklisted-token')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        type: 'refresh',
      });
      prisma.refreshToken.findMany.mockResolvedValue([]);
      tokenBlacklistService.isTokenBlacklisted.mockResolvedValue(false);

      await expect(service.refreshToken('refresh-token')).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('logout', () => {
    it('should successfully logout', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout('user-id');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
      });
    });

    it('should handle logout errors gracefully', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      // Should not throw error
      await expect(service.logout('invalid-token')).resolves.toBeUndefined();
    });
  });

  describe('validateUser', () => {
    it('should return user without password if credentials are valid', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(
        'test@example.com',
        'password123'
      );

      expect(result).toEqual(mockUserWithoutPassword);
    });

    it('should return null if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(
        'test@example.com',
        'password123'
      );

      expect(result).toBeNull();
    });

    it('should return null if password is incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrongpassword'
      );

      expect(result).toBeNull();
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service['generateTokens'](mockUser);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          type: 'access',
        }),
        expect.any(Object)
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          type: 'refresh',
        }),
        expect.any(Object)
      );
    });
  });
});
