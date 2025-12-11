import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../common/enums/permissions.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  const mockUser = {
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

  const mockPaginatedResponse = {
    data: [mockUser],
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    },
  };

  beforeEach(async () => {
    const mockUsersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      updateStatus: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
    .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(require('../common/guards/roles.guard').RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
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

    it('should create user successfully', async () => {
      usersService.create.mockResolvedValue(mockUser);

      const result = await controller.create(createUserDto);

      expect(result).toEqual(mockUser);
      expect(usersService.create).toHaveBeenCalledWith(createUserDto);
    });

    it('should handle conflict exception', async () => {
      usersService.create.mockRejectedValue(
        new ConflictException('邮箱已存在')
      );

      await expect(controller.create(createUserDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should handle validation errors', async () => {
      const invalidDto = { ...createUserDto, email: 'invalid-email' };

      usersService.create.mockResolvedValue(mockUser);

      await controller.create(invalidDto as any);

      expect(usersService.create).toHaveBeenCalledWith(invalidDto);
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
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      const result = await controller.findAll(query);

      expect(result).toEqual(mockPaginatedResponse);
      expect(usersService.findAll).toHaveBeenCalledWith(query);
    });

    it('should handle search query', async () => {
      const searchQuery = { ...query, search: 'test' };
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(searchQuery);

      expect(usersService.findAll).toHaveBeenCalledWith(searchQuery);
    });

    it('should handle role filter', async () => {
      const roleQuery = { ...query, role: UserRole.ADMIN };
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(roleQuery);

      expect(usersService.findAll).toHaveBeenCalledWith(roleQuery);
    });

    it('should handle default pagination values', async () => {
      const emptyQuery = {};

      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(emptyQuery as any);

      expect(usersService.findAll).toHaveBeenCalled();
    });

    it('should handle large page numbers', async () => {
      const largePageQuery = { ...query, page: 100 };
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(largePageQuery);

      expect(usersService.findAll).toHaveBeenCalledWith(largePageQuery);
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      usersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.findOne('user-id');

      expect(result).toEqual(mockUser);
      expect(usersService.findOne).toHaveBeenCalledWith('user-id');
    });

    it('should handle not found exception', async () => {
      usersService.findOne.mockRejectedValue(
        new NotFoundException('用户不存在')
      );

      await expect(controller.findOne('invalid-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle invalid id format', async () => {
      usersService.findOne.mockRejectedValue(
        new NotFoundException('用户不存在')
      );

      await expect(controller.findOne('')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateUserDto: UpdateUserDto = {
      nickname: 'Updated Nickname',
    };

    it('should update user successfully', async () => {
      const updatedUser = { ...mockUser, ...updateUserDto };
      usersService.update.mockResolvedValue(updatedUser);

      const result = await controller.update('user-id', updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(usersService.update).toHaveBeenCalledWith('user-id', updateUserDto);
    });

    it('should handle not found exception', async () => {
      usersService.update.mockRejectedValue(
        new NotFoundException('用户不存在')
      );

      await expect(controller.update('invalid-id', updateUserDto)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle conflict exception', async () => {
      usersService.update.mockRejectedValue(
        new ConflictException('邮箱已存在')
      );

      await expect(controller.update('user-id', updateUserDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { nickname: 'New Nickname' };
      const updatedUser = { ...mockUser, ...partialUpdate };
      usersService.update.mockResolvedValue(updatedUser);

      const result = await controller.update('user-id', partialUpdate);

      expect(result).toEqual(updatedUser);
      expect(usersService.update).toHaveBeenCalledWith('user-id', partialUpdate);
    });

    it('should handle empty update object', async () => {
      usersService.update.mockResolvedValue(mockUser);

      const result = await controller.update('user-id', {});

      expect(result).toEqual(mockUser);
      expect(usersService.update).toHaveBeenCalledWith('user-id', {});
    });
  });

  describe('remove', () => {
    it('should remove user successfully', async () => {
      usersService.remove.mockResolvedValue({ message: '用户删除成功' });

      const result = await controller.remove('user-id');

      expect(result).toEqual({ message: '用户删除成功' });
      expect(usersService.remove).toHaveBeenCalledWith('user-id');
    });

    it('should handle not found exception', async () => {
      usersService.remove.mockRejectedValue(
        new NotFoundException('用户不存在')
      );

      await expect(controller.remove('invalid-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle foreign key constraints', async () => {
      usersService.remove.mockRejectedValue(
        new BadRequestException('无法删除用户，存在关联数据')
      );

      await expect(controller.remove('user-id')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('updateStatus', () => {
    it('should update user status successfully', async () => {
      const updatedUser = { ...mockUser, status: 'INACTIVE' };
      usersService.updateStatus.mockResolvedValue(updatedUser);

      const result = await controller.updateStatus('user-id', 'INACTIVE');

      expect(result).toEqual(updatedUser);
      expect(usersService.updateStatus).toHaveBeenCalledWith('user-id', 'INACTIVE');
    });

    it('should handle not found exception', async () => {
      usersService.updateStatus.mockRejectedValue(
        new NotFoundException('用户不存在')
      );

      await expect(controller.updateStatus('invalid-id', 'ACTIVE')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle invalid status', async () => {
      usersService.updateStatus.mockRejectedValue(
        new BadRequestException('无效的用户状态')
      );

      await expect(controller.updateStatus('user-id', 'INVALID' as any)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should handle all valid statuses', async () => {
      const statuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
      
      for (const status of statuses) {
        const updatedUser = { ...mockUser, status };
        usersService.updateStatus.mockResolvedValue(updatedUser);

        const result = await controller.updateStatus('user-id', status);

        expect(result).toEqual(updatedUser);
        expect(usersService.updateStatus).toHaveBeenCalledWith('user-id', status);
      }
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      usersService.findOne.mockRejectedValue(new Error('Database error'));

      await expect(controller.findOne('user-id')).rejects.toThrow('Database error');
    });

    it('should handle database connection errors', async () => {
      usersService.findOne.mockRejectedValue(new Error('Connection refused'));

      await expect(controller.findOne('user-id')).rejects.toThrow('Connection refused');
    });

    it('should handle timeout errors', async () => {
      usersService.findOne.mockRejectedValue(new Error('Request timeout'));

      await expect(controller.findOne('user-id')).rejects.toThrow('Request timeout');
    });
  });

  describe('input validation edge cases', () => {
    it('should handle very long usernames', async () => {
      const longUsername = 'a'.repeat(300);
      const createUserDto = {
        email: 'test@example.com',
        username: longUsername,
        password: 'password123',
      };

      usersService.create.mockResolvedValue(mockUser);

      await controller.create(createUserDto as any);

      expect(usersService.create).toHaveBeenCalledWith(createUserDto);
    });

    it('should handle special characters in nickname', async () => {
      const specialNickname = '测试用户!@#$%^&*()';
      const updateUserDto = { nickname: specialNickname };
      const updatedUser = { ...mockUser, ...updateUserDto };
      
      usersService.update.mockResolvedValue(updatedUser);

      const result = await controller.update('user-id', updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(usersService.update).toHaveBeenCalledWith('user-id', updateUserDto);
    });

    it('should handle unicode characters', async () => {
      const unicodeEmail = '测试@example.com';
      const createUserDto = {
        email: unicodeEmail,
        username: 'testuser',
        password: 'password123',
      };

      usersService.create.mockResolvedValue(mockUser);

      await controller.create(createUserDto as any);

      expect(usersService.create).toHaveBeenCalledWith(createUserDto);
    });
  });

  describe('response format consistency', () => {
    it('should always return consistent user format', async () => {
      usersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.findOne('user-id');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('username');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('status');
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('pagination edge cases', () => {
    it('should handle page 0', async () => {
      const query = { page: 0, limit: 10 };
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(query as any);

      expect(usersService.findAll).toHaveBeenCalledWith(query);
    });

    it('should handle negative page numbers', async () => {
      const query = { page: -1, limit: 10 };
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(query as any);

      expect(usersService.findAll).toHaveBeenCalledWith(query);
    });

    it('should handle very large limit', async () => {
      const query = { page: 1, limit: 1000 };
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(query as any);

      expect(usersService.findAll).toHaveBeenCalledWith(query);
    });

    it('should handle limit 0', async () => {
      const query = { page: 1, limit: 0 };
      usersService.findAll.mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(query as any);

      expect(usersService.findAll).toHaveBeenCalledWith(query);
    });
  });
});