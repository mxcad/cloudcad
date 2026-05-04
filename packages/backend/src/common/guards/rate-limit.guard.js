///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software should reach an agreement with Chengdu Dream Kaide
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
import { Injectable, HttpException, HttpStatus, Logger, } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
/**
 * 速率限制 Guard
 *
 * 功能：
 * 1. 对公开接口（@Public）施加严格的速率限制
 * 2. 对需要认证的接口施加宽松的速率限制
 * 3. 基于 IP 进行限流
 * 4. 使用滑动窗口算法
 * 5. 可通过装饰器自定义限流规则
 */
let RateLimitGuard = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RateLimitGuard = _classThis = class {
        constructor(reflector) {
            this.reflector = reflector;
            this.logger = new Logger(RateLimitGuard.name);
            // 内存存储的 IP 请求记录
            this.requestRecords = new Map();
            // 配置：公开接口限制（更严格）
            this.publicLimit = {
                windowMs: 60000, // 1分钟
                maxRequests: 30, // 最多30次请求
            };
            // 配置：认证接口限制（更宽松）
            this.authenticatedLimit = {
                windowMs: 60000, // 1分钟
                maxRequests: 150, // 最多150次请求
            };
            // 每5分钟清理一次过期记录
            this.cleanupInterval = setInterval(() => this.cleanupOldRecords(), 300000);
        }
        /**
         * 清理过期的请求记录
         */
        cleanupOldRecords() {
            const now = Date.now();
            const maxAge = Math.max(this.publicLimit.windowMs, this.authenticatedLimit.windowMs) * 2;
            for (const [ip, record] of this.requestRecords) {
                if (now - record.startTime > maxAge) {
                    this.requestRecords.delete(ip);
                }
            }
            this.logger.debug(`清理了过期的速率限制记录`);
        }
        /**
         * 获取客户端真实 IP
         */
        getClientIp(request) {
            // 尝试从各种可能的头中获取真实 IP
            const forwardedFor = request.headers['x-forwarded-for'];
            if (forwardedFor) {
                const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim();
                return ips;
            }
            const realIp = request.headers['x-real-ip'];
            if (realIp) {
                return Array.isArray(realIp) ? realIp[0] : realIp;
            }
            // 回退到 Express 的 ip 属性
            return request.ip || request.connection?.remoteAddress || 'unknown';
        }
        /**
         * 检查是否超过速率限制
         */
        isRateLimited(ip, limitConfig) {
            const now = Date.now();
            let record = this.requestRecords.get(ip);
            if (!record) {
                // 没有记录，创建新的
                record = { count: 1, startTime: now };
                this.requestRecords.set(ip, record);
                return false;
            }
            // 检查是否在同一个时间窗口内
            if (now - record.startTime < limitConfig.windowMs) {
                // 在同一个窗口内，增加计数
                record.count++;
                if (record.count > limitConfig.maxRequests) {
                    return true;
                }
            }
            else {
                // 新的时间窗口，重置计数
                record.count = 1;
                record.startTime = now;
            }
            return false;
        }
        async canActivate(context) {
            const request = context.switchToHttp().getRequest();
            const ip = this.getClientIp(request);
            // 检查是否是公开接口
            const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
            const limitConfig = isPublic ? this.publicLimit : this.authenticatedLimit;
            if (this.isRateLimited(ip, limitConfig)) {
                this.logger.warn(`IP ${ip} 超过速率限制 (${isPublic ? '公开接口' : '认证接口'})`);
                throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
            }
            return true;
        }
    };
    __setFunctionName(_classThis, "RateLimitGuard");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RateLimitGuard = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RateLimitGuard = _classThis;
})();
export { RateLimitGuard };
//# sourceMappingURL=rate-limit.guard.js.map