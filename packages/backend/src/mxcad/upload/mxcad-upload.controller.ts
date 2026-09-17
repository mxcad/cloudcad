///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpStatus,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiResponse } from '@nestjs/swagger';
import { DrawingIngestService } from './drawing-ingest.service';
import { ChunkUploadManagerService } from '../services/chunk-upload-manager.service';
import { UploadUtilityService } from './upload-utility.service';
import { I18nContext } from 'nestjs-i18n';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import type { MergeResult } from './file-upload-manager.types';
import {
  CheckChunkExistDto,
  CheckChunkExistResponseDto,
} from '../dto/check-chunk-exist.dto';
import { CheckFileExistDto } from '../dto/check-file-exist.dto';
import { FileExistResponseDto } from '../dto/file-exist-response.dto';
import { UploadFilesDto } from '../dto/upload-files.dto';
import { UploadFileResponseDto } from '../dto/upload-file-response.dto';
import type { MxCadRequest } from '../types/request.types';
import { MxCadRequestContextBuilder } from '../core/mxcad-request-context-builder';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { FileUtils } from '../../common/utils/file-utils';

@ApiTags('MxCAD 文件上传')
@Controller('mxcad')
export class MxcadUploadController {
  private readonly logger = new Logger(MxcadUploadController.name);

  constructor(
    private readonly drawingIngestService: DrawingIngestService,
    private readonly chunkUploadManager: ChunkUploadManagerService,
    private readonly uploadUtilityService: UploadUtilityService,
    private readonly requestContextBuilder: MxCadRequestContextBuilder,
    private readonly auditLogService: AuditLogService
  ) {}

