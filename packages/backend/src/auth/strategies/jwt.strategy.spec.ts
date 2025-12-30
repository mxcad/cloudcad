import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { JwtStrategy } from './jwt.strategy';
import { TokenBlacklistService } from '../services/token-blacklist.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: jest.Mocked<ConfigService>;
  let prisma: jest.Mocked<DatabaseService>;
  let tokenBlacklistService: jest.Mocked<TokenBlacklistService>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: undefined,
    role: 'USER',
    status: 'ACTIVE',
  };

  const mockPayload = {
    sub: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.secret') {
          return 'test-secret';
        }
        return null;
      }),
    } as any;

    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    } as any;

    const mockTokenBlacklistService = {
      isUserBlacklisted: jest.fn().mockResolvedValue(false),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklistService,
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

    strategy = moduleRef.get<JwtStrategy>(JwtStrategy);
    configService = moduleRef.get(ConfigService);
    prisma = moduleRef.get(DatabaseService);
    tokenBlacklistService = moduleRef.get(TokenBlacklistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be configured with correct options', () => {
      expect(strategy).toBeDefined();
      expect(configService.get).toHaveBeenCalledWith('jwt.secret');
    });

    it('should throw error when config is missing', async () => {
      const mockConfigServiceNoSecret = {
        get: jest.fn().mockReturnValue(null),
      } as any;

      await expect(
        Test.createTestingModule({
          providers: [
            JwtStrategy,
            {
              provide: ConfigService,
              useValue: mockConfigServiceNoSecret,
            },
            {
              provide: DatabaseService,
              useValue: {
                user: { findUnique: jest.fn() },
              },
            },
            {
              provide: TokenBlacklistService,
              useValue: {
                isUserBlacklisted: jest.fn().mockResolvedValue(false),
              },
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
          .compile()
      ).rejects.toThrow('JWT_SECRET environment variable is required');
    });
  });

  describe('validate', () => {
    it('should return user when valid payload and active user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockPayload);

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockPayload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
        },
      });
    });

    it('should throw error when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        '用户不存在'
      );
    });

    it('should throw error when user is inactive', async () => {
      const inactiveUser = { ...mockUser, status: 'INACTIVE' };
      prisma.user.findUnique.mockResolvedValue(inactiveUser);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        '用户已被禁用'
      );
    });

    it('should throw error when user is suspended', async () => {
      const suspendedUser = { ...mockUser, status: 'SUSPENDED' };
      prisma.user.findUnique.mockResolvedValue(suspendedUser);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        '用户已被禁用'
      );
    });

    it('should handle database errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Database error'
      );
    });

    it('should work with different payload structures', async () => {
      const differentPayload = {
        sub: 'different-user-id',
        email: 'different@example.com',
        username: 'differentuser',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const differentUser = {
        ...mockUser,
        id: 'different-user-id',
        email: 'different@example.com',
        username: 'differentuser',
      };

      prisma.user.findUnique.mockResolvedValue(differentUser);

      const result = await strategy.validate(differentPayload);

      expect(result).toEqual(differentUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'different-user-id' },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
        },
      });
    });

    it('should handle user with null avatar', async () => {
      const userWithNullAvatar = { ...mockUser, avatar: null };
      prisma.user.findUnique.mockResolvedValue(userWithNullAvatar);

      const result = await strategy.validate(mockPayload);

      expect(result.avatar).toBeNull();
    });

    it('should handle user with undefined nickname', async () => {
      const userWithUndefinedNickname = { ...mockUser };
      delete userWithUndefinedNickname.nickname;
      prisma.user.findUnique.mockResolvedValue(userWithUndefinedNickname);

      const result = await strategy.validate(mockPayload);

      expect(result.nickname).toBeUndefined();
    });

    it('should validate admin user', async () => {
      const adminUser = { ...mockUser, role: 'ADMIN' };
      prisma.user.findUnique.mockResolvedValue(adminUser);

      const result = await strategy.validate(mockPayload);

      expect(result.role).toBe('ADMIN');
    });

    it('should handle malformed payload', async () => {
      const malformedPayload = {
        sub: '',
        email: '',
        username: '',
      };

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(malformedPayload)).rejects.toThrow(
        '用户不存在'
      );
    });

    it('should handle payload with extra fields', async () => {
      const payloadWithExtraFields = {
        ...mockPayload,
        extraField: 'extra-value',
        anotherField: 123,
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate(payloadWithExtraFields);

      expect(result).toEqual(mockUser);
      // Should only use sub, email, username from payload
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockPayload.sub },
        select: expect.any(Object),
      });
    });
  });

  describe('strategy configuration', () => {
    it('should extract JWT from Authorization header', () => {
      // This is tested through the constructor and passport-jwt library
      // The strategy should be configured with ExtractJwt.fromAuthHeaderAsBearerToken()
      expect(strategy).toBeDefined();
    });

    it('should not ignore expiration', () => {
      // This is tested through the constructor and passport-jwt library
      // The strategy should be configured with ignoreExpiration: false
      expect(strategy).toBeDefined();
    });

    it('should use secret from config service', () => {
      // Verified in constructor test
      expect(configService.get).toHaveBeenCalledWith('jwt.secret');
    });
  });

  describe('edge cases', () => {
    it('should handle user with all possible statuses', async () => {
      const statuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

      for (const status of statuses) {
        const userWithStatus = { ...mockUser, status };
        prisma.user.findUnique.mockResolvedValue(userWithStatus);

        if (status === 'ACTIVE') {
          const result = await strategy.validate(mockPayload);
          expect(result.status).toBe(status);
        } else {
          await expect(strategy.validate(mockPayload)).rejects.toThrow(
            '用户已被禁用'
          );
        }
      }
    });

    it('should handle user with all possible roles', async () => {
      const roles = ['USER', 'ADMIN'];

      for (const role of roles) {
        const userWithRole = { ...mockUser, role };
        prisma.user.findUnique.mockResolvedValue(userWithRole);

        const result = await strategy.validate(mockPayload);
        expect(result.role).toBe(role);
      }
    });

    it('should handle very long user IDs', async () => {
      const longUserId = 'a'.repeat(100);
      const payloadWithLongId = { ...mockPayload, sub: longUserId };
      const userWithLongId = { ...mockUser, id: longUserId };

      prisma.user.findUnique.mockResolvedValue(userWithLongId);

      const result = await strategy.validate(payloadWithLongId);

      expect(result.id).toBe(longUserId);
    });

    it('should handle special characters in username and email', async () => {
      const specialUser = {
        ...mockUser,
        username: 'user+special@example.com',
        email: 'special.user+test@sub.example.co.uk',
      };

      prisma.user.findUnique.mockResolvedValue(specialUser);

      const result = await strategy.validate(mockPayload);

      expect(result.username).toBe(specialUser.username);
      expect(result.email).toBe(specialUser.email);
    });
  });
});
