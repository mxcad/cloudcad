///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 用户侧控制器（提交 / 我的反馈 / 匿名查询 / 我的奖励）
//
// 匿名可用但受限：提交与查询走 @OptionalAuth（登录则注入 req.user），
// 匿名开关/每日限流/内容长度全部由 RuntimeConfig feedback.* 键控制。
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { getClientIp } from '../common/utils/client-ip';
import { FeedbackService } from './feedback.service';
import { FeedbackRateLimitService } from './feedback-rate-limit.service';
import { CreateFeedbackDto } from './dto/feedback.dto';
import {
  FeedbackListResponseDto,
  FeedbackQueryResultDto,
  FeedbackRewardListResponseDto,
  SubmitFeedbackResultDto,
} from './dto/feedback-response.dto';

@ApiTags('用户反馈')
@ApiBearerAuth()
@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly rateLimit: FeedbackRateLimitService
  ) {}

  /** 提交反馈（匿名/登录） */
  @Post()
  @OptionalAuth()
  @ApiOperation({ summary: '提交反馈（匿名可用，受限）' })
  @ApiResponse({ status: 200, description: '提交成功，返回查询码', type: SubmitFeedbackResultDto })
  async create(
    @Body() dto: CreateFeedbackDto,
    @Req() req: Request,
  ): Promise<SubmitFeedbackResultDto> {
    const user = req.user as { id: string } | undefined;
    return this.feedbackService.create(dto, {
      userId: user?.id,
      ip: getClientIp(req),
      userAgent: req.headers?.['user-agent'] as string | undefined,
    });
  }

  /** 我的反馈列表（登录） */
  @Get('mine')
  @ApiOperation({ summary: '我的反馈列表' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20' })
  @ApiResponse({ status: 200, description: '反馈列表', type: FeedbackListResponseDto })
  async listMine(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: Request,
  ): Promise<FeedbackListResponseDto> {
    const userId = (req!.user as { id: string }).id;
    return this.feedbackService.listMine(
      userId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  /** 匿名凭码查询（限流防枚举） */
  @Get('code/:code')
  @OptionalAuth()
  @ApiOperation({ summary: '凭反馈查询码查询状态（匿名查询）' })
  @ApiQuery({ name: 'contact', required: false, type: String, description: '提交时填写的联系方式（反馈留有联系方式的须匹配）' })
  @ApiResponse({ status: 200, description: '反馈状态', type: FeedbackQueryResultDto })
  async queryByCode(
    @Param('code') code: string,
    @Query('contact') contact?: string,
    @Req() req?: Request,
  ): Promise<FeedbackQueryResultDto> {
    await this.rateLimit.assertCodeQueryAllowed(getClientIp(req!));
    return this.feedbackService.queryByCode(code, contact);
  }

  /** 我的奖励记录（登录） */
  @Get('reward/mine')
  @ApiOperation({ summary: '我的奖励记录（含已采纳待发放）' })
  @ApiResponse({ status: 200, description: '奖励记录', type: FeedbackRewardListResponseDto })
  async listMineRewards(@Req() req: Request): Promise<FeedbackRewardListResponseDto> {
    const userId = (req.user as { id: string }).id;
    return this.feedbackService.listMineRewards(userId);
  }
}
