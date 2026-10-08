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

// ---------- shared test data shapes ----------
interface MockUser {
  id: string; email: string; username: string; nickname: string;
  avatar: string | null; role: string | { id: string; name: string }; status: string;
  password?: string;
  createdAt: Date; updatedAt: Date;
}

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
