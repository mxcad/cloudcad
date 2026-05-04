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
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
let JwtStrategy = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = PassportStrategy(Strategy);
    var JwtStrategy = _classThis = class extends _classSuper {
        constructor(configService, prisma, tokenBlacklistService) {
            const jwtSecret = configService.get('jwt.secret');
            if (!jwtSecret) {
                throw new BadRequestException('JWT_SECRET environment variable is required');
            }
            super({
                jwtFromRequest: ExtractJwt.fromExtractors([
                    ExtractJwt.fromAuthHeaderAsBearerToken(),
                    (request) => {
                        let token = null;
                        if (request?.cookies) {
                            token = request.cookies['auth_token'];
                        }
                        if (!token && request?.headers?.cookie) {
                            const match = request.headers.cookie.match(/auth_token=([^;]+)/);
                            if (match) {
                                token = decodeURIComponent(match[1]);
                            }
                        }
                        return token;
                    },
                ]),
                ignoreExpiration: false,
                secretOrKey: jwtSecret,
            });
            this.logger = new Logger(JwtStrategy.name);
            this.configService = configService;
            this.prisma = prisma;
            this.tokenBlacklistService = tokenBlacklistService;
            this.isDevelopment =
                configService.get('node.env') === 'development';
        }
        async validate(payload) {
            // 检查用户是否在黑名单中
            const isUserBlacklisted = await this.tokenBlacklistService.isUserBlacklisted(payload.sub);
            if (isUserBlacklisted) {
                if (this.isDevelopment) {
                    this.logger.warn(`用户已被禁用: ${payload.sub}`);
                }
                throw new UnauthorizedException('用户已被禁用');
            }
            // 快速查询：仅检查用户是否存在和状态
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    nickname: true,
                    avatar: true,
                    status: true,
                    roleId: true,
                    phone: true,
                    phoneVerified: true,
                    wechatId: true,
                    provider: true,
                    password: true, // 用于判断是否设置了密码
                },
            });
            if (!user) {
                if (this.isDevelopment) {
                    this.logger.warn(`用户不存在: ${payload.sub}`);
                }
                return null;
            }
            if (user.status !== 'ACTIVE') {
                if (this.isDevelopment) {
                    this.logger.warn(`用户状态非ACTIVE: ${user.status}`);
                }
                throw new UnauthorizedException('用户已被禁用');
            }
            // 查询用户的角色和权限信息
            const role = await this.prisma.role.findUnique({
                where: { id: user.roleId },
                include: {
                    permissions: {
                        select: {
                            permission: true,
                        },
                    },
                },
            });
            if (!role) {
                if (this.isDevelopment) {
                    this.logger.warn(`角色不存在: ${user.roleId}`);
                }
                return null;
            }
            // 返回用户基本信息 + 角色和权限信息
            const { password, ...userWithoutPassword } = user;
            return {
                ...userWithoutPassword,
                hasPassword: !!password,
                role: {
                    name: role.name,
                    description: role.description,
                    permissions: role.permissions.map((p) => p.permission),
                },
            };
        }
    };
    __setFunctionName(_classThis, "JwtStrategy");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        JwtStrategy = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return JwtStrategy = _classThis;
})();
export { JwtStrategy };
//# sourceMappingURL=jwt.strategy.js.map