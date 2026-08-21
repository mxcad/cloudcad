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

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/cloudcad_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
});

afterAll(async () => {
  // Restore console methods
  jest.restoreAllMocks();
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();

  // 功能版 Redis mock 的共享内存存储：每用例清空，隔离账号限流计数 / 验证码 / 黑名单等跨用例状态
  redisStore.clear();
  // pub/sub 订阅总线跨用例清空，避免失效广播穿透到新用例
  pubSubBus.length = 0;

  // restoreMocks / resetMocks 会在每用例前还原或清空 jest.fn 的实现，统一在此恢复：
  // 1. bcryptjs 委托真实实现（使"错误密码 → 401"等认证语义在集成测试链路中真实成立；
  //    login.service.spec 等单测会在各自的 beforeEach 里再次覆盖为 true）
  (bcrypt.hash as jest.Mock).mockImplementation(bcryptHashImpl);
  (bcrypt.compare as jest.Mock).mockImplementation(bcryptCompareImpl);

  // 2. console 静音（restoreMocks 会还原 beforeAll 中创建的 spy，需每用例重新挂载）
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Clean up after each test
  jest.clearAllTimers();
  jest.useRealTimers();
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {});

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

  // Global test utilities
  function createMockRequest(
    user?: unknown,
    params?: Record<string, unknown>,
    query?: Record<string, unknown>,
    body?: Record<string, unknown>
  ): {
    user: unknown;
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    headers: Record<string, string>;
    method: string;
    url: string;
  };
  function createMockResponse(): {
    status: jest.Mock;
    json: jest.Mock;
    send: jest.Mock;
    redirect: jest.Mock;
  };
  function createMockNext(): jest.Mock;
  function sleep(ms: number): Promise<void>;
  function generateId(): string;
  function generateEmail(): string;
  function generateUsername(): string;
  function createTestUser(
    overrides?: Record<string, unknown>
  ): Record<string, unknown>;
  function createTestProject(
    overrides?: Record<string, unknown>
  ): Record<string, unknown>;
  function createTestFile(
    overrides?: Record<string, unknown>
  ): Record<string, unknown>;
}

// Mock external dependencies
// bcryptjs：直接委托真实实现（jest.requireActual），保证"错误密码 → 401"等认证语义与生产一致。
// 包装成 jest.fn 以兼容单测对 `(bcrypt.compare as jest.Mock).mockResolvedValue(...)` 的覆盖；
// 实现抽成模块级函数声明（jest.mock 会被提升到模块顶部，const 引用会触发 TDZ），
// 供 jest.mock 工厂与 beforeEach（resetMocks 会清空实现）共用。
function bcryptHashImpl(password: string, salt: string | number) {
  return jest.requireActual<typeof bcrypt>('bcryptjs').hash(password, salt);
}
function bcryptCompareImpl(password: string, hash: string | null) {
  if (!hash) return false;
  return jest.requireActual<typeof bcrypt>('bcryptjs').compare(password, hash);
}

jest.mock('bcryptjs', () => ({
  hash: jest.fn(bcryptHashImpl),
  compare: jest.fn(bcryptCompareImpl),
}));

// Mock @nestjs-modules/mailer (module not available in dev environment)
class MockMailerService {
  sendMail = jest.fn().mockResolvedValue(undefined);
}
const mockMailModule = {
  module: class {},
  providers: [MockMailerService],
  exports: [MockMailerService],
};

jest.mock('@nestjs-modules/mailer', () => ({
  MailerModule: {
    forRoot: () => mockMailModule,
    forRootAsync: () => mockMailModule,
  },
  MailerService: MockMailerService,
  HandlebarsAdapter: function () {
    return {
      compile: () => () => '<html></html>',
    };
  },
}));
jest.mock('@nestjs-modules/mailer/adapters/handlebars.adapter', () => ({
  HandlebarsAdapter: function () {
    return {
      compile: () => () => '<html></html>',
    };
  },
}));

