///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import { CheckThumbnailResponseDto } from '../dto/check-thumbnail-response.dto';
import { UploadThumbnailResponseDto } from '../dto/upload-thumbnail-response.dto';
import { UploadThumbnailDto } from '../dto/upload-thumbnail.dto';
import { I18nContext } from 'nestjs-i18n';
import { getThumbnailFileName } from './thumbnail-utils';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator';
import { LibraryPublicAccess } from '../../common/decorators/library-public.decorator';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';

@ApiTags('MxCAD 缩略图')
@Controller('mxcad')
@UseGuards(RequireProjectPermissionGuard, PermissionsGuard)
export class ThumbnailController {
  private readonly logger = new Logger(ThumbnailController.name);

  constructor(
    private readonly thumbnailGenerationService: ThumbnailGenerationService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly configService: ConfigService
  ) {}

  @Get('nodes/:nodeId/thumbnail/check')
  @OptionalAuth()
  @LibraryPublicAccess()
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: CheckThumbnailResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async checkThumbnail(
    @Param('nodeId') nodeId: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    this.logger.log(`[checkThumbnail] 查询缩略图, nodeId: ${nodeId}`);
    try {
      const result =
        await this.thumbnailGenerationService.checkThumbnailExists(nodeId);

      const responseBody = { code: 0, message: 'ok', exists: result.exists };
      const etag = `"${nodeId}-${result.exists}-${result.fileName || ''}"`;

      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('ETag', etag);

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      return res.json(responseBody);
    } catch (error) {
      this.logger.error(
        `[checkThumbnail] 查询缩略图失败: ${error.message}`,
        error.stack
      );
      return res.status(500).json({
        code: -1,
        message:
          I18nContext.current()?.t('error.thumbnail_query_failed') ??
          '查询缩略图失败',
      });
    }
  }

  @Post('nodes/:nodeId/thumbnail')
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @LibraryPublicAccess()
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadThumbnailDto })
  @ApiResponse({
    status: 200,
    description: '上传成功',
    type: UploadThumbnailResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 500, description: '上传失败' })
  async uploadThumbnail(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    this.logger.log(`[uploadThumbnail] 上传缩略图, nodeId: ${nodeId}`);

    if (!file) {
      this.logger.error(`[uploadThumbnail] file 对象为空`);
      return res.status(400).json({
        code: -1,
        message:
          I18nContext.current()?.t('error.file.missing_file') ?? '缺少文件',
      });
    }

    const fileInfo = {
      keys: Object.keys(file),
      hasBuffer: !!file.buffer,
      bufferType: file.buffer ? typeof file.buffer : 'N/A',
      bufferIsBuffer: file.buffer ? Buffer.isBuffer(file.buffer) : 'N/A',
      bufferLen: file.buffer
        ? Buffer.isBuffer(file.buffer)
          ? file.buffer.length
          : 'N/A'
        : 'N/A',
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      fieldname: file.fieldname,
      encoding: file.encoding,
    };
    this.logger.log(
      `[uploadThumbnail] file debug: ${JSON.stringify(fileInfo)}`
    );

    try {
      let fileBuffer: Buffer | null = null;

      if (
        file.buffer &&
        Buffer.isBuffer(file.buffer) &&
        file.buffer.length > 0
      ) {
        fileBuffer = file.buffer;
      } else if (file.path && fs.existsSync(file.path)) {
        fileBuffer = fs.readFileSync(file.path);
      }

      if (!fileBuffer) {
        this.logger.error(
          `[uploadThumbnail] 文件数据不可用: ${JSON.stringify(fileInfo)}`
        );
        return res.status(500).json({
          code: -1,
          message:
            I18nContext.current()?.t('error.uploaded_file_not_found') ??
            '上传的文件不存在',
        });
      }

      const node = await this.fileSystemNodeService.findById(nodeId);
      if (!node || !node.path) {
        return res
          .status(404)
          .json({ code: -1, message: '文件不存在或没有 path' });
      }

      const filesDataPath = this.configService.get('filesDataPath', {
        infer: true,
      });
      // 与 storageManager.getFullPath 保持一致的路径解析（剥离 /mxcad/file/ 前缀），
      // 否则上传目录与缩略图读取目录不一致，导致有缩略图却找不到
      const cleanPath = node.path
        .replace(/^\/mxcad\/file\//, '')
        .replace(/\.\./g, '_')
        .replace(/~/g, '_');
      const dirParts = cleanPath.split('/').filter(Boolean).slice(0, -1);
      const targetDir = path.resolve(filesDataPath, dirParts.join('/'));
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      // 限制只能上传 jpg 缩略图，统一命名 thumbnail.jpg
      // 注意：前端以 Blob 形式上传（FormData 无文件名，originalname 为 "blob"），
      // 不能依赖文件扩展名判断格式，必须用 Multer 从 Blob type 解析出的 mimetype
      const mimeType = (file.mimetype || '').toLowerCase();
      if (
        mimeType !== 'image/jpeg' &&
        mimeType !== 'image/jpg' &&
        mimeType !== 'image/pjpeg'
      ) {
        this.logger.warn(
          `[uploadThumbnail] 仅支持 jpg 格式缩略图，收到: ${mimeType || '未知'}`
        );
        return res
          .status(400)
          .json({ code: -1, message: '仅支持 jpg 格式的缩略图' });
      }

      const targetFileName = getThumbnailFileName('jpg');
      const targetFilePath = path.join(targetDir, targetFileName);
      if (fs.existsSync(targetFilePath)) {
        fs.unlinkSync(targetFilePath);
      }

      fs.writeFileSync(targetFilePath, fileBuffer);
      this.logger.log(`[uploadThumbnail] 缩略图已上传: ${targetFilePath}`);
      return res.json({
        code: 0,
        message:
          I18nContext.current()?.t('success.thumbnail_uploaded') ??
          '缩略图上传成功',
        data: { fileName: targetFileName },
      });
    } catch (error) {
      this.logger.error(
        `[uploadThumbnail] 上传缩略图失败: ${error.message}`,
        error.stack
      );
      return res.status(500).json({
        code: -1,
        message:
          I18nContext.current()?.t('error.thumbnail_upload_failed') ??
          '上传缩略图失败',
      });
    }
  }
}
