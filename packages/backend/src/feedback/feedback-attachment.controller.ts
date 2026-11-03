///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 附件控制器（上传 / 注册图纸 / 下载）
//
// 上传：multipart（diskStorage 临时落盘，service 校验后移入附件存储），
//       图片魔数校验 + 分类型大小上限由 service 执行。
// 下载：登录（上传者/反馈提交者）/ 匿名（短期签名 token + code）鉴权。
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Request, Response } from 'express';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { getClientIp } from '../common/utils/client-ip';
import { FeedbackAttachmentService } from './feedback-attachment.service';
import { RegisterDrawingAttachmentDto } from './dto/feedback.dto';
import { FeedbackAttachmentDto } from './dto/feedback-response.dto';

@ApiTags('用户反馈')
@ApiConsumes('multipart/form-data')
@Controller('feedback/attachments')
export class FeedbackAttachmentController {
  constructor(
    private readonly attachmentService: FeedbackAttachmentService
  ) {}

  /** 上传图片/文档附件（先传拿 id，再随反馈提交绑定） */
  @Post()
  @ApiConsumes('multipart/form-data')
  @OptionalAuth()
  // defParamCharset: 'utf8' — busboy 默认用 latin1 解码 multipart 头中的文件名，
  // 浏览器以 UTF-8 字节发送的中文名（如「测试图纸.dwg」）会被解析成
  // 「æµè¯å¾çº¸.dwg」乱码并落盘（全仓其他上传点均已配置，本处曾遗漏，见 service 防御层）。
  @UseInterceptors(
    FileInterceptor('file', {
      defParamCharset: 'utf8',
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, tmpdir()),
        filename: (_req, _file, cb) => cb(null, `fbatt_${randomBytes(8).toString('hex')}`),
      }),
      limits: { fileSize: 512 * 1024 * 1024 },
    })
  )
  @ApiOperation({ summary: '上传反馈附件（图片/文档；返回附件 id 供提交绑定）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        anonToken: { type: 'string', description: '匿名设备令牌（匿名提交时传）' },
      },
    },
  })
  @ApiResponse({ status: 200, type: FeedbackAttachmentDto })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { anonToken?: string },
    @Req() req: Request
  ): Promise<FeedbackAttachmentDto> {
    const user = req.user as { id: string } | undefined;
    return this.attachmentService.uploadFile(file, {
      userId: user?.id,
      anonToken: body?.anonToken,
      ip: getClientIp(req),
    });
  }

  /** 注册图纸附件（copy 副本 / reference 引用） */
  @Post('drawing')
  @OptionalAuth()
  @ApiConsumes('application/json')
  @ApiOperation({ summary: '注册图纸附件（复用 mxcad 图纸上传后调用：copy=副本 / reference=引用）' })
  @ApiResponse({ status: 200, type: FeedbackAttachmentDto })
  async registerDrawing(
    @Body() dto: RegisterDrawingAttachmentDto,
    @Req() req: Request
  ): Promise<FeedbackAttachmentDto> {
    const user = req.user as { id: string } | undefined;
    return this.attachmentService.registerDrawing(dto, {
      userId: user?.id,
      ip: getClientIp(req),
    });
  }

  /** 查看/预览附件（登录/匿名签名 token 鉴权；提交者可看图片/文档，图纸引用仅管理员） */
  @Get(':id/download')
  @OptionalAuth()
  @ApiOperation({ summary: '查看/预览附件（匿名凭 code 查询响应的短期 token；内联下发）' })
  @ApiQuery({ name: 'token', required: false, description: '短期签名 token（匿名查看）' })
  @ApiQuery({ name: 'code', required: false, description: '反馈查询码（匿名查看）' })
  async download(
    @Param('id') id: string,
    @Query('token') token: string,
    @Query('code') code: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const user = req.user as { id: string } | undefined;
    const { absPath, fileName, mimeType } = await this.attachmentService.getDownload(id, {
      userId: user?.id,
      token,
      code,
    });
    const safeName = encodeURIComponent(fileName || 'attachment');
    // 查看语义：内联下发（图片/PDF 在浏览器渲染；图纸在新标签打开，浏览器自行处理下载）。
    // 真正的「下载保存」只走管理员端点 /admin/feedback/attachments/:id/download（MANAGE 守卫）。
    res.set({
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
    });
    return new StreamableFile(createReadStream(absPath));
  }

  /** 附件缩略图（FILE 图纸预览；REFERENCE 无缩略图） */
  @Get(':id/thumbnail')
  @OptionalAuth()
  @ApiOperation({ summary: '附件缩略图（FILE 图纸；提交者/管理员可看）' })
  @ApiQuery({ name: 'token', required: false, description: '短期签名 token（匿名查看）' })
  @ApiQuery({ name: 'code', required: false, description: '反馈查询码（匿名查看）' })
  async thumbnail(
    @Param('id') id: string,
    @Query('token') token: string,
    @Query('code') code: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const user = req.user as { id: string } | undefined;
    const { absPath, mimeType } = await this.attachmentService.getThumbnail(id, {
      userId: user?.id,
      token,
      code,
    });
    res.set({
      'Content-Type': mimeType || 'image/jpeg',
      'Content-Disposition': 'inline',
    });
    return new StreamableFile(createReadStream(absPath));
  }
}