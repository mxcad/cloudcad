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
  // 轮询节奏由 DEVICE_CODE_POLL_INTERVAL 定义（客户端按 interval 定时发请求），
  // 这里的 limit 只是兜底保护、不是节奏上限，只是不能低于
  // ttl / (DEVICE_CODE_POLL_INTERVAL * 1000)，否则客户端按建议间隔轮询自己就会
  // 撞 429。配额按请求计数、不看响应码：authorization_pending 的 400 同样占额度，
  // 用户还没点确认时配额已在消耗。
  // 当前 300/60s = 5 req/s（允许最快 200ms 一次），对 300ms 节奏留 50% 余量，
  // 所以它永远不会成为实际生效的上限。
  // 单请求代价仅为一次 Redis EVAL（成功时 DEL key，令牌不可重复取走），
  // 放宽上限不改变安全边界。
  @Throttle({ default: { limit: 300, ttl: 60000 } })
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
