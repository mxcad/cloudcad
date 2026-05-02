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
import { CommonModule } from '../common/common.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { SmsModule } from '../auth/services/sms/sms.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { USER_SERVICE } from '../common/interfaces/user-service.interface';

@Module({
  imports: [
    CommonModule,
    RuntimeConfigModule,
    SmsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: USER_SERVICE, useExisting: UsersService },
  ],
  exports: [UsersService, USER_SERVICE],
})
export class UsersModule {}
