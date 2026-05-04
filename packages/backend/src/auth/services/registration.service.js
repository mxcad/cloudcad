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
import { Injectable, Logger, BadRequestException, ConflictException, InternalServerErrorException, } from '@nestjs/common';
let RegistrationService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RegistrationService = _classThis = class {
        constructor(prisma, jwtService, configService, emailVerificationService, runtimeConfigService, userService, authTokenService, redis) {
            this.prisma = prisma;
            this.jwtService = jwtService;
            this.configService = configService;
            this.emailVerificationService = emailVerificationService;
            this.runtimeConfigService = runtimeConfigService;
            this.userService = userService;
            this.authTokenService = authTokenService;
            this.redis = redis;
            this.logger = new Logger(RegistrationService.name);
        }
        async register(registerDto, req) {
            const { email, username, password, nickname, wechatTempToken } = registerDto;
            const allowRegister = await this.runtimeConfigService.getValue('allowRegister', true);
            if (!allowRegister) {
                throw new BadRequestException('系统已关闭注册功能');
            }
            if (email) {
                const existingUserByEmail = await this.prisma.user.findFirst({
                    where: {
                        email,
                        deletedAt: null,
                    },
                });
                if (existingUserByEmail) {
                    throw new ConflictException('邮箱已被注册');
                }
            }
            const existingUserByUsername = await this.prisma.user.findUnique({
                where: { username },
            });
            if (existingUserByUsername) {
                throw new ConflictException('用户名已被使用');
            }
            let wechatData = null;
            if (wechatTempToken) {
                try {
                    const payload = this.jwtService.verify(wechatTempToken, {
                        secret: this.configService.get('JWT_SECRET'),
                    });
                    if (payload.type === 'wechat_temp' && payload.wechatId) {
                        wechatData = {
                            wechatId: payload.wechatId,
                            nickname: payload.nickname || username,
                            avatar: payload.avatar || '',
                        };
                        const existingWechatUser = await this.prisma.user.findUnique({
                            where: { wechatId: wechatData.wechatId },
                        });
                        if (existingWechatUser) {
                            throw new ConflictException('该微信已绑定其他账号');
                        }
                    }
                }
                catch (error) {
                    if (error instanceof ConflictException)
                        throw error;
                    throw new BadRequestException('无效的微信临时 Token');
                }
            }
            const mailEnabled = await this.runtimeConfigService.getValue('mailEnabled', false);
            if (!mailEnabled) {
                const user = await this.userService.create({
                    email: email || undefined,
                    username,
                    password,
                    nickname: nickname || wechatData?.nickname || username,
                    avatar: wechatData?.avatar,
                    wechatId: wechatData?.wechatId,
                    provider: wechatData ? 'WECHAT' : 'LOCAL',
                });
                this.logger.log(`用户直接注册成功（邮件服务未启用）: ${username}`);
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
            const requireEmailVerification = await this.runtimeConfigService.getValue('requireEmailVerification', false);
            if (requireEmailVerification && !email) {
                throw new BadRequestException('邮箱验证已启用，注册需要提供邮箱地址');
            }
            if (!requireEmailVerification) {
                const user = await this.userService.create({
                    email: email || undefined,
                    username,
                    password,
                    nickname: nickname || wechatData?.nickname || username,
                    avatar: wechatData?.avatar,
                    wechatId: wechatData?.wechatId,
                    provider: wechatData ? 'WECHAT' : 'LOCAL',
                });
                this.logger.log(`用户直接注册成功（无需邮箱验证）: ${username}`);
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
            const registerKey = `register:pending:${email}`;
            await this.redis.setex(registerKey, 15 * 60, JSON.stringify({
                email,
                username,
                password,
                nickname: nickname || wechatData?.nickname || username,
                avatar: wechatData?.avatar,
                wechatId: wechatData?.wechatId,
                provider: wechatData ? 'WECHAT' : 'LOCAL',
            }));
            try {
                await this.emailVerificationService.sendVerificationEmail(email);
                this.logger.log(`验证码已发送: ${email}`);
            }
            catch (error) {
                const err = error;
                this.logger.error(`发送验证码失败: ${err.message}`);
                await this.redis.del(registerKey);
                throw new InternalServerErrorException('发送验证码失败，请稍后重试');
            }
            return {
                message: '验证码已发送到您的邮箱，请查收并完成验证',
                email: email,
            };
        }
        async verifyEmailAndActivate(email, code, req) {
            this.logger.log(`开始验证邮箱: ${email}`);
            const result = await this.emailVerificationService.verifyEmail(email, code);
            if (!result.valid) {
                this.logger.error(`验证码验证失败: ${email}，${result.message}`);
                throw new BadRequestException(result.message);
            }
            this.logger.log(`验证码验证成功: ${email}`);
            // 场景1：注册流程 - Redis 中有 pending 注册信息，需要创建用户
            const registerKey = `register:pending:${email}`;
            const registerDataStr = await this.redis.get(registerKey);
            if (registerDataStr) {
                const registerData = JSON.parse(registerDataStr);
                this.logger.log(`解析注册信息成功: ${registerData.username}`);
                const user = await this.userService.create({
                    email: registerData.email,
                    username: registerData.username,
                    password: registerData.password,
                    nickname: registerData.nickname,
                    avatar: registerData.avatar,
                    wechatId: registerData.wechatId,
                    provider: registerData.provider || 'LOCAL',
                });
                this.logger.log(`用户创建成功: ${email}`);
                await this.redis.del(registerKey);
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
            // 场景2：已有用户验证邮箱 - 用户已注册但邮箱未验证
            const existingUser = await this.prisma.user.findUnique({
                where: { email },
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
            if (!existingUser) {
                this.logger.error(`注册信息已过期且用户不存在: ${email}`);
                throw new BadRequestException('注册信息已过期，请重新注册');
            }
            this.logger.log(`已有用户验证邮箱: userId=${existingUser.id}`);
            const updatedUser = await this.prisma.user.update({
                where: { id: existingUser.id },
                data: {
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
            const { password: _, ...userWithoutPassword } = updatedUser;
            const tokens = await this.authTokenService.generateTokens(userWithoutPassword);
            if (req && req.session) {
                req.session.userId = updatedUser.id;
                req.session.userRole = updatedUser.role?.name || 'USER';
            }
            return {
                ...tokens,
                user: userWithoutPassword,
            };
        }
    };
    __setFunctionName(_classThis, "RegistrationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RegistrationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RegistrationService = _classThis;
})();
export { RegistrationService };
//# sourceMappingURL=registration.service.js.map