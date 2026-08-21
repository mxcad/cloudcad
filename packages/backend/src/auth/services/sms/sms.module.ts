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
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../../../redis/redis.module';
import { RuntimeConfigModule } from '../../../runtime-config/runtime-config.module';
import { SmsVerificationService } from './sms-verification.service';
import { SMS_VERIFICATION_SERVICE } from '../../../common/interfaces/verification.interface';

@Module({
  imports: [ConfigModule, RedisModule, RuntimeConfigModule],
  providers: [
    SmsVerificationService,
    { provide: SMS_VERIFICATION_SERVICE, useExisting: SmsVerificationService },
  ],
  exports: [SmsVerificationService, SMS_VERIFICATION_SERVICE],
})
export class SmsModule {}
