///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger, UnauthorizedException, InternalServerErrorException, } from '@nestjs/common';
let AuthTokenService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuthTokenService = _classThis = class {
        constructor(prisma, jwtService, configService, tokenBlacklistService) {
            this.prisma = prisma;
            this.jwtService = jwtService;
            this.configService = configService;
            this.tokenBlacklistService = tokenBlacklistService;
            this.logger = new Logger(AuthTokenService.name);
        }
        async generateTokens(user) {
            const accessPayload = {
                sub: user.id,
                email: user.email,
                username: user.username,
                role: user.role?.name || 'USER',
                type: 'access',
            };
            const refreshPayload = {
                sub: user.id,
                type: 'refresh',
            };
            const jwtSecret = this.configService.get('jwt.secret');
            if (!jwtSecret) {
                throw new InternalServerErrorException('JWT_SECRET environment variable is required');
            }
            const accessExpiresInConfig = this.configService.get('jwt.expiresIn');
            const refreshExpiresInConfig = this.configService.get('jwt.refreshExpiresIn');
            const accessExpiresIn = (accessExpiresInConfig ||
                '1h');
            const refreshExpiresIn = (refreshExpiresInConfig ||
                '7d');
            const [accessToken, refreshToken] = await Promise.all([
                this.jwtService.signAsync(accessPayload, {
                    secret: jwtSecret,
                    expiresIn: accessExpiresIn,
                }),
                this.jwtService.signAsync(refreshPayload, {
                    secret: jwtSecret,
                    expiresIn: refreshExpiresIn,
                }),
            ]);
            await this.storeRefreshToken(user.id, refreshToken);
            return {
                accessToken,
                refreshToken,
            };
        }
        async storeRefreshToken(userId, token) {
            try {
                const payload = this.jwtService.verify(token, {
                    secret: this.configService.get('jwt.secret'),
                });
                const expiresAt = new Date(payload.exp * 1000);
                await this.prisma.refreshToken.deleteMany({
                    where: { userId },
                });
                await this.prisma.refreshToken.create({
                    data: {
                        token,
                        userId,
                        expiresAt,
                    },
                });
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('Unique constraint')) {
                    this.logger.warn(`并发刷新 token 冲突，已忽略: ${error.message}`);
                    return;
                }
                throw new UnauthorizedException('Token存储失败');
            }
        }
        async validateRefreshToken(token, userId) {
            try {
                const refreshToken = await this.prisma.refreshToken.findFirst({
                    where: {
                        token,
                        userId,
                        expiresAt: {
                            gt: new Date(),
                        },
                    },
                });
                return !!refreshToken;
            }
            catch (error) {
                return false;
            }
        }
        async deleteAllRefreshTokens(userId) {
            try {
                await this.prisma.refreshToken.deleteMany({
                    where: { userId },
                });
            }
            catch (error) {
                throw new UnauthorizedException('删除刷新Token失败');
            }
        }
        async refreshToken(refreshToken) {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('jwt.secret'),
            });
            if (payload.type !== 'refresh') {
                throw new UnauthorizedException('无效的刷新Token');
            }
            const isValidRefreshToken = await this.validateRefreshToken(refreshToken, payload.sub);
            if (!isValidRefreshToken) {
                throw new UnauthorizedException('刷新Token无效或已过期');
            }
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    nickname: true,
                    avatar: true,
                    role: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            isSystem: true,
                            permissions: {
                                select: {
                                    permission: true,
                                },
                            },
                        },
                    },
                    status: true,
                    wechatId: true,
                    provider: true,
                    password: true,
                },
            });
            if (!user || user.status !== 'ACTIVE') {
                throw new UnauthorizedException('用户不存在或已被禁用');
            }
            const hasPassword = !!user.password;
            const { password: _, ...userWithoutPassword } = user;
            const tokens = await this.generateTokens(userWithoutPassword);
            return {
                ...tokens,
                user: {
                    ...userWithoutPassword,
                    hasPassword,
                },
            };
        }
        async logout(userId, accessToken, req) {
            try {
                await this.deleteAllRefreshTokens(userId);
                this.logger.log(`用户退出登录，已删除刷新令牌：${userId}`);
                if (accessToken) {
                    try {
                        const payload = this.jwtService.verify(accessToken, {
                            secret: this.configService.get('jwt.secret'),
                        });
                        if (payload.type === 'access') {
                            const now = Math.floor(Date.now() / 1000);
                            const expiresIn = payload.exp - now;
                            if (expiresIn > 0) {
                                await this.tokenBlacklistService.addToBlacklist(accessToken, expiresIn);
                                this.logger.log(`Access Token 已加入黑名单：${userId}`);
                            }
                        }
                    }
                    catch (error) {
                        this.logger.warn(`Access Token 验证失败，跳过黑名单：${error instanceof Error ? error.message : 'Unknown'}`);
                    }
                }
                if (req?.session) {
                    await new Promise((resolve, reject) => {
                        req.session.destroy((err) => {
                            if (err) {
                                this.logger.error(`Session 销毁失败：${err.message}`);
                                reject(err);
                            }
                            else {
                                this.logger.log(`用户 Session 已销毁：${userId}`);
                                resolve();
                            }
                        });
                    });
                }
            }
            catch (error) {
                const err = error;
                this.logger.error(`登出失败：${err.message}`);
                throw new UnauthorizedException('登出失败');
            }
        }
        async revokeToken(token) {
            try {
                const payload = this.jwtService.verify(token, {
                    secret: this.configService.get('jwt.secret'),
                });
                const now = Math.floor(Date.now() / 1000);
                const expiresIn = payload.exp - now;
                if (expiresIn > 0) {
                    await this.tokenBlacklistService.addToBlacklist(token, expiresIn);
                }
            }
            catch (error) {
                throw new UnauthorizedException('无效的Token');
            }
        }
    };
    __setFunctionName(_classThis, "AuthTokenService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuthTokenService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuthTokenService = _classThis;
})();
export { AuthTokenService };
//# sourceMappingURL=auth-token.service.js.map