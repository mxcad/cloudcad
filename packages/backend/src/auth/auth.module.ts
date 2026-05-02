///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module, forwardRef } from '@nestjs/common';
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
import { SessionController } from './session.controller';
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
import { AppConfig } from '../config/app.config';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => CommonModule),
    RedisModule,
    RuntimeConfigModule,
    forwardRef(() => UsersModule),
    PassportModule,
    SmsModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig>) => {
        const mailConfig = configService.get('mail', { infer: true })!;
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
      useFactory: (configService: ConfigService<AppConfig>) => ({
        secret: configService.get('jwt.secret', { infer: true }),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn', { infer: true }),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, SessionController],
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
  ],
})
export class AuthModule {}
