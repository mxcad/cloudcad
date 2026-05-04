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
import { Injectable, Logger, UnauthorizedException, BadRequestException, InternalServerErrorException, } from '@nestjs/common';
let LocalAuthProvider = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var LocalAuthProvider = _classThis = class {
        constructor(prisma, jwtService, configService, smsVerificationService, wechatService, runtimeConfigService, userService, registrationService, loginService, authTokenService) {
            this.prisma = prisma;
            this.jwtService = jwtService;
            this.configService = configService;
            this.smsVerificationService = smsVerificationService;
            this.wechatService = wechatService;
            this.runtimeConfigService = runtimeConfigService;
            this.userService = userService;
            this.registrationService = registrationService;
            this.loginService = loginService;
            this.authTokenService = authTokenService;
            this.logger = new Logger(LocalAuthProvider.name);
        }
        async login(credentials, req) {
            return this.loginService.login(credentials, req);
        }
        async loginByPhone(phone, code, req) {
            this.logger.log(`手机号验证码登录尝试: ${phone}`);
            const verifyResult = await this.smsVerificationService.verifyCode(phone, code);
            if (!verifyResult.valid) {
                throw new BadRequestException(verifyResult.message);
            }
            const formattedPhone = phone.replace(/^\+86/, '');
            let user = await this.prisma.user.findUnique({
                where: { phone: formattedPhone },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    nickname: true,
                    avatar: true,
                    phone: true,
                    phoneVerified: true,
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
                },
            });
            if (!user) {
                const allowAutoRegister = await this.runtimeConfigService.getValue('allowAutoRegisterOnPhoneLogin', false);
                const allowRegister = await this.runtimeConfigService.getValue('allowRegister', true);
                if (allowAutoRegister && allowRegister) {
                    this.logger.log(`手机号未注册，开始自动注册: ${formattedPhone}`);
                    const baseUsername = `u_${formattedPhone.slice(-8)}`;
                    let username = baseUsername;
                    let suffix = 1;
                    while (await this.prisma.user.findUnique({ where: { username } })) {
                        username = `${baseUsername}_${suffix}`;
                        suffix++;
                    }
                    const newUser = await this.userService.create({
                        username,
                        password: Math.random().toString(36).slice(-12) + '!Aa',
                        nickname: `用户${formattedPhone.slice(-4)}`,
                        phone: formattedPhone,
                        phoneVerified: true,
                    });
                    this.logger.log(`手机号自动注册成功: ${formattedPhone}, username: ${username}`);
                    user = await this.prisma.user.findUnique({
                        where: { id: newUser.id },
                        select: {
                            id: true,
                            email: true,
                            username: true,
                            nickname: true,
                            avatar: true,
                            phone: true,
                            phoneVerified: true,
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
                        },
                    });
                }
                else {
                    throw new BadRequestException({
                        code: 'PHONE_NOT_REGISTERED',
                        message: '手机号未注册，请先注册',
                        phone: formattedPhone,
                    });
                }
            }
            if (!user) {
                throw new InternalServerErrorException('用户创建失败');
            }
            if (user.status !== 'ACTIVE') {
                throw new UnauthorizedException('账号已被禁用');
            }
            const tokens = await this.authTokenService.generateTokens(user);
            if (req && req.session) {
                req.session.userId = user.id;
                req.session.userRole = user.role.name;
                req.session.userEmail = user.email ?? undefined;
                await req.session.save();
                this.logger.log(`Session 已设置: userId=${user.id}, role=${user.role.name}`);
            }
            this.logger.log(`手机号验证码登录成功: ${formattedPhone}`);
            return {
                ...tokens,
                user: {
                    ...user,
                    nickname: user.nickname || undefined,
                    avatar: user.avatar || undefined,
                    role: user.role,
                    status: user.status,
                },
            };
        }
        async loginByWechat(code, state) {
            if (!this.wechatService.validateState(state)) {
                throw new BadRequestException('无效的状态参数');
            }
            const tokenData = await this.wechatService.getAccessToken(code);
            const wechatUser = await this.wechatService.getUserInfo(tokenData.access_token, tokenData.openid);
            let user = await this.prisma.user.findUnique({
                where: { wechatId: wechatUser.openid },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    nickname: true,
                    avatar: true,
                    wechatId: true,
                    provider: true,
                    roleId: true,
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
                    emailVerified: true,
                    phone: true,
                    phoneVerified: true,
                },
            });
            const wechatAutoRegister = await this.runtimeConfigService.getValue('wechatAutoRegister', false);
            const requireEmailVerification = await this.runtimeConfigService.getValue('requireEmailVerification', false);
            const requirePhoneVerification = await this.runtimeConfigService.getValue('requirePhoneVerification', false);
            if (!user) {
                const allowRegister = await this.runtimeConfigService.getValue('allowRegister', true);
                if (wechatAutoRegister && allowRegister) {
                    let username = `wechat_${wechatUser.openid.slice(0, 8)}`;
                    let counter = 0;
                    while (await this.prisma.user.findUnique({ where: { username } })) {
                        counter++;
                        username = `wechat_${wechatUser.openid.slice(0, 8)}_${counter}`;
                    }
                    const defaultRole = await this.prisma.role.findFirst({
                        where: { name: 'USER' },
                    });
                    if (!defaultRole) {
                        throw new InternalServerErrorException('默认角色不存在');
                    }
                    user = await this.prisma.user.create({
                        data: {
                            wechatId: wechatUser.openid,
                            provider: 'WECHAT',
                            username,
                            nickname: wechatUser.nickname,
                            avatar: wechatUser.headimgurl,
                            roleId: defaultRole.id,
                            status: 'ACTIVE',
                        },
                        select: {
                            id: true,
                            email: true,
                            username: true,
                            nickname: true,
                            avatar: true,
                            wechatId: true,
                            provider: true,
                            roleId: true,
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
                            emailVerified: true,
                            phone: true,
                            phoneVerified: true,
                        },
                    });
                    this.logger.log(`微信自动注册新用户: ${username} (ID: ${user.id})`);
                }
                else {
                    const tempToken = this.jwtService.sign({
                        sub: 'pending',
                        type: 'wechat_temp',
                        wechatId: wechatUser.openid,
                        nickname: wechatUser.nickname,
                        avatar: wechatUser.headimgurl,
                    }, {
                        secret: this.configService.get('JWT_SECRET'),
                        expiresIn: '30m',
                    });
                    return {
                        accessToken: '',
                        refreshToken: '',
                        user: null,
                        requireEmailBinding: false,
                        requirePhoneBinding: false,
                        needRegister: true,
                        tempToken,
                    };
                }
            }
            else {
                if (user.status === 'SUSPENDED') {
                    throw new UnauthorizedException('账号已被暂停使用');
                }
                else if (user.status === 'INACTIVE') {
                    throw new UnauthorizedException('账号尚未激活');
                }
                else if (user.status !== 'ACTIVE') {
                    throw new UnauthorizedException('账号状态异常');
                }
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        nickname: wechatUser.nickname,
                        avatar: wechatUser.headimgurl,
                    },
                });
                this.logger.log(`微信用户登录成功: ${user.username} (ID: ${user.id})`);
            }
            const needEmailBinding = requireEmailVerification && !user.email;
            const needPhoneBinding = requirePhoneVerification && !user.phone;
            if (needEmailBinding || needPhoneBinding) {
                const tempToken = this.jwtService.sign({
                    sub: user.id,
                    type: 'wechat_bind_temp',
                    wechatId: user.wechatId,
                }, {
                    secret: this.configService.get('JWT_SECRET'),
                    expiresIn: '30m',
                });
                return {
                    accessToken: '',
                    refreshToken: '',
                    user: {
                        ...user,
                        nickname: user.nickname || undefined,
                        avatar: user.avatar || undefined,
                        role: user.role,
                        status: user.status,
                    },
                    requireEmailBinding: needEmailBinding,
                    requirePhoneBinding: needPhoneBinding,
                    tempToken,
                };
            }
            const tokens = await this.authTokenService.generateTokens(user);
            return {
                ...tokens,
                user: {
                    ...user,
                    nickname: user.nickname || undefined,
                    avatar: user.avatar || undefined,
                    role: user.role,
                    status: user.status,
                },
                requireEmailBinding: false,
                requirePhoneBinding: false,
            };
        }
        async register(data, req) {
            return this.registrationService.register(data, req);
        }
        async refreshToken(token) {
            const result = await this.authTokenService.refreshToken(token);
            const user = await this.prisma.user.findUnique({
                where: { id: result.user.id },
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
                },
            });
            if (!user) {
                throw new UnauthorizedException('用户不存在');
            }
            return {
                ...result,
                user: {
                    ...user,
                    nickname: user.nickname || undefined,
                    avatar: user.avatar || undefined,
                    role: user.role,
                    status: user.status,
                    hasPassword: result.user.hasPassword,
                },
            };
        }
        async getUserInfo(userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
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
                    phone: true,
                    phoneVerified: true,
                    wechatId: true,
                    provider: true,
                },
            });
            if (!user) {
                throw new UnauthorizedException('用户不存在');
            }
            return {
                ...user,
                nickname: user.nickname || undefined,
                avatar: user.avatar || undefined,
                phone: user.phone || undefined,
            };
        }
    };
    __setFunctionName(_classThis, "LocalAuthProvider");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        LocalAuthProvider = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return LocalAuthProvider = _classThis;
})();
export { LocalAuthProvider };
//# sourceMappingURL=local-auth.provider.js.map