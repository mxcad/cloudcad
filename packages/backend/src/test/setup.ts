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

import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

// Global test setup
beforeAll(async () => {
	// Set test environment variables
	process.env.NODE_ENV = "test";
	process.env.JWT_SECRET = "test-jwt-secret";
	process.env.DATABASE_URL =
		"postgresql://postgres:password@localhost:5432/cloudcad_test";
	process.env.REDIS_URL = "redis://localhost:6379/1";

	// Mock console methods to reduce noise in tests
	jest.spyOn(console, "log").mockImplementation(() => {});
	jest.spyOn(console, "debug").mockImplementation(() => {});
	jest.spyOn(console, "info").mockImplementation(() => {});
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(console, "error").mockImplementation(() => {});
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
process.on("unhandledRejection", (reason, promise) => {});

// Global error handler for uncaught exceptions
process.on("uncaughtException", (error) => {});

// Extend Jest matchers for custom assertions
expect.extend({
	toBeValidUser(received) {
		const pass =
			received &&
			typeof received.id === "string" &&
			typeof received.email === "string" &&
			typeof received.username === "string" &&
			typeof received.role === "string" &&
			typeof received.status === "string" &&
			!Object.hasOwn(received, "password");

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
			typeof received.accessToken === "string" &&
			typeof received.refreshToken === "string" &&
			received.user &&
			typeof received.user.id === "string" &&
			typeof received.user.email === "string" &&
			!Object.hasOwn(received.user, "password");

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
			typeof received.pagination.page === "number" &&
			typeof received.pagination.limit === "number" &&
			typeof received.pagination.total === "number" &&
			typeof received.pagination.totalPages === "number";

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
		body?: Record<string, unknown>,
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
		overrides?: Record<string, unknown>,
	): Record<string, unknown>;
	function createTestProject(
		overrides?: Record<string, unknown>,
	): Record<string, unknown>;
	function createTestFile(
		overrides?: Record<string, unknown>,
	): Record<string, unknown>;
}

// Mock external dependencies
jest.mock("bcryptjs", () => ({
	hash: jest.fn().mockResolvedValue("hashed-password"),
	compare: jest.fn().mockResolvedValue(true),
}));

// Mock conversion engine to avoid ProcessRunnerService DI issues in tests
// Mock conversion engine to avoid ProcessRunnerService DI issues in tests
// Mock conversion engine to avoid ProcessRunnerService DI issues in tests
// Mock conversion engine to avoid ProcessRunnerService DI issues in tests
// Mock conversion engine to avoid ProcessRunnerService DI issues in tests
jest.mock("@cloudcad/conversion-engine", () => {
	class MockProcessRunnerService {
		run = jest.fn();
		stop = jest.fn();
		isRunning = jest.fn();
	}
	return {
		I_CONVERSION_SERVICE: "CONVERSION_SERVICE",
		ConversionModule: {
			forRoot: jest.fn().mockReturnValue({
				module: class MockConversionModule {},
				providers: [
					{ provide: "CONVERSION_SERVICE", useValue: { convert: jest.fn() } },
					MockProcessRunnerService,
				],
				exports: ["CONVERSION_SERVICE", MockProcessRunnerService],
				global: true,
			}),
		},
		ProcessRunnerService: MockProcessRunnerService,
	};
});

// Mock @nestjs-modules/mailer handlebars adapter (pulls in native @css-inline/css-inline)
jest.mock("@nestjs-modules/mailer/dist/adapters/handlebars.adapter", () => ({
	HandlebarsAdapter: jest.fn().mockImplementation(() => ({
		compile: jest
			.fn()
			.mockReturnValue(jest.fn().mockReturnValue("<html></html>")),
	})),
}));

// Mock @tus/server and @tus/file-store (ESM packages incompatible with Jest CJS transform)
jest.mock("@tus/server", () => ({
	Server: jest.fn().mockImplementation(() => ({
		handle: jest.fn(),
		listen: jest.fn(),
		get: jest.fn(),
		on: jest.fn(),
	})),
}));

jest.mock("@tus/file-store", () => ({
	FileStore: jest.fn().mockImplementation(() => ({
		read: jest.fn(),
		write: jest.fn(),
		remove: jest.fn(),
	})),
}));

// Mock flydrive (ESM package incompatible with Jest CJS transform)
jest.mock("flydrive", () => ({
	Disk: jest.fn().mockImplementation(() => ({
		exists: jest.fn().mockResolvedValue(false),
		get: jest.fn().mockResolvedValue(""),
		getBytes: jest.fn().mockResolvedValue(new Uint8Array()),
		getStream: jest.fn().mockResolvedValue({ pipe: jest.fn() }),
		getMetaData: jest.fn().mockResolvedValue({
			contentLength: 0,
			contentType: "application/octet-stream",
			lastModified: new Date(),
			etag: "",
		}),
		put: jest.fn().mockResolvedValue(undefined),
		putStream: jest.fn().mockResolvedValue(undefined),
		copy: jest.fn().mockResolvedValue(undefined),
		move: jest.fn().mockResolvedValue(undefined),
		delete: jest.fn().mockResolvedValue(undefined),
		deleteAll: jest.fn().mockResolvedValue(undefined),
		getUrl: jest.fn().mockResolvedValue("/test/url"),
		listAll: jest.fn().mockResolvedValue({ objects: [] }),
		driver: { existsSync: jest.fn().mockReturnValue(false) },
	})),
}));

jest.mock("flydrive/drivers/fs", () => ({
	FSDriver: jest.fn().mockImplementation(() => ({
		existsSync: jest.fn().mockReturnValue(false),
	})),
}));

// Mock Redis
const MockRedis = jest.fn().mockImplementation(() => ({
	get: jest.fn().mockResolvedValue(null),
	set: jest.fn().mockResolvedValue("OK"),
	del: jest.fn().mockResolvedValue(1),
	exists: jest.fn().mockResolvedValue(0),
	expire: jest.fn().mockResolvedValue(1),
	keys: jest.fn().mockResolvedValue([]),
	flushdb: jest.fn().mockResolvedValue("OK"),
}));
jest.mock("ioredis", () => ({
	__esModule: true,
	default: MockRedis,
	Redis: MockRedis,
}));

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
	nickname: "Test User",
	avatar: null,
	role: "USER",
	status: "ACTIVE",
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
});

global.createTestProject = (overrides: any = {}) => ({
	id: global.generateId(),
	name: "Test Project",
	description: "Test project description",
	creatorId: global.generateId(),
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
});

global.createTestFile = (overrides: any = {}) => ({
	id: global.generateId(),
	name: "test-file.dwg",
	size: 1024,
	mimeType: "application/dwg",
	projectId: global.generateId(),
	creatorId: global.generateId(),
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
});
