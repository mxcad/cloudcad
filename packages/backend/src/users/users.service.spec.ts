import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../common/enums/permissions.enum';
import { DatabaseService } from '../database/database.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: jest.Mocked<DatabaseService>;
  let permissionCacheService: jest.Mocked<PermissionCacheService>;
  let bcryptCompare: jest.MockedFunction<typeof bcrypt.compare>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: null,
    role: UserRole.USER,
    status: 'ACTIVE',
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
    role: UserRole.USER,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as any;

    const mockPermissionCacheService = {
      clearUserCache: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: PermissionCacheService,
          useValue: mockPermissionCacheService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(DatabaseService);
    permissionCacheService = module.get(PermissionCacheService);

    // Mock bcrypt
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedPassword');
    bcryptCompare = jest.spyOn(bcrypt, 'compare') as jest.MockedFunction<typeof bcrypt.compare>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserDto: CreateUserDto = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
      nickname: 'Test User',
      role: UserRole.USER,
    };

    it('should successfully create a new user', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(null); // username check
      prisma.user.create.mockResolvedValue(mockUserWithoutPassword);

      const result = await service.create(createUserDto);

      expect(result).toEqual(mockUserWithoutPassword);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          ...createUserDto,
          password: 'hashedPassword',
        },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should throw ConflictException if username already exists', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(mockUser); // username check

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should hash password before creating user', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue(mockUserWithoutPassword);

      await service.create(createUserDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
    });

    it('should handle database errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.create(createUserDto)).rejects.toThrow('Database error');
    });
  });

  describe('findAll', () => {
    const query: QueryUsersDto = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };

    it('should return paginated users', async () => {
      const mockUsers = [mockUserWithoutPassword];
      const mockTotal = 1;

      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.user.count.mockResolvedValue(mockTotal);

      const result = await service.findAll(query);

      expect(result).toEqual({
        data: mockUsers,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should filter by search term', async () => {
      const searchQuery = { ...query, search: 'test' };
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(searchQuery);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: { contains: 'test', mode: 'insensitive' } },
            { username: { contains: 'test', mode: 'insensitive' } },
            { nickname: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });

    it('should filter by role', async () => {
      const roleQuery = { ...query, role: UserRole.ADMIN };
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(roleQuery);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: UserRole.ADMIN },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });

    it('should combine search and role filters', async () => {
      const combinedQuery = { ...query, search: 'test', role: UserRole.ADMIN };
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(combinedQuery);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: { contains: 'test', mode: 'insensitive' } },
            { username: { contains: 'test', mode: 'insensitive' } },
            { nickname: { contains: 'test', mode: 'insensitive' } },
          ],
          role: UserRole.ADMIN,
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });

    it('should calculate pagination correctly', async () => {
      const paginationQuery = { page: 2, limit: 5 };
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(25);

      const result = await service.findAll(paginationQuery);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        })
      );
      expect(result.pagination.totalPages).toBe(5);
    });

    it('should handle database errors', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.findAll(query)).rejects.toThrow('Database error');
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithoutPassword);

      const result = await service.findOne('user-id');

      expect(result).toEqual(mockUserWithoutPassword);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle database errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.findOne('user-id')).rejects.toThrow('Database error');
    });
  });

  describe('findByEmail', () => {
    it('should return user by email including password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
          password: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should return null if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.findByEmail('test@example.com')).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('update', () => {
    const updateUserDto: UpdateUserDto = {
      nickname: 'Updated Nickname',
    };

    it('should successfully update user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUserWithoutPassword);

      const result = await service.update('user-id', updateUserDto);

      expect(result).toEqual(mockUserWithoutPassword);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: updateUserDto,
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update('invalid-id', updateUserDto)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      const existingUser = { ...mockUser, email: 'existing@example.com' };
      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // current user
        .mockResolvedValueOnce(existingUser); // email conflict

      await expect(
        service.update('user-id', { email: 'existing@example.com' })
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if username already exists', async () => {
      const existingUser = { ...mockUser, username: 'existinguser' };
      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // current user
        .mockResolvedValueOnce(existingUser); // username conflict

      await expect(
        service.update('user-id', { username: 'existinguser' })
      ).rejects.toThrow(ConflictException);
    });

    it('should hash password if provided', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUserWithoutPassword);

      await service.update('user-id', { password: 'newpassword' });

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 12);
    });

    it('should not check uniqueness for unchanged email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUserWithoutPassword);

      await service.update('user-id', { nickname: 'New Nickname' });

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should handle database errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.update('user-id', updateUserDto)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('remove', () => {
    it('should successfully delete user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove('user-id');

      expect(result).toEqual({ message: '用户删除成功' });
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-id' },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('invalid-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle database errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.remove('user-id')).rejects.toThrow('Database error');
    });
  });

  describe('updateStatus', () => {
    it('should successfully update user status', async () => {
      const updatedUser = { ...mockUserWithoutPassword, status: 'INACTIVE' };
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateStatus('user-id', 'INACTIVE');

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { status: 'INACTIVE' },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should handle database errors', async () => {
      prisma.user.update.mockRejectedValue(new Error('Database error'));

      await expect(service.updateStatus('user-id', 'INACTIVE')).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      bcryptCompare.mockResolvedValue(true);

      const result = await service.validatePassword('password', 'hashedPassword');

      expect(result).toBe(true);
      expect(bcryptCompare).toHaveBeenCalledWith('password', 'hashedPassword');
    });

    it('should return false for incorrect password', async () => {
      bcryptCompare.mockResolvedValue(false);

      const result = await service.validatePassword('wrongpassword', 'hashedPassword');

      expect(result).toBe(false);
    });

    it('should handle bcrypt errors', async () => {
      bcryptCompare.mockRejectedValue(new Error('Bcrypt error'));

      await expect(
        service.validatePassword('password', 'hashedPassword')
      ).rejects.toThrow('Bcrypt error');
    });
  });
});