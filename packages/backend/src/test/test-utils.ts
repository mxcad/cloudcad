///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { UsersModule } from '../users/users.module';

// ---------- shared test data shapes ----------
interface MockUser {
  id: string; email: string; username: string; nickname: string;
  avatar: string | null; role: string; status: string;
  createdAt: Date; updatedAt: Date;
}
interface MockProject {
  id: string; name: string; description: string; creatorId: string;
  createdAt: Date; updatedAt: Date;
}
interface MockFile {
  id: string; name: string; size: number; mimeType: string;
  projectId: string; creatorId: string;
  createdAt: Date; updatedAt: Date;
}
interface MockProjectMember {
  userId: string; projectId: string; role: string; createdAt: Date;
}
interface MockFileAccess {
  userId: string; fileId: string; role: string; createdAt: Date;
}
interface CreateUserData {
  email: string; username: string; password: string; nickname: string; role: string;
}
interface CreateProjectData {
  name: string; description: string;
}
interface CreateFileData {
  name: string; size: number; mimeType: string;
}
interface UpdateUserData {
  nickname: string; avatar: string;
}

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

export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
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

export const createMockProject = (overrides: Partial<MockProject> = {}): MockProject => ({
  id: 'test-project-id',
  name: 'Test Project',
  description: 'Test project description',
  creatorId: 'test-user-id',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockFile = (overrides: Partial<MockFile> = {}): MockFile => ({
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

export const createMockProjectMember = (overrides: Partial<MockProjectMember> = {}): MockProjectMember => ({
  userId: 'test-user-id',
  projectId: 'test-project-id',
  role: 'MEMBER',
  createdAt: new Date(),
  ...overrides,
});

export const createMockFileAccess = (overrides: Partial<MockFileAccess> = {}): MockFileAccess => ({
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
  user?: Record<string, unknown>,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
  body?: Record<string, unknown>,
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

export const expectValidUserResponse = (
  response: Record<string, unknown>,
  expectedUser: Record<string, unknown> | null,
) => {
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
  response: Record<string, unknown>,
  statusCode: number,
  message: string,
) => {
  expect(response.statusCode).toBe(statusCode);
  expect(response.message).toContain(message);
};

// Test data factories
export const createTestUserData = (overrides: Partial<CreateUserData> = {}): CreateUserData => ({
  email: 'test@example.com',
  username: 'testuser',
  password: 'password123',
  nickname: 'Test User',
  role: 'USER',
  ...overrides,
});

export const createTestProjectData = (overrides: Partial<CreateProjectData> = {}): CreateProjectData => ({
  name: 'Test Project',
  description: 'Test project description',
  ...overrides,
});

export const createTestFileData = (overrides: Partial<CreateFileData> = {}): CreateFileData => ({
  name: 'test-file.dwg',
  size: 1024,
  mimeType: 'application/dwg',
  ...overrides,
});

export const createTestLoginData = (account: string, password: string) => ({
  account,
  password,
});

export const createTestUpdateUserData = (overrides: Partial<UpdateUserData> = {}): UpdateUserData => ({
  nickname: 'Updated Nickname',
  avatar: 'updated-avatar-url',
  ...overrides,
});
