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
import { Injectable, Logger, UnauthorizedException, } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
let JwtAuthGuard = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = AuthGuard('jwt');
    var JwtAuthGuard = _classThis = class extends _classSuper {
        constructor(tokenBlacklistService, reflector) {
            super();
            this.tokenBlacklistService = tokenBlacklistService;
            this.reflector = reflector;
            this.logger = new Logger(JwtAuthGuard.name);
        }
        async canActivate(context) {
            // 检查是否为公开路由
            const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);
            if (isPublic) {
                return true;
            }
            // 检查是否为可选认证路由
            const isOptionalAuth = this.reflector.getAllAndOverride(IS_OPTIONAL_AUTH_KEY, [context.getHandler(), context.getClass()]);
            const request = context.switchToHttp().getRequest();
            const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
            this.logger.debug(`URL: ${request.url}`);
            this.logger.debug(`Token: ${token ? `present (${token.substring(0, 20)}...)` : 'missing'}`);
            this.logger.debug(`Session: ${request.session?.userId ? 'present' : 'missing'}`);
            this.logger.debug(`OptionalAuth: ${isOptionalAuth}`);
            // 如果没有Token，检查 Session
            if (!token) {
                // 检查 Session 是否有用户信息
                if (request.session?.userId) {
                    this.logger.debug(`使用 Session 认证: ${request.session.userId}`);
                    // 将 Session 用户信息附加到 request.user
                    request.user = {
                        id: request.session.userId,
                        role: request.session.userRole,
                        email: request.session.userEmail,
                    };
                    // Session 认证成功，直接返回 true，不要调用 super.canActivate
                    return true;
                }
                // 既没有 Token 也没有 Session
                if (isOptionalAuth) {
                    // 可选认证模式：允许未登录用户继续访问
                    this.logger.debug('可选认证模式：允许未登录用户继续访问');
                    return true;
                }
                // 强制认证模式：抛出异常
                this.logger.debug('请求未提供Token且无有效Session');
                throw new UnauthorizedException('未登录或登录已过期');
            }
            try {
                // 检查Token是否在黑名单中
                if (this.tokenBlacklistService) {
                    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
                    if (isBlacklisted) {
                        this.logger.warn('尝试使用已撤销的Token');
                        throw new UnauthorizedException('Token已被撤销');
                    }
                }
                // 继续正常的JWT验证
                const result = await super.canActivate(context);
                if (result) {
                    this.logger.debug('JWT验证成功');
                }
                return result;
            }
            catch (error) {
                const err = error;
                if (error instanceof UnauthorizedException) {
                    throw error;
                }
                this.logger.error(`JWT验证失败: ${err.message}`, err.stack);
                throw new UnauthorizedException('Token验证失败');
            }
        }
    };
    __setFunctionName(_classThis, "JwtAuthGuard");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        JwtAuthGuard = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return JwtAuthGuard = _classThis;
})();
export { JwtAuthGuard };
//# sourceMappingURL=jwt-auth.guard.js.map