import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CooperateService } from './cooperate.service';
import {
  CreateShareDto,
  CreateShareResponseDto,
  ResolveShareResponseDto,
  ResolveShareNodeResponseDto,
} from './dto';

@ApiTags('协同分享')
@Controller('collaboration')
export class CooperateController {
  private readonly logger = new Logger(CooperateController.name);

  constructor(private readonly cooperateService: CooperateService) {}

  @Post('share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建协同分享链接' })
  @ApiResponse({
    status: 201,
    description: '分享链接创建成功',
    type: CreateShareResponseDto,
  })
  @ApiResponse({ status: 400, description: '参数错误' })
  async createShare(@Body() dto: CreateShareDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const result = await this.cooperateService.createShare(dto, userId);
    return result;
  }

  @Get('share/:token')
  @ApiOperation({ summary: '解析分享链接' })
  @ApiResponse({
    status: 200,
    description: '解析成功',
    type: ResolveShareResponseDto,
  })
  @ApiResponse({ status: 404, description: '链接不存在或已失效' })
  async resolveShare(@Param('token') token: string) {
    const result = await this.cooperateService.resolveShare(token);
    return result;
  }

  @Get('share/:token/node')
  @ApiOperation({ summary: '通过分享 token 获取文件信息' })
  @ApiResponse({
    status: 200,
    description: '文件信息',
    type: ResolveShareNodeResponseDto,
  })
  @ApiResponse({ status: 404, description: '链接不存在或文件不存在' })
  async resolveShareNode(@Param('token') token: string) {
    const result = await this.cooperateService.resolveShareNode(token);
    return result;
  }

  @Delete('share/:token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销分享链接' })
  @ApiResponse({ status: 200, description: '撤销成功' })
  @ApiResponse({ status: 403, description: '无权操作' })
  @ApiResponse({ status: 404, description: '链接不存在' })
  async revokeShare(@Param('token') token: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    await this.cooperateService.revokeShare(token, userId);
    return { message: '分享已撤销' };
  }
}