  @Post('files/chunkisExist')
  @OptionalAuth()
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: '检查分片是否存在',
    type: CheckChunkExistResponseDto,
  })
  async checkChunkExist(
    @Body() body: CheckChunkExistDto,
    @Req() request: MxCadRequest
  ) {
    this.logger.log(`[chunkisExist] 参数: ${JSON.stringify(body)}`);
    const context =
      await this.requestContextBuilder.buildContextFromRequest(request);
    const chunkExistsInStorage =
      await this.uploadUtilityService.checkChunkExistsInStorage(
        body.fileHash,
        body.chunk
      );
    if (chunkExistsInStorage) {
      this.logger.log(
        `[chunkisExist] 分片存在于 uploads 目录: chunk=${body.chunk}, hash=${body.fileHash}`
      );
      return { exists: true };
    }
    if (context.userId && context.nodeId) {
      const result = await this.chunkUploadManager.checkChunkExist({
        hash: body.fileHash,
        name: body.filename,
        size: body.size,
        chunk: body.chunk,
        chunks: body.chunks,
        context,
      });
      return { exists: result.ret === MxUploadReturn.kChunkAlreadyExist };
    }
    return { exists: false };
  }

  @Post('files/fileisExist')
  @OptionalAuth()
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: '检查文件是否存在',
    type: FileExistResponseDto,
  })
  async checkFileExist(
    @Body() body: CheckFileExistDto,
    @Req() request: MxCadRequest
  ) {
    const context =
      await this.requestContextBuilder.buildContextFromRequest(request);
    const fileExistsInStorage =
      await this.uploadUtilityService.checkFileExistsInStorage(
        body.fileHash,
        body.filename
      );
    if (fileExistsInStorage) {
      this.logger.log(
        `[fileisExist] 文件存在于 uploads 目录: ${body.filename}, hash=${body.fileHash}`
      );
      if (context.userId && context.nodeId) {
        context.fileSize = body.fileSize;
        const result = await this.drawingIngestService.checkExist(
          body.fileHash,
          body.filename,
          {
            userId: context.userId,
            parentNodeId: context.nodeId,
            ownerId: context.userId,
            conflictStrategy: context.conflictStrategy,
            isLibrary: context.isLibrary,
            fileSize: body.fileSize,
          }
        );
        // 秒传命中且新建节点 → 记"新增图纸"（项目操作历史）
        await this.logInstantUploadCreate(result, context.userId);
        return {
          exists: result.ret === MxUploadReturn.kFileAlreadyExist,
          nodeId: result.nodeId,
        };
      }
      return { exists: true, nodeId: null };
    }
    if (context.userId && context.nodeId) {
      context.fileSize = body.fileSize;
      const result = await this.drawingIngestService.checkExist(
        body.fileHash,
        body.filename,
        {
          userId: context.userId,
          parentNodeId: context.nodeId,
          ownerId: context.userId,
          conflictStrategy: context.conflictStrategy,
          isLibrary: context.isLibrary,
          fileSize: body.fileSize,
        }
      );
      // 秒传命中且新建节点 → 记"新增图纸"（项目操作历史）
      await this.logInstantUploadCreate(result, context.userId);
      return {
        exists: result.ret === MxUploadReturn.kFileAlreadyExist,
        nodeId: result.nodeId,
      };
    }
    return { exists: false, nodeId: null };
  }

  /**
   * 秒传新建节点审计（fileisExist 路径）：存储已存在文件且目标目录无同名冲突时，
   * checkExist 会 materialize 新建节点（created=true）→ 记 FILE_CREATE；
   * skip 冲突返回已有节点（created 为空）不算新增。项目内判断收敛在
   * logProjectNodeAction（audit-log.service 内查 projectId）。
   */
  private async logInstantUploadCreate(
    result:
      | Awaited<ReturnType<DrawingIngestService['checkExist']>>
      | undefined,
    userId: string
  ): Promise<void> {
    if (
      result?.ret === MxUploadReturn.kFileAlreadyExist &&
      result.created &&
      result.nodeId
    ) {
      await this.auditLogService.logProjectNodeAction(
        AuditAction.FILE_CREATE,
        result.nodeId,
        userId
      );
    }
  }

  @Post('files/uploadFiles')
  @OptionalAuth()
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.FILE_CREATE)
  @UseInterceptors(AnyFilesInterceptor({ defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: '文件上传成功',
    type: UploadFileResponseDto,
  })
  async uploadFile(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadFilesDto,
    @Req() request: MxCadRequest
  ) {
    const file = files && files.length > 0 ? files[0] : null;
    this.logger.log(
      `[uploadFile] files count: ${files?.length || 0}, file exists: ${!!file}, size: ${file?.size}`
    );
    let context: Awaited<
      ReturnType<MxCadRequestContextBuilder['buildContextFromRequest']>
    > | null = null;
    try {
      const isMergeRequest = !file && body.chunks !== undefined;
      if (!isMergeRequest && !file)
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.upload_missing') ?? '缺少上传文件'
        );
      if (!body.hash || !body.name || !body.size)
        throw new BadRequestException(
          I18nContext.current()?.t('error.mxcad.missing_params_hash_name_size') ??
            '缺少必要参数: hash, name 或 size'
        );
      // body.name 为客户端可控字段，落库前统一清洗：basename 去路径段、去 .. 与危险字符
      // <>:"|?*、去首尾点/空格，防路径遍历串进入节点 name/originalName（进而影响展示、
      // 批量下载 zip 条目名、同名去重）。用 sanitizeFilename（非白名单）而非 validateFilename，
      // 避免误拒含括号/加号等合法字符的文件名（如「图纸 (1).dwg」）。
      body.name = FileUtils.sanitizeFilename(body.name);
      if (body.chunk !== undefined && body.chunks === undefined)
        throw new BadRequestException(
          I18nContext.current()?.t('error.mxcad.missing_params_chunks') ??
            '缺少必要参数: chunks'
        );
      context =
        await this.requestContextBuilder.buildContextFromRequest(request);
      let result: {
        nodeId?: string;
        ret: MxUploadReturn;
        tz?: boolean;
        created?: boolean;
      };
      if (isMergeRequest) {
        const uploadResult = await this.chunkUploadManager.uploadChunk({
          hash: body.hash,
          name: body.name,
          size: body.size,
          chunk: body.chunks - 1,
          chunks: body.chunks,
          context,
          skipDb: body.skipDb,
        });
        result = uploadResult as MergeResult;
      } else if (body.chunk !== undefined) {
        // 每个分片上传前的配额预检：分片请求体带整个文件大小（body.size），
        // 空间不足立即 403 中止，覆盖绕过秒传预检（forceUpload / 直连 API 分片上传）
        // 的路径——不触发合并、不创建节点，避免用户传完整文件才收到"空间不足"。
        // skipDb 仅传文件不占配额，跳过；权威断言仍在合并后按真实文件大小复核。
        if (!body.skipDb) {
          await this.drawingIngestService.assertQuotaBeforeUpload({
            userId: context.userId,
            parentNodeId: context.nodeId,
            ownerId: context.userId,
            conflictStrategy: context.conflictStrategy,
            isLibrary: context.isLibrary,
            fileSize: body.size,
          });
        }
        const uploadResult = await this.chunkUploadManager.uploadChunk({
          hash: body.hash,
          name: body.name,
          size: body.size,
          chunk: body.chunk,
          chunks: body.chunks,
          context,
          skipDb: body.skipDb,
        });
        result = uploadResult as MergeResult;
      } else {
        result = await this.drawingIngestService.ingest(
          {
            kind: 'file',
            filePath: file!.path,
            fileHash: body.hash,
            name: body.name,
            size: body.size,
            forceUpload: body.forceUpload,
            ip: context.ip,
          },
          {
            userId: context.userId,
            parentNodeId: context.nodeId,
            ownerId: context.userId,
            conflictStrategy: context.conflictStrategy,
            isLibrary: context.isLibrary,
            fileSize: body.size,
          }
        );
      }
      // 上传成功（新节点入库）审计：仅真正新建节点的上传记录 FILE_CREATE
      // （skip 冲突返回已有节点 created 为空，不算新增）；仅项目内节点记
      // FILE_CREATE（个人空间/公共资源库无 projectId 不记，保持"项目操作历史"语义）
      if (result.created && result.nodeId) {
        await this.auditLogService.logProjectNodeAction(
          AuditAction.FILE_CREATE,
          result.nodeId,
          context.userId,
        );
      }
      return { nodeId: result.nodeId, tz: result.tz, ret: result.ret };
    } catch (error) {
      // #207 阶段 2：上传失败埋点（FILE_UPLOAD 成功记录已在写入入口过滤，失败保留）
      await this.auditLogService.log(
        AuditAction.FILE_UPLOAD,
        ResourceType.FILE,
        undefined,
        context?.userId ?? 'unknown',
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        undefined,
        body?.name,
        { fileName: body?.name ?? null, hash: body?.hash ?? null }
      );
      throw error;
    }
  }
}
