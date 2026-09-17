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

/**
 * 通知中心路由。
 *
 * 公开读接口（/current、/stream）与写接口分开门控：读接口 @Public() 免登录
 * （未登录首屏也能拿到广播公告），写接口显式 @UseGuards(PermissionsGuard)。
 * PermissionsGuard 不是全局 guard，不显式声明就是无人消费的元数据。
 *
 * SSE 认证用一次性 ticket 而不是 ?token=：JWT 落 URL 会进浏览器历史与反代
 * access log。ticket 5 分钟内有效、连接时立即删除，泄露面被限制在「拿到一个
 * 匿名 SSE 连接」，而广播内容本来就是公开接口能拿到的。
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  Header,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { NoticeCenterService } from './notice-center.service';
import { NoticeSseService } from './notice-sse.service';
import {
  CreateNoticeDto,
  NoticeResponseDto,
  NoticeTicketDto,
  UpdateNoticeDto,
} from './dto/notice.dto';

@ApiTags('notice-center')
@ApiBearerAuth()
@Controller('notices')
export class NoticeCenterController {
  constructor(
    private readonly noticeService: NoticeCenterService,
    private readonly sseService: NoticeSseService,
  ) {}

  /**
   * 当前生效中的通知（首屏 + 30s 轮询兜底）。
   * 已按时间窗与受众过滤；@Public() 免登录，未登录时只返回广播通知。
   *
   * Cache-Control 10s < 轮询间隔 30s：浏览器 10 秒内不重复请求，又不会因缓存
   * 让公告的下线延迟超过一个轮询周期。
   */
  @Public()
  @Get('current')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'private, max-age=10')
  @ApiOperation({ summary: '获取当前生效中的通知（公开）' })
  @ApiResponse({
    status: 200,
    description: '生效中的通知列表',
    type: [NoticeResponseDto],
  })
  async getCurrent(@Req() req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    return this.noticeService.getEffective(userId);
  }

  /**
   * 签发一次性 SSE ticket。走全局 JwtStrategyExecutor APP_GUARD（无 @Public），
   * 因此必须是登录用户。
   */
  @Post('stream/ticket')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '签发一次性 SSE 连接票据' })
  @ApiResponse({
    status: 200,
    description: '一次性票据（5 分钟内有效，连接时立即失效）',
    type: NoticeTicketDto,
  })
  async issueTicket(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const ticket = await this.noticeService.issueTicket(userId);
    return { ticket };
  }

  /**
   * SSE 长连接。@Public() + ticket 校验：ticket 是一次性身份凭据，不需要 JWT。
   * 无效 ticket 直接 401 结束响应（不能走异常过滤器，此时响应头已可能发出）。
   *
   * 服务端先订阅 Redis、再下发当前快照，两步之间发布的通知只会重复到达
   * （客户端按 noticeId 去重），不会漏。
   */
  @Public()
  @Get('stream')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '通知 SSE 长连接（一次性 ticket 认证）' })
  @ApiQuery({ name: 'ticket', description: 'POST /notices/stream/ticket 获取' })
  async openStream(
    @Req() req: Request,
    @Res() res: Response,
    @Query('ticket') ticket?: string
  ): Promise<void> {
    const userId = await this.noticeService.redeemTicket(ticket ?? '');
    if (!userId) {
      res.status(HttpStatus.UNAUTHORIZED).end();
      return;
    }

    const snapshot = await this.noticeService.getEffective(userId);
    this.sseService.open(req, res, userId, snapshot);
  }

  /** 管理后台全量列表（含草稿与已下线） */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiOperation({ summary: '列出全部通知（管理后台）' })
  @ApiResponse({ status: 200, description: '全部通知', type: [NoticeResponseDto] })
  async listAll() {
    return this.noticeService.listAll();
  }

  /**
   * 发布通知。publishNow=false 保存为草稿；startAt 在未来的不立即推送，
   * 由定时任务到点处理。autoExpire=true 必须提供 endAt。
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiOperation({ summary: '发布通知' })
  @ApiResponse({ status: 201, description: '已创建', type: NoticeResponseDto })
  async create(
    @Body() dto: CreateNoticeDto,
    @Req() req: Request
  ): Promise<NoticeResponseDto> {
    const userId = (req.user as { id: string }).id;
    return this.noticeService.create(dto, userId);
  }

  /** 部分更新文案与级别；v1 禁止改 startAt/endAt/userId（见 dto 文件头注释） */
  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiOperation({ summary: '更新通知文案（不改时间窗）' })
  @ApiResponse({ status: 200, description: '已更新', type: NoticeResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto
  ): Promise<NoticeResponseDto> {
    return this.noticeService.update(id, dto);
  }

  /** 下线：置空 publishedAt + 记 retractedAt，并广播 retract 事件 */
  @Post(':id/retract')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiOperation({ summary: '下线通知' })
  @ApiResponse({ status: 200, description: '已下线', type: NoticeResponseDto })
  async retract(@Param('id') id: string): Promise<NoticeResponseDto> {
    return this.noticeService.retract(id);
  }
}
