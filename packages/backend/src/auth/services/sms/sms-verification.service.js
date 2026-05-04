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
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { SmsProviderFactory, MockSmsProvider } from './providers';
/**
 * 短信验证服务
 *
 * 提供短信验证码的发送和验证功能
 *
 * 安全限制：
 * - 发送频率限制：同一手机号 60 秒内只能发送 1 次
 * - 每日发送上限：同一手机号每天最多发送 N 次（默认 10 次）
 * - IP 限制：同一 IP 每小时最多发送 N 次（默认 20 次）
 */
let SmsVerificationService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var SmsVerificationService = _classThis = class {
        constructor(configService, runtimeConfigService, redis) {
            this.configService = configService;
            this.runtimeConfigService = runtimeConfigService;
            this.redis = redis;
            this.logger = new Logger(SmsVerificationService.name);
            this.provider = null;
            this.providerInitialized = false;
            const cacheTTL = this.configService.get('cacheTTL');
            const smsConfig = this.configService.get('sms');
            // 设置验证码有效期（默认 5 分钟）
            this.codeTTL = cacheTTL?.verificationCode ?? 300;
            // 设置发送频率限制（默认 60 秒）
            this.rateLimitTTL = cacheTTL?.verificationRateLimit ?? 60;
            // 设置发送限制
            this.limits = smsConfig?.limits ?? {
                dailyLimitPerPhone: 10,
                hourlyLimitPerIp: 20,
            };
            // 设置验证限制（默认最多尝试 5 次）
            const smsVerifyConfig = this.configService.get('sms');
            this.verifyLimits = smsVerifyConfig?.verifyLimits ?? {
                maxVerifyAttempts: 5,
            };
            this.logger.log(`短信限制配置: 每日上限=${this.limits.dailyLimitPerPhone}/手机号, IP限制=${this.limits.hourlyLimitPerIp}/小时, 验证最多${this.verifyLimits.maxVerifyAttempts}次`);
        }
        /**
         * 获取或初始化短信服务商
         */
        async getProvider() {
            if (this.providerInitialized) {
                return this.provider;
            }
            // 检查运行时配置是否启用短信服务
            const smsEnabled = await this.runtimeConfigService.getValue('smsEnabled', false);
            if (!smsEnabled) {
                this.provider = new MockSmsProvider();
                this.providerInitialized = true;
                this.logger.log('短信服务未启用（运行时配置），使用 Mock 模式');
                return this.provider;
            }
            // 获取静态配置
            const smsConfig = this.configService.get('sms');
            if (smsConfig) {
                this.provider = SmsProviderFactory.create({
                    provider: smsConfig.provider,
                    aliyun: smsConfig.aliyun,
                    tencent: smsConfig.tencent,
                });
                this.logger.log(`短信服务已启用，使用 ${this.provider.name} 服务商`);
            }
            else {
                this.provider = new MockSmsProvider();
                this.logger.log('短信服务配置缺失，使用 Mock 模式');
            }
            this.providerInitialized = true;
            return this.provider;
        }
        /**
         * 获取验证码存储 Key
         */
        getCodeKey(phone) {
            return `sms_verification:code:${phone}`;
        }
        /**
         * 获取频率限制 Key（60秒内只能发1次）
         */
        getRateLimitKey(phone) {
            return `sms_verification:rate_limit:${phone}`;
        }
        /**
         * 获取每日发送次数 Key
         */
        getDailyCountKey(phone) {
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            return `sms_verification:daily_count:${phone}:${today}`;
        }
        /**
         * 获取 IP 每小时发送次数 Key
         */
        getIpHourlyCountKey(ip) {
            const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
            return `sms_verification:ip_hourly_count:${ip}:${hour}`;
        }
        /**
         * 获取验证尝试次数 Key
         */
        getVerifyAttemptsKey(phone) {
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            return `sms_verification:verify_attempts:${phone}:${today}`;
        }
        /**
         * 验证手机号格式
         */
        validatePhone(phone) {
            // 中国大陆手机号：11位数字，以1开头
            const phoneRegex = /^1[3-9]\d{9}$/;
            // 或者带国际区号的格式：+86开头
            const internationalRegex = /^\+86\s*1[3-9]\d{9}$/;
            return phoneRegex.test(phone) || internationalRegex.test(phone);
        }
        /**
         * 格式化手机号（统一为中国大陆格式）
         */
        formatPhone(phone) {
            // 移除空格和 +86 前缀，然后重新添加
            const cleaned = phone.replace(/\s/g, '').replace(/^\+86/, '');
            return `+86${cleaned}`;
        }
        /**
         * 发送验证码
         *
         * @param phone 手机号
         * @param clientIp 客户端 IP 地址
         * @returns 发送结果
         */
        async sendVerificationCode(phone, clientIp) {
            // 验证手机号格式
            if (!this.validatePhone(phone)) {
                throw new BadRequestException('手机号格式不正确');
            }
            const formattedPhone = this.formatPhone(phone);
            // 1. 检查发送频率限制（60秒内只能发1次）
            const rateLimitKey = this.getRateLimitKey(formattedPhone);
            const rateExists = await this.redis.exists(rateLimitKey);
            if (rateExists) {
                const ttl = await this.redis.ttl(rateLimitKey);
                throw new BadRequestException(`发送过于频繁，请${ttl}秒后再试`);
            }
            // 2. 检查每日发送上限
            const dailyCountKey = this.getDailyCountKey(formattedPhone);
            const dailyCount = parseInt((await this.redis.get(dailyCountKey)) || '0', 10);
            if (dailyCount >= this.limits.dailyLimitPerPhone) {
                throw new BadRequestException(`该手机号今日发送次数已达上限（${this.limits.dailyLimitPerPhone}次），请明天再试`);
            }
            // 3. 检查 IP 每小时发送上限
            if (clientIp) {
                const ipCountKey = this.getIpHourlyCountKey(clientIp);
                const ipCount = parseInt((await this.redis.get(ipCountKey)) || '0', 10);
                if (ipCount >= this.limits.hourlyLimitPerIp) {
                    throw new BadRequestException(`当前网络发送次数已达上限，请稍后再试`);
                }
            }
            // 生成 6 位数字验证码
            const code = (100000 + crypto.randomInt(900000)).toString();
            // 存储验证码到 Redis
            const codeKey = this.getCodeKey(formattedPhone);
            await this.redis.setex(codeKey, this.codeTTL, code);
            // 设置频率限制
            await this.redis.setex(rateLimitKey, this.rateLimitTTL, '1');
            // 增加每日发送计数（有效期到当天结束）
            const secondsUntilMidnight = this.getSecondsUntilMidnight();
            await this.redis.multi();
            const currentDailyCount = await this.redis.incr(dailyCountKey);
            if (currentDailyCount === 1) {
                await this.redis.expire(dailyCountKey, secondsUntilMidnight);
            }
            // 增加 IP 每小时发送计数
            if (clientIp) {
                const ipCountKey = this.getIpHourlyCountKey(clientIp);
                const currentIpCount = await this.redis.incr(ipCountKey);
                if (currentIpCount === 1) {
                    await this.redis.expire(ipCountKey, 3600); // 1 小时
                }
            }
            // 获取短信服务商并发送短信
            const provider = await this.getProvider();
            const result = await provider.sendVerificationCode(formattedPhone, code);
            if (result.success) {
                this.logger.log(`验证码发送成功: ${formattedPhone}, 今日第${currentDailyCount}次, IP=${clientIp || 'unknown'}`);
                return { success: true, message: '验证码已发送' };
            }
            else {
                this.logger.warn(`验证码发送失败: ${formattedPhone}, 原因: ${result.message}`);
                // 发送失败时清理 Redis 中的验证码和计数
                await this.redis.del(codeKey);
                await this.redis.del(rateLimitKey);
                await this.redis.decr(dailyCountKey);
                if (clientIp) {
                    await this.redis.decr(this.getIpHourlyCountKey(clientIp));
                }
                return {
                    success: false,
                    message: result.message || '发送失败，请稍后重试',
                };
            }
        }
        /**
         * 获取到午夜的秒数
         */
        getSecondsUntilMidnight() {
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            return Math.floor((midnight.getTime() - now.getTime()) / 1000);
        }
        /**
         * 验证验证码
         *
         * @param phone 手机号
         * @param code 验证码
         * @returns 验证结果
         */
        async verifyCode(phone, code) {
            if (!this.validatePhone(phone)) {
                throw new BadRequestException('手机号格式不正确');
            }
            const formattedPhone = this.formatPhone(phone);
            const codeKey = this.getCodeKey(formattedPhone);
            const attemptsKey = this.getVerifyAttemptsKey(formattedPhone);
            const storedCode = await this.redis.get(codeKey);
            if (!storedCode) {
                return { valid: false, message: '验证码已过期，请重新获取' };
            }
            if (storedCode !== code) {
                // 获取当前验证尝试次数
                const attempts = parseInt((await this.redis.get(attemptsKey)) || '0', 10);
                const remainingAttempts = this.verifyLimits.maxVerifyAttempts - attempts;
                if (remainingAttempts <= 0) {
                    // 验证次数用完，删除验证码
                    await this.redis.del(codeKey);
                    await this.redis.del(attemptsKey);
                    return { valid: false, message: '验证次数已用完，请重新获取验证码' };
                }
                // 增加验证尝试次数
                await this.redis.incr(attemptsKey);
                // 设置验证次数key的过期时间与验证码一致
                const ttl = await this.redis.ttl(codeKey);
                if (ttl > 0) {
                    await this.redis.expire(attemptsKey, ttl);
                }
                this.logger.log(`验证码验证失败: ${formattedPhone}, 剩余尝试次数: ${remainingAttempts - 1}`);
                return {
                    valid: false,
                    message: `验证码错误，剩余 ${remainingAttempts - 1} 次尝试机会`,
                    remainingAttempts: remainingAttempts - 1,
                };
            }
            // 验证成功后删除验证码和验证次数记录
            await this.redis.del(codeKey);
            await this.redis.del(attemptsKey);
            // 获取验证码剩余有效期
            const ttl = await this.redis.ttl(codeKey);
            this.logger.log(`验证码验证成功: ${formattedPhone}`);
            return {
                valid: true,
                message: '验证成功',
                expiresIn: ttl > 0 ? ttl : undefined,
            };
        }
        /**
         * 发送模板短信
         *
         * @param phone 手机号
         * @param templateId 模板ID
         * @param params 模板参数
         * @returns 发送结果
         */
        async sendTemplate(phone, templateId, params) {
            if (!this.validatePhone(phone)) {
                throw new BadRequestException('手机号格式不正确');
            }
            const formattedPhone = this.formatPhone(phone);
            const provider = await this.getProvider();
            const result = await provider.sendTemplate(formattedPhone, templateId, params);
            return {
                success: result.success,
                message: result.success ? '短信发送成功' : result.message || '发送失败',
            };
        }
        /**
         * 检查短信服务是否启用
         */
        async isEnabled() {
            return this.runtimeConfigService.getValue('smsEnabled', false);
        }
        /**
         * 健康检查
         */
        async healthCheck() {
            const provider = await this.getProvider();
            const isHealthy = await provider.healthCheck();
            return {
                healthy: isHealthy,
                provider: provider.name,
            };
        }
    };
    __setFunctionName(_classThis, "SmsVerificationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        SmsVerificationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return SmsVerificationService = _classThis;
})();
export { SmsVerificationService };
//# sourceMappingURL=sms-verification.service.js.map