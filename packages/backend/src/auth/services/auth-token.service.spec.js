///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { InternalServerErrorException, UnauthorizedException, } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { DatabaseService } from "../../database/database.service";
import { AuthTokenService } from "./auth-token.service";
import { TokenBlacklistService } from "./token-blacklist.service";
describe("AuthTokenService", () => {
    let service;
    const mockPrisma = {
        refreshToken: {
            deleteMany: jest.fn(),
            create: jest.fn(),
            findFirst: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
        },
    };
    const mockJwtService = {
        signAsync: jest.fn(),
        verify: jest.fn(),
    };
    const mockConfigService = {
        get: jest.fn(),
    };
    const mockTokenBlacklistService = {
        addToBlacklist: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                AuthTokenService,
                { provide: DatabaseService, useValue: mockPrisma },
                { provide: JwtService, useValue: mockJwtService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
            ],
        }).compile();
        service = module.get(AuthTokenService);
    });
    it("should be defined", () => {
        expect(service).toBeDefined();
    });
    describe("generateTokens", () => {
        const mockUser = {
            id: "user123",
            email: "test@example.com",
            username: "testuser",
            role: { id: "role1", name: "USER", isSystem: true },
        };
        it("should throw when JWT secret not configured", async () => {
            mockConfigService.get.mockImplementation((key) => {
                if (key === "jwt.secret")
                    return null;
                return "1h";
            });
            await expect(service.generateTokens(mockUser)).rejects.toThrow(InternalServerErrorException);
        });
        it("should generate tokens successfully with default expirations", async () => {
            mockConfigService.get.mockImplementation((key) => {
                if (key === "jwt.secret")
                    return "test-secret";
                if (key === "jwt.expiresIn")
                    return undefined;
                if (key === "jwt.refreshExpiresIn")
                    return undefined;
                return "test-value";
            });
            mockJwtService.signAsync
                .mockResolvedValueOnce("access-token-123")
                .mockResolvedValueOnce("refresh-token-456");
            mockJwtService.verify.mockReturnValue({
                exp: Math.floor(Date.now() / 1000) + 86400,
                sub: "user123",
                type: "refresh",
            });
            const result = await service.generateTokens(mockUser);
            expect(result.accessToken).toBe("access-token-123");
            expect(result.refreshToken).toBe("refresh-token-456");
            expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
                where: { userId: "user123" },
            });
            expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
        });
        it("should generate tokens with configured expirations", async () => {
            mockConfigService.get.mockImplementation((key) => {
                if (key === "jwt.secret")
                    return "test-secret";
                if (key === "jwt.expiresIn")
                    return "2h";
                if (key === "jwt.refreshExpiresIn")
                    return "14d";
                return "test-value";
            });
            mockJwtService.signAsync
                .mockResolvedValueOnce("access-token-123")
                .mockResolvedValueOnce("refresh-token-456");
            mockJwtService.verify.mockReturnValue({
                exp: Math.floor(Date.now() / 1000) + 86400,
                sub: "user123",
                type: "refresh",
            });
            await service.generateTokens(mockUser);
            expect(mockJwtService.signAsync).toHaveBeenCalledTimes(2);
        });
    });
    describe("validateRefreshToken", () => {
        it("should return true when token valid and not expired", async () => {
            mockPrisma.refreshToken.findFirst.mockResolvedValue({
                token: "refresh-token",
                userId: "user123",
                expiresAt: new Date(Date.now() + 86400000),
            });
            const result = await service.validateRefreshToken("refresh-token", "user123");
            expect(result).toBe(true);
        });
        it("should return false when token not found", async () => {
            mockPrisma.refreshToken.findFirst.mockResolvedValue(null);
            const result = await service.validateRefreshToken("refresh-token", "user123");
            expect(result).toBe(false);
        });
        it("should return false when token expired", async () => {
            mockPrisma.refreshToken.findFirst.mockResolvedValue(null);
            const result = await service.validateRefreshToken("refresh-token", "user123");
            expect(result).toBe(false);
        });
        it("should return false on database error", async () => {
            mockPrisma.refreshToken.findFirst.mockRejectedValue(new Error("DB error"));
            const result = await service.validateRefreshToken("refresh-token", "user123");
            expect(result).toBe(false);
        });
    });
    describe("deleteAllRefreshTokens", () => {
        it("should delete tokens successfully", async () => {
            mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
            await service.deleteAllRefreshTokens("user123");
            expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
                where: { userId: "user123" },
            });
        });
        it("should throw on deletion error", async () => {
            mockPrisma.refreshToken.deleteMany.mockRejectedValue(new Error("DB error"));
            await expect(service.deleteAllRefreshTokens("user123")).rejects.toThrow(UnauthorizedException);
        });
    });
    describe("refreshToken", () => {
        it("should throw when token type not refresh", async () => {
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "access",
                exp: Math.floor(Date.now() / 1000) + 86400,
            });
            mockConfigService.get.mockReturnValue("test-secret");
            await expect(service.refreshToken("refresh-token")).rejects.toThrow(UnauthorizedException);
        });
        it("should throw when refresh token invalid", async () => {
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "refresh",
                exp: Math.floor(Date.now() / 1000) + 86400,
            });
            mockConfigService.get.mockReturnValue("test-secret");
            mockPrisma.refreshToken.findFirst.mockResolvedValue(null);
            await expect(service.refreshToken("refresh-token")).rejects.toThrow(UnauthorizedException);
        });
        it("should throw when user not found", async () => {
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "refresh",
                exp: Math.floor(Date.now() / 1000) + 86400,
            });
            mockConfigService.get.mockReturnValue("test-secret");
            mockPrisma.refreshToken.findFirst.mockResolvedValue({ token: "valid" });
            mockPrisma.user.findUnique.mockResolvedValue(null);
            await expect(service.refreshToken("refresh-token")).rejects.toThrow(UnauthorizedException);
        });
        it("should throw when user not active", async () => {
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "refresh",
                exp: Math.floor(Date.now() / 1000) + 86400,
            });
            mockConfigService.get.mockReturnValue("test-secret");
            mockPrisma.refreshToken.findFirst.mockResolvedValue({ token: "valid" });
            mockPrisma.user.findUnique.mockResolvedValue({
                id: "user123",
                status: "SUSPENDED",
            });
            await expect(service.refreshToken("refresh-token")).rejects.toThrow(UnauthorizedException);
        });
        it("should refresh tokens successfully", async () => {
            const mockUser = {
                id: "user123",
                email: "test@example.com",
                username: "testuser",
                nickname: "Test User",
                role: { id: "role1", name: "USER", permissions: [] },
                status: "ACTIVE",
                password: "hashed",
            };
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "refresh",
                exp: Math.floor(Date.now() / 1000) + 86400,
            });
            mockConfigService.get.mockReturnValue("test-secret");
            mockPrisma.refreshToken.findFirst.mockResolvedValue({ token: "valid" });
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            mockJwtService.signAsync
                .mockResolvedValueOnce("new-access-token")
                .mockResolvedValueOnce("new-refresh-token");
            const result = await service.refreshToken("refresh-token");
            expect(result.accessToken).toBe("new-access-token");
            expect(result.refreshToken).toBe("new-refresh-token");
            expect(result.user.id).toBe("user123");
            expect(result.user.hasPassword).toBe(true);
        });
    });
    describe("logout", () => {
        it("should delete refresh tokens and add access token to blacklist", async () => {
            mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
            mockJwtService.verify.mockReturnValue({
                sub: "user123",
                type: "access",
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            mockConfigService.get.mockReturnValue("test-secret");
            mockTokenBlacklistService.addToBlacklist.mockResolvedValue(undefined);
            await service.logout("user123", "access-token");
            expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
                where: { userId: "user123" },
            });
            expect(mockTokenBlacklistService.addToBlacklist).toHaveBeenCalled();
        });
        it("should destroy session when provided", async () => {
            mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
            mockConfigService.get.mockReturnValue("test-secret");
            const req = {
                session: {
                    destroy: jest.fn((callback) => callback(null)),
                },
            };
            await service.logout("user123", undefined, req);
            expect(req.session.destroy).toHaveBeenCalled();
        });
        it("should throw on logout error", async () => {
            mockPrisma.refreshToken.deleteMany.mockRejectedValue(new Error("DB error"));
            await expect(service.logout("user123")).rejects.toThrow(UnauthorizedException);
        });
    });
    describe("revokeToken", () => {
        it("should add token to blacklist when valid", async () => {
            mockJwtService.verify.mockReturnValue({
                exp: Math.floor(Date.now() / 1000) + 3600,
                sub: "user123",
                type: "refresh",
            });
            mockConfigService.get.mockReturnValue("test-secret");
            mockTokenBlacklistService.addToBlacklist.mockResolvedValue(undefined);
            await service.revokeToken("token-to-revoke");
            expect(mockTokenBlacklistService.addToBlacklist).toHaveBeenCalled();
        });
        it("should throw when token invalid", async () => {
            mockJwtService.verify.mockImplementation(() => {
                throw new Error("Invalid token");
            });
            mockConfigService.get.mockReturnValue("test-secret");
            await expect(service.revokeToken("invalid-token")).rejects.toThrow(UnauthorizedException);
        });
    });
});
//# sourceMappingURL=auth-token.service.spec.js.map