///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { resolve } from 'path';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from '../common/common.module';
import { NotificationModule } from '../notification/notification.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { UsersModule } from '../users/users.module';
import { BillingModule } from '../billing/billing.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { SmsModule } from './services/sms/sms.module';
import { WechatModule } from './services/wechat/wechat.module';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AuthFacadeService } from './auth-facade.service';
import { AdminAuthService } from './impl/services/admin-auth.service';
import { IpWhitelistModule } from '../ip-whitelist/ip-whitelist.module';
import { IpBlacklistModule } from '../ip-blacklist/ip-blacklist.module';
import { SecurityAccessAttemptModule } from '../security/security-access-attempt.module';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { InitializationService } from './services/initialization.service';
import { AccountRateLimitService } from './services/account-rate-limit.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { AppConfig } from '../config/app.config';
import configuration from '../config/configuration';
import { createDefaultAuthProviders } from './impl/index';
import { DeviceAuthModule } from './device/device-auth.module';
import { PermissionModule } from '../permission/permission.module';
import { EmailVerificationService } from '../notification/email-verification.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { DatabaseService } from '../database/database.service';
import { SmsVerificationService } from './services/sms';
import { MembershipService } from '../vip/membership.service';
import { DB, EMAIL, CONFIG, SMS, TOKEN_BLACKLIST, MEMBERSHIP_SERVICE, IAUTH_FACADE } from '@cloudcad/contracts';

function resolveAuthImplPath(authImpl: string): string {
  // IMPL=true / IMPL=1 → 私有包默认路径 packages/impl-mx/dist
  if (authImpl === 'true' || authImpl === '1') {
    // 当前文件: packages/backend/dist/auth/auth.module.js
    // 向上 4 级: auth/ → dist/ → backend/ → packages/ → <项目根目录>
    return resolve(__dirname, '../../../../packages/impl-mx/dist');
  }
  return authImpl;
}

function resolveAuthProviders(implPath: string): Provider[] {
  try {
    const impl = require(implPath) as {
      createAuthProviders?: () => Provider[];
      createRealProviders?: () => Provider[];
    };
    return impl.createAuthProviders?.() ?? impl.createRealProviders?.() ?? [];
  } catch {
    try {
      const resolved = resolve(implPath);
      const impl = require(resolved) as {
        createAuthProviders?: () => Provider[];
        createRealProviders?: () => Provider[];
      };
      return impl.createAuthProviders?.() ?? impl.createRealProviders?.() ?? [];
    } catch (e) {
      throw new Error(`Failed to load auth implementation from ${implPath}: ${(e as Error).message}`);
    }
  }
}

@Module({})
export class AuthModule {
  private static rootModule: DynamicModule;

  static forRoot(): DynamicModule {
    if (AuthModule.rootModule) {
      return AuthModule.rootModule;
    }

    const authImplPath = configuration().authImpl;
    // OSS 服务始终注册；IMPL 存在时仅叠加 impl-mx 覆盖层（后注册者覆盖同 token）
    const authProviders: Provider[] = [
      ...createDefaultAuthProviders(),
      ...(authImplPath ? resolveAuthProviders(resolveAuthImplPath(authImplPath)) : []),
    ];

    AuthModule.rootModule = {
      module: AuthModule,
      global: true,
      imports: [
        DatabaseModule,
        CommonModule,
        NotificationModule,
        RedisModule,
        RuntimeConfigModule,
        UsersModule,
        BillingModule,
        PassportModule,
        SmsModule,
        WechatModule,
        AuditLogModule,
        PermissionModule,
        DeviceAuthModule,
        IpWhitelistModule,
        IpBlacklistModule,
        SecurityAccessAttemptModule,
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
      controllers: [AuthController, AdminAuthController],
      providers: [
        AuthFacadeService,
        AdminAuthService,
        {
          provide: IAUTH_FACADE,
          useClass: AuthFacadeService,
        },
        TokenBlacklistService,
        InitializationService,
        AccountRateLimitService,
        JwtStrategy,
        RefreshTokenStrategy,
        // Token aliases for private auth implementation DI
        { provide: DB, useExisting: DatabaseService },
        { provide: EMAIL, useExisting: EmailVerificationService },
        { provide: CONFIG, useExisting: RuntimeConfigService },
        { provide: SMS, useExisting: SmsVerificationService },
        { provide: TOKEN_BLACKLIST, useExisting: TokenBlacklistService },
        { provide: MEMBERSHIP_SERVICE, useExisting: MembershipService },
        ...authProviders,
      ],
      exports: [
        AuthFacadeService,
        IAUTH_FACADE,
        TokenBlacklistService,
        SmsModule,
        WechatModule,
      ],
    };
    return AuthModule.rootModule;
  }
}
