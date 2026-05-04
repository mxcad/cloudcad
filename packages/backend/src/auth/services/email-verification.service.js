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
import { Injectable, BadRequestException } from '@nestjs/common';
let EmailVerificationService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var EmailVerificationService = _classThis = class {
        constructor(emailService, configService, redis) {
            this.emailService = emailService;
            this.configService = configService;
            this.redis = redis;
            const cacheTTL = this.configService.get('cacheTTL', { infer: true });
            this.codeTTL = cacheTTL.verificationCode;
            this.rateLimitTTL = cacheTTL.verificationRateLimit;
            this.maxVerifyAttempts = 5;
        }
        getCodeKey(email) {
            return `email_verification:code:${email}`;
        }
        getRateLimitKey(email) {
            return `email_verification:rate_limit:${email}`;
        }
        getVerifyAttemptsKey(email) {
            const today = new Date().toISOString().slice(0, 10);
            return `email_verification:verify_attempts:${email}:${today}`;
        }
        async generateVerificationToken(email) {
            // 生成6位数字验证码（使用加密安全的随机数生成器）
            const crypto = await import('crypto');
            const code = (100000 + crypto.randomInt(900000)).toString();
            // 存储到 Redis，配置的过期时间
            const key = this.getCodeKey(email);
            await this.redis.setex(key, this.codeTTL, code);
            return code;
        }
        async sendVerificationEmail(email) {
            // 检查发送频率限制
            const rateLimitKey = this.getRateLimitKey(email);
            const exists = await this.redis.exists(rateLimitKey);
            if (exists) {
                throw new BadRequestException('发送过于频繁，请稍后再试');
            }
            // 生成并发送验证码
            const token = await this.generateVerificationToken(email);
            await this.emailService.sendVerificationEmail(email, token);
            // 设置频率限制，配置的时间内不能重复发送
            await this.redis.setex(rateLimitKey, this.rateLimitTTL, '1');
        }
        async verifyEmail(email, code) {
            const key = this.getCodeKey(email);
            const attemptsKey = this.getVerifyAttemptsKey(email);
            const rateLimitKey = this.getRateLimitKey(email);
            const storedCode = await this.redis.get(key);
            if (!storedCode) {
                throw new BadRequestException('验证码无效或已过期');
            }
            if (storedCode !== code) {
                const attempts = parseInt((await this.redis.get(attemptsKey)) || '0', 10);
                const remainingAttempts = this.maxVerifyAttempts - attempts;
                if (remainingAttempts <= 0) {
                    await this.redis.del(key);
                    await this.redis.del(attemptsKey);
                    throw new BadRequestException('验证次数已用完，请重新获取验证码');
                }
                await this.redis.incr(attemptsKey);
                const ttl = await this.redis.ttl(key);
                if (ttl > 0) {
                    await this.redis.expire(attemptsKey, ttl);
                }
                throw new BadRequestException(`验证码错误，剩余 ${remainingAttempts - 1} 次尝试机会`);
            }
            await this.redis.del(key);
            await this.redis.del(attemptsKey);
            await this.redis.del(rateLimitKey);
            return { valid: true, message: '验证成功' };
        }
        async resendVerificationEmail(email) {
            await this.sendVerificationEmail(email);
        }
    };
    __setFunctionName(_classThis, "EmailVerificationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        EmailVerificationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return EmailVerificationService = _classThis;
})();
export { EmailVerificationService };
//# sourceMappingURL=email-verification.service.js.map