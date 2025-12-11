import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<DatabaseService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: null,
    role: 'USER',
    status: 'ACTIVE',
    password: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const configs = {
        'jwt.secret': 'test-secret',
        'jwt.expiresIn': '1h',
        'jwt.refreshExpiresIn': '7d',
      };
      return configs[key];
    }),
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    } as any;

    const mockJwtService = {
      signAsync: jest.fn(),
      verify: jest.fn(),
    } as any;

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
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(DatabaseService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
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
      // Mock database queries
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // Email not found
        .mockResolvedValueOnce(null); // Username not found

      // Mock password hashing
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedPassword');

      // Mock user creation
      const userWithoutPassword = { ...mockUser };
      delete (userWithoutPassword as any).password;
      prisma.user.create.mockResolvedValue(userWithoutPassword);

      // Mock JWT generation
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(result.user).toEqual({
        ...userWithoutPassword,
        nickname: userWithoutPassword.nickname || undefined,
        avatar: userWithoutPassword.avatar || undefined,
        role: userWithoutPassword.role,
        status: userWithoutPassword.status,
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
    });

    it('should throw ConflictException if username already exists', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // Email not found
        .mockResolvedValueOnce(mockUser); // Username found

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: registerDto.username },
      });
    });

    it('should use username as nickname if not provided', async () => {
      const registerDtoWithoutNickname = { ...registerDto };
      delete registerDtoWithoutNickname.nickname;

      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedPassword');

      const userWithoutPassword = { ...mockUser };
      delete (userWithoutPassword as any).password;
      prisma.user.create.mockResolvedValue(userWithoutPassword);

      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      await service.register(registerDtoWithoutNickname);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: registerDto.email,
          username: registerDto.username,
          password: 'hashedPassword',
          nickname: registerDto.username,
        },
        select: expect.any(Object),
      });
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      account: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login with email', async () => {
      // Mock user lookup
      prisma.user.findFirst.mockResolvedValue(mockUser);

      // Mock password comparison
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      // Mock JWT generation
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockUser.email);
    });

    it('should successfully login with username', async () => {
      const loginDtoWithUsername = { ...loginDto, account: 'testuser' };

      prisma.user.findFirst.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login(loginDtoWithUsername);

      expect(result.user.username).toBe(mockUser.username);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      const inactiveUser = { ...mockUser, status: 'INACTIVE' };
      prisma.user.findFirst.mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('refreshToken', () => {
    const refreshToken = 'valid-refresh-token';

    it('should successfully refresh token', async () => {
      const payload = { sub: mockUser.id, type: 'refresh' };
      jwtService.verify.mockReturnValue(payload);

      const userWithoutPassword = { ...mockUser };
      delete (userWithoutPassword as any).password;
      prisma.user.findUnique.mockResolvedValue(userWithoutPassword);

      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshToken(refreshToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw UnauthorizedException for invalid token type', async () => {
      const payload = { sub: mockUser.id, type: 'access' };
      jwtService.verify.mockReturnValue(payload);

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const payload = { sub: 'invalid-user-id', type: 'refresh' };
      jwtService.verify.mockReturnValue(payload);

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      const payload = { sub: mockUser.id, type: 'refresh' };
      jwtService.verify.mockReturnValue(payload);

      const inactiveUser = { ...mockUser, status: 'INACTIVE' };
      delete (inactiveUser as any).password;
      prisma.user.findUnique.mockResolvedValue(inactiveUser);

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException for malformed token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const userId = 'user-id';
      await expect(service.logout(userId)).resolves.toBeUndefined();
    });
  });

  describe('validateUser', () => {
    it('should validate user with correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await service.validateUser(mockUser.email, 'password123');

      expect(result).toBeTruthy();
      expect(result).not.toHaveProperty('password');
    });

    it('should return null for invalid password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      const result = await service.validateUser(
        mockUser.email,
        'wrong-password'
      );

      expect(result).toBeNull();
    });

    it('should return null for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: 'INACTIVE' };
      prisma.user.findUnique.mockResolvedValue(inactiveUser);

      const result = await service.validateUser(
        inactiveUser.email,
        'password123'
      );

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(
        'nonexistent@example.com',
        'password123'
      );

      expect(result).toBeNull();
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
      };

      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service['generateTokens'](user);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: user.id,
          email: user.email,
          username: user.username,
          type: 'access',
        }),
        expect.any(Object)
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: user.id,
          type: 'refresh',
        }),
        expect.any(Object)
      );
    });
  });
});
