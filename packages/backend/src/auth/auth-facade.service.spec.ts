///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
	BadRequestException,
	ConflictException,
	HttpException,
	HttpStatus,
	InternalServerErrorException,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import Redis from "ioredis";
import {
	IUserService,
	USER_SERVICE,
} from "../common/interfaces/user-service.interface";
import { InitializationService } from "./services/initialization.service";
import { DatabaseService } from "../database/database.service";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";
import { AuthFacadeService } from "./auth-facade.service";
import type { AuthResponseDto, LoginDto, RegisterDto } from "./dto/auth.dto";
import type {
	WechatBindResponseDto,
	WechatLoginResponseDto,
	WechatLoginUserDto,
	WechatUnbindResponseDto,
} from "./dto/wechat.dto";
import {
  AUTHENTICATION_HANDLER,
  OAUTH_HANDLER,
  SMS_AUTH_HANDLER,
  ACCOUNT_BINDING_HANDLER,
  TOKEN_HANDLER,
  AUTH_PROVIDER,
} from "./interfaces/auth-provider.interface";
import type { SessionRequest, UserForToken } from "./interfaces/jwt-payload.interface";
import { EmailVerificationService } from "../notification/email-verification.service";
import { SmsVerificationService } from "./services/sms";
import {
  REGISTRATION_SERVICE,
  PASSWORD_SERVICE,
  ACCOUNT_BINDING_SERVICE,
  AUTH_TOKEN_SERVICE,
} from "./interfaces/service-interfaces";
import { MembershipService } from "../vip/membership.service";
import { TokenBlacklistService } from "./services/token-blacklist.service";
import { PasswordPolicyService } from "./services/password-policy.service";
import {
	registerAuditLoggerInstance,
	type AuditLogger,
} from "../audit/audit-logger.service";
import {
	maskPhone,
	maskEmail,
	maskAccount,
} from "../common/pii/pii-crypto.service";

