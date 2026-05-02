import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['dotenv/config'],
  roots: ['<rootDir>/src'],
  // 白名单机制：只运行核心测试文件
  testMatch: [
    '**/file-validation.service.spec.ts',   // P1: 文件验证逻辑
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
  transform: {
    '^\.+\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          target: 'ES2022',
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          esModuleInterop: true,
          strict: false,
          noImplicitAny: false,
          strictNullChecks: false,
          noImplicitThis: false,
          alwaysStrict: false,
          skipLibCheck: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/test/**',
    '!src/main.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  // 覆盖率阈值：只针对核心模块要求高覆盖率
  coverageThreshold: {
    global: {
      branches: 0,    // 全局不要求覆盖率
      functions: 0,
      lines: 0,
      statements: 0,
    },
    // P0模块：安全关键，必须高覆盖
    './src/auth/auth.service.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/common/services/permission.service.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    // P1模块：业务关键，中等覆盖
    './src/file-system/file-system.service.ts': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    './src/common/services/role-inheritance.service.ts': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    './src/file-system/file-validation.service.ts': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    './src/file-system/file-system-permission.service.ts': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 30000,
  maxWorkers: '50%',
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/src/test/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  snapshotResolver: '<rootDir>/jest-snapshot-resolver.js',
  snapshotSerializers: [],
};

export default config;
