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
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MxCadService } from '../core/mxcad.service';
import { CheckThumbnailResponseDto } from '../dto/check-thumbnail-response.dto';
import { UploadThumbnailResponseDto } from '../dto/upload-thumbnail-response.dto';
import { UploadThumbnailDto } from '../dto/upload-thumbnail.dto';
import {
  getThumbnailFileName,
  THUMBNAIL_FORMATS,
  type ThumbnailFormat,
} from './thumbnail-utils';

@ApiTags('MxCAD 缩略图')
@Controller('mxcad')
export class ThumbnailController {
  private readonly logger = new Logger(ThumbnailController.name);

  constructor(
    private readonly mxCadService: MxCadService,
    private readonly configService: ConfigService,
  ) {}

  @Get('thumbnail/:nodeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: CheckThumbnailResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async checkThumbnail(
    @Param('nodeId') nodeId: string,
    @Res() res: Response,
  ) {
    this.logger.log(`[checkThumbnail] 查询缩略图, nodeId: ${nodeId}`);
    try {
      const result =
        await this.mxCadService.checkThumbnailExists(nodeId);
      return res.json({ code: 0, message: 'ok', exists: result.exists });
    } catch (error) {
      this.logger.error(
        `[checkThumbnail] 查询缩略图失败: ${error.message}`,
        error.stack,
      );
      return res
        .status(500)
        .json({ code: -1, message: '查询缩略图失败' });
    }
  }

  @Post('thumbnail/:nodeId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
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
    @Res() res: Response,
  ) {
    this.logger.log(`[uploadThumbnail] 上传缩略图, nodeId: ${nodeId}`);
    if (!file) {
      return res.status(400).json({ code: -1, message: '缺少文件' });
    }
    if (!fs.existsSync(file.path)) {
      return res
        .status(500)
        .json({ code: -1, message: '上传的文件不存在' });
    }
    try {
      const node =
        await this.mxCadService.getFileSystemNodeByNodeId(nodeId);
      if (!node || !node.path) {
        return res
          .status(404)
          .json({ code: -1, message: '文件不存在或没有 path' });
      }
      const filesDataPath = this.configService.get('filesDataPath', {
        infer: true,
      });
      const nodePathParts = node.path.split('/');
      const dirParts = nodePathParts.slice(0, -1);
      const targetDir = path.resolve(filesDataPath, dirParts.join('/'));
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const rawExt = path
        .extname(file.originalname || file.filename)
        .toLowerCase();
      // path.extname 返回带点号前缀 (如 ".png")，需去掉点号；空扩展名回退为 png
      const fileExt = (rawExt.startsWith(".") ? rawExt.slice(1) : rawExt) || "jpg";

      const targetFileName = getThumbnailFileName(fileExt as ThumbnailFormat);
      const targetFilePath = path.join(targetDir, targetFileName);
      if (fs.existsSync(targetFilePath)) {
        fs.unlinkSync(targetFilePath);
      }
      fs.renameSync(file.path, targetFilePath);
      this.logger.log(
        `[uploadThumbnail] 缩略图已上传: ${targetFilePath}`,
      );
      return res.json({
        code: 0,
        message: '缩略图上传成功',
        data: { fileName: targetFileName },
      });
    } catch (error) {
      this.logger.error(
        `[uploadThumbnail] 上传缩略图失败: ${error.message}`,
        error.stack,
      );
      return res
        .status(500)
        .json({ code: -1, message: '上传缩略图失败' });
    }
  }
}