describe("AuthFacadeService", () => {
	let service: AuthFacadeService;

	// Mock dependencies
	const mockPrisma = {
		user: {
			findUnique: jest.fn(),
			findFirst: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
		},
		role: {
			findFirst: jest.fn(),
		},
		runtimeConfig: {
			findMany: jest.fn(),
			createMany: jest.fn(),
		},
	};

	const mockJwtService = {
		sign: jest.fn(),
		signAsync: jest.fn(),
		verify: jest.fn(),
		verifyAsync: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn(),
	};

	const mockTokenBlacklistService = {
		addToBlacklist: jest.fn(),
		isBlacklisted: jest.fn(),
	};

	const mockEmailVerificationService = {
		verifyEmail: jest.fn(),
		sendVerificationEmail: jest.fn(),
	};

	const mockSmsVerificationService = {
		verifyCode: jest.fn(),
		sendVerificationCode: jest.fn(),
	};

	const mockInitializationService = {
		ensureDefaultRoles: jest.fn(),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	const mockUserService = {
		create: jest.fn(),
		findById: jest.fn(),
	};

	// Redis is globally mocked in setup.ts

	const mockRegistrationService = {
		register: jest.fn(),
		verifyEmailAndActivate: jest.fn(),
	};

	const mockPasswordService = {
		validateUser: jest.fn(),
		forgotPassword: jest.fn(),
		resetPassword: jest.fn(),
	};

	const mockAccountBindingService = {
		sendBindEmailCode: jest.fn(),
		verifyBindEmail: jest.fn(),
		bindPhone: jest.fn(),
		sendUnbindPhoneCode: jest.fn(),
		verifyUnbindPhoneCode: jest.fn(),
		rebindPhone: jest.fn(),
		sendUnbindEmailCode: jest.fn(),
		verifyUnbindEmailCode: jest.fn(),
		rebindEmail: jest.fn(),
		bindWechat: jest.fn(),
		unbindWechat: jest.fn(),
		checkFieldUniqueness: jest.fn(),
	};

	const mockAuthTokenService = {
		generateTokens: jest.fn(),
		refreshToken: jest.fn(),
		logout: jest.fn(),
		revokeToken: jest.fn(),
		deleteAllRefreshTokens: jest.fn(),
	};

	const mockAuthProvider = {
		login: jest.fn(),
		loginByPhone: jest.fn(),
		loginByWechat: jest.fn(),
		register: jest.fn(),
		refreshToken: jest.fn(),
		getUserInfo: jest.fn(),
		verifyPhoneAndLogin: jest.fn(),
		bindEmailAndLogin: jest.fn(),
		bindPhoneAndLogin: jest.fn(),
		verifyEmailAndRegisterPhone: jest.fn(),
		registerByPhone: jest.fn(),
	};

	const mockMembershipService = {
		getMembership: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthFacadeService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: JwtService, useValue: mockJwtService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
				{
					provide: EmailVerificationService,
					useValue: mockEmailVerificationService,
				},
				{
					provide: SmsVerificationService,
					useValue: mockSmsVerificationService,
				},
				{
					provide: MembershipService,
					useValue: mockMembershipService,
				},
				{ provide: InitializationService, useValue: mockInitializationService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{
					provide: PasswordPolicyService,
					useValue: {
						assertPasswordPolicy: jest.fn(),
						getPasswordChangeStatus: jest.fn().mockReturnValue({
							required: undefined,
							expiringSoon: false,
						}),
					},
				},
				{ provide: USER_SERVICE, useValue: mockUserService },
				{
					provide: "default_IORedisModuleConnectionToken",
					useValue: {} as Partial<Redis>,
				},
				{ provide: REGISTRATION_SERVICE, useValue: mockRegistrationService },
				{ provide: PASSWORD_SERVICE, useValue: mockPasswordService },
				{ provide: ACCOUNT_BINDING_SERVICE, useValue: mockAccountBindingService },
				{ provide: AUTH_TOKEN_SERVICE, useValue: mockAuthTokenService },
				{ provide: AUTHENTICATION_HANDLER, useValue: mockAuthProvider },
				{ provide: OAUTH_HANDLER, useValue: mockAuthProvider },
				{ provide: SMS_AUTH_HANDLER, useValue: mockAuthProvider },
				{ provide: ACCOUNT_BINDING_HANDLER, useValue: mockAuthProvider },
				{ provide: TOKEN_HANDLER, useValue: mockAuthProvider },
			],
		}).compile();

		service = module.get<AuthFacadeService>(AuthFacadeService);
	});

	it("should be defined", () => {
		expect(service).toBeDefined();
	});

	describe("audit details PII 掩码（#417）", () => {
		let auditMock: { audit: jest.Mock };

		beforeEach(() => {
			auditMock = { audit: jest.fn().mockResolvedValue(undefined) };
			registerAuditLoggerInstance(auditMock as unknown as AuditLogger);
		});

		afterEach(() => {
			registerAuditLoggerInstance(null);
		});

		// 审计装饰器默认以 result.user.id 作为 userId，缺省则跳过审计；
		// 故 mock 返回体须含 user.id 才能让 details 回调执行。
		const authResponse = {
			accessToken: "a",
			refreshToken: "r",
			user: { id: "user-1" },
		} as AuthResponseDto;

		it("login：account 部分掩码写入审计 details（不含明文）", async () => {
			mockAuthProvider.login.mockResolvedValue(authResponse);

			await service.login(
				{ account: "+8613812345678", password: "x" } as LoginDto,
				{ session: {} } as SessionRequest,
			);

			const details = auditMock.audit.mock.calls[0][0].details;
			expect(details.account).toBe(maskAccount("+8613812345678"));
			expect(details.account).not.toContain("13812345678");
			expect(JSON.stringify(details)).not.toContain("+8613812345678");
		});

		it("loginByPhone：phone 部分掩码写入审计 details（不含明文）", async () => {
			mockAuthProvider.loginByPhone.mockResolvedValue(authResponse);

			await service.loginByPhone(
				"+8613812345678",
				"123456",
				{ session: {} } as SessionRequest,
			);

			const details = auditMock.audit.mock.calls[0][0].details;
			expect(details.phone).toBe(maskPhone("+8613812345678"));
			expect(details.phone).not.toContain("13812345678");
		});

		it("bindEmailAndLogin：email 部分掩码写入审计 details（不含明文）", async () => {
			mockAuthProvider.bindEmailAndLogin.mockResolvedValue(authResponse);

			await service.bindEmailAndLogin(
				"temp",
				"Test@Example.com",
				"123456",
				{ session: {} } as SessionRequest,
			);

			const details = auditMock.audit.mock.calls[0][0].details;
			expect(details.email).toBe(maskEmail("Test@Example.com"));
			expect(details.email).not.toContain("Test@Example.com");
		});
	});

	describe("register", () => {
		it("should delegate to registrationService.register (OSS, not overridden)", async () => {
			const registerDto: RegisterDto = {
				username: "testuser",
				password: "test-value",
				email: "test@example.com",
				nickname: "Test User",
			};
			const req: SessionRequest = { session: {} } as Partial<SessionRequest>;
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: {
					id: "user123",
					email: "test@example.com",
					username: "testuser",
					nickname: "Test User",
					avatar: null,
					phone: null,
					phoneVerified: false,
					role: {
						id: "role1",
						name: "USER",
						description: "User role",
						isSystem: true,
						permissions: [{ permission: "read" }],
					},
					status: "ACTIVE",
				},
			};

			mockRegistrationService.register.mockResolvedValue(expectedResult);

			const result = await service.register(registerDto, req);

			expect(result).toEqual(expectedResult);
			expect(mockRegistrationService.register).toHaveBeenCalledWith(registerDto, req);
			expect(mockAuthProvider.register).not.toHaveBeenCalled();
		});
	});

	describe("verifyEmailAndActivate", () => {
		it("should delegate to registrationService.verifyEmailAndActivate", async () => {
			const email = "test@example.com";
			const code = "123456";
			const req: SessionRequest = { session: {} } as Partial<SessionRequest>;
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: {
					id: "user123",
					email: "test@example.com",
					username: "testuser",
					nickname: "Test User",
					avatar: null,
					phone: null,
					phoneVerified: false,
					role: {
						id: "role1",
						name: "USER",
						description: "User role",
						isSystem: true,
						permissions: [{ permission: "read" }],
					},
					status: "ACTIVE",
				},
			};

			mockRegistrationService.verifyEmailAndActivate.mockResolvedValue(
				expectedResult,
			);

			const result = await service.verifyEmailAndActivate(email, code, req);

			expect(result).toEqual(expectedResult);
			expect(
				mockRegistrationService.verifyEmailAndActivate,
			).toHaveBeenCalledWith(email, code, req);
		});
	});

	describe("login", () => {
		it("should delegate to authProvider.login", async () => {
			const loginDto: LoginDto = {
				account: "test@example.com",
				password: "test-value",
			};
			const req: SessionRequest = { session: {} } as Partial<SessionRequest>;
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: {
					id: "user123",
					email: "test@example.com",
					username: "testuser",
					nickname: "Test User",
					avatar: null,
					phone: null,
					phoneVerified: false,
					role: {
						id: "role1",
						name: "USER",
						description: "User role",
						isSystem: true,
						permissions: [{ permission: "read" }],
					},
					status: "ACTIVE",
				},
			};

			mockAuthProvider.login.mockResolvedValue(expectedResult);

			const result = await service.login(loginDto, req);

			expect(result).toEqual(expectedResult);
			expect(mockAuthProvider.login).toHaveBeenCalledWith(loginDto, req);
		});
	});

	describe("loginByPhone", () => {
		const phone = "+8613812345678";
		const code = "123456";
		const req: SessionRequest = { session: {} } as Partial<SessionRequest>;

		it("should delegate to authProvider.loginByPhone and return result", async () => {
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: { id: "user123" } as Partial<AuthResponseDto>["user"],
			};
			mockAuthProvider.loginByPhone.mockResolvedValue(expectedResult);

			const result = await service.loginByPhone(phone, code, req);

			expect(mockAuthProvider.loginByPhone).toHaveBeenCalledWith(
				phone,
				code,
				req,
			);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.loginByPhone", async () => {
			mockAuthProvider.loginByPhone.mockRejectedValue(
				new BadRequestException("验证码错误"),
			);

			await expect(service.loginByPhone(phone, code, req)).rejects.toThrow(
				BadRequestException,
			);
		});
	});

	describe("registerByPhone", () => {
		const registerDto = {
			phone: "+8613812345678",
			code: "123456",
			username: "testuser",
			password: "test-value",
			nickname: "Test User",
		} as any;
		const req = { session: {} } as any;

		it("should delegate to authProvider.registerByPhone and return result", async () => {
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: { id: "user123" } as any,
			};
			mockAuthProvider.registerByPhone.mockResolvedValue(expectedResult);

			const result = await service.registerByPhone(registerDto, req);

			expect(mockAuthProvider.registerByPhone).toHaveBeenCalledWith(
				registerDto,
				req,
			);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.registerByPhone", async () => {
			mockAuthProvider.registerByPhone.mockRejectedValue(
				new BadRequestException("注册失败"),
			);

			await expect(
				service.registerByPhone(registerDto, req),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe("loginWithWechat", () => {
		const code = "wechat_code";
		const state = "valid_state";

		it("should delegate to authProvider.loginByWechat and return result", async () => {
			const expectedResult: WechatLoginResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: { id: "user123", emailVerified: true } as unknown as WechatLoginUserDto,
				requireEmailBinding: false,
				requirePhoneBinding: false,
				needRegister: false,
				tempToken: "",
			};
			mockAuthProvider.loginByWechat.mockResolvedValue(expectedResult);

			const result = await service.loginWithWechat(code, state);

			expect(mockAuthProvider.loginByWechat).toHaveBeenCalledWith(code, state);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.loginByWechat", async () => {
			mockAuthProvider.loginByWechat.mockRejectedValue(
				new BadRequestException("state校验失败"),
			);

			await expect(service.loginWithWechat(code, state)).rejects.toThrow(
				BadRequestException,
			);
		});
	});

	describe("refreshToken", () => {
		const refreshToken = "test-value";

		it("should delegate to authProvider.refreshToken and return result", async () => {
			const expectedResult: AuthResponseDto = {
				accessToken: "new_access_token",
				refreshToken: "new_refresh_token",
				user: { id: "user123" } as Partial<AuthResponseDto>["user"],
			};
			mockAuthProvider.refreshToken.mockResolvedValue(expectedResult);

			const result = await service.refreshToken(refreshToken);

			expect(mockAuthProvider.refreshToken).toHaveBeenCalledWith(refreshToken);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.refreshToken", async () => {
			mockAuthProvider.refreshToken.mockRejectedValue(
				new UnauthorizedException("token过期"),
			);

			await expect(service.refreshToken(refreshToken)).rejects.toThrow(
				UnauthorizedException,
			);
		});
	});

	describe("logout", () => {
		it("should delegate to authTokenService.logout", async () => {
			const userId = "user123";
			const accessToken = "test-value";
			const req = {};

			mockAuthTokenService.logout.mockResolvedValue(undefined);

			await service.logout(userId, accessToken, req);

			expect(mockAuthTokenService.logout).toHaveBeenCalledWith(
				userId,
				accessToken,
				req,
			);
		});
	});

	describe("revokeToken", () => {
		it("should delegate to authTokenService.revokeToken", async () => {
			const token = "test-value";

			mockAuthTokenService.revokeToken.mockResolvedValue(undefined);

			await service.revokeToken(token);

			expect(mockAuthTokenService.revokeToken).toHaveBeenCalledWith(token);
		});
	});

	describe("generateTokens", () => {
		it("should delegate to authTokenService.generateTokens", async () => {
			const user = {
				id: "user123",
				email: "test@example.com",
				username: "testuser",
				role: { name: "USER" },
			} as UserForToken;
			const tokens = {
				accessToken: "test-value",
				refreshToken: "test-value",
			};

			mockAuthTokenService.generateTokens.mockResolvedValue(tokens);

			const result = await service.generateTokens(user);

			expect(mockAuthTokenService.generateTokens).toHaveBeenCalledWith(user);
			expect(result).toEqual(tokens);
		});
	});

	describe("validateUser", () => {
		it("should delegate to passwordService.validateUser", async () => {
			const email = "test@example.com";
			const password = "test-value";
			const user = { id: "user123" };

			mockPasswordService.validateUser.mockResolvedValue(user);

			const result = await service.validateUser(email, password);

			expect(mockPasswordService.validateUser).toHaveBeenCalledWith(
				email,
				password,
			);
			expect(result).toEqual(user);
		});
	});

	describe("forgotPassword", () => {
		it("should delegate to passwordService.forgotPassword", async () => {
			const email = "test@example.com";
			const phone = "+8613812345678";
			const result = {
				message: "验证码已发送",
				mailEnabled: true,
				smsEnabled: true,
				supportEmail: "support@example.com",
				supportPhone: "13812345678",
			};

			mockPasswordService.forgotPassword.mockResolvedValue(result);

			const response = await service.forgotPassword(email, phone);

			expect(mockPasswordService.forgotPassword).toHaveBeenCalledWith(
				email,
				phone,
			);
			expect(response).toEqual(result);
		});
	});

	describe("resetPassword", () => {
		it("should delegate to passwordService.resetPassword", async () => {
			const email = "test@example.com";
			const phone = "+8613812345678";
			const code = "123456";
			const newPassword = "newpassword123";
			const result = { message: "密码重置成功" };

			mockPasswordService.resetPassword.mockResolvedValue(result);

			const response = await service.resetPassword(
				email,
				phone,
				code,
				newPassword,
			);

			expect(mockPasswordService.resetPassword).toHaveBeenCalledWith(
				email,
				phone,
				code,
				newPassword,
			);
			expect(response).toEqual(result);
		});
	});

	describe("account binding methods", () => {
		it("sendBindEmailCode should delegate to accountBindingService", async () => {
			const userId = "user123";
			const email = "test@example.com";
			const isRebind = false;
			const result = { message: "验证码已发送" };

			mockAccountBindingService.sendBindEmailCode.mockResolvedValue(result);

			const response = await service.sendBindEmailCode(userId, email, isRebind);

			expect(mockAccountBindingService.sendBindEmailCode).toHaveBeenCalledWith(
				userId,
				email,
				isRebind,
			);
			expect(response).toEqual(result);
		});

		it("verifyBindEmail should delegate to accountBindingService", async () => {
			const userId = "user123";
			const email = "test@example.com";
			const code = "123456";
			const result = { message: "邮箱绑定成功" };

			mockAccountBindingService.verifyBindEmail.mockResolvedValue(result);

			const response = await service.verifyBindEmail(userId, email, code);

			expect(mockAccountBindingService.verifyBindEmail).toHaveBeenCalledWith(
				userId,
				email,
				code,
			);
			expect(response).toEqual(result);
		});

		it("bindPhone should delegate to accountBindingService", async () => {
			const userId = "user123";
			const phone = "+8613812345678";
			const code = "123456";
			const result = { success: true, message: "手机号绑定成功" };

			mockAccountBindingService.bindPhone.mockResolvedValue(result);

			const response = await service.bindPhone(userId, phone, code);

			expect(mockAccountBindingService.bindPhone).toHaveBeenCalledWith(
				userId,
				phone,
				code,
			);
			expect(response).toEqual(result);
		});

		it("sendUnbindPhoneCode should delegate to accountBindingService", async () => {
			const userId = "user123";
			const result = { success: true, message: "验证码已发送" };

			mockAccountBindingService.sendUnbindPhoneCode.mockResolvedValue(result);

			const response = await service.sendUnbindPhoneCode(userId);

			expect(
				mockAccountBindingService.sendUnbindPhoneCode,
			).toHaveBeenCalledWith(userId);
			expect(response).toEqual(result);
		});

		it("verifyUnbindPhoneCode should delegate to accountBindingService", async () => {
			const userId = "user123";
			const code = "123456";
			const result = {
				success: true,
				message: "验证成功",
				token: "test-value",
			};

			mockAccountBindingService.verifyUnbindPhoneCode.mockResolvedValue(result);

			const response = await service.verifyUnbindPhoneCode(userId, code);

			expect(
				mockAccountBindingService.verifyUnbindPhoneCode,
			).toHaveBeenCalledWith(userId, code);
			expect(response).toEqual(result);
		});

		it("rebindPhone should delegate to accountBindingService", async () => {
			const userId = "user123";
			const phone = "+8613812345678";
			const code = "123456";
			const token = "test-value";
			const result = { success: true, message: "手机号更换成功" };

			mockAccountBindingService.rebindPhone.mockResolvedValue(result);

			const response = await service.rebindPhone(userId, phone, code, token);

			expect(mockAccountBindingService.rebindPhone).toHaveBeenCalledWith(
				userId,
				phone,
				code,
				token,
			);
			expect(response).toEqual(result);
		});

		it("sendUnbindEmailCode should delegate to accountBindingService", async () => {
			const userId = "user123";
			const result = { success: true, message: "验证码已发送" };

			mockAccountBindingService.sendUnbindEmailCode.mockResolvedValue(result);

			const response = await service.sendUnbindEmailCode(userId);

			expect(
				mockAccountBindingService.sendUnbindEmailCode,
			).toHaveBeenCalledWith(userId);
			expect(response).toEqual(result);
		});

		it("verifyUnbindEmailCode should delegate to accountBindingService", async () => {
			const userId = "user123";
			const code = "123456";
			const result = {
				success: true,
				message: "验证成功",
				token: "test-value",
			};

			mockAccountBindingService.verifyUnbindEmailCode.mockResolvedValue(result);

			const response = await service.verifyUnbindEmailCode(userId, code);

			expect(
				mockAccountBindingService.verifyUnbindEmailCode,
			).toHaveBeenCalledWith(userId, code);
			expect(response).toEqual(result);
		});

		it("rebindEmail should delegate to accountBindingService", async () => {
			const userId = "user123";
			const email = "new@example.com";
			const code = "123456";
			const token = "test-value";
			const result = { success: true, message: "邮箱更换成功" };

			mockAccountBindingService.rebindEmail.mockResolvedValue(result);

			const response = await service.rebindEmail(userId, email, code, token);

			expect(mockAccountBindingService.rebindEmail).toHaveBeenCalledWith(
				userId,
				email,
				code,
				token,
			);
			expect(response).toEqual(result);
		});

		it("bindWechat should delegate to accountBindingService", async () => {
			const userId = "user123";
			const code = "wechat_code";
			const state = "state123";
			const result: WechatBindResponseDto = {
				success: true,
				message: "微信绑定成功",
			};

			mockAccountBindingService.bindWechat.mockResolvedValue(result);

			const response = await service.bindWechat(userId, code, state);

			expect(mockAccountBindingService.bindWechat).toHaveBeenCalledWith(
				userId,
				code,
				state,
				undefined,
			);
			expect(response).toEqual(result);
		});

		it("unbindWechat should delegate to accountBindingService", async () => {
			const userId = "user123";
			const result: WechatUnbindResponseDto = {
				success: true,
				message: "微信解绑成功",
			};

			mockAccountBindingService.unbindWechat.mockResolvedValue(result);

			const response = await service.unbindWechat(userId);

			expect(mockAccountBindingService.unbindWechat).toHaveBeenCalledWith(
				userId,
			);
			expect(response).toEqual(result);
		});

		it("checkFieldUniqueness should delegate to accountBindingService", async () => {
			const dto = {
				username: "testuser",
				email: "test@example.com",
				phone: "+8613812345678",
			};
			const result = {
				usernameExists: false,
				emailExists: false,
				phoneExists: false,
			};

			mockAccountBindingService.checkFieldUniqueness.mockResolvedValue(result);

			const response = await service.checkFieldUniqueness(dto);

			expect(
				mockAccountBindingService.checkFieldUniqueness,
			).toHaveBeenCalledWith(dto);
			expect(response).toEqual(result);
		});

		describe("sendSmsCode", () => {
			const phone = "+8613812345678";
			const clientIp = "127.0.0.1";

			it("should delegate to smsVerificationService without uniqueness check for default scene", async () => {
				const result = { success: true, message: "验证码已发送" };
				mockSmsVerificationService.sendVerificationCode.mockResolvedValue(
					result,
				);

				const response = await service.sendSmsCode(phone, clientIp);

				expect(
					mockAccountBindingService.checkFieldUniqueness,
				).not.toHaveBeenCalled();
				expect(
					mockSmsVerificationService.sendVerificationCode,
				).toHaveBeenCalledWith(phone, clientIp);
				expect(response).toEqual(result);
			});

			it("should reject with ConflictException when phone is already bound in bind scene", async () => {
				mockAccountBindingService.checkFieldUniqueness.mockResolvedValue({
					usernameExists: false,
					emailExists: false,
					phoneExists: true,
				});

				await expect(
					service.sendSmsCode(phone, clientIp, "bind"),
				).rejects.toThrow("该手机号已被其他用户绑定");
				expect(
					mockSmsVerificationService.sendVerificationCode,
				).not.toHaveBeenCalled();
			});

			it("should send code when phone is not bound in bind scene", async () => {
				const result = { success: true, message: "验证码已发送" };
				mockAccountBindingService.checkFieldUniqueness.mockResolvedValue({
					usernameExists: false,
					emailExists: false,
					phoneExists: false,
				});
				mockSmsVerificationService.sendVerificationCode.mockResolvedValue(
					result,
				);

				const response = await service.sendSmsCode(phone, clientIp, "bind");

				expect(
					mockAccountBindingService.checkFieldUniqueness,
				).toHaveBeenCalledWith({ phone });
				expect(
					mockSmsVerificationService.sendVerificationCode,
				).toHaveBeenCalledWith(phone, clientIp);
				expect(response).toEqual(result);
			});
		});

		it("deleteAllRefreshTokens should delegate to authTokenService", async () => {
			const userId = "user123";

			mockAuthTokenService.deleteAllRefreshTokens.mockResolvedValue(undefined);

			await service.deleteAllRefreshTokens(userId);

			expect(mockAuthTokenService.deleteAllRefreshTokens).toHaveBeenCalledWith(
				userId,
			);
		});
	});

	describe("verifyPhoneAndLogin", () => {
		const phone = "+8613812345678";
		const code = "123456";
		const req = { session: {} } as any;

		it("should delegate to authProvider.verifyPhoneAndLogin and return result", async () => {
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: { id: "user123" } as any,
			};
			mockAuthProvider.verifyPhoneAndLogin.mockResolvedValue(expectedResult);

			const result = await service.verifyPhoneAndLogin(phone, code, req);

			expect(mockAuthProvider.verifyPhoneAndLogin).toHaveBeenCalledWith(
				phone,
				code,
				req,
			);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.verifyPhoneAndLogin", async () => {
			mockAuthProvider.verifyPhoneAndLogin.mockRejectedValue(
				new BadRequestException("验证失败"),
			);

			await expect(
				service.verifyPhoneAndLogin(phone, code, req),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe("bindEmailAndLogin", () => {
		const tempToken = "temp_token";
		const email = "test@example.com";
		const code = "123456";
		const req = { session: {} } as any;

		it("should delegate to authProvider.bindEmailAndLogin and return result", async () => {
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: { id: "user123" } as any,
			};
			mockAuthProvider.bindEmailAndLogin.mockResolvedValue(expectedResult);

			const result = await service.bindEmailAndLogin(
				tempToken,
				email,
				code,
				req,
			);

			expect(mockAuthProvider.bindEmailAndLogin).toHaveBeenCalledWith(
				tempToken,
				email,
				code,
				req,
			);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.bindEmailAndLogin", async () => {
			mockAuthProvider.bindEmailAndLogin.mockRejectedValue(
				new BadRequestException("绑定失败"),
			);

			await expect(
				service.bindEmailAndLogin(tempToken, email, code, req),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe("bindPhoneAndLogin", () => {
		const tempToken = "temp_token";
		const phone = "+8613812345678";
		const code = "123456";
		const req = { session: {} } as any;

		it("should delegate to authProvider.bindPhoneAndLogin and return result", async () => {
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: { id: "user123" } as any,
			};
			mockAuthProvider.bindPhoneAndLogin.mockResolvedValue(expectedResult);

			const result = await service.bindPhoneAndLogin(
				tempToken,
				phone,
				code,
				req,
			);

			expect(mockAuthProvider.bindPhoneAndLogin).toHaveBeenCalledWith(
				tempToken,
				phone,
				code,
				req,
			);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.bindPhoneAndLogin", async () => {
			mockAuthProvider.bindPhoneAndLogin.mockRejectedValue(
				new BadRequestException("绑定失败"),
			);

			await expect(
				service.bindPhoneAndLogin(tempToken, phone, code, req),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe("verifyEmailAndRegisterPhone", () => {
		const email = "test@example.com";
		const emailCode = "123456";
		const registerData = {
			phone: "+8613812345678",
			code: "654321",
			username: "testuser",
			password: "test-value",
			nickname: "Test User",
		};
		const req = { session: {} } as any;

		it("should delegate to authProvider.verifyEmailAndRegisterPhone and return result", async () => {
			const expectedResult: AuthResponseDto = {
				accessToken: "test-value",
				refreshToken: "test-value",
				user: { id: "user123" } as any,
			};
			mockAuthProvider.verifyEmailAndRegisterPhone.mockResolvedValue(
				expectedResult,
			);

			const result = await service.verifyEmailAndRegisterPhone(
				email,
				emailCode,
				registerData,
				req,
			);

			expect(
				mockAuthProvider.verifyEmailAndRegisterPhone,
			).toHaveBeenCalledWith(email, emailCode, registerData, req);
			expect(result).toEqual(expectedResult);
		});

		it("should propagate errors from authProvider.verifyEmailAndRegisterPhone", async () => {
			mockAuthProvider.verifyEmailAndRegisterPhone.mockRejectedValue(
				new BadRequestException("验证失败"),
			);

			await expect(
				service.verifyEmailAndRegisterPhone(email, emailCode, registerData, req),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe("verifyPhoneAndLogin", () => {
		const phone = "+8613812345678";
		const code = "123456";
		const req = { session: {} } as any;

		describe("when user not found", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.verifyPhoneAndLogin.mockRejectedValue(
					new BadRequestException("该手机号未注册"),
				);

				await expect(
					service.verifyPhoneAndLogin(phone, code, req),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when user status is not ACTIVE", () => {
			it("should throw UnauthorizedException", async () => {
				mockAuthProvider.verifyPhoneAndLogin.mockRejectedValue(
					new UnauthorizedException("账号已被注销"),
				);

				await expect(
					service.verifyPhoneAndLogin(phone, code, req),
				).rejects.toThrow(UnauthorizedException);
			});
		});

		describe("when all conditions pass", () => {
			it("should return tokens from authProvider", async () => {
				const expectedResult: AuthResponseDto = {
					accessToken: "test-value",
					refreshToken: "test-value",
					user: { id: "user123" } as any,
				};
				mockAuthProvider.verifyPhoneAndLogin.mockResolvedValue(expectedResult);

				const result = await service.verifyPhoneAndLogin(phone, code, req);

				expect(mockAuthProvider.verifyPhoneAndLogin).toHaveBeenCalledWith(
					phone, code, req,
				);
				expect(result).toEqual(expectedResult);
			});
		});
	});

	describe("bindEmailAndLogin", () => {
		const tempToken = "temp_token";
		const email = "test@example.com";
		const code = "123456";
		const req: SessionRequest = { session: {} } as Partial<SessionRequest>;

		describe("when temp token is invalid", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.bindEmailAndLogin.mockRejectedValue(
					new BadRequestException("invalid token"),
				);

				await expect(
					service.bindEmailAndLogin(tempToken, email, code, req),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when token type is wrong", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.bindEmailAndLogin.mockRejectedValue(
					new BadRequestException("wrong token type"),
				);

				await expect(
					service.bindEmailAndLogin(tempToken, email, code, req),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when email verification fails", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.bindEmailAndLogin.mockRejectedValue(
					new BadRequestException("验证码错误"),
				);

				await expect(
					service.bindEmailAndLogin(tempToken, email, code, req),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when email already used by another user", () => {
			it("should throw ConflictException", async () => {
				mockAuthProvider.bindEmailAndLogin.mockRejectedValue(
					new ConflictException("邮箱已被使用"),
				);

				await expect(
					service.bindEmailAndLogin(tempToken, email, code, req),
				).rejects.toThrow(ConflictException);
			});
		});

		describe("when all conditions pass", () => {
			it("should return tokens from authProvider", async () => {
				const expectedResult: AuthResponseDto = {
					accessToken: "test-value",
					refreshToken: "test-value",
					user: { id: "user123" } as any,
				};
				mockAuthProvider.bindEmailAndLogin.mockResolvedValue(expectedResult);

				const result = await service.bindEmailAndLogin(
					tempToken, email, code, req,
				);

				expect(mockAuthProvider.bindEmailAndLogin).toHaveBeenCalledWith(
					tempToken, email, code, req,
				);
				expect(result).toEqual(expectedResult);
			});
		});
	});

	describe("bindPhoneAndLogin", () => {
		const tempToken = "temp_token";
		const phone = "+8613812345678";
		const code = "123456";
		const formattedPhone = "13812345678";
		const req: SessionRequest = { session: {} } as Partial<SessionRequest>;

		describe("when temp token is invalid", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.bindPhoneAndLogin.mockRejectedValue(
					new BadRequestException("invalid token"),
				);

				await expect(
					service.bindPhoneAndLogin(tempToken, phone, code, req),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when token type is wrong", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.bindPhoneAndLogin.mockRejectedValue(
					new BadRequestException("wrong token type"),
				);

				await expect(
					service.bindPhoneAndLogin(tempToken, phone, code, req),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when SMS verification fails", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.bindPhoneAndLogin.mockRejectedValue(
					new BadRequestException("验证码错误"),
				);

				await expect(
					service.bindPhoneAndLogin(tempToken, phone, code, req),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when phone already used by another user", () => {
			it("should throw ConflictException", async () => {
				mockAuthProvider.bindPhoneAndLogin.mockRejectedValue(
					new ConflictException("手机号已被使用"),
				);

				await expect(
					service.bindPhoneAndLogin(tempToken, phone, code, req),
				).rejects.toThrow(ConflictException);
			});
		});

		describe("when all conditions pass", () => {
			it("should update user phone and return tokens", async () => {
				const mockUser = {
					id: "user123",
					email: null,
					username: "testuser",
					nickname: "Test User",
					avatar: null,
					phone: formattedPhone,
					phoneVerified: true,
				};
				const tokens = {
					accessToken: "test-value",
					refreshToken: "test-value",
				};
				const expectedResult = { ...tokens, user: mockUser };
				mockAuthProvider.bindPhoneAndLogin.mockResolvedValue(expectedResult);

				const result = await service.bindPhoneAndLogin(
					tempToken, phone, code, req,
				);

				expect(mockAuthProvider.bindPhoneAndLogin).toHaveBeenCalledWith(
					tempToken, phone, code, req,
				);
				expect(result).toEqual(expectedResult);
			});
		});
	});

	describe("verifyEmailAndRegisterPhone", () => {
		const email = "test@example.com";
		const emailCode = "123456";
		const registerData = {
			phone: "+8613812345678",
			code: "654321",
			username: "testuser",
			password: "test-value",
			nickname: "Test User",
		};
		const formattedPhone = "13812345678";
		const req: SessionRequest = { session: {} } as Partial<SessionRequest>;

		describe("when email verification fails", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.verifyEmailAndRegisterPhone.mockRejectedValue(
					new BadRequestException("验证码错误"),
				);

				await expect(
					service.verifyEmailAndRegisterPhone(
						email,
						emailCode,
						registerData,
						req,
					),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when phone verification fails", () => {
			it("should throw BadRequestException", async () => {
				mockAuthProvider.verifyEmailAndRegisterPhone.mockRejectedValue(
					new BadRequestException("验证码错误"),
				);

				await expect(
					service.verifyEmailAndRegisterPhone(
						email,
						emailCode,
						registerData,
						req,
					),
				).rejects.toThrow(BadRequestException);
			});
		});

		describe("when phone already registered", () => {
			it("should throw ConflictException", async () => {
				mockAuthProvider.verifyEmailAndRegisterPhone.mockRejectedValue(
					new ConflictException("手机号已被注册"),
				);

				await expect(
					service.verifyEmailAndRegisterPhone(
						email,
						emailCode,
						registerData,
						req,
					),
				).rejects.toThrow(ConflictException);
			});
		});

		describe("when username already exists", () => {
			it("should throw ConflictException", async () => {
				mockAuthProvider.verifyEmailAndRegisterPhone.mockRejectedValue(
					new ConflictException("用户名已存在"),
				);

				await expect(
					service.verifyEmailAndRegisterPhone(
						email,
						emailCode,
						registerData,
						req,
					),
				).rejects.toThrow(ConflictException);
			});
		});

		describe("when email already registered", () => {
			it("should throw ConflictException", async () => {
				mockAuthProvider.verifyEmailAndRegisterPhone.mockRejectedValue(
					new ConflictException("邮箱已被注册"),
				);

				await expect(
					service.verifyEmailAndRegisterPhone(
						email,
						emailCode,
						registerData,
						req,
					),
				).rejects.toThrow(ConflictException);
			});
		});

		describe("when all conditions pass", () => {
			it("should create user with email and phone verified", async () => {
				const mockUser = {
					id: "newuser123",
					email: "test@example.com",
					username: "testuser",
					nickname: "Test User",
					avatar: null,
					phone: formattedPhone,
					phoneVerified: true,
				};
				const tokens = {
					accessToken: "test-value",
					refreshToken: "test-value",
				};
				const expectedResult = { ...tokens, user: mockUser };
				mockAuthProvider.verifyEmailAndRegisterPhone.mockResolvedValue(
					expectedResult,
				);

				const result = await service.verifyEmailAndRegisterPhone(
					email, emailCode, registerData, req,
				);

				expect(mockAuthProvider.verifyEmailAndRegisterPhone).toHaveBeenCalledWith(
					email, emailCode, registerData, req,
				);
				expect(result).toMatchObject({
					accessToken: "test-value",
					refreshToken: "test-value",
					user: expect.objectContaining({
						id: "newuser123",
						email: "test@example.com",
						phone: formattedPhone,
					}),
				});
			});
		});
	});
});
