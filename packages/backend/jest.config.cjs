module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '!**/node_modules/**'],
  // 默认 `pnpm test` / `pnpm test:ci` 语义 = 纯单元测试（本地无 DB 可全绿）。
  // 集成测试统一走 `pnpm test:integration`（独立配置 test/jest-integration.json，需真实 PG+Redis）：
  //   - /integration/          排除 test/integration/ 与 src/test/integration/ 目录
  //   - \.integration\.spec\.ts 排除任意位置的 *integration.spec.ts 集成文件（如 project-lifecycle）
  //   - \.e2e-spec\.ts         排除 E2E（test:e2e 独立配置）
  testPathIgnorePatterns: [
    '/node_modules/',
    '/integration/',
    '\\.integration\\.spec\\.ts$',
    '\\.e2e-spec\\.ts$',
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          target: 'ES2022',
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/'],
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
  snapshotSerializers: [],
};
