///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiConsumes, ApiResponse, ApiBody } from '@nestjs/swagger';
import {
  I_EXTERNAL_REF_FACADE,
  IExternalRefFacade,
} from './interfaces/ext-ref-facade.interface';
import { DrawingIngestService } from '../upload/drawing-ingest.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { I18nContext } from 'nestjs-i18n';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { PreloadingDataDto } from '../dto/preloading-data.dto';
import { UploadExtReferenceFileDto } from '../dto/upload-ext-reference-file.dto';
import { CheckReferenceDto } from '../dto/check-reference.dto';
import { CheckReferenceResponseDto } from '../dto/check-reference-response.dto';
import { RefreshExternalReferencesResponseDto } from '../dto/refresh-external-references-response.dto';
import type { MxCadRequest } from '../types/request.types';
import { QuotaExceededException } from '../../vip/errors/quota-exceeded.error';

@ApiTags('MxCAD 外部参照')
@Controller('mxcad')
export class MxcadExternalRefController {
  private readonly logger = new Logger(MxcadExternalRefController.name);

  constructor(
    @Inject(I_EXTERNAL_REF_FACADE)
    private readonly externalRefFacade: IExternalRefFacade,
    private readonly drawingIngestService: DrawingIngestService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly fileTreeService: FileTreeService
  ) {}

  @Get('preloading/:nodeId')
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiResponse({
    status: 200,
    description: '获取外部参照预加载数据',
    type: PreloadingDataDto,
  })
  async getPreloadingData(
    @Param('nodeId') nodeId: string
  ): Promise<PreloadingDataDto | null> {
    this.logger.debug(`[getPreloadingData] nodeId=${nodeId}`);
    const cached = this.externalRefFacade.getPreloadingCache(nodeId);
    if (cached) return cached;
    const data = await this.externalRefFacade.getPreloadingData(nodeId);
    if (!data) return null;
    this.externalRefFacade.setPreloadingCache(nodeId, data);
    this.externalRefFacade.cleanExpiredCache();
    return data;
  }

  @Post('file/:nodeId/check-reference')
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
  @ApiResponse({
    status: 200,
    description: '检查外部参照文件是否存在',
    type: CheckReferenceResponseDto,
  })
  @ApiBody({ type: CheckReferenceDto })
  async checkExternalReference(
    @Param('nodeId') nodeId: string,
    @Body() body: CheckReferenceDto
  ) {
    if (!body.fileName) return { exists: false };
    const exists = await this.externalRefFacade.checkExists(
      nodeId,
      body.fileName
    );
    return { exists };
  }

  @Post('file/:nodeId/refresh-external-references')
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
  @ApiResponse({
    status: 200,
    description: '刷新成功',
    type: RefreshExternalReferencesResponseDto,
  })
  async refreshExternalReferences(@Param('nodeId') nodeId: string) {
    const stats = await this.externalRefFacade.getStats(nodeId);
    await this.externalRefFacade.updateInfo(nodeId, stats);
    this.externalRefFacade.invalidatePreloadingCache(nodeId);
    return {
      code: 0,
      message: I18nContext.current()?.t('success.refreshed') ?? '刷新成功',
      stats,
    };
  }

