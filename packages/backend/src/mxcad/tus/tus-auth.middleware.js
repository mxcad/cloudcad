///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ExtractJwt } from 'passport-jwt';
/**
 * Tus 认证中间件
 *
 * 为 Tus 上传端点提供 JWT 认证保护。
 */
let TusAuthMiddleware = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TusAuthMiddleware = _classThis = class {
        constructor(jwtService, configService) {
            this.jwtService = jwtService;
            this.configService = configService;
            this.logger = new Logger(TusAuthMiddleware.name);
        }
        use(req, res, next) {
            // 跳过 OPTIONS 请求（CORS 预检）
            if (req.method === 'OPTIONS') {
                return next();
            }
            try {
                // 从 Authorization header 提取 token
                const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
                if (!token) {
                    // 尝试从 session 中获取
                    if (req.session?.userId) {
                        req.user = {
                            id: req.session.userId,
                            role: req.session.userRole,
                            email: req.session.userEmail,
                        };
                        this.logger.debug(`使用 Session 认证: ${req.user.id}`);
                        return next();
                    }
                    this.logger.debug('请求未提供 Token 且无有效 Session');
                    throw new UnauthorizedException('未登录或登录已过期');
                }
                // 验证 JWT
                const secret = this.configService.get('jwt.secret', { infer: true });
                const payload = this.jwtService.verify(token, { secret });
                req.user = payload;
                this.logger.debug(`JWT 认证成功: ${payload.id}`);
                next();
            }
            catch (error) {
                this.logger.error(`Tus 认证失败: ${error.message}`);
                res.status(401).json({
                    statusCode: 401,
                    message: '未登录或登录已过期',
                    error: 'Unauthorized'
                });
            }
        }
    };
    __setFunctionName(_classThis, "TusAuthMiddleware");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TusAuthMiddleware = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TusAuthMiddleware = _classThis;
})();
export { TusAuthMiddleware };
//# sourceMappingURL=tus-auth.middleware.js.map