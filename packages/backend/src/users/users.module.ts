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

import { Module } from '@nestjs/common';
import { CONFIG } from '@cloudcad/contracts';
import { CommonModule } from '../common/common.module';
import { NotificationModule } from '../notification/notification.module';
import { UserCleanupModule } from '../user-cleanup/user-cleanup.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { SmsModule } from '../auth/services/sms/sms.module';
import { WechatModule } from '../auth/services/wechat/wechat.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageQuotaModule } from '../file-system/storage-quota/storage-quota.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserCrudService } from './services/user-crud.service';
import { UserStatusService } from './services/user-status.service';
import { UserPasswordService } from './services/user-password.service';
import { USER_SERVICE } from '../common/interfaces/user-service.interface';
import { PASSWORD_HASHER } from './interfaces/password-hasher.interface';
import { BcryptPasswordHasher } from './services/password-hasher.service';
import {
  VERIFICATION_STRATEGIES,
  IAccountVerificationStrategy,
} from './interfaces/account-verification-strategy.interface';
import { PasswordVerificationStrategy } from './strategies/password-verification.strategy';
import { PhoneCodeVerificationStrategy } from './strategies/phone-code-verification.strategy';
import { EmailCodeVerificationStrategy } from './strategies/email-code-verification.strategy';
import { WechatVerificationStrategy } from './strategies/wechat-verification.strategy';

@Module({
  imports: [
    CommonModule,
    NotificationModule,
    UserCleanupModule,
    RuntimeConfigModule,
    PermissionModule,
    SmsModule,
    WechatModule,
    StorageQuotaModule,
    AuditLogModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserCrudService,
    UserStatusService,
    UserPasswordService,
    // UserStatusService 等注入 CONFIG token（IRuntimeConfigService），与 AuthModule 注册方式保持一致
    { provide: CONFIG, useExisting: RuntimeConfigService },
    { provide: USER_SERVICE, useExisting: UsersService },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    PasswordVerificationStrategy,
    PhoneCodeVerificationStrategy,
    EmailCodeVerificationStrategy,
    WechatVerificationStrategy,
    {
      provide: VERIFICATION_STRATEGIES,
      useFactory: (
        password: PasswordVerificationStrategy,
        phoneCode: PhoneCodeVerificationStrategy,
        emailCode: EmailCodeVerificationStrategy,
        wechat: WechatVerificationStrategy
      ): IAccountVerificationStrategy[] => [password, phoneCode, emailCode, wechat],
      inject: [
        PasswordVerificationStrategy,
        PhoneCodeVerificationStrategy,
        EmailCodeVerificationStrategy,
        WechatVerificationStrategy,
      ],
    },
  ],
  exports: [UsersService, USER_SERVICE, PASSWORD_HASHER, VERIFICATION_STRATEGIES],
})
export class UsersModule {}
