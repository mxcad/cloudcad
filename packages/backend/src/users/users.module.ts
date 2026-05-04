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

import { Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CommonModule } from '../common/common.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { SmsModule } from '../auth/services/sms/sms.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
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
    RuntimeConfigModule,
    SmsModule,
    forwardRef(() => AuthModule),
    EventEmitterModule.forRoot(),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
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
  exports: [UsersService, USER_SERVICE],
})
export class UsersModule {}
