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

import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import type { AuthResponseDto } from '../../dto/auth.dto';

/**
 * 创建会话转移凭证 — 响应
 *
 * EXE 侧拿到 transferUrl 后直接 openExternal，无需自行拼装 URL。
 */
export class SessionTransferCreateResponseDto {
  @ApiProperty({
    description: '一次性转移凭证（60 秒内有效，消费即失效）',
    example: 'GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9e',
  })
  token: string;

  @ApiProperty({ description: '凭证过期时间（秒）', example: 60 })
  expiresIn: number;

  @ApiProperty({
    description:
      '浏览器跳转地址（EXE 直接 openExternal，无需自行拼装；含一次性 token 与可选 redirect 路径）',
    example: 'https://app.mxdraw.com/session-transfer?token=***&redirect=/member-center',
  })
  transferUrl: string;

  constructor(partial: Partial<SessionTransferCreateResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * 消费会话转移凭证 — 请求
 *
 * token 格式校验（base64url，长度 43）：非法格式与「不存在/已过期」统一返回 401，
 * 不向调用方区分「格式错误」与「凭证无效」，避免成为探测有效凭证的 oracle。
 */
export class SessionTransferConsumeRequestDto {
  @ApiProperty({
    description: '一次性转移凭证',
    example: 'GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9e',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'token 格式无效',
  })
  token: string;
}

/**
 * 消费会话转移凭证 — 响应
 *
 * 复用现有 AuthResponseDto（accessToken/refreshToken/user），
 * 前端登录态写入逻辑零适配：清旧三键后写入新三键即可。
 */
export type SessionTransferConsumeResponseDto = AuthResponseDto;
