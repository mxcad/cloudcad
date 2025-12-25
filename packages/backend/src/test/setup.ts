import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_URL =
    'postgresql://postgres:password@localhost:5432/cloucad_test';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_PORT = '9000';
  process.env.MINIO_ACCESS_KEY = 'minioadmin';
  process.env.MINIO_SECRET_KEY = 'minioadmin';

  // Mock console methods to reduce noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(async () => {
  // Restore console methods
  jest.restoreAllMocks();
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  jest.clearAllTimers();
  jest.useRealTimers();
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
});

// Extend Jest matchers for custom assertions
expect.extend({
  toBeValidUser(received) {
    const pass =
      received &&
      typeof received.id === 'string' &&
      typeof received.email === 'string' &&
      typeof received.username === 'string' &&
      typeof received.role === 'string' &&
      typeof received.status === 'string' &&
      !Object.hasOwn(received, 'password');

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid user`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid user`,
        pass: false,
      };
    }
  },

  toBeValidAuthResponse(received) {
    const pass =
      received &&
      typeof received.accessToken === 'string' &&
      typeof received.refreshToken === 'string' &&
      received.user &&
      typeof received.user.id === 'string' &&
      typeof received.user.email === 'string' &&
      !Object.hasOwn(received.user, 'password');

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid auth response`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid auth response`,
        pass: false,
      };
    }
  },

  toBeValidPaginatedResponse(received) {
    const pass =
      received &&
      Array.isArray(received.data) &&
      received.pagination &&
      typeof received.pagination.page === 'number' &&
      typeof received.pagination.limit === 'number' &&
      typeof received.pagination.total === 'number' &&
      typeof received.pagination.totalPages === 'number';

    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be a valid paginated response`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid paginated response`,
        pass: false,
      };
    }
  },

  toHavePermission(received, permission) {
    const pass = Array.isArray(received) && received.includes(permission);

    if (pass) {
      return {
        message: () =>
          `expected permissions ${received} not to include ${permission}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected permissions ${received} to include ${permission}`,
        pass: false,
      };
    }
  },

  toBeInStatus(received, status) {
    const pass = received && received.status === status;

    if (pass) {
      return {
        message: () => `expected user status not to be ${status}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected user status to be ${status}`,
        pass: false,
      };
    }
  },
});

// Declare custom matcher types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUser(): R;
      toBeValidAuthResponse(): R;
      toBeValidPaginatedResponse(): R;
      toHavePermission(permission: string): R;
      toBeInStatus(status: string): R;
    }
  }
}

// Mock external dependencies
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(false),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(undefined),
    removeObject: jest.fn().mockResolvedValue(undefined),
    listObjects: jest.fn().mockReturnValue([]),
  })),
}));

// Mock Redis
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    flushdb: jest.fn().mockResolvedValue('OK'),
  })),
}));

// Global test utilities
global.createMockRequest = (
  user?: any,
  params?: any,
  query?: any,
  body?: any
) => ({
  user,
  params: params || {},
  query: query || {},
  body: body || {},
  headers: {},
  method: 'GET',
  url: '/',
});

global.createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

global.createMockNext = () => jest.fn();

global.sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

global.generateId = () => Math.random().toString(36).substring(2, 15);

global.generateEmail = () => `test-${global.generateId()}@example.com`;

global.generateUsername = () => `testuser-${global.generateId()}`;

// Test data generators
global.createTestUser = (overrides: any = {}) => ({
  id: global.generateId(),
  email: global.generateEmail(),
  username: global.generateUsername(),
  nickname: 'Test User',
  avatar: null,
  role: 'USER',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

global.createTestProject = (overrides: any = {}) => ({
  id: global.generateId(),
  name: 'Test Project',
  description: 'Test project description',
  creatorId: global.generateId(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

global.createTestFile = (overrides: any = {}) => ({
  id: global.generateId(),
  name: 'test-file.dwg',
  size: 1024,
  mimeType: 'application/dwg',
  projectId: global.generateId(),
  creatorId: global.generateId(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});
