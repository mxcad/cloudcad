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
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthFacadeService } from './auth-facade.service';
import { RegistrationService } from './services/registration.service';
import { LoginService } from './services/login.service';
import { PasswordService } from './services/password.service';
import { AccountBindingService } from './services/account-binding.service';
import { AuthTokenService } from './services/auth-token.service';
import { WechatService } from './services/wechat.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailService } from './services/email.service';
import { EmailVerificationService } from './services/email-verification.service';
import { SmsModule } from './services/sms/sms.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { InitializationService } from '../common/services/initialization.service';
import { EMAIL_VERIFICATION_SERVICE } from '../common/interfaces/verification.interface';
import { AUTH_PROVIDER } from './interfaces/auth-provider.interface';
import { LocalAuthProvider } from './providers/local-auth.provider';
let AuthModule = (() => {
    let _classDecorators = [Module({
            imports: [
                DatabaseModule,
                CommonModule,
                RedisModule,
                RuntimeConfigModule,
                UsersModule,
                PassportModule,
                SmsModule,
                MailerModule.forRootAsync({
                    imports: [ConfigModule],
                    useFactory: (configService) => {
                        const mailConfig = configService.get('mail', { infer: true });
                        return {
                            transport: {
                                host: mailConfig.host,
                                port: mailConfig.port,
                                secure: mailConfig.secure,
                                auth: {
                                    user: mailConfig.user,
                                    pass: mailConfig.pass,
                                },
                            },
                            defaults: {
                                from: mailConfig.from,
                            },
                            template: {
                                dir: join(__dirname, '..', 'templates'),
                                adapter: new HandlebarsAdapter(),
                                options: {
                                    strict: false,
                                },
                            },
                        };
                    },
                    inject: [ConfigService],
                }),
                JwtModule.registerAsync({
                    imports: [ConfigModule],
                    useFactory: (configService) => ({
                        secret: configService.get('jwt.secret', { infer: true }),
                        signOptions: {
                            expiresIn: configService.get('jwt.expiresIn', { infer: true }),
                        },
                    }),
                    inject: [ConfigService],
                }),
            ],
            controllers: [AuthController],
            providers: [
                AuthFacadeService,
                RegistrationService,
                LoginService,
                PasswordService,
                AccountBindingService,
                AuthTokenService,
                WechatService,
                JwtStrategy,
                RefreshTokenStrategy,
                JwtAuthGuard,
                TokenBlacklistService,
                EmailService,
                EmailVerificationService,
                InitializationService,
                LocalAuthProvider,
                {
                    provide: EMAIL_VERIFICATION_SERVICE,
                    useExisting: EmailVerificationService,
                },
                {
                    provide: AUTH_PROVIDER,
                    useFactory: (configService, localAuthProvider) => {
                        const providerType = configService.get('AUTH_PROVIDER', 'local');
                        switch (providerType) {
                            case 'local':
                            default:
                                return localAuthProvider;
                        }
                    },
                    inject: [ConfigService, LocalAuthProvider],
                },
            ],
            exports: [
                AuthFacadeService,
                RegistrationService,
                LoginService,
                PasswordService,
                AccountBindingService,
                AuthTokenService,
                TokenBlacklistService,
                JwtAuthGuard,
                EmailVerificationService,
                SmsModule,
                EMAIL_VERIFICATION_SERVICE,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuthModule = _classThis = class {
    };
    __setFunctionName(_classThis, "AuthModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuthModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuthModule = _classThis;
})();
export { AuthModule };
//# sourceMappingURL=auth.module.js.map