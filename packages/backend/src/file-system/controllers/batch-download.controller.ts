import {
  Controller,
  Post,
  Body,
  Request,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CrossNodeDownloadService } from '../file-download/cross-node-download.service';

class BatchDownloadBody {
  nodeIds: string[];
}

@ApiTags('Batch Download')
@Controller('file-system')
@UseGuards(RequireProjectPermissionGuard, PermissionsGuard)
export class BatchDownloadController {
  private readonly logger = new Logger(BatchDownloadController.name);

  constructor(
    private readonly crossNodeDownloadService: CrossNodeDownloadService
  ) {}

  @Post('download/batch-zip')
  @RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)
  @ApiOperation({ summary: '跨节点批量下载文件为 ZIP（流式）' })
  async downloadBatchZip(
    @Body() body: BatchDownloadBody,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId = (req.user as { id: string }).id;
    const { stream, filename } =
      await this.crossNodeDownloadService.createBatchZip(body.nodeIds, userId);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    stream.pipe(res);
  }
}
