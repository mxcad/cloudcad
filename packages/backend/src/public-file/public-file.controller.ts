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
  Req,
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
  ApiTags, ApiOperation, ApiConsumes, ApiResponse, ApiQuery,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PublicFileService } from './public-file.service';
import { QuotaExceededException } from '../vip/errors/quota-exceeded.error';
import { VipFeatureRequiredException } from '../vip/errors/vip-feature-required.error';
import { MxCadRequestContextBuilder } from '../mxcad/core/mxcad-request-context-builder';
import type { MxCadRequest } from '../mxcad/types/request.types';
import { PreloadingDataDto } from '../mxcad/dto/preloading-data.dto';
import { UploadExtReferenceDto, ConvertFileDto } from './dto';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';

import * as fs from 'fs';
import * as path from 'path';

import { I18nContext } from 'nestjs-i18n';
const ALLOWED_EXT_REFERENCE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
  '.dwg', '.dxf',
];

function validateFileName(fileName: string): boolean {
  if (fileName.length > 255) return false;
  if (/[<>:"|?*]/.test(fileName)) return false;
  if (/[\/\\]/.test(fileName)) return false;
  if (/\.\./.test(fileName)) return false;
  for (let i = 0; i < fileName.length; i++) {
    const charCode = fileName.charCodeAt(i);
    if (charCode < 0x20 || charCode === 0x7f) return false;
  }
  return true;
}

function validateFileType(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXT_REFERENCE_EXTENSIONS.includes(ext);
}

@ApiTags('公开文件服务')
@Controller('public-file')
export class PublicFileController {
  private readonly logger = new Logger(PublicFileController.name);

  constructor(
    private readonly publicFileService: PublicFileService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly requestContextBuilder: MxCadRequestContextBuilder
  ) {}

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
      throw new NotFoundException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');
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
          res.status(500).json({ code: -1, message: (I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败') });
        }
      });
    } catch (error) {
      this.logger.error(`访问文件失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        throw new NotFoundException(I18nContext.current()?.t('error.public_file.file_not_found_or_deleted') ?? '文件不存在或已被删除');
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
      throw new NotFoundException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');
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
          res.status(500).json({ code: -1, message: (I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败') });
        }
      });
    } catch (error) {
      this.logger.error(`访问文件失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        throw new NotFoundException(I18nContext.current()?.t('error.public_file.file_not_found_or_deleted') ?? '文件不存在或已被删除');
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
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), defParamCharset: 'utf8' })
  )
  async uploadExtReference(
    @Body() dto: UploadExtReferenceDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: MxCadRequest
  ): Promise<{ ret: string; hash?: string; message?: string }> {
    if (!file) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.no_file_uploaded') ?? '未上传文件');
    }

    if (!dto.srcFileHash) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_source_hash') ?? '缺少源图纸哈希值');
    }

    if (!dto.extRefFile) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_ref_filename') ?? '缺少外部参照文件名');
    }

    if (!validateFileName(dto.extRefFile)) {
      throw new BadRequestException(I18nContext.current()?.t('error.file.name_contains_illegal_chars') ?? '文件名包含非法字符');
    }

    if (!validateFileType(dto.extRefFile)) {
      const allowed = ALLOWED_EXT_REFERENCE_EXTENSIONS.join(', ');
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.only_supported_types') ?? `仅支持 ${allowed} 文件`);
    }

    const extRefMaxFileSizeMB = await this.runtimeConfigService.getValue<number>('extRefMaxFileSize', 100);
    if (file.size > extRefMaxFileSizeMB * 1024 * 1024) {
      throw new BadRequestException(I18nContext.current()?.t('error.file.size_exceeded_limit', { args: { limit: extRefMaxFileSizeMB } }) ?? `文件大小超出限制（最大 ${extRefMaxFileSizeMB}MB）`);
    }

    // 替换模式：使用原始 xref 文件名存储
    const refFileName = dto.originalXrefName || dto.extRefFile;

    this.logger.log(
      `[uploadExtReference] 开始处理: srcHash=${dto.srcFileHash}, extRefFile=${dto.extRefFile}, originalXrefName=${dto.originalXrefName || '无'}, storageFileName=${refFileName}`
    );

    const context = await this.requestContextBuilder.buildContextFromRequest(
      request
    );

    return this.publicFileService.uploadExtReference(
      file.buffer,
      dto.srcFileHash,
      refFileName,
      dto.hash,
      context.ip,
      context.userId
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
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_source_hash') ?? '缺少源图纸哈希值');
    }

    if (!fileName) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_ref_filename') ?? '缺少外部参照文件名');
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
    type: PreloadingDataDto,
  })
  @ApiResponse({ status: 404, description: '预加载数据不存在' })
  async getPreloadingData(@Param('hash') hash: string): Promise<PreloadingDataDto | null> {
    if (!hash) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_file_hash') ?? '缺少文件哈希值');
    }

    const data = await this.publicFileService.getPreloadingData(hash);

    if (!data) {
      this.logger.log(`[getPreloadingData] 预加载数据不存在: hash=${hash}`);
      return null;
    }

    this.logger.log(`[getPreloadingData] 预加载数据返回: hash=${hash}`);

    return data;
  }

  /**
   * 将 mxweb 文件转换为指定格式并下载（公开接口，无需认证）
   * POST /api/v1/public-file/convert?format=dwg|dxf|pdf|mxweb
   *
   * 频率限制（ADR-0043）：匿名端点按客户端 IP 计数（运行时配置 conversionGuestLimit /
   * conversionGuestWindowHours）；携带有效 JWT 时按登录用户 userId 计数，超限返回 403。
   */
  @Post('convert')
  @Public()
  @ApiOperation({ summary: '将 mxweb 文件转换为指定格式并下载（公开接口）' })

  @ApiResponse({ status: 200, description: '返回转换后的文件' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async convertAndDownload(
    @Body() body: ConvertFileDto,
    @Res() res: Response,
    @Req() request: MxCadRequest,
  ): Promise<void> {
    if (!body?.fileHash) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_file_hash') ?? '缺少 fileHash');
    }

    if (!body?.format || !['dwg', 'dxf', 'pdf', 'mxweb'].includes(body.format)) {
      throw new BadRequestException(
        '不支持的格式，请选择 dwg、dxf、pdf 或 mxweb',
      );
    }

    this.logger.log(`[convertAndDownload] params: ${JSON.stringify(body.params)}`);

    try {
      const context =
        await this.requestContextBuilder.buildContextFromRequest(request);
      const result = await this.publicFileService.convertMxwebByHash(
        body.fileHash,
        body.format,
        body.params,
        context.ip,
        context.userId,
      );

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Length', result.buffer.length);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(result.filename)}"`,
      );
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.send(result.buffer);
    } catch (error) {
      // ADR-0043：频率超限保持 403，不转成 400；
      // VIP 专属门控拒绝同样保持 403 + 业务码（前端据此弹购买引导）
      if (error instanceof QuotaExceededException) throw error;
      if (error instanceof VipFeatureRequiredException) throw error;
      this.logger.error(
        `[convertAndDownload] 转换失败: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(error.message || '文件转换失败');
    }
  }
}
