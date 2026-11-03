///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 附件资源管理控制器（管理员）
//
// 权限：SYSTEM_FEEDBACK_READ 列表；SYSTEM_FEEDBACK_MANAGE 删除。
// 路由独立于 admin/feedback/:id（避免 :id 吞掉 /attachments）。
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { FeedbackAttachmentService } from './feedback-attachment.service';
import {
  AdminAttachmentListResponseDto,
  BatchDeleteAttachmentsResultDto,
} from './dto/feedback-response.dto';
import { BatchDeleteAttachmentsDto } from './dto/feedback.dto';

@ApiTags('用户反馈管理')
@ApiBearerAuth()
@Controller('admin/feedback/attachments')
@UseGuards(RolesGuard, PermissionsGuard)
export class FeedbackAttachmentAdminController {
  constructor(
    private readonly attachmentService: FeedbackAttachmentService
  ) {}

  /** 附件资源管理页列表（按 type/kind/时间筛选 + 分页） */
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_READ])
  @ApiOperation({ summary: '附件资源管理列表（反馈附件/头像/logo 聚合入口可复用）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20' })
  @ApiQuery({ name: 'type', required: false, enum: ['IMAGE', 'DOCUMENT', 'DRAWING'], description: '按附件类型筛选' })
  @ApiQuery({ name: 'kind', required: false, enum: ['FILE', 'REFERENCE'], description: '按形态筛选' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '按文件名/查询码/上传者搜索' })
  @ApiQuery({ name: 'fromDate', required: false, type: String, description: '起始日期（ISO）' })
  @ApiQuery({ name: 'toDate', required: false, type: String, description: '结束日期（ISO）' })
  @ApiResponse({ status: 200, description: '附件列表', type: AdminAttachmentListResponseDto })
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('kind') kind?: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Req() req?: Request,
  ): Promise<AdminAttachmentListResponseDto> {
    const userId = (req?.user as { id: string } | undefined)?.id;
    return this.attachmentService.adminList(
      {
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
        type,
        kind,
        search,
        fromDate,
        toDate,
      },
      userId
    );
  }

  /** 下载附件（管理员且有 SYSTEM_FEEDBACK_MANAGE；提交者无权下载） */
  @Get(':id/download')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_MANAGE])
  @ApiOperation({ summary: '下载附件（管理员且有管理反馈权限；提交者无权）' })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { absPath, fileName, mimeType } =
      await this.attachmentService.adminDownload(id);
    const safeName = encodeURIComponent(fileName || 'attachment');
    res.set({
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
    });
    return new StreamableFile(createReadStream(absPath));
  }

  /** 删除附件（REFERENCE 只删记录；FILE 删物理文件 + 记录 + 审计） */
  @Delete(':id')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_MANAGE])
  @ApiOperation({ summary: '删除附件（删除留审计；图纸引用不删图纸本体）' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async remove(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const operatorId = (req.user as { id: string }).id;
    const att = await this.attachmentService.findForAudit(id);
    await this.attachmentService.adminDelete(id, operatorId, {
      type: att?.type,
      kind: att?.kind,
    });
    return { success: true };
  }

  /** 批量删除附件（复用单删语义，每条留审计；不存在的 ID 记入 notFoundIds） */
  @Post('batch-delete')
  @RequirePermissions([SystemPermission.SYSTEM_FEEDBACK_MANAGE])
  @ApiOperation({
    summary: '批量删除附件（删除留审计；图纸引用不删图纸本体；不存在的 ID 不报错）',
  })
  @ApiResponse({ status: 200, description: '批量删除结果', type: BatchDeleteAttachmentsResultDto })
  async batchRemove(
    @Body() dto: BatchDeleteAttachmentsDto,
    @Req() req: Request,
  ): Promise<BatchDeleteAttachmentsResultDto> {
    const operatorId = (req.user as { id: string }).id;
    return this.attachmentService.adminDeleteMany(dto.ids, operatorId);
  }
}
