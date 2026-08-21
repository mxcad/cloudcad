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
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { DeviceAuthController } from './device-auth.controller';
import { DeviceAuthService } from './device-auth.service';
import type { AppConfig } from '../../config/app.config';

@Module({
  imports: [
    RuntimeConfigModule,
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
  controllers: [DeviceAuthController],
  providers: [DeviceAuthService],
  exports: [DeviceAuthService],
})
export class DeviceAuthModule {}
