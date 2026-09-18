import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Res,
  Header,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiQuery,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { Response, Request as ExpressRequest } from 'express';
import { UnifiedConversionService } from './conversion-task.service';
import { ConversionTaskSseService } from './conversion-task.sse.service';
import type { MxCadRequest } from '../types/request.types';
import {
  SubmitConversionTaskDto,
  SubmitConversionTaskResponseDto,
  ConversionTaskListResponseDto,
  ConversionHistoryResponseDto,
  RetryConversionTaskResponseDto,
  ConversionQuotaDto,
} from './dto/conversion-task.dto';

/**
 * 统一转换任务端点（#468 提交 / #469 状态查询）
 *
 * 面板「云端」数据源：登录用户打开项目文件 → 建 node（nodeId）→ 转换记录到服务器。
 * 前端队列面板 = 云端（本端点）+ 本地（localStorage 无 nodeId 关联的转换）结合。
 */
@ApiTags('ConversionTask')
@Controller('mxcad/conversion')
export class ConversionTaskController {
  private readonly logger = new Logger(ConversionTaskController.name);

  constructor(
    private readonly unifiedConversionService: UnifiedConversionService,
    private readonly conversionTaskSseService: ConversionTaskSseService
  ) {}

  @Post('tasks')
  @ApiOperation({
    summary: '统一提交转换任务（open + nodeId / download + nodeId + format）',
  })
  @ApiResponse({ type: SubmitConversionTaskResponseDto })
  async submitTask(
    @Body() dto: SubmitConversionTaskDto,
    @Req() request: MxCadRequest
  ): Promise<SubmitConversionTaskResponseDto> {
    const result = await this.unifiedConversionService.submitTask(
      dto,
      request.user?.id
    );
    this.logger.log(
      `Conversion task submitted: ${result.taskId} (node ${result.nodeId}, type ${dto.type ?? 'open'})`
    );
    return result;
  }

  @Get('tasks')
  @ApiOperation({ summary: '统一查询当前用户的转换任务（云端数据源）' })
  @ApiResponse({ type: ConversionTaskListResponseDto })
  async listTasks(
    @Req() request: MxCadRequest
  ): Promise<ConversionTaskListResponseDto> {
    const userId = request.user?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return this.unifiedConversionService.listTasks(userId);
  }

  /**
   * 转换历史分页查询（#476）：已完成（COMPLETED）任务，供面板「转换·历史」区块滚动加载。
   * 与 tasks（进行中/失败，实时轮询）互补。limit/offset 走 query（可选，配 @ApiQuery）。
   */
  @Get('history')
  @ApiOperation({ summary: '分页查询当前用户已完成的转换历史（COMPLETED）' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页数量（默认 20，最大 50）',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: '偏移量（分页游标，默认 0）',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: '按文件名模糊搜索（空=不过滤）',
  })
  @ApiResponse({ type: ConversionHistoryResponseDto })
  async listHistory(
    @Req() request: MxCadRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string
  ): Promise<ConversionHistoryResponseDto> {
    const userId = request.user?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return this.unifiedConversionService.listHistory(
      userId,
      limit !== undefined ? Number(limit) : undefined,
      offset !== undefined ? Number(offset) : undefined,
      search
    );
  }

  /**
   * S4-3：转换任务状态实时推送（SSE，per-user 长连接）。
   *
   * 前端 EventSource 订阅本端点，任务终态变更（COMPLETED/FAILED）时后端 emit 事件，
   * 前端收到即 refreshCloud 刷新（替代 5s 轮询为主实时通道，轮询保留为兜底）。
   * token 走 query（EventSource 无法带 Authorization header，与 batch-download SSE 一致）。
   */
  // SSE 端点不进 Swagger/SDK（ADR-0034，EventSource 订阅无 SDK 形态），
  // @ApiExcludeEndpoint 把豁免下沉为可执行门禁，重跑 generate:api-types 不收本端点。
  @Get('tasks/stream')
  @ApiExcludeEndpoint()
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: '转换任务状态实时推送（SSE，per-user 长连接）' })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'JWT token for SSE auth',
  })
  async streamTasks(
    @Req() request: ExpressRequest,
    @Res() res: Response
  ): Promise<void> {
    const userId = this.conversionTaskSseService.resolveUserId(request, res);
    if (!userId) return;
    await this.conversionTaskSseService.streamTasks(userId, res, request);
  }

  @Post('tasks/:taskId/cancel')
  @ApiOperation({ summary: '取消转换任务（#463，仅独立转换服务模式支持）' })
  @ApiParam({ name: 'taskId', description: '转换任务 ID' })
  async cancelTask(
    @Param('taskId') taskId: string
  ): Promise<{ ok: boolean; status?: string; reason?: string }> {
    const result = await this.unifiedConversionService.cancelTask(taskId);
    this.logger.log(
      `Conversion task ${taskId} cancel: ok=${result.ok} ${result.reason ?? ''}`
    );
    return result;
  }

  @Post('tasks/:taskId/retry')
  @ApiOperation({
    summary: '重试失败的转换任务（原地重新排队，不重新上传、不占配额）',
  })
  @ApiParam({ name: 'taskId', description: '要重试的转换任务 ID' })
  async retryTask(
    @Param('taskId') taskId: string,
    @Req() request: MxCadRequest
  ): Promise<RetryConversionTaskResponseDto> {
    const userId = request.user?.id;
    if (!userId)
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    const result = await this.unifiedConversionService.retryTask(
      taskId,
      userId
    );
    this.logger.log(
      `Conversion task ${taskId} retry by user ${userId}: new=${result.taskId}`
    );
    return result;
  }

  /**
   * 当前调用者的转换配额（ADR-0043，只读不占位）：@Public 端点，
   * 游客按 IP 窗口、登录用户按 userId 窗口（scope 区分）。
   */
  @Public()
  @Get('quota')
  @ApiOperation({ summary: '当前调用者的转换配额（本窗口已用/上限）' })
  @ApiResponse({ type: ConversionQuotaDto })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: '显式指定用户窗口；省略时按已登录身份或客户端 IP 窗口',
  })
  async getQuota(
    @Req() request: ExpressRequest,
    @Query('userId') userId?: string
  ): Promise<ConversionQuotaDto> {
    return this.unifiedConversionService.getQuota(userId, request.ip);
  }
}
