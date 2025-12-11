/**
 * 共享类型包测试
 */

import {
  User,
  UserRole,
  UserStatus,
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  Permission,
  ProjectStatus,
  FileStatus,
  LibraryType,
  ApiResponse,
  PaginatedResponse,
} from '../src';

describe('共享类型包测试', () => {
  describe('用户类型', () => {
    it('应该创建有效的用户对象', () => {
      const user: User = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        nickname: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      expect(user.id).toBe('user-123');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe(UserRole.USER);
      expect(user.status).toBe(UserStatus.ACTIVE);
    });

    it('应该验证用户角色枚举', () => {
      expect(UserRole.ADMIN).toBe('ADMIN');
      expect(UserRole.USER).toBe('USER');
    });

    it('应该验证用户状态枚举', () => {
      expect(UserStatus.ACTIVE).toBe('ACTIVE');
      expect(UserStatus.INACTIVE).toBe('INACTIVE');
      expect(UserStatus.SUSPENDED).toBe('SUSPENDED');
    });
  });

  describe('认证类型', () => {
    it('应该创建有效的登录DTO', () => {
      const loginDto: LoginDto = {
        account: 'test@example.com',
        password: 'password123',
      };

      expect(loginDto.account).toBe('test@example.com');
      expect(loginDto.password).toBe('password123');
    });

    it('应该创建有效的注册DTO', () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        nickname: 'Test User',
      };

      expect(registerDto.email).toBe('test@example.com');
      expect(registerDto.username).toBe('testuser');
      expect(registerDto.nickname).toBe('Test User');
    });

    it('应该创建有效的认证响应', () => {
      const authResponse: AuthResponseDto = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          nickname: 'Test User',
          role: 'USER',
          status: 'ACTIVE',
        },
      };

      expect(authResponse.accessToken).toBe('access-token');
      expect(authResponse.refreshToken).toBe('refresh-token');
      expect(authResponse.user.id).toBe('user-123');
    });
  });

  describe('权限类型', () => {
    it('应该验证权限枚举', () => {
      expect(Permission.USER_READ).toBe('user:read');
      expect(Permission.PROJECT_CREATE).toBe('project:create');
      expect(Permission.FILE_DOWNLOAD).toBe('file:download');
      expect(Permission.SYSTEM_ADMIN).toBe('system:admin');
    });
  });

  describe('项目类型', () => {
    it('应该验证项目状态枚举', () => {
      expect(ProjectStatus.ACTIVE).toBe('ACTIVE');
      expect(ProjectStatus.ARCHIVED).toBe('ARCHIVED');
      expect(ProjectStatus.DELETED).toBe('DELETED');
    });
  });

  describe('文件类型', () => {
    it('应该验证文件状态枚举', () => {
      expect(FileStatus.UPLOADING).toBe('UPLOADING');
      expect(FileStatus.PROCESSING).toBe('PROCESSING');
      expect(FileStatus.COMPLETED).toBe('COMPLETED');
      expect(FileStatus.FAILED).toBe('FAILED');
      expect(FileStatus.DELETED).toBe('DELETED');
    });
  });

  describe('资源库类型', () => {
    it('应该验证资源库类型枚举', () => {
      expect(LibraryType.BLOCK).toBe('block');
      expect(LibraryType.FONT).toBe('font');
    });
  });

  describe('通用类型', () => {
    it('应该创建有效的API响应', () => {
      const apiResponse: ApiResponse<string> = {
        data: 'success',
        message: '操作成功',
        statusCode: 200,
        timestamp: '2023-01-01T00:00:00Z',
      };

      expect(apiResponse.data).toBe('success');
      expect(apiResponse.message).toBe('操作成功');
      expect(apiResponse.statusCode).toBe(200);
    });

    it('应该创建有效的分页响应', () => {
      const paginatedResponse: PaginatedResponse<User> = {
        data: [
          {
            id: 'user-1',
            email: 'user1@example.com',
            username: 'user1',
            role: UserRole.USER,
            status: UserStatus.ACTIVE,
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-01T00:00:00Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      expect(paginatedResponse.data).toHaveLength(1);
      expect(paginatedResponse.pagination.page).toBe(1);
      expect(paginatedResponse.pagination.total).toBe(1);
    });
  });

  describe('类型兼容性', () => {
    it('应该确保前后端类型兼容', () => {
      // 模拟前端使用类型
      const frontendUser: User = {
        id: 'frontend-user',
        email: 'frontend@example.com',
        username: 'frontend',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      // 模拟后端返回数据
      const backendResponse = {
        id: 'frontend-user',
        email: 'frontend@example.com',
        username: 'frontend',
        role: 'USER' as UserRole,
        status: 'ACTIVE' as UserStatus,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      // 验证类型兼容性
      expect(frontendUser.id).toBe(backendResponse.id);
      expect(frontendUser.email).toBe(backendResponse.email);
      expect(frontendUser.role).toBe(backendResponse.role);
      expect(frontendUser.status).toBe(backendResponse.status);
    });
  });
});