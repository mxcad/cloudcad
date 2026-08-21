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

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeviceAuthService } from './device-auth.service';
import { DeviceCodeRequestDto, DeviceCodeResponseDto } from './dto/device-code.dto';
import {
  DeviceAuthorizeRequestDto,
  DeviceAuthorizeResponseDto,
} from './dto/device-authorize.dto';
import { DeviceTokenRequestDto, DeviceTokenResponseDto } from './dto/device-token.dto';
import { Public } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@ApiTags('设备授权')
@Controller('device')
export class DeviceAuthController {
  constructor(private readonly deviceAuthService: DeviceAuthService) {}

  @Post('code')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '申请设备码（EXE 客户端调用）' })
  @ApiResponse({
    status: 200,
    description: '设备码生成成功',
    type: DeviceCodeResponseDto,
  })
  @ApiResponse({ status: 400, description: '无效的 client_id' })
  async requestDeviceCode(
    @Body() dto: DeviceCodeRequestDto,
  ): Promise<DeviceCodeResponseDto> {
    return this.deviceAuthService.requestDeviceCode(dto.client_id);
  }

  @Post('authorize')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户确认授权（浏览器页面调用）' })
  @ApiResponse({
    status: 200,
    description: '授权成功',
    type: DeviceAuthorizeResponseDto,
  })
  @ApiResponse({ status: 404, description: '无效或已过期的 user_code' })
  async authorizeDevice(
    @Body() dto: DeviceAuthorizeRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeviceAuthorizeResponseDto> {
    return this.deviceAuthService.authorizeDevice(dto.user_code, req.user.id);
  }

  @Post('oauth/token')
  @Public()
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '轮询获取 Token（EXE 客户端调用）' })
  @ApiResponse({
    status: 200,
    description: 'Token 获取成功',
    type: DeviceTokenResponseDto,
  })
  @ApiResponse({ status: 400, description: 'authorization_pending / expired_token / access_denied' })
  async pollForToken(
    @Body() dto: DeviceTokenRequestDto,
  ): Promise<DeviceTokenResponseDto> {
    return this.deviceAuthService.pollForToken(dto.device_code, dto.client_id);
  }
}
