import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  Res,
  Logger,
  HttpCode,
  Header,
  Query,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Response, Request as ExpressRequest } from 'express';
import { BatchDownloadService } from './batch-download.service';
import {
  CreateBatchDownloadDto,
  CreateSingleFormatDownloadDto,
  BatchDownloadProgressDto,
  BatchDownloadTaskDto,
  BatchDownloadTaskPageDto,
  MergeBatchDownloadDto,
} from './dto/create-batch-download.dto';
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
    private readonly runtimeConfigService: RuntimeConfigService
  ) {}

  @Post()
  @ApiOperation({ summary: '创建批量下载任务' })
  async createTask(
    @Body() dto: CreateBatchDownloadDto,
    @Request() req: ExpressRequest
  ) {
    await this.assertEnabled();
    const userId = this.getUserId(req);
    return this.batchDownloadService.createTask(userId, dto);
  }

  @Post('single-file')
  @ApiOperation({
    summary: '创建单文件格式转换下载任务（不受批量下载开关门控）',
  })
  async createSingleFileTask(
    @Body() dto: CreateSingleFormatDownloadDto,
    @Request() req: ExpressRequest
  ) {
    const userId = this.getUserId(req);
    // 单文件格式下载是「单个文件下载」，与批量下载语义分离：batchDownloadEnabled
    // 只保护批量/多文件下载（防目录爬取、IO 打爆），单个文件下载不受其门控。
    // 后端内核复用批量异步任务表（mode='individual' + 单项），仅 HTTP 路由分离。
    // VIP 导出门控由 service 的 hasExportFormat 分支保留（付费功能，另一条约束）。
    return this.batchDownloadService.createTask(userId, {
      fileList: [
        {
          // nodeId（已保存节点）与 fileHash（内存导出上传的临时文件）二选一
          nodeId: dto.nodeId,
          fileHash: dto.fileHash,
          fileName: dto.fileName,
          formats: [dto.format],
          dwgVersion: dto.dwgVersion,
          width: dto.width,
          height: dto.height,
          colorPolicy: dto.colorPolicy,
        },
      ],
      projectId: dto.projectId,
      mode: 'individual',
      libraryType: dto.libraryType,
    });
  }

  @Get(':taskId/progress')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: '获取任务进度（SSE 或 JSON）' })
  @ApiResponse({ type: BatchDownloadProgressDto })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'JWT token for SSE auth',
  })
  async getProgress(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const accept = req.headers.accept || '';
    if (accept.includes('text/event-stream')) {
      return this.batchDownloadService.getProgressForSse(taskId, res, req);
    }
    const userId = this.getUserId(req);
    const progress = await this.batchDownloadService.getProgress(
      taskId,
      userId
    );
    return res.json(progress);
  }

  @Get(':taskId/download')
  @ApiOperation({ summary: '下载打包的 ZIP 文件' })
  async downloadZip(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId = this.getUserId(req);
    const filePath = await this.batchDownloadService.getDownloadPath(
      taskId,
      userId
    );
    const filename = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const encodedFilename = encodeURIComponent(filename);
    const fallbackFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent)
        res.status(500).json({ message: 'File read failed' });
    });
  }

  @Get(':taskId/items/:itemIndex/download')
  @ApiOperation({ summary: '下载 individual 任务的单个产物文件' })
  async downloadItem(
    @Param('taskId') taskId: string,
    @Param('itemIndex') itemIndex: string,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId = this.getUserId(req);
    const index = Number.parseInt(itemIndex, 10);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: 'Invalid item index' });
    }
    const item = await this.batchDownloadService.getItemDownload(
      taskId,
      userId,
      index
    );
    // 失败项 / 已清理产物 → 404，前端据此跳过继续下载其余文件
    if (!item) {
      return res.status(404).json({ message: 'Item not available' });
    }
    const stat = fs.statSync(item.fullPath);
    const encodedFilename = encodeURIComponent(item.name);
    const fallbackFilename = item.name.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(item.fullPath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent)
        res.status(500).json({ message: 'File read failed' });
    });
    // 转换临时产物下载完成后即清理；源文件（temp=false）绝不删除
    stream.on('close', () => {
      if (!item.temp) return;
      fs.promises.unlink(item.fullPath).catch(() => undefined);
    });
  }

  @Post('merge-zip')
  @ApiOperation({ summary: '合并多个 COMPLETED 任务为单个 ZIP 下载' })
  async mergeZip(
    @Body() dto: MergeBatchDownloadDto,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId = this.getUserId(req);
    const zipPath = await this.batchDownloadService.mergeZip(
      dto.taskIds,
      userId
    );
    const filename = path.basename(zipPath);
    const stat = fs.statSync(zipPath);
    const encodedFilename = encodeURIComponent(filename);
    const fallbackFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(zipPath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent)
        res.status(500).json({ message: 'File read failed' });
    });
    // 合并产物为临时按需产物：下载完成后即清理（区别于任务 zip 持久化可重复下载）
    stream.on('close', () => {
      fs.promises.unlink(zipPath).catch(() => undefined);
    });
  }

  @Post(':taskId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '取消批量下载任务' })
  async cancelTask(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest
  ) {
    const userId = this.getUserId(req);
    await this.batchDownloadService.cancelTask(taskId, userId);
    return { message: 'Task cancelled' };
  }

  @Post(':taskId/retry')
  @HttpCode(200)
  @ApiOperation({ summary: '重试失败的批量下载任务（仅 FAILED 任务）' })
  async retryTask(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest
  ) {
    const userId = this.getUserId(req);
    const result = await this.batchDownloadService.retryTask(taskId, userId);
    return { ...result, message: 'Task retry started' };
  }

  @Post(':taskId/retry-failed')
  @HttpCode(200)
  @ApiOperation({
    summary: '重试 FAILED 任务中失败的文件项（创建新任务，成功项不重跑）',
  })
  async retryFailedItems(
    @Param('taskId') taskId: string,
    @Request() req: ExpressRequest
  ) {
    const userId = this.getUserId(req);
    const result = await this.batchDownloadService.retryFailedItems(
      taskId,
      userId
    );
    return { ...result, message: 'Failed items retry started' };
  }

  @Get('tasks')
  @ApiOperation({ summary: '获取用户的批量下载任务列表（分页）' })
  @ApiResponse({ type: BatchDownloadTaskPageDto })
  @ApiQuery({ name: 'page', required: false, description: '页码（从 1 开始）' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: '每页条数（默认 20，最大 50）',
  })
  async getUserTasks(
    @Request() req: ExpressRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    const userId = this.getUserId(req);
    return this.batchDownloadService.getUserTasks(userId, {
      page: page ? Number.parseInt(page, 10) : undefined,
      pageSize: pageSize ? Number.parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('folder/:nodeId/files')
  @ApiOperation({ summary: '递归获取文件夹下所有文件节点' })
  async getFolderFiles(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest
  ) {
    const userId = this.getUserId(req);
    return this.batchDownloadService.getFolderFilesRecursive(nodeId, userId);
  }

  private getUserId(req: ExpressRequest): string {
    const userId = (req.user as { id?: string })?.id;
    if (!userId) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth_extra.user_not_logged_in') ??
          'Not authenticated'
      );
    }
    return userId;
  }

  private async assertEnabled(): Promise<void> {
    const enabled = await this.runtimeConfigService.getValue<boolean>(
      'batchDownloadEnabled',
      false
    );
    if (!enabled) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.batch_download.disabled') ??
          '批量下载功能未开启'
      );
    }
  }
}
