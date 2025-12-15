import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { UsersModule } from '../users/users.module';

export const createTestModule = async (): Promise<TestingModule> => {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
      }),
      DatabaseModule,
      AuthModule,
      UsersModule,
      CommonModule,
      FileSystemModule,
    ],
  }).compile();
};

export const createMockUser = (overrides: any = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  username: 'testuser',
  nickname: 'Test User',
  avatar: null,
  role: 'USER',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockProject = (overrides: any = {}) => ({
  id: 'test-project-id',
  name: 'Test Project',
  description: 'Test project description',
  creatorId: 'test-user-id',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockFile = (overrides: any = {}) => ({
  id: 'test-file-id',
  name: 'test-file.dwg',
  size: 1024,
  mimeType: 'application/dwg',
  projectId: 'test-project-id',
  creatorId: 'test-user-id',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockProjectMember = (overrides: any = {}) => ({
  userId: 'test-user-id',
  projectId: 'test-project-id',
  role: 'MEMBER',
  createdAt: new Date(),
  ...overrides,
});

export const createMockFileAccess = (overrides: any = {}) => ({
  userId: 'test-user-id',
  fileId: 'test-file-id',
  role: 'VIEWER',
  createdAt: new Date(),
  ...overrides,
});

export const testUsers = {
  admin: {
    id: 'admin-user-id',
    email: 'admin@test.com',
    username: 'admin',
    nickname: 'Admin User',
    role: 'ADMIN',
    status: 'ACTIVE',
  },
  user: {
    id: 'regular-user-id',
    email: 'user@test.com',
    username: 'user',
    nickname: 'Regular User',
    role: 'USER',
    status: 'ACTIVE',
  },
  inactive: {
    id: 'inactive-user-id',
    email: 'inactive@test.com',
    username: 'inactive',
    nickname: 'Inactive User',
    role: 'USER',
    status: 'INACTIVE',
  },
};

export const testTokens = {
  admin: 'admin-access-token',
  user: 'user-access-token',
  expired: 'expired-token',
  invalid: 'invalid-token',
};

export const testPermissions = {
  userRead: 'user:read',
  userWrite: 'user:write',
  userDelete: 'user:delete',
  projectCreate: 'project:create',
  projectRead: 'project:read',
  projectWrite: 'project:write',
  projectDelete: 'project:delete',
  fileCreate: 'file:create',
  fileRead: 'file:read',
  fileWrite: 'file:write',
  fileDelete: 'file:delete',
  fileShare: 'file:share',
  fileDownload: 'file:download',
};

export const mockDatabaseService = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  projectMember: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  file: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  fileAccess: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

export const mockJwtService = {
  signAsync: jest.fn(),
  verify: jest.fn(),
  sign: jest.fn(),
};

export const mockConfigService = {
  get: jest.fn((key: string) => {
    const configs = {
      'jwt.secret': 'test-secret',
      'jwt.expiresIn': '1h',
      'jwt.refreshExpiresIn': '7d',
      'database.url': 'postgresql://test:test@localhost:5432/test',
    };
    return configs[key] || null;
  }),
};

export const mockPermissionService = {
  hasPermission: jest.fn(),
  hasRole: jest.fn(),
  hasProjectRole: jest.fn(),
  hasFileRole: jest.fn(),
  getProjectPermissions: jest.fn(),
  getFilePermissions: jest.fn(),
};

export const mockPermissionCacheService = {
  getProjectPermissions: jest.fn(),
  cacheProjectPermissions: jest.fn(),
  invalidateProjectPermissions: jest.fn(),
  getFilePermissions: jest.fn(),
  cacheFilePermissions: jest.fn(),
  invalidateFilePermissions: jest.fn(),
  clearCache: jest.fn(),
  cleanupExpired: jest.fn(),
  getCacheStats: jest.fn(),
};

export const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  validateUser: jest.fn(),
};

export const mockUsersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  findByEmail: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  updateStatus: jest.fn(),
  validatePassword: jest.fn(),
};

export const setupTestDatabase = async () => {
  // This would typically set up a test database
  // For now, we'll use mocks
  jest.clearAllMocks();
};

export const cleanupTestDatabase = async () => {
  // This would typically clean up the test database
  // For now, we'll just clear mocks
  jest.clearAllMocks();
};

export const createTestExecutionContext = (
  user?: any,
  params?: any,
  query?: any,
  body?: any
) => ({
  switchToHttp: jest.fn().mockReturnValue({
    getRequest: jest.fn().mockReturnValue({
      user,
      params: params || {},
      query: query || {},
      body: body || {},
    }),
  }),
  getHandler: jest.fn(),
  getClass: jest.fn(),
});

export const expectValidUserResponse = (response: any, expectedUser: any) => {
  expect(response).toHaveProperty('id');
  expect(response).toHaveProperty('email');
  expect(response).toHaveProperty('username');
  expect(response).toHaveProperty('role');
  expect(response).toHaveProperty('status');
  expect(response).not.toHaveProperty('password');

  if (expectedUser) {
    expect(response.id).toBe(expectedUser.id);
    expect(response.email).toBe(expectedUser.email);
    expect(response.username).toBe(expectedUser.username);
    expect(response.role).toBe(expectedUser.role);
    expect(response.status).toBe(expectedUser.status);
  }
};

export const expectValidAuthResponse = (response: any) => {
  expect(response).toHaveProperty('accessToken');
  expect(response).toHaveProperty('refreshToken');
  expect(response).toHaveProperty('user');
  expectValidUserResponse(response.user, null);
};

export const expectPaginatedResponse = (response: any) => {
  expect(response).toHaveProperty('data');
  expect(response).toHaveProperty('pagination');
  expect(Array.isArray(response.data)).toBe(true);
  expect(response.pagination).toHaveProperty('page');
  expect(response.pagination).toHaveProperty('limit');
  expect(response.pagination).toHaveProperty('total');
  expect(response.pagination).toHaveProperty('totalPages');
};

export const expectErrorResponse = (
  response: any,
  statusCode: number,
  message: string
) => {
  expect(response.statusCode).toBe(statusCode);
  expect(response.message).toContain(message);
};

// Test data factories
export const createTestUserData = (overrides: any = {}) => ({
  email: 'test@example.com',
  username: 'testuser',
  password: 'password123',
  nickname: 'Test User',
  role: 'USER',
  ...overrides,
});

export const createTestProjectData = (overrides: any = {}) => ({
  name: 'Test Project',
  description: 'Test project description',
  ...overrides,
});

export const createTestFileData = (overrides: any = {}) => ({
  name: 'test-file.dwg',
  size: 1024,
  mimeType: 'application/dwg',
  ...overrides,
});

export const createTestLoginData = (account: string, password: string) => ({
  account,
  password,
});

export const createTestUpdateUserData = (overrides: any = {}) => ({
  nickname: 'Updated Nickname',
  avatar: 'updated-avatar-url',
  ...overrides,
});
