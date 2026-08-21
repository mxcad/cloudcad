import {
  Controller, Post, Get, Param, Body, Request, Res, Logger,
  HttpCode, Header, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Response, Request as ExpressRequest } from 'express';
import { BatchDownloadService } from './batch-download.service';
import { CreateBatchDownloadDto } from './dto/create-batch-download.dto';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { I18nContext } from 'nestjs-i18n';
import * as fs from 'fs';
import * as path from 'path';

@Controller('file-system/batch-download')
@ApiTags('文件系统 - 批量下载')
@ApiBearerAuth()
export class BatchDownloadController {
  private readonly logger = new Logger(BatchDownloadController.name);

  constructor(
    private readonly batchDownloadService: BatchDownloadService,
    private readonly runtimeConfigService: RuntimeConfigService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建批量下载任务' })
  async createTask(
    @Body() dto: CreateBatchDownloadDto,
    @Request() req: ExpressRequest,
  ) {
    await this.assertEnabled();
    const userId = this.getUserId(req);
    return this.batchDownloadService.createTask(userId, dto);
  }

  @Get(':taskId/progress')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: '获取任务进度（SSE 或 JSON）' })
  @ApiQuery({ name: 'token', required: false, description: 'JWT token for SSE auth' })
  async getProgress(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const accept = req.headers.accept || '';
    if (accept.includes('text/event-stream')) {
      return this.batchDownloadService.getProgressForSse(taskId, res, req);
    }
    const userId = this.getUserId(req);
    const progress = await this.batchDownloadService.getProgress(taskId, userId);
    return res.json(progress);
  }

  @Get(':taskId/download')
  @ApiOperation({ summary: '下载打包的 ZIP 文件' })
  async downloadZip(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const userId = this.getUserId(req);
    const filePath = await this.batchDownloadService.getDownloadPath(taskId, userId);
    const filename = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const encodedFilename = encodeURIComponent(filename);
    const fallbackFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ message: 'File read failed' });
    });
  }

  @Post(':taskId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '取消批量下载任务' })
  async cancelTask(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    await this.batchDownloadService.cancelTask(taskId, userId);
    return { message: 'Task cancelled' };
  }

  @Get('tasks')
  @ApiOperation({ summary: '获取用户的批量下载任务列表' })
  async getUserTasks(@Request() req: ExpressRequest) {
    const userId = this.getUserId(req);
    return this.batchDownloadService.getUserTasks(userId);
  }

  @Get('folder/:nodeId/files')
  @ApiOperation({ summary: '递归获取文件夹下所有文件节点' })
  async getFolderFiles(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
  ) {
    const userId = this.getUserId(req);
    return this.batchDownloadService.getFolderFilesRecursive(nodeId, userId);
  }

  private getUserId(req: ExpressRequest): string {
    const userId = (req.user as { id?: string })?.id;
    if (!userId) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth_extra.user_not_logged_in') ?? 'Not authenticated');
    }
    return userId;
  }

  private async assertEnabled(): Promise<void> {
    const enabled = await this.runtimeConfigService.getValue<boolean>(
      'batchDownloadEnabled',
      false,
    );
    if (!enabled) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.batch_download.disabled') ?? '批量下载功能未开启',
      );
    }
  }
}
