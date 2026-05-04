"use strict";
jest.mock('@cloudcad/svn-version-tool', () => svnMockObj);
jest.mock('@cloudcad/conversion-engine', () => ({
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
//# sourceMappingURL=mocks-setup.js.map