///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
	BadRequestException,
	ConflictException,
	InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import Redis from "ioredis";
import {
	IUserService,
	USER_SERVICE,
} from "../../common/interfaces/user-service.interface";
import { DatabaseService } from "../../database/database.service";
import { RuntimeConfigService } from "../../runtime-config/runtime-config.service";
import { AuthTokenService } from "./auth-token.service";
import { EmailVerificationService } from "./email-verification.service";
import { RegistrationService } from "./registration.service";

describe("RegistrationService", () => {
	let service: RegistrationService;

	// Mock dependencies
	const mockPrisma = {
		user: {
			findFirst: jest.fn(),
			findUnique: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
		},
	};

	const mockJwtService = {
		verify: jest.fn(),
		sign: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn().mockReturnValue("test-jwt-secret"),
	};

	const mockEmailVerificationService = {
		verifyEmail: jest.fn(),
		sendVerificationEmail: jest.fn(),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	const mockUserService = {
		create: jest.fn(),
	};

	const mockAuthTokenService = {
		generateTokens: jest.fn(),
	};

	const mockRedis = {
		setex: jest.fn(),
		get: jest.fn(),
		del: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RegistrationService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: JwtService, useValue: mockJwtService },
				{ provide: ConfigService, useValue: mockConfigService },
				{
					provide: EmailVerificationService,
					useValue: mockEmailVerificationService,
				},
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: USER_SERVICE, useValue: mockUserService },
				{ provide: AuthTokenService, useValue: mockAuthTokenService },
				{
					provide: "default_IORedisModuleConnectionToken",
					useValue: mockRedis,
				},
			],
		}).compile();

		service = module.get<RegistrationService>(RegistrationService);
	});

	it("should be defined", () => {
		expect(service).toBeDefined();
	});

	describe("register", () => {
		const registerDto = {
			email: "test@example.com",
			username: "testuser",
			password: "password123",
			nickname: "Test User",
		};

		describe("when registration is disabled", () => {
			it("should throw BadRequestException", async () => {
				mockRuntimeConfigService.getValue.mockResolvedValue(false);

				await expect(service.register(registerDto)).rejects.toThrow(
					BadRequestException,
				);
				expect(mockRuntimeConfigService.getValue).toHaveBeenCalledWith(
					"allowRegister",
					true,
				);
			});
		});

		describe("when email is already registered", () => {
			it("should throw ConflictException", async () => {
				mockRuntimeConfigService.getValue.mockResolvedValue(true);
				mockPrisma.user.findFirst.mockResolvedValue({ id: "existing-user" });

				await expect(service.register(registerDto)).rejects.toThrow(
					ConflictException,
				);
			});
		});

		describe("when username is already used", () => {
			it("should throw ConflictException", async () => {
				mockRuntimeConfigService.getValue.mockResolvedValue(true);
				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

				await expect(service.register(registerDto)).rejects.toThrow(
					ConflictException,
				);
			});
		});

		describe("when mail is disabled (normal case)", () => {
			it("should create user and return tokens", async () => {
				mockRuntimeConfigService.getValue.mockImplementation((key) => {
					if (key === "allowRegister") return Promise.resolve(true);
					if (key === "mailEnabled") return Promise.resolve(false);
					return Promise.resolve(false);
				});

				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValue(null);

				const mockUser = {
					id: "user123",
					username: "testuser",
					email: "test@example.com",
					nickname: "Test User",
					avatar: null,
					role: { id: "role1", name: "USER" },
					status: "ACTIVE",
				};

				mockUserService.create.mockResolvedValue(mockUser);
				mockAuthTokenService.generateTokens.mockResolvedValue({
					accessToken: "access-token",
					refreshToken: "refresh-token",
				});

				const result = await service.register(registerDto, {
					session: {},
				} as any);

				expect(mockUserService.create).toHaveBeenCalled();
				expect(mockAuthTokenService.generateTokens).toHaveBeenCalledWith(
					mockUser,
				);
				expect(result.accessToken).toBe("access-token");
			});
		});

		describe("when mail enabled but verification not required", () => {
			it("should create user and return tokens", async () => {
				mockRuntimeConfigService.getValue.mockImplementation((key) => {
					if (key === "allowRegister") return Promise.resolve(true);
					if (key === "mailEnabled") return Promise.resolve(true);
					if (key === "requireEmailVerification") return Promise.resolve(false);
					return Promise.resolve(false);
				});

				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValue(null);

				const mockUser = {
					id: "user123",
					username: "testuser",
					email: "test@example.com",
					role: { id: "role1", name: "USER" },
					status: "ACTIVE",
				};

				mockUserService.create.mockResolvedValue(mockUser);
				mockAuthTokenService.generateTokens.mockResolvedValue({
					accessToken: "access-token",
					refreshToken: "refresh-token",
				});

				const result = await service.register(registerDto);

				expect(mockUserService.create).toHaveBeenCalled();
				expect(result.accessToken).toBe("access-token");
			});
		});

		describe("when mail and verification enabled", () => {
			it("should send verification code and return message", async () => {
				mockRuntimeConfigService.getValue.mockImplementation((key) => {
					if (key === "allowRegister") return Promise.resolve(true);
					if (key === "mailEnabled") return Promise.resolve(true);
					if (key === "requireEmailVerification") return Promise.resolve(true);
					return Promise.resolve(false);
				});

				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValue(null);
				mockEmailVerificationService.sendVerificationEmail.mockResolvedValue(
					undefined,
				);

				const result = await service.register(registerDto);

				expect(mockRedis.setex).toHaveBeenCalled();
				expect(
					mockEmailVerificationService.sendVerificationEmail,
				).toHaveBeenCalled();
				expect(result).toBeDefined();
			});

			it("should throw InternalServerErrorException when sending email fails", async () => {
				mockRuntimeConfigService.getValue.mockImplementation((key) => {
					if (key === "allowRegister") return Promise.resolve(true);
					if (key === "mailEnabled") return Promise.resolve(true);
					if (key === "requireEmailVerification") return Promise.resolve(true);
					return Promise.resolve(false);
				});

				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValue(null);
				mockEmailVerificationService.sendVerificationEmail.mockRejectedValue(
					new Error("Send failed"),
				);

				await expect(service.register(registerDto)).rejects.toThrow(
					InternalServerErrorException,
				);
				expect(mockRedis.del).toHaveBeenCalled();
			});
		});

		describe("with wechat temp token", () => {
			it("should register with wechat data", async () => {
				mockRuntimeConfigService.getValue.mockImplementation((key) => {
					if (key === "allowRegister") return Promise.resolve(true);
					if (key === "mailEnabled") return Promise.resolve(false);
					return Promise.resolve(false);
				});

				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValue(null);

				mockJwtService.verify.mockReturnValue({
					type: "wechat_temp",
					wechatId: "wechat123",
					nickname: "WeChat User",
					avatar: "avatar.jpg",
				});

				const mockUser = {
					id: "user123",
					username: "testuser",
					role: { id: "role1", name: "USER" },
					status: "ACTIVE",
				};

				mockUserService.create.mockResolvedValue(mockUser);
				mockAuthTokenService.generateTokens.mockResolvedValue({
					accessToken: "access-token",
					refreshToken: "refresh-token",
				});

				const result = await service.register({
					...registerDto,
					wechatTempToken: "temp-token",
				});

				expect(mockUserService.create).toHaveBeenCalledWith(
					expect.objectContaining({
						wechatId: "wechat123",
						provider: "WECHAT",
					}),
				);
			});

			it("should throw ConflictException when wechat already bound", async () => {
				mockRuntimeConfigService.getValue.mockResolvedValue(true);
				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValueOnce(null);

				mockJwtService.verify.mockReturnValue({
					type: "wechat_temp",
					wechatId: "wechat123",
				});

				mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "existing" });

				await expect(
					service.register({
						...registerDto,
						wechatTempToken: "temp-token",
					}),
				).rejects.toThrow(ConflictException);
			});

			it("should throw BadRequestException when temp token invalid", async () => {
				mockRuntimeConfigService.getValue.mockResolvedValue(true);
				mockPrisma.user.findFirst.mockResolvedValue(null);
				mockPrisma.user.findUnique.mockResolvedValue(null);
				mockJwtService.verify.mockImplementation(() => {
					throw new Error("Invalid token");
				});

				await expect(
					service.register({
						...registerDto,
						wechatTempToken: "invalid-token",
					}),
				).rejects.toThrow(BadRequestException);
			});
		});
	});

	describe("verifyEmailAndActivate", () => {
		const email = "test@example.com";
		const code = "123456";

		describe("when verification code is invalid", () => {
			it("should throw BadRequestException", async () => {
				mockEmailVerificationService.verifyEmail.mockResolvedValue({
					valid: false,
					message: "验证码错误",
				});

				await expect(
					service.verifyEmailAndActivate(email, code),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when verification code is valid", () => {
			beforeEach(() => {
				mockEmailVerificationService.verifyEmail.mockResolvedValue({
					valid: true,
					message: "验证成功",
				});
			});

			describe("when register data exists in Redis", () => {
				it("should create user and return tokens", async () => {
					mockRedis.get.mockResolvedValue(
						JSON.stringify({
							email: "test@example.com",
							username: "testuser",
							password: "password123",
							nickname: "Test User",
						}),
					);

					const mockUser = {
						id: "user123",
						username: "testuser",
						email: "test@example.com",
						role: { id: "role1", name: "USER" },
						status: "ACTIVE",
					};

					mockUserService.create.mockResolvedValue(mockUser);
					mockAuthTokenService.generateTokens.mockResolvedValue({
						accessToken: "access-token",
						refreshToken: "refresh-token",
					});

					const result = await service.verifyEmailAndActivate(email, code);

					expect(mockUserService.create).toHaveBeenCalled();
					expect(mockRedis.del).toHaveBeenCalled();
					expect(result.accessToken).toBe("access-token");
				});
			});

			describe("when register data not exists but user exists", () => {
				it("should verify user email and return tokens", async () => {
					mockRedis.get.mockResolvedValue(null);

					const existingUser = {
						id: "user123",
						username: "testuser",
						email: "test@example.com",
						role: { id: "role1", name: "USER" },
						status: "ACTIVE",
						password: "hashed-password",
					};

					mockPrisma.user.findUnique.mockResolvedValue(existingUser);
					mockPrisma.user.update.mockResolvedValue({
						...existingUser,
						emailVerified: true,
					});
					mockAuthTokenService.generateTokens.mockResolvedValue({
						accessToken: "access-token",
						refreshToken: "refresh-token",
					});

					const result = await service.verifyEmailAndActivate(email, code);

					expect(mockPrisma.user.update).toHaveBeenCalledWith(
						expect.objectContaining({
							data: { emailVerified: true, emailVerifiedAt: expect.any(Date) },
						}),
					);
					expect(result.accessToken).toBe("access-token");
				});
			});

			describe("when register data and user not exist", () => {
				it("should throw BadRequestException", async () => {
					mockRedis.get.mockResolvedValue(null);
					mockPrisma.user.findUnique.mockResolvedValue(null);

					await expect(
						service.verifyEmailAndActivate(email, code),
					).rejects.toThrow(BadRequestException);
				});
			});
		});
	});
});
