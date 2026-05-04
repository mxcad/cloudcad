///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { BadRequestException, ConflictException, UnauthorizedException, } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { USER_SERVICE, } from "../common/interfaces/user-service.interface";
import { InitializationService } from "../common/services/initialization.service";
import { DatabaseService } from "../database/database.service";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";
import { AuthFacadeService } from "./auth-facade.service";
import { AUTH_PROVIDER } from "./interfaces/auth-provider.interface";
import { AccountBindingService } from "./services/account-binding.service";
import { AuthTokenService } from "./services/auth-token.service";
import { EmailVerificationService } from "./services/email-verification.service";
import { LoginService } from "./services/login.service";
import { PasswordService } from "./services/password.service";
import { RegistrationService } from "./services/registration.service";
import { SmsVerificationService } from "./services/sms";
import { TokenBlacklistService } from "./services/token-blacklist.service";
import { WechatService } from "./services/wechat.service";
describe("AuthFacadeService", () => {
    let service;
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
    const mockWechatService = {
        validateState: jest.fn(),
        getAccessToken: jest.fn(),
        getUserInfo: jest.fn(),
    };
    const mockInitializationService = {
        ensureDefaultRoles: jest.fn(),
    };
    const mockRuntimeConfigService = {
        getValue: jest.fn(),
    };
    const mockUserService = {
        create: jest.fn(),
    };
    // Redis is globally mocked in setup.ts
    const mockRegistrationService = {
        register: jest.fn(),
        verifyEmailAndActivate: jest.fn(),
    };
    const mockLoginService = {
        login: jest.fn(),
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
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
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
                { provide: WechatService, useValue: mockWechatService },
                { provide: InitializationService, useValue: mockInitializationService },
                { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
                { provide: USER_SERVICE, useValue: mockUserService },
                {
                    provide: "default_IORedisModuleConnectionToken",
                    useValue: {},
                },
                { provide: RegistrationService, useValue: mockRegistrationService },
                { provide: LoginService, useValue: mockLoginService },
                { provide: PasswordService, useValue: mockPasswordService },
                { provide: AccountBindingService, useValue: mockAccountBindingService },
                { provide: AuthTokenService, useValue: mockAuthTokenService },
                { provide: AUTH_PROVIDER, useValue: mockAuthProvider },
            ],
        }).compile();
        service = module.get(AuthFacadeService);
    });
    it("should be defined", () => {
        expect(service).toBeDefined();
    });
    describe("register", () => {
        it("should delegate to authProvider.register", async () => {
            const registerDto = {
                username: "testuser",
                password: "password123",
                email: "test@example.com",
                nickname: "Test User",
            };
            const req = { session: {} };
            const expectedResult = {
                accessToken: "access_token",
                refreshToken: "refresh_token",
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
            mockAuthProvider.register.mockResolvedValue(expectedResult);
            const result = await service.register(registerDto, req);
            expect(result).toEqual(expectedResult);
            expect(mockAuthProvider.register).toHaveBeenCalledWith(registerDto, req);
        });
    });
    describe("verifyEmailAndActivate", () => {
        it("should delegate to registrationService.verifyEmailAndActivate", async () => {
            const email = "test@example.com";
            const code = "123456";
            const req = { session: {} };
            const expectedResult = {
                accessToken: "access_token",
                refreshToken: "refresh_token",
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
            mockRegistrationService.verifyEmailAndActivate.mockResolvedValue(expectedResult);
            const result = await service.verifyEmailAndActivate(email, code, req);
            expect(result).toEqual(expectedResult);
            expect(mockRegistrationService.verifyEmailAndActivate).toHaveBeenCalledWith(email, code, req);
        });
    });
    describe("login", () => {
        it("should delegate to authProvider.login", async () => {
            const loginDto = {
                account: "test@example.com",
                password: "password123",
            };
            const req = { session: {} };
            const expectedResult = {
                accessToken: "access_token",
                refreshToken: "refresh_token",
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
        const req = { session: {} };
        it("should delegate to authProvider.loginByPhone and return result", async () => {
            const expectedResult = {
                accessToken: "access_token",
                refreshToken: "refresh_token",
                user: { id: "user123" },
            };
            mockAuthProvider.loginByPhone.mockResolvedValue(expectedResult);
            const result = await service.loginByPhone(phone, code, req);
            expect(mockAuthProvider.loginByPhone).toHaveBeenCalledWith(phone, code, req);
            expect(result).toEqual(expectedResult);
        });
        it("should propagate errors from authProvider.loginByPhone", async () => {
            mockAuthProvider.loginByPhone.mockRejectedValue(new BadRequestException("验证码错误"));
            await expect(service.loginByPhone(phone, code, req)).rejects.toThrow(BadRequestException);
        });
    });
    describe("registerByPhone", () => {
        const registerDto = {
            phone: "+8613812345678",
            code: "123456",
            username: "testuser",
            password: "password123",
            nickname: "Test User",
        };
        const formattedPhone = "13812345678";
        const req = { session: {} };
        describe("when registration is disabled", () => {
            it("should throw BadRequestException", async () => {
                mockRuntimeConfigService.getValue.mockResolvedValue(false);
                await expect(service.registerByPhone(registerDto, req)).rejects.toThrow(BadRequestException);
                expect(mockRuntimeConfigService.getValue).toHaveBeenCalledWith("allowRegister", true);
            });
        });
        describe("when SMS service is disabled", () => {
            it("should throw BadRequestException", async () => {
                mockRuntimeConfigService.getValue.mockImplementation((key) => {
                    if (key === "allowRegister")
                        return Promise.resolve(true);
                    if (key === "smsEnabled")
                        return Promise.resolve(false);
                    if (key === "requirePhoneVerification")
                        return Promise.resolve(true);
                    return Promise.resolve(false);
                });
                await expect(service.registerByPhone(registerDto, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when phone verification is not required", () => {
            it("should throw BadRequestException", async () => {
                mockRuntimeConfigService.getValue.mockImplementation((key) => {
                    if (key === "allowRegister")
                        return Promise.resolve(true);
                    if (key === "smsEnabled")
                        return Promise.resolve(true);
                    if (key === "requirePhoneVerification")
                        return Promise.resolve(false);
                    return Promise.resolve(false);
                });
                await expect(service.registerByPhone(registerDto, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when verification code is invalid", () => {
            it("should throw BadRequestException", async () => {
                mockRuntimeConfigService.getValue.mockImplementation((key) => {
                    if (key === "allowRegister")
                        return Promise.resolve(true);
                    if (key === "smsEnabled")
                        return Promise.resolve(true);
                    if (key === "requirePhoneVerification")
                        return Promise.resolve(true);
                    return Promise.resolve(false);
                });
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: false,
                    message: "验证码错误",
                });
                await expect(service.registerByPhone(registerDto, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when phone number already registered", () => {
            it("should throw ConflictException", async () => {
                mockRuntimeConfigService.getValue.mockResolvedValue(true);
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" });
                await expect(service.registerByPhone(registerDto, req)).rejects.toThrow(ConflictException);
                expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
                    where: { phone: formattedPhone },
                });
            });
        });
        describe("when username already exists", () => {
            it("should throw ConflictException", async () => {
                mockRuntimeConfigService.getValue.mockResolvedValue(true);
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findUnique
                    .mockResolvedValueOnce(null) // phone check
                    .mockResolvedValueOnce({ id: "existing" }); // username check
                await expect(service.registerByPhone(registerDto, req)).rejects.toThrow(ConflictException);
                expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
                    where: { username: "testuser" },
                });
            });
        });
        describe("when all conditions pass", () => {
            it("should create user and return tokens", async () => {
                const mockUser = {
                    id: "newuser123",
                    email: null,
                    username: "testuser",
                    nickname: "Test User",
                    avatar: null,
                    phone: formattedPhone,
                    phoneVerified: true,
                    role: {
                        id: "role1",
                        name: "USER",
                        description: "User role",
                        isSystem: true,
                        permissions: [{ permission: "read" }],
                    },
                    status: "ACTIVE",
                };
                mockRuntimeConfigService.getValue.mockResolvedValue(true);
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findUnique.mockResolvedValue(null);
                mockUserService.create.mockResolvedValue(mockUser);
                mockAuthTokenService.generateTokens.mockResolvedValue({
                    accessToken: "access_token",
                    refreshToken: "refresh_token",
                });
                const result = await service.registerByPhone(registerDto, req);
                expect(mockUserService.create).toHaveBeenCalledWith({
                    username: "testuser",
                    password: "password123",
                    nickname: "Test User",
                    phone: formattedPhone,
                    phoneVerified: true,
                });
                expect(mockAuthTokenService.generateTokens).toHaveBeenCalledWith(mockUser);
                expect(result).toEqual({
                    accessToken: "access_token",
                    refreshToken: "refresh_token",
                    user: {
                        ...mockUser,
                        role: mockUser.role,
                        status: mockUser.status,
                    },
                });
            });
        });
    });
    describe("loginWithWechat", () => {
        const code = "wechat_code";
        const state = "valid_state";
        it("should delegate to authProvider.loginByWechat and return result", async () => {
            const expectedResult = {
                accessToken: "access_token",
                refreshToken: "refresh_token",
                user: { id: "user123" },
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
            mockAuthProvider.loginByWechat.mockRejectedValue(new BadRequestException("state校验失败"));
            await expect(service.loginWithWechat(code, state)).rejects.toThrow(BadRequestException);
        });
    });
    describe("refreshToken", () => {
        const refreshToken = "refresh_token";
        it("should delegate to authProvider.refreshToken and return result", async () => {
            const expectedResult = {
                accessToken: "new_access_token",
                refreshToken: "new_refresh_token",
                user: { id: "user123" },
            };
            mockAuthProvider.refreshToken.mockResolvedValue(expectedResult);
            const result = await service.refreshToken(refreshToken);
            expect(mockAuthProvider.refreshToken).toHaveBeenCalledWith(refreshToken);
            expect(result).toEqual(expectedResult);
        });
        it("should propagate errors from authProvider.refreshToken", async () => {
            mockAuthProvider.refreshToken.mockRejectedValue(new UnauthorizedException("token过期"));
            await expect(service.refreshToken(refreshToken)).rejects.toThrow(UnauthorizedException);
        });
    });
    describe("logout", () => {
        it("should delegate to authTokenService.logout", async () => {
            const userId = "user123";
            const accessToken = "access_token";
            const req = {};
            mockAuthTokenService.logout.mockResolvedValue(undefined);
            await service.logout(userId, accessToken, req);
            expect(mockAuthTokenService.logout).toHaveBeenCalledWith(userId, accessToken, req);
        });
    });
    describe("revokeToken", () => {
        it("should delegate to authTokenService.revokeToken", async () => {
            const token = "token123";
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
            };
            const tokens = {
                accessToken: "access_token",
                refreshToken: "refresh_token",
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
            const password = "password123";
            const user = { id: "user123" };
            mockPasswordService.validateUser.mockResolvedValue(user);
            const result = await service.validateUser(email, password);
            expect(mockPasswordService.validateUser).toHaveBeenCalledWith(email, password);
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
            expect(mockPasswordService.forgotPassword).toHaveBeenCalledWith(email, phone);
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
            const response = await service.resetPassword(email, phone, code, newPassword);
            expect(mockPasswordService.resetPassword).toHaveBeenCalledWith(email, phone, code, newPassword);
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
            expect(mockAccountBindingService.sendBindEmailCode).toHaveBeenCalledWith(userId, email, isRebind);
            expect(response).toEqual(result);
        });
        it("verifyBindEmail should delegate to accountBindingService", async () => {
            const userId = "user123";
            const email = "test@example.com";
            const code = "123456";
            const result = { message: "邮箱绑定成功" };
            mockAccountBindingService.verifyBindEmail.mockResolvedValue(result);
            const response = await service.verifyBindEmail(userId, email, code);
            expect(mockAccountBindingService.verifyBindEmail).toHaveBeenCalledWith(userId, email, code);
            expect(response).toEqual(result);
        });
        it("bindPhone should delegate to accountBindingService", async () => {
            const userId = "user123";
            const phone = "+8613812345678";
            const code = "123456";
            const result = { success: true, message: "手机号绑定成功" };
            mockAccountBindingService.bindPhone.mockResolvedValue(result);
            const response = await service.bindPhone(userId, phone, code);
            expect(mockAccountBindingService.bindPhone).toHaveBeenCalledWith(userId, phone, code);
            expect(response).toEqual(result);
        });
        it("sendUnbindPhoneCode should delegate to accountBindingService", async () => {
            const userId = "user123";
            const result = { success: true, message: "验证码已发送" };
            mockAccountBindingService.sendUnbindPhoneCode.mockResolvedValue(result);
            const response = await service.sendUnbindPhoneCode(userId);
            expect(mockAccountBindingService.sendUnbindPhoneCode).toHaveBeenCalledWith(userId);
            expect(response).toEqual(result);
        });
        it("verifyUnbindPhoneCode should delegate to accountBindingService", async () => {
            const userId = "user123";
            const code = "123456";
            const result = {
                success: true,
                message: "验证成功",
                token: "unbind_token",
            };
            mockAccountBindingService.verifyUnbindPhoneCode.mockResolvedValue(result);
            const response = await service.verifyUnbindPhoneCode(userId, code);
            expect(mockAccountBindingService.verifyUnbindPhoneCode).toHaveBeenCalledWith(userId, code);
            expect(response).toEqual(result);
        });
        it("rebindPhone should delegate to accountBindingService", async () => {
            const userId = "user123";
            const phone = "+8613812345678";
            const code = "123456";
            const token = "unbind_token";
            const result = { success: true, message: "手机号更换成功" };
            mockAccountBindingService.rebindPhone.mockResolvedValue(result);
            const response = await service.rebindPhone(userId, phone, code, token);
            expect(mockAccountBindingService.rebindPhone).toHaveBeenCalledWith(userId, phone, code, token);
            expect(response).toEqual(result);
        });
        it("sendUnbindEmailCode should delegate to accountBindingService", async () => {
            const userId = "user123";
            const result = { success: true, message: "验证码已发送" };
            mockAccountBindingService.sendUnbindEmailCode.mockResolvedValue(result);
            const response = await service.sendUnbindEmailCode(userId);
            expect(mockAccountBindingService.sendUnbindEmailCode).toHaveBeenCalledWith(userId);
            expect(response).toEqual(result);
        });
        it("verifyUnbindEmailCode should delegate to accountBindingService", async () => {
            const userId = "user123";
            const code = "123456";
            const result = {
                success: true,
                message: "验证成功",
                token: "unbind_token",
            };
            mockAccountBindingService.verifyUnbindEmailCode.mockResolvedValue(result);
            const response = await service.verifyUnbindEmailCode(userId, code);
            expect(mockAccountBindingService.verifyUnbindEmailCode).toHaveBeenCalledWith(userId, code);
            expect(response).toEqual(result);
        });
        it("rebindEmail should delegate to accountBindingService", async () => {
            const userId = "user123";
            const email = "new@example.com";
            const code = "123456";
            const token = "unbind_token";
            const result = { success: true, message: "邮箱更换成功" };
            mockAccountBindingService.rebindEmail.mockResolvedValue(result);
            const response = await service.rebindEmail(userId, email, code, token);
            expect(mockAccountBindingService.rebindEmail).toHaveBeenCalledWith(userId, email, code, token);
            expect(response).toEqual(result);
        });
        it("bindWechat should delegate to accountBindingService", async () => {
            const userId = "user123";
            const code = "wechat_code";
            const state = "state123";
            const result = {
                success: true,
                message: "微信绑定成功",
            };
            mockAccountBindingService.bindWechat.mockResolvedValue(result);
            const response = await service.bindWechat(userId, code, state);
            expect(mockAccountBindingService.bindWechat).toHaveBeenCalledWith(userId, code, state);
            expect(response).toEqual(result);
        });
        it("unbindWechat should delegate to accountBindingService", async () => {
            const userId = "user123";
            const result = {
                success: true,
                message: "微信解绑成功",
            };
            mockAccountBindingService.unbindWechat.mockResolvedValue(result);
            const response = await service.unbindWechat(userId);
            expect(mockAccountBindingService.unbindWechat).toHaveBeenCalledWith(userId);
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
            expect(mockAccountBindingService.checkFieldUniqueness).toHaveBeenCalledWith(dto);
            expect(response).toEqual(result);
        });
        it("deleteAllRefreshTokens should delegate to authTokenService", async () => {
            const userId = "user123";
            mockAuthTokenService.deleteAllRefreshTokens.mockResolvedValue(undefined);
            await service.deleteAllRefreshTokens(userId);
            expect(mockAuthTokenService.deleteAllRefreshTokens).toHaveBeenCalledWith(userId);
        });
    });
    describe("verifyPhoneAndLogin", () => {
        const phone = "+8613812345678";
        const code = "123456";
        const formattedPhone = "13812345678";
        const req = { session: {} };
        describe("when verification code is invalid", () => {
            it("should throw BadRequestException", async () => {
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: false,
                    message: "验证码错误",
                });
                await expect(service.verifyPhoneAndLogin(phone, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when user not found", () => {
            it("should throw BadRequestException", async () => {
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findFirst.mockResolvedValue(null);
                await expect(service.verifyPhoneAndLogin(phone, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when user status is not ACTIVE", () => {
            it("should throw UnauthorizedException", async () => {
                const mockUser = {
                    id: "user123",
                    password: "hashed",
                    role: { name: "USER" },
                    status: "SUSPENDED",
                };
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findFirst.mockResolvedValue(mockUser);
                await expect(service.verifyPhoneAndLogin(phone, code, req)).rejects.toThrow(UnauthorizedException);
            });
        });
        describe("when all conditions pass", () => {
            it("should update phoneVerified and return tokens", async () => {
                const mockUser = {
                    id: "user123",
                    email: "test@example.com",
                    username: "testuser",
                    nickname: "Test User",
                    avatar: null,
                    phone: formattedPhone,
                    phoneVerified: false,
                    password: "hashed",
                    role: {
                        id: "role1",
                        name: "USER",
                        description: "User role",
                        isSystem: true,
                        permissions: [{ permission: "read" }],
                    },
                    status: "ACTIVE",
                };
                const userWithoutPassword = { ...mockUser, password: undefined };
                const tokens = {
                    accessToken: "access_token",
                    refreshToken: "refresh_token",
                };
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findFirst.mockResolvedValue(mockUser);
                mockAuthTokenService.generateTokens.mockResolvedValue(tokens);
                const result = await service.verifyPhoneAndLogin(phone, code, req);
                expect(mockPrisma.user.update).toHaveBeenCalledWith({
                    where: { id: "user123" },
                    data: {
                        phoneVerified: true,
                        phoneVerifiedAt: expect.any(Date),
                    },
                });
                expect(mockAuthTokenService.generateTokens).toHaveBeenCalledWith(userWithoutPassword);
                expect(result).toEqual({
                    ...tokens,
                    user: {
                        ...userWithoutPassword,
                        phoneVerified: true,
                    },
                });
            });
        });
    });
    describe("bindEmailAndLogin", () => {
        const tempToken = "temp_token";
        const email = "test@example.com";
        const code = "123456";
        const req = { session: {} };
        beforeEach(() => {
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "bind_email_temp",
            });
        });
        describe("when temp token is invalid", () => {
            it("should throw BadRequestException", async () => {
                mockJwtService.verify.mockImplementation(() => {
                    throw new Error("invalid token");
                });
                await expect(service.bindEmailAndLogin(tempToken, email, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when token type is wrong", () => {
            it("should throw BadRequestException", async () => {
                mockJwtService.verify.mockReturnValue({
                    sub: "user123",
                    type: "wrong_type",
                });
                await expect(service.bindEmailAndLogin(tempToken, email, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when email verification fails", () => {
            it("should throw BadRequestException", async () => {
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: false,
                    message: "验证码错误",
                });
                await expect(service.bindEmailAndLogin(tempToken, email, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when email already used by another user", () => {
            it("should throw ConflictException", async () => {
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findFirst.mockResolvedValue({ id: "another_user" });
                await expect(service.bindEmailAndLogin(tempToken, email, code, req)).rejects.toThrow(ConflictException);
            });
        });
        describe("when all conditions pass", () => {
            it("should update user email and return tokens", async () => {
                const mockUser = {
                    id: "user123",
                    email: "test@example.com",
                    username: "testuser",
                    nickname: "Test User",
                    avatar: null,
                    phone: null,
                    phoneVerified: false,
                    password: "hashed",
                    role: {
                        id: "role1",
                        name: "USER",
                        description: "User role",
                        isSystem: true,
                        permissions: [{ permission: "read" }],
                    },
                    status: "ACTIVE",
                };
                const userWithoutPassword = { ...mockUser, password: undefined };
                const tokens = {
                    accessToken: "access_token",
                    refreshToken: "refresh_token",
                };
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findFirst.mockResolvedValue(null);
                mockPrisma.user.update.mockResolvedValue(mockUser);
                mockAuthTokenService.generateTokens.mockResolvedValue(tokens);
                const result = await service.bindEmailAndLogin(tempToken, email, code, req);
                expect(mockPrisma.user.update).toHaveBeenCalledWith({
                    where: { id: "user123" },
                    data: {
                        email: "test@example.com",
                        emailVerified: true,
                        emailVerifiedAt: expect.any(Date),
                    },
                    include: expect.any(Object),
                });
                expect(result).toEqual({
                    ...tokens,
                    user: userWithoutPassword,
                });
            });
        });
    });
    describe("bindPhoneAndLogin", () => {
        const tempToken = "temp_token";
        const phone = "+8613812345678";
        const code = "123456";
        const formattedPhone = "13812345678";
        const req = { session: {} };
        beforeEach(() => {
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "bind_phone_temp",
            });
        });
        describe("when temp token is invalid", () => {
            it("should throw BadRequestException", async () => {
                mockJwtService.verify.mockImplementation(() => {
                    throw new Error("invalid token");
                });
                await expect(service.bindPhoneAndLogin(tempToken, phone, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when token type is wrong", () => {
            it("should throw BadRequestException", async () => {
                mockJwtService.verify.mockReturnValue({
                    sub: "user123",
                    type: "wrong_type",
                });
                await expect(service.bindPhoneAndLogin(tempToken, phone, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when SMS verification fails", () => {
            it("should throw BadRequestException", async () => {
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: false,
                    message: "验证码错误",
                });
                await expect(service.bindPhoneAndLogin(tempToken, phone, code, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when phone already used by another user", () => {
            it("should throw ConflictException", async () => {
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findFirst.mockResolvedValue({ id: "another_user" });
                await expect(service.bindPhoneAndLogin(tempToken, phone, code, req)).rejects.toThrow(ConflictException);
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
                    password: "hashed",
                    role: {
                        id: "role1",
                        name: "USER",
                        description: "User role",
                        isSystem: true,
                        permissions: [{ permission: "read" }],
                    },
                    status: "ACTIVE",
                };
                const userWithoutPassword = { ...mockUser, password: undefined };
                const tokens = {
                    accessToken: "access_token",
                    refreshToken: "refresh_token",
                };
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findFirst.mockResolvedValue(null);
                mockPrisma.user.update.mockResolvedValue(mockUser);
                mockAuthTokenService.generateTokens.mockResolvedValue(tokens);
                const result = await service.bindPhoneAndLogin(tempToken, phone, code, req);
                expect(mockPrisma.user.update).toHaveBeenCalledWith({
                    where: { id: "user123" },
                    data: {
                        phone: formattedPhone,
                        phoneVerified: true,
                        phoneVerifiedAt: expect.any(Date),
                    },
                    include: expect.any(Object),
                });
                expect(result).toEqual({
                    ...tokens,
                    user: userWithoutPassword,
                });
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
            password: "password123",
            nickname: "Test User",
        };
        const formattedPhone = "13812345678";
        const req = { session: {} };
        describe("when email verification fails", () => {
            it("should throw BadRequestException", async () => {
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: false,
                    message: "验证码错误",
                });
                await expect(service.verifyEmailAndRegisterPhone(email, emailCode, registerData, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when phone verification fails", () => {
            it("should throw BadRequestException", async () => {
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: false,
                    message: "验证码错误",
                });
                await expect(service.verifyEmailAndRegisterPhone(email, emailCode, registerData, req)).rejects.toThrow(BadRequestException);
            });
        });
        describe("when phone already registered", () => {
            it("should throw ConflictException", async () => {
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findUnique.mockResolvedValue({ id: "existing_user" });
                await expect(service.verifyEmailAndRegisterPhone(email, emailCode, registerData, req)).rejects.toThrow(ConflictException);
            });
        });
        describe("when username already exists", () => {
            it("should throw ConflictException", async () => {
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findUnique
                    .mockResolvedValueOnce(null) // phone check
                    .mockResolvedValueOnce({ id: "existing_user" }); // username check
                await expect(service.verifyEmailAndRegisterPhone(email, emailCode, registerData, req)).rejects.toThrow(ConflictException);
            });
        });
        describe("when email already registered", () => {
            it("should throw ConflictException", async () => {
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findUnique.mockResolvedValue(null);
                mockPrisma.user.findFirst.mockResolvedValue({ id: "existing_user" });
                await expect(service.verifyEmailAndRegisterPhone(email, emailCode, registerData, req)).rejects.toThrow(ConflictException);
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
                    role: {
                        id: "role1",
                        name: "USER",
                        description: "User role",
                        isSystem: true,
                        permissions: [{ permission: "read" }],
                    },
                    status: "ACTIVE",
                };
                mockEmailVerificationService.verifyEmail.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockSmsVerificationService.verifyCode.mockResolvedValue({
                    valid: true,
                    message: "验证成功",
                });
                mockPrisma.user.findUnique.mockResolvedValue(null);
                mockPrisma.user.findFirst.mockResolvedValue(null);
                mockUserService.create.mockResolvedValue(mockUser);
                mockAuthTokenService.generateTokens.mockResolvedValue({
                    accessToken: "access_token",
                    refreshToken: "refresh_token",
                });
                const result = await service.verifyEmailAndRegisterPhone(email, emailCode, registerData, req);
                expect(mockUserService.create).toHaveBeenCalledWith({
                    username: "testuser",
                    password: "password123",
                    nickname: "Test User",
                    email: "test@example.com",
                    emailVerified: true,
                    phone: formattedPhone,
                    phoneVerified: true,
                });
                expect(result).toMatchObject({
                    accessToken: "access_token",
                    refreshToken: "refresh_token",
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
//# sourceMappingURL=auth-facade.service.spec.js.map