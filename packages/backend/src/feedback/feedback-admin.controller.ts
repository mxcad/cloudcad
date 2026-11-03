///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 管理侧控制器（列表 / 详情 / 状态 / 采纳 / 奖励发放）
//
// 三类权限（新增）：
//   SYSTEM_FEEDBACK_READ    查看反馈列表/详情
//   SYSTEM_FEEDBACK_MANAGE  改状态、采纳/驳回、打标
//   SYSTEM_FEEDBACK_REWARD  发放/撤销奖励（客服可用）
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { FeedbackService } from './feedback.service';
import { FeedbackRewardService } from './feedback-reward.service';
import { FeedbackStatus } from './feedback.enums';
import {
  AdoptFeedbackDto,
  IssueRewardDto,
  RevokeRewardDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';
import {
  FeedbackListResponseDto,
  FeedbackResponseDto,
  FeedbackRewardListResponseDto,
  FeedbackRewardResponseDto,
} from './dto/feedback-response.dto';

@ApiTags('用户反馈管理')
@ApiBearerAuth()
@Controller('admin/feedback')
@UseGuards(RolesGuard, PermissionsGuard)
export class FeedbackAdminController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly rewardService: FeedbackRewardService
  ) {}

  /** 反馈列表（筛选 + 分页） */
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_READ])
  @ApiOperation({ summary: '反馈列表（筛选/分页）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20' })
  @ApiQuery({ name: 'type', required: false, enum: ['BUG', 'SUGGESTION', 'COMPLAINT', 'OTHER'], description: '按类型筛选' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'REVIEWING', 'ADOPTED', 'REJECTED', 'CLOSED'], description: '按状态筛选' })
  @ApiQuery({ name: 'rewardStatus', required: false, enum: ['NONE', 'PENDING', 'ISSUED', 'REVOKED'], description: '按奖励状态筛选' })
  @ApiQuery({ name: 'source', required: false, enum: ['PC', 'MOBILE'], description: '按来源筛选' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '按标题/内容/查询码搜索' })
  @ApiQuery({ name: 'fromDate', required: false, type: String, description: '起始日期（ISO）' })
  @ApiQuery({ name: 'toDate', required: false, type: String, description: '结束日期（ISO）' })
  @ApiResponse({ status: 200, description: '反馈列表', type: FeedbackListResponseDto })
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('rewardStatus') rewardStatus?: string,
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Req() req?: Request,
  ): Promise<FeedbackListResponseDto> {
    const userId = (req?.user as { id: string } | undefined)?.id;
    return this.feedbackService.adminList(
      {
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
        type,
        status,
        rewardStatus,
        source,
        search,
        fromDate,
        toDate,
      },
      userId
    );
  }

  /** 奖励记录列表（待发放/全部）—— 必须先于 :id 声明（路由顺序） */
  @Get('rewards')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_REWARD])
  @ApiOperation({ summary: '奖励记录列表（默认全部，可筛 status/分类，可按查询码/标题/账号搜索）' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'ISSUED', 'REVOKED'], description: '按奖励状态筛选' })
  @ApiQuery({ name: 'type', required: false, enum: ['BUG', 'SUGGESTION', 'COMPLAINT', 'OTHER'], description: '按反馈类型（分类）筛选' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '按查询码/反馈标题/绑定账号搜索' })
  @ApiResponse({ status: 200, description: '奖励记录', type: FeedbackRewardListResponseDto })
  async listRewards(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ): Promise<FeedbackRewardListResponseDto> {
    return this.feedbackService.listRewards({ status, type, search });
  }

  /** 反馈详情 */
  @Get(':id')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_READ])
  @ApiOperation({ summary: '反馈详情' })
  @ApiResponse({ status: 200, description: '反馈详情', type: FeedbackResponseDto })
  async detail(
    @Param('id') id: string,
    @Req() req?: Request,
  ): Promise<FeedbackResponseDto> {
    const userId = (req?.user as { id: string } | undefined)?.id;
    return this.feedbackService.adminDetail(id, userId);
  }

  /** 改状态（REVIEWING/REJECTED/CLOSED；采纳走 adopt） */
  @Patch(':id/status')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_MANAGE])
  @ApiOperation({ summary: '改反馈状态（驳回/转处理中/关闭）' })
  @ApiResponse({ status: 200, description: '更新后反馈', type: FeedbackResponseDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto,
    @Req() req: Request,
  ): Promise<FeedbackResponseDto> {
    const operatorId = (req.user as { id: string }).id;
    return this.feedbackService.adminUpdateStatus(
      id,
      dto.status as FeedbackStatus,
      dto.reason,
      operatorId,
    );
  }

  /** 采纳 + 创建待发放奖励 */
  @Post(':id/adopt')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_MANAGE])
  @ApiOperation({ summary: '采纳反馈并创建奖励（待发放）' })
  @ApiResponse({ status: 200, description: '奖励记录（PENDING）', type: FeedbackRewardResponseDto })
  async adopt(
    @Param('id') id: string,
    @Body() dto: AdoptFeedbackDto,
    @Req() req: Request,
  ): Promise<FeedbackRewardResponseDto> {
    const operatorId = (req.user as { id: string }).id;
    return this.rewardService.adopt(id, dto, operatorId);
  }

  /** 发放奖励（绑定账号 + 写 UserMembership） */
  @Post('rewards/:id/issue')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_REWARD])
  @ApiOperation({ summary: '发放奖励（客服核实 + 绑定账号 + 写会员）' })
  @ApiResponse({ status: 200, description: '发放后奖励', type: FeedbackRewardResponseDto })
  async issue(
    @Param('id') id: string,
    @Body() dto: IssueRewardDto,
    @Req() req: Request,
  ): Promise<FeedbackRewardResponseDto> {
    const operatorId = (req.user as { id: string }).id;
    return this.rewardService.issue(id, dto, operatorId);
  }

  /** 撤销奖励 */
  @Post('rewards/:id/revoke')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_REWARD])
  @ApiOperation({ summary: '撤销奖励（误采纳/作弊；已发放的会员回收由人工处理）' })
  @ApiResponse({ status: 200, description: '撤销后奖励', type: FeedbackRewardResponseDto })
  async revoke(
    @Param('id') id: string,
    @Body() dto: RevokeRewardDto,
    @Req() req: Request,
  ): Promise<FeedbackRewardResponseDto> {
    const operatorId = (req.user as { id: string }).id;
    return this.rewardService.revoke(id, dto, operatorId);
  }
}