  @Post('up_ext_reference_dwg/:nodeId')
  @UseGuards(RequireProjectPermissionGuard)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadExtReferenceFileDto })
  async uploadExtReferenceDwg(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadExtReferenceFileDto,
    @Req() request: MxCadRequest,
    @Res() res: Response
  ) {
    body.nodeId = nodeId;
    const validationResult =
      await this.externalRefFacade.validateExtReferenceUpload(file, body, [
        '.dwg',
        '.dxf',
      ]);
    if (!validationResult.success) return res.json(validationResult.error);
    let fileHash = body.hash;
    if (!fileHash) {
      const result = this.externalRefFacade.computeUploadedFileHash(
        file.path,
        file.originalname
      );
      fileHash = result.hash;
      file.path = result.path;
    }
    const node = await this.fileSystemNodeService.findById(body.nodeId);
    const parentFolderId = node?.parentId || node?.id || 'external-reference';
    const context = {
      nodeId: parentFolderId,
      userId: await this.externalRefFacade.validateTokenAndGetUserId(request),
      userRole: 'USER',
      srcDwgNodeId: node?.id || body.nodeId,
      isImage: false,
    };
    const storageFileName = body.originalXrefName || body.ext_ref_file;
    const result = await this.drawingIngestService.ingest(
      {
        kind: 'file',
        filePath: file.path,
        fileHash: fileHash || '',
        name: storageFileName,
        size: file.size,
      },
      {
        userId: context.userId,
        parentNodeId: context.nodeId,
        ownerId: context.userId,
        srcDwgNodeId: context.srcDwgNodeId,
        isImage: context.isImage,
      }
    );
    if (result.ret === 'ok' || result.ret === 'fileAlreadyExist') {
      await this.externalRefFacade.updatePreloadingAfterUpload(
        body.nodeId,
        body.ext_ref_file,
        body.originalXrefName
      );
      try {
        await this.externalRefFacade.updateAfterUpload(body.nodeId);
      } catch (updateError) {
        this.logger.error(
          `更新外部参照信息失败: ${updateError.message}`,
          updateError.stack
        );
      }
      this.externalRefFacade.invalidatePreloadingCache(body.nodeId);
      return res.json({ code: 0, message: 'ok' });
    }
    return res.json({ code: -1, message: result.ret || 'upload failed' });
  }

  @Post('up_ext_reference_image/:nodeId')
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadExtReferenceFileDto })
  async uploadExtReferenceImage(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadExtReferenceFileDto,
    @Req() request: MxCadRequest,
    @Res() res: Response
  ) {
    body.nodeId = nodeId;
    const validationResult =
      await this.externalRefFacade.validateExtReferenceUpload(
        file,
        body,
        null,
        true,
        null
      );
    if (!validationResult.success) return res.json(validationResult.error);
    let sourceNode: { id: string; parentId?: string | null } | null = null;
    try {
      const userId =
        await this.externalRefFacade.validateTokenAndGetUserId(request);
      const node = await this.fileSystemNodeService.findById(body.nodeId);
      if (node) {
        const permission = await this.externalRefFacade.checkFileAccessPermission(
          body.nodeId,
          userId,
          userId
        );
        if (!permission)
          return res.json({
            code: -1,
            message:
              I18nContext.current()?.t('error.mxcad.no_access_drawing') ??
              '无权限访问该图纸',
          });
        sourceNode = node;
      }
    } catch (authError) {
      return res.json({
        code: -1,
        message:
          I18nContext.current()?.t(
            'error.mxcad.permission_verification_failed'
          ) ?? '权限验证失败',
      });
    }
    const { hash: fileHash, path: newPath } =
      this.externalRefFacade.computeUploadedFileHash(
        file.path,
        file.originalname
      );
    file.path = newPath;
    const srcNodeId = sourceNode?.id || body.nodeId;
    const context = {
      nodeId: srcNodeId,
      userId: await this.externalRefFacade.validateTokenAndGetUserId(request),
      userRole: 'USER',
      srcDwgNodeId: srcNodeId,
      isImage: true,
      fileSize: file.size,
    };
    const storageFileName = body.originalXrefName || body.ext_ref_file;
    try {
      await this.externalRefFacade.handleExternalReferenceImage(
        fileHash,
        srcNodeId,
        storageFileName,
        file.path,
        context
      );
      if (body.updatePreloading) {
        try {
          await this.externalRefFacade.updateAfterUpload(body.nodeId);
          await this.externalRefFacade.updatePreloadingAfterUpload(
            body.nodeId,
            body.ext_ref_file,
            body.originalXrefName
          );
        } catch {
          // 外参照关联更新失败不阻断响应，仅作尽力而为（best-effort）
        }
        this.externalRefFacade.invalidatePreloadingCache(body.nodeId);
      }
      return res.json({ code: 0, message: 'ok' });
    } catch (error) {
      if (error instanceof QuotaExceededException) {
        throw error;
      }
      return res.json({
        code: -1,
        message:
          I18nContext.current()?.t('error.mxcad.copy_image_failed') ??
          '图片文件拷贝失败',
      });
    }
  }
}
