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

  @Get(':taskId/items/:itemIndex/download')
  @ApiOperation({ summary: '下载 individual 任务的单个产物文件' })
  async downloadItem(
    @Param('taskId') taskId: string,
    @Param('itemIndex') itemIndex: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const userId = this.getUserId(req);
    const index = Number.parseInt(itemIndex, 10);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: 'Invalid item index' });
    }
    const item = await this.batchDownloadService.getItemDownload(taskId, userId, index);
    // 失败项 / 已清理产物 → 404，前端据此跳过继续下载其余文件
    if (!item) {
      return res.status(404).json({ message: 'Item not available' });
    }
    const stat = fs.statSync(item.fullPath);
    const encodedFilename = encodeURIComponent(item.name);
    const fallbackFilename = item.name.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(item.fullPath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ message: 'File read failed' });
    });
    // 转换临时产物下载完成后即清理；源文件（temp=false）绝不删除
    stream.on('close', () => {
      if (!item.temp) return;
      fs.promises.unlink(item.fullPath).catch(() => undefined);
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
