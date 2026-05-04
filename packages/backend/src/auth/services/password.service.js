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
import { Injectable, Logger, UnauthorizedException, BadRequestException, } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
let PasswordService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PasswordService = _classThis = class {
        constructor(prisma, emailVerificationService, smsVerificationService, runtimeConfigService, authTokenService, tokenBlacklistService) {
            this.prisma = prisma;
            this.emailVerificationService = emailVerificationService;
            this.smsVerificationService = smsVerificationService;
            this.runtimeConfigService = runtimeConfigService;
            this.authTokenService = authTokenService;
            this.tokenBlacklistService = tokenBlacklistService;
            this.logger = new Logger(PasswordService.name);
        }
        async validateUser(email, password) {
            const user = await this.prisma.user.findUnique({
                where: { email },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    nickname: true,
                    avatar: true,
                    role: {
                        include: {
                            permissions: true,
                        },
                    },
                    status: true,
                    password: true,
                },
            });
            if (user && user.status === 'ACTIVE') {
                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (isPasswordValid) {
                    const { password: _, ...result } = user;
                    return result;
                }
            }
            return null;
        }
        async forgotPassword(email, phone) {
            if (!email && !phone) {
                throw new BadRequestException('邮箱和手机号不能同时为空');
            }
            this.logger.log(`忘记密码请求：email=${email}, phone=${phone}`);
            const mailEnabled = await this.runtimeConfigService.getValue('mailEnabled', false);
            const smsEnabled = await this.runtimeConfigService.getValue('smsEnabled', false);
            if (!mailEnabled && !smsEnabled) {
                const supportEmail = await this.runtimeConfigService.getValue('supportEmail', '');
                const supportPhone = await this.runtimeConfigService.getValue('supportPhone', '');
                return {
                    message: '邮件服务和短信服务均未启用，请联系客服重置密码',
                    mailEnabled: false,
                    smsEnabled: false,
                    supportEmail,
                    supportPhone,
                };
            }
            if (email) {
                if (!mailEnabled) {
                    const supportEmail = await this.runtimeConfigService.getValue('supportEmail', '');
                    const supportPhone = await this.runtimeConfigService.getValue('supportPhone', '');
                    return {
                        message: '邮件服务未启用，无法使用邮箱重置密码，请联系客服',
                        mailEnabled: false,
                        smsEnabled,
                        supportEmail,
                        supportPhone,
                    };
                }
                const user = await this.prisma.user.findUnique({
                    where: { email },
                });
                if (!user) {
                    throw new UnauthorizedException('该邮箱未注册');
                }
                if (user.status !== 'ACTIVE') {
                    throw new UnauthorizedException('账号已被禁用，无法重置密码');
                }
                await this.emailVerificationService.sendVerificationEmail(email);
                this.logger.log(`密码重置验证码已发送：${email}`);
                return {
                    message: '密码重置验证码已发送到您的邮箱',
                    mailEnabled: true,
                    smsEnabled,
                };
            }
            if (phone) {
                if (!smsEnabled) {
                    const supportEmail = await this.runtimeConfigService.getValue('supportEmail', '');
                    const supportPhone = await this.runtimeConfigService.getValue('supportPhone', '');
                    return {
                        message: '短信服务未启用，无法使用手机号重置密码，请联系客服',
                        mailEnabled,
                        smsEnabled: false,
                        supportEmail,
                        supportPhone,
                    };
                }
                const user = await this.prisma.user.findUnique({
                    where: { phone },
                });
                if (!user) {
                    throw new UnauthorizedException('该手机号未注册');
                }
                if (user.status !== 'ACTIVE') {
                    throw new UnauthorizedException('账号已被禁用，无法重置密码');
                }
                await this.smsVerificationService.sendVerificationCode(phone);
                this.logger.log(`密码重置验证码已发送：${phone}`);
                return {
                    message: '密码重置验证码已发送到您的手机',
                    mailEnabled,
                    smsEnabled: true,
                };
            }
            throw new BadRequestException('邮箱和手机号不能同时为空');
        }
        async resetPassword(email, phone, code, newPassword) {
            this.logger.log(`重置密码请求：email=${email}, phone=${phone}`);
            let user;
            if (email) {
                const result = await this.emailVerificationService.verifyEmail(email, code);
                if (!result.valid) {
                    this.logger.error(`验证码验证失败：${email}，${result.message}`);
                    throw new UnauthorizedException(result.message);
                }
                user = await this.prisma.user.findUnique({
                    where: { email },
                });
            }
            else if (phone) {
                const result = await this.smsVerificationService.verifyCode(phone, code);
                if (!result.valid) {
                    this.logger.error(`验证码验证失败：${phone}，${result.message}`);
                    throw new UnauthorizedException(result.message);
                }
                user = await this.prisma.user.findUnique({
                    where: { phone },
                });
            }
            if (!user) {
                throw new UnauthorizedException('用户不存在');
            }
            const hashedPassword = await bcrypt.hash(newPassword, 12);
            await this.prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword },
            });
            await this.authTokenService.deleteAllRefreshTokens(user.id);
            await this.tokenBlacklistService.removeUserFromBlacklist(user.id);
            this.logger.log(`密码重置成功：email=${email ?? phone}`);
            return {
                message: '密码重置成功，请使用新密码登录',
            };
        }
    };
    __setFunctionName(_classThis, "PasswordService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PasswordService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PasswordService = _classThis;
})();
export { PasswordService };
//# sourceMappingURL=password.service.js.map