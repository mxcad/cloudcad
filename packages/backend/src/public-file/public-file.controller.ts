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
  Post,
  Get,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Logger,
  Res,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PublicFileService, PreloadingData } from './public-file.service';
import { UploadExtReferenceDto } from './dto';
import { memoryStorage } from 'multer';
import { Response } from 'express';

import * as fs from 'fs';
import * as path from 'path';

@ApiTags('公开文件服务')
@Controller('public-file')
export class PublicFileController {
  private readonly logger = new Logger(PublicFileController.name);

  constructor(private readonly publicFileService: PublicFileService) {}

  /**
   * 通过文件哈希访问目录下的文件
   * GET /api/public-file/access/:hash/:filename
   * 返回 uploads/{hash}/{filename}
   */
  @Get('access/:hash/:filename')
  @Public()
  @ApiOperation({ summary: '通过文件哈希访问目录下的文件' })
  @ApiResponse({
    status: 200,
    description: '返回文件二进制数据',
    content: { 'application/octet-stream': {} },
  })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async accessFile(
    @Param('hash') hash: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ): Promise<void> {
    const filePath = await this.publicFileService.findFileInDir(hash, filename);

    if (!filePath) {
      throw new NotFoundException('文件不存在');
    }

    this.logger.log(
      `文件访问: hash=${hash}, filename=${filename}, path=${filePath}`
    );

    try {
      const fileStats = fs.statSync(filePath);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fileStats.size);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(path.basename(filePath))}"`
      );
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        this.logger.error(`文件流错误: ${error.message}`, error);
        if (!res.headersSent) {
          res.status(500).json({ code: -1, message: '获取文件失败' });
        }
      });
    } catch (error) {
      this.logger.error(`访问文件失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        throw new NotFoundException('文件不存在或已被删除');
      }
    }
  }


  /**
   * 在 uploads 目录下查找 {hash}.*.mxweb 文件（平铺存储）
   * GET /api/public-file/access/:filename（filename 格式: {hash}.xxx.mxweb）
   * 例如: GET /api/v1/public-file/access/abc123.dwg.mxweb
   *        → findMxwebFile("abc123") → uploads/abc123.dwg.mxweb
   */
  @Get('access/:filename')
  @Public()
  @ApiOperation({ summary: '在 uploads 目录下查找 mxweb 文件（平铺存储）' })
  @ApiResponse({
    status: 200,
    description: '返回文件二进制数据',
    content: { 'application/octet-stream': {} },
  })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async accessFileByHashPattern(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    // 从 filename 中提取 hash（去掉 .xxx.mxweb 或 .mxweb 后缀）
    // 如 "abc123.dwg.mxweb" → "abc123"
    // 如 "4246fa7f1b8b623e72f5db8634d788c6.mxweb" → "4246fa7f1b8b623e72f5db8634d788c6"
    const hash = filename.replace(/(?:\.[^.]+)?\.mxweb$/i, '');

    const filePath = await this.publicFileService.findMxwebFile(hash);

    if (!filePath) {
      throw new NotFoundException('文件不存在');
    }

    this.logger.log(`文件访问: filename=${filename}, hash=${hash}, path=${filePath}`);

    try {
      const fileStats = fs.statSync(filePath);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fileStats.size);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        this.logger.error(`文件流错误: ${error.message}`, error);
        if (!res.headersSent) {
          res.status(500).json({ code: -1, message: '获取文件失败' });
        }
      });
    } catch (error) {
      this.logger.error(`访问文件失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        throw new NotFoundException('文件不存在或已被删除');
      }
    }
  }


  /**
   * 上传外部参照文件（公开接口，无需认证）
   * POST /api/public-file/ext-reference/upload
   * 外部参照文件存储在主图纸的 hash 目录下
   */
  @Post('ext-reference/upload')
  @Public()
  @ApiOperation({ summary: '上传外部参照文件（公开接口）' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: '上传成功',
    schema: {
      type: 'object',
      properties: {
        ret: { type: 'string', example: 'ok' },
        hash: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadExtReference(
    @Body() dto: UploadExtReferenceDto,
    @UploadedFile() file: Express.Multer.File
  ): Promise<{ ret: string; hash?: string; message?: string }> {
    if (!file) {
      throw new BadRequestException('未上传文件');
    }

    if (!dto.srcFileHash) {
      throw new BadRequestException('缺少源图纸哈希值');
    }

    if (!dto.extRefFile) {
      throw new BadRequestException('缺少外部参照文件名');
    }

    this.logger.log(
      `[uploadExtReference] 开始处理: srcHash=${dto.srcFileHash}, extRefFile=${dto.extRefFile}, size=${file.size}`
    );

    return this.publicFileService.uploadExtReference(
      file.buffer,
      dto.srcFileHash,
      dto.extRefFile,
      dto.hash
    );
  }

  /**
   * 检查外部参照文件是否存在
   * GET /api/public-file/ext-reference/check?srcHash=xxx&fileName=xxx
   */
  @Get('ext-reference/check')
  @Public()
  @ApiOperation({ summary: '检查外部参照文件是否存在' })
  @ApiQuery({
    name: 'srcHash',
    description: '源图纸文件的哈希值',
    required: true,
  })
  @ApiQuery({ name: 'fileName', description: '外部参照文件名', required: true })
  @ApiResponse({
    status: 200,
    description: '返回文件存在状态',
    schema: {
      type: 'object',
      properties: {
        exists: { type: 'boolean' },
      },
    },
  })
  async checkExtReference(
    @Query('srcHash') srcHash: string,
    @Query('fileName') fileName: string
  ): Promise<{ exists: boolean }> {
    if (!srcHash) {
      throw new BadRequestException('缺少源图纸哈希值');
    }

    if (!fileName) {
      throw new BadRequestException('缺少外部参照文件名');
    }

    const exists = await this.publicFileService.checkExtReferenceExists(
      srcHash,
      fileName
    );

    this.logger.log(
      `[checkExtReference] 检查结果: srcHash=${srcHash}, fileName=${fileName}, exists=${exists}`
    );

    return { exists };
  }

  /**
   * 获取预加载数据（包含外部参照信息）
   * GET /api/public-file/preloading/:hash
   */
  @Get('preloading/:hash')
  @Public()
  @ApiOperation({ summary: '获取预加载数据（包含外部参照信息）' })
  @ApiResponse({
    status: 200,
    description: '返回预加载数据',
  })
  @ApiResponse({ status: 404, description: '预加载数据不存在' })
  async getPreloadingData(@Param('hash') hash: string): Promise<PreloadingData | null> {
    if (!hash) {
      throw new BadRequestException('缺少文件哈希值');
    }

    const data = await this.publicFileService.getPreloadingData(hash);

    if (!data) {
      this.logger.log(`[getPreloadingData] 预加载数据不存在: hash=${hash}`);
      return null;
    }

    this.logger.log(`[getPreloadingData] 预加载数据返回: hash=${hash}`);

    return data;
  }
}
