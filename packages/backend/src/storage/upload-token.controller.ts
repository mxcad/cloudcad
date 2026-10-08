///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { UploadTokenService } from './upload-token.service';
import { CreateUploadTokenDto } from './dto/create-upload-token.dto';
import { UploadTokenResponseDto } from './dto/upload-token-response.dto';

@ApiTags('Storage - 上传令牌')
@ApiBearerAuth()
@Controller('files')
export class UploadTokenController {
  private readonly logger = new Logger(UploadTokenController.name);

  constructor(private readonly uploadTokenService: UploadTokenService) {}

  @Post('upload-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '签发预签名上传令牌',
    description:
      'standalone 存储模式下，客户端直连 storage-service 上传文件前，先向后端申请预签名 JWT。',
  })
  @ApiResponse({
    status: 200,
    description: '签发成功，返回预签名 JWT',
    type: UploadTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: '未登录或 BACKEND_JWT_SECRET 未配置' })
  @ApiResponse({ status: 400, description: 'path 非法' })
  async createUploadToken(
    @Body() dto: CreateUploadTokenDto,
    // 运行时由全局 JwtStrategyExecutor 守卫恒提供；`?` 仅为单测直调便利（匿名回落）
    @Req() req?: { user?: { id?: string } },
  ): Promise<UploadTokenResponseDto> {
    this.validatePath(dto.path);
    // 全局 JwtStrategyExecutor 守卫已填充 req.user；userId 签进令牌供 storage-service 审计
    const userId = req?.user?.id;
    this.logger.log(
      `[upload-token] 签发上传令牌: path=${dto.path}, userId=${userId ?? 'anonymous'}`,
    );
    return this.uploadTokenService.signUploadToken(dto.path, userId);
  }

  /**
   * 校验目标路径，防止路径穿越（与 storage-service file-handler 的清理规则对齐）
   */
  private validatePath(path: string): void {
    if (
      path.includes('..') ||
      path.includes('~') ||
      path.startsWith('/') ||
      path.startsWith('\\') ||
      /^[a-zA-Z]:/.test(path)
    ) {
      throw new BadRequestException('非法路径');
    }
  }
}
