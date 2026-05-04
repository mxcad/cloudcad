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
import { Injectable, Logger, UnauthorizedException, BadRequestException, ConflictException, } from '@nestjs/common';
let AuthFacadeService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuthFacadeService = _classThis = class {
        constructor(prisma, jwtService, configService, tokenBlacklistService, emailVerificationService, smsVerificationService, initializationService, runtimeConfigService, userService, redis, registrationService, passwordService, accountBindingService, authTokenService, authProvider) {
            this.prisma = prisma;
            this.jwtService = jwtService;
            this.configService = configService;
            this.tokenBlacklistService = tokenBlacklistService;
            this.emailVerificationService = emailVerificationService;
            this.smsVerificationService = smsVerificationService;
            this.initializationService = initializationService;
            this.runtimeConfigService = runtimeConfigService;
            this.userService = userService;
            this.redis = redis;
            this.registrationService = registrationService;
            this.passwordService = passwordService;
            this.accountBindingService = accountBindingService;
            this.authTokenService = authTokenService;
            this.authProvider = authProvider;
            this.logger = new Logger(AuthFacadeService.name);
        }
        async register(registerDto, req) {
            return this.authProvider.register(registerDto, req);
        }
        async verifyEmailAndActivate(email, code, req) {
            return this.registrationService.verifyEmailAndActivate(email, code, req);
        }
        async login(loginDto, req) {
            return this.authProvider.login(loginDto, req);
        }
        async loginByPhone(phone, code, req) {
            return this.authProvider.loginByPhone(phone, code, req);
        }
        async registerByPhone(registerDto, req) {
            const { phone, code, username, password, nickname } = registerDto;
            const allowRegister = await this.runtimeConfigService.getValue('allowRegister', true);
            if (!allowRegister) {
                throw new BadRequestException('系统已关闭注册功能');
            }
            const smsEnabled = await this.runtimeConfigService.getValue('smsEnabled', false);
            const requirePhoneVerification = await this.runtimeConfigService.getValue('requirePhoneVerification', false);
            if (!smsEnabled || !requirePhoneVerification) {
                throw new BadRequestException('手机号注册未启用，请使用邮箱注册');
            }
            const verifyResult = await this.smsVerificationService.verifyCode(phone, code);
            if (!verifyResult.valid) {
                throw new BadRequestException(verifyResult.message);
            }
            const formattedPhone = phone.replace(/^\+86/, '');
            const existingUserByPhone = await this.prisma.user.findUnique({
                where: { phone: formattedPhone },
            });
            if (existingUserByPhone) {
                throw new ConflictException('手机号已被注册');
            }
            const existingUserByUsername = await this.prisma.user.findUnique({
                where: { username },
            });
            if (existingUserByUsername) {
                throw new ConflictException('用户名已被使用');
            }
            const user = await this.userService.create({
                username,
                password,
                nickname: nickname || username,
                phone: formattedPhone,
                phoneVerified: true,
            });
            this.logger.log(`手机号注册成功: ${formattedPhone}, username: ${username}`);
            const tokens = await this.authTokenService.generateTokens(user);
            if (req && req.session) {
                req.session.userId = user.id;
                req.session.userRole = user.role?.name || 'USER';
            }
            return {
                ...tokens,
                user: {
                    ...user,
                    role: user.role,
                    status: user.status,
                },
            };
        }
        async loginWithWechat(code, state) {
            return this.authProvider.loginByWechat(code, state);
        }
        async refreshToken(refreshToken) {
            return this.authProvider.refreshToken(refreshToken);
        }
        async logout(userId, accessToken, req) {
            return this.authTokenService.logout(userId, accessToken, req);
        }
        async revokeToken(token) {
            return this.authTokenService.revokeToken(token);
        }
        async generateTokens(user) {
            return this.authTokenService.generateTokens(user);
        }
        async validateUser(email, password) {
            return this.passwordService.validateUser(email, password);
        }
        async forgotPassword(email, phone) {
            return this.passwordService.forgotPassword(email, phone);
        }
        async resetPassword(email, phone, code, newPassword) {
            return this.passwordService.resetPassword(email, phone, code, newPassword);
        }
        async sendBindEmailCode(userId, email, isRebind = false) {
            return this.accountBindingService.sendBindEmailCode(userId, email, isRebind);
        }
        async verifyBindEmail(userId, email, code) {
            return this.accountBindingService.verifyBindEmail(userId, email, code);
        }
        async bindPhone(userId, phone, code) {
            return this.accountBindingService.bindPhone(userId, phone, code);
        }
        async sendUnbindPhoneCode(userId) {
            return this.accountBindingService.sendUnbindPhoneCode(userId);
        }
        async verifyUnbindPhoneCode(userId, code) {
            return this.accountBindingService.verifyUnbindPhoneCode(userId, code);
        }
        async rebindPhone(userId, phone, code, token) {
            return this.accountBindingService.rebindPhone(userId, phone, code, token);
        }
        async sendUnbindEmailCode(userId) {
            return this.accountBindingService.sendUnbindEmailCode(userId);
        }
        async verifyUnbindEmailCode(userId, code) {
            return this.accountBindingService.verifyUnbindEmailCode(userId, code);
        }
        async rebindEmail(userId, email, code, token) {
            return this.accountBindingService.rebindEmail(userId, email, code, token);
        }
        async bindWechat(userId, code, state) {
            return this.accountBindingService.bindWechat(userId, code, state);
        }
        async unbindWechat(userId) {
            return this.accountBindingService.unbindWechat(userId);
        }
        async checkFieldUniqueness(dto) {
            return this.accountBindingService.checkFieldUniqueness(dto);
        }
        async deleteAllRefreshTokens(userId) {
            return this.authTokenService.deleteAllRefreshTokens(userId);
        }
        async verifyPhoneAndLogin(phone, code, req) {
            this.logger.log(`开始验证手机号: ${phone}`);
            const verifyResult = await this.smsVerificationService.verifyCode(phone, code);
            if (!verifyResult.valid) {
                throw new BadRequestException(verifyResult.message);
            }
            const formattedPhone = phone.replace(/^\+86/, '');
            const user = await this.prisma.user.findFirst({
                where: { phone: formattedPhone },
                include: {
                    role: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            isSystem: true,
                            permissions: { select: { permission: true } },
                        },
                    },
                },
            });
            if (!user) {
                throw new BadRequestException('该手机号未注册');
            }
            if (user.status !== 'ACTIVE') {
                throw new UnauthorizedException('账号已被禁用');
            }
            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    phoneVerified: true,
                    phoneVerifiedAt: new Date(),
                },
            });
            this.logger.log(`手机号验证成功: ${formattedPhone}, userId: ${user.id}`);
            const { password: _, ...userWithoutPassword } = user;
            const tokens = await this.authTokenService.generateTokens(userWithoutPassword);
            if (req && req.session) {
                req.session.userId = user.id;
                req.session.userRole = user.role?.name || 'USER';
            }
            return {
                ...tokens,
                user: {
                    ...userWithoutPassword,
                    phoneVerified: true,
                },
            };
        }
        async bindEmailAndLogin(tempToken, email, code, req) {
            this.logger.log(`开始绑定邮箱并登录: ${email}`);
            let payload;
            try {
                payload = this.jwtService.verify(tempToken, {
                    secret: this.configService.get('JWT_SECRET'),
                });
            }
            catch {
                throw new BadRequestException('临时令牌无效或已过期，请重新登录');
            }
            if (payload.type !== 'bind_email_temp') {
                throw new BadRequestException('无效的令牌类型');
            }
            const userId = payload.sub;
            const result = await this.emailVerificationService.verifyEmail(email, code);
            if (!result.valid) {
                throw new BadRequestException(result.message);
            }
            const existingUser = await this.prisma.user.findFirst({
                where: {
                    email,
                    deletedAt: null,
                },
            });
            if (existingUser && existingUser.id !== userId) {
                throw new ConflictException('该邮箱已被其他账号绑定');
            }
            const user = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    email,
                    emailVerified: true,
                    emailVerifiedAt: new Date(),
                },
                include: {
                    role: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            isSystem: true,
                            permissions: { select: { permission: true } },
                        },
                    },
                },
            });
            this.logger.log(`邮箱绑定成功: userId=${userId}, email=${email}`);
            const { password: _, ...userWithoutPassword } = user;
            const tokens = await this.authTokenService.generateTokens(userWithoutPassword);
            if (req && req.session) {
                req.session.userId = user.id;
                req.session.userRole = user.role?.name || 'USER';
            }
            return {
                ...tokens,
                user: userWithoutPassword,
            };
        }
        async bindPhoneAndLogin(tempToken, phone, code, req) {
            this.logger.log(`开始绑定手机号并登录: ${phone}`);
            let payload;
            try {
                payload = this.jwtService.verify(tempToken, {
                    secret: this.configService.get('JWT_SECRET'),
                });
            }
            catch {
                throw new BadRequestException('临时令牌无效或已过期，请重新登录');
            }
            if (payload.type !== 'bind_phone_temp') {
                throw new BadRequestException('无效的令牌类型');
            }
            const userId = payload.sub;
            const verifyResult = await this.smsVerificationService.verifyCode(phone, code);
            if (!verifyResult.valid) {
                throw new BadRequestException(verifyResult.message);
            }
            const formattedPhone = phone.replace(/^\+86/, '');
            const existingUser = await this.prisma.user.findFirst({
                where: { phone: formattedPhone },
            });
            if (existingUser && existingUser.id !== userId) {
                throw new ConflictException('该手机号已被其他账号绑定');
            }
            const user = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    phone: formattedPhone,
                    phoneVerified: true,
                    phoneVerifiedAt: new Date(),
                },
                include: {
                    role: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            isSystem: true,
                            permissions: { select: { permission: true } },
                        },
                    },
                },
            });
            this.logger.log(`手机号绑定成功: userId=${userId}, phone=${formattedPhone}`);
            const { password: _, ...userWithoutPassword } = user;
            const tokens = await this.authTokenService.generateTokens(userWithoutPassword);
            if (req && req.session) {
                req.session.userId = user.id;
                req.session.userRole = user.role?.name || 'USER';
            }
            return {
                ...tokens,
                user: userWithoutPassword,
            };
        }
        async verifyEmailAndRegisterPhone(email, emailCode, registerData, req) {
            this.logger.log(`开始验证邮箱并完成手机号注册: ${email}, phone: ${registerData.phone}`);
            const emailVerifyResult = await this.emailVerificationService.verifyEmail(email, emailCode);
            if (!emailVerifyResult.valid) {
                throw new BadRequestException(emailVerifyResult.message);
            }
            const phoneVerifyResult = await this.smsVerificationService.verifyCode(registerData.phone, registerData.code);
            if (!phoneVerifyResult.valid) {
                throw new BadRequestException(phoneVerifyResult.message);
            }
            const { phone, username, password, nickname } = registerData;
            const formattedPhone = phone.replace(/^\+86/, '');
            const existingUserByPhone = await this.prisma.user.findUnique({
                where: { phone: formattedPhone },
            });
            if (existingUserByPhone) {
                throw new ConflictException('手机号已被注册');
            }
            const existingUserByUsername = await this.prisma.user.findUnique({
                where: { username },
            });
            if (existingUserByUsername) {
                throw new ConflictException('用户名已被使用');
            }
            const existingUserByEmail = await this.prisma.user.findFirst({
                where: {
                    email,
                    deletedAt: null,
                },
            });
            if (existingUserByEmail) {
                throw new ConflictException('邮箱已被注册');
            }
            const user = await this.userService.create({
                username,
                password,
                nickname: nickname || username,
                email,
                emailVerified: true,
                phone: formattedPhone,
                phoneVerified: true,
            });
            this.logger.log(`手机号注册成功（邮箱验证后）: ${formattedPhone}, email: ${email}, username: ${username}`);
            const tokens = await this.authTokenService.generateTokens(user);
            if (req && req.session) {
                req.session.userId = user.id;
                req.session.userRole = user.role?.name || 'USER';
            }
            return {
                ...tokens,
                user: {
                    ...user,
                    role: user.role,
                    status: user.status,
                },
            };
        }
    };
    __setFunctionName(_classThis, "AuthFacadeService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuthFacadeService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuthFacadeService = _classThis;
})();
export { AuthFacadeService };
//# sourceMappingURL=auth-facade.service.js.map