// Mock flydrive (ESM package incompatible with Jest CJS transform)
// 注意：全部使用普通函数而非 jest.fn —— restoreMocks/resetMocks 会清空 jest.fn 实现，
// 导致每用例重建 AppModule 的 suite 在第二次起 new Disk() 返回 undefined 而崩溃。
jest.mock('flydrive', () => ({
  Disk: function () {
    return {
      exists: async () => false,
      get: async () => '',
      getBytes: async () => new Uint8Array(),
      getStream: async () => ({ pipe: () => undefined }),
      getMetaData: async () => ({
        contentLength: 0,
        contentType: 'application/octet-stream',
        lastModified: new Date(),
        etag: '',
      }),
      put: async () => undefined,
      putStream: async () => undefined,
      copy: async () => undefined,
      move: async () => undefined,
      delete: async () => undefined,
      deleteAll: async () => undefined,
      getUrl: async () => '/test/url',
      listAll: async () => ({ objects: [] }),
      driver: { existsSync: () => false },
    };
  },
}));

jest.mock('flydrive/drivers/fs', () => ({
  FSDriver: function () {
    return {
      existsSync: () => false,
    };
  },
}));

// Mock Redis：AppModule 集成测试需要真实可用的 in-memory 行为（get/set/incr/ttl + pub/sub 失效广播）。
// 全部使用普通函数而非 jest.fn，避免 restoreMocks/resetMocks 清空实现后限流/黑名单等逻辑静默失效。
const redisStore = new Map<string, string>();
const pubSubBus: Array<{
  channel: string;
  handler: (channel: string, message: string) => void;
}> = [];

const MockRedis = function (this: Record<string, unknown>) {
  let messageHandler: ((channel: string, message: string) => void) | null =
    null;

  const mock: Record<string, unknown> & { [k: string]: any } = {
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      redisStore.set(key, String(value));
      return 'OK';
    },
    del: async (...keys: string[]) => {
      let removed = 0;
      for (const k of keys) if (redisStore.delete(k)) removed++;
      return removed;
    },
    setex: async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, String(value));
      return 'OK';
    },
    eval: async () => 1,
    decr: async (key: string) => {
      const next = (parseInt(redisStore.get(key) ?? '0', 10) || 0) - 1;
      redisStore.set(key, String(next));
      return next;
    },
    scan: async () => ['0', []],
    exists: async (key: string) => (redisStore.has(key) ? 1 : 0),
    expire: async () => 1,
    ttl: async () => 300,
    incr: async (key: string) => {
      const next = (parseInt(redisStore.get(key) ?? '0', 10) || 0) + 1;
      redisStore.set(key, String(next));
      return next;
    },
    keys: async (pattern: string) => {
      const re = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      return [...redisStore.keys()].filter((k) => re.test(k));
    },
    flushdb: async () => {
      redisStore.clear();
      return 'OK';
    },
    on: function (this: any, event: string, cb: any) {
      if (event === 'message') messageHandler = cb;
      return this;
    },
    duplicate: () => new (MockRedis as any)(),
    subscribe: async (channel: string, cb?: (err?: Error | null) => void) => {
      pubSubBus.push({
        channel,
        handler: (c, m) => {
          if (messageHandler) messageHandler(c, m);
        },
      });
      if (cb) cb(null);
      return undefined;
    },
    publish: async (channel: string, message: string) => {
      let count = 0;
      for (const sub of pubSubBus) {
        if (sub.channel === channel) {
          sub.handler(channel, message);
          count++;
        }
      }
      return count;
    },
    unsubscribe: async () => undefined,
    quit: async () => 'OK',
    disconnect: () => undefined,
    multi: () => ({
      zremrangebyscore: function (this: any) {
        return this;
      },
      zadd: function (this: any) {
        return this;
      },
      zcard: function (this: any) {
        return this;
      },
      expire: function (this: any) {
        return this;
      },
      exec: async () => [null, null, [null, 1], [null, 1]],
    }),
  };
  return mock;
} as unknown as typeof jest.fn & (new (options?: unknown) => any);
jest.mock('ioredis', () => ({
  __esModule: true,
  default: MockRedis,
  Redis: MockRedis,
}));

global.createMockResponse = () => {
  const res: Record<string, unknown> & {
    status: jest.Mock;
    json: jest.Mock;
    send: jest.Mock;
    redirect: jest.Mock;
  } = {} as any;
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
global.createTestUser = (overrides: Record<string, unknown> = {}) => ({
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

global.createTestProject = (overrides: Record<string, unknown> = {}) => ({
  id: global.generateId(),
  name: 'Test Project',
  description: 'Test project description',
  creatorId: global.generateId(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

global.createTestFile = (overrides: Record<string, unknown> = {}) => ({
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
