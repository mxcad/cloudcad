jest.mock('@cloudcad/mx-version-tool', () => mxMockObj);

jest.mock('../src/conversion', () => ({
  ProcessRunnerService: jest.fn(),
}));

jest.mock('../../src/common/concurrency/rate-limiter', () => ({
  RateLimiter: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: () => true,
    readdirSync: () => [],
    mkdirSync: () => undefined,
    readFileSync: () => '{}',
    statSync: () => ({ size: 1024 }),
  };
});