import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Header,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { Response, Request as ExpressRequest } from 'express';
import { ConversionFileSseService } from './conversion-file.sse.service';

/**
 * 无节点（游客 / 公开图纸）转换完成 SSE（per 文件 hash，公开端点）。
 *
 * 游客无 token：前端打开图纸后（上传/合并请求立即返回）用 EventSource 订阅本端点
 * 等转换完成通知（latest-wins：只打开最后打开的那个文件）。与 tasks/stream 不同，
 * 本端点 @Public 无需认证，hash 是唯一参数。
 *
 * SSE 端点不进 Swagger/SDK（ADR-0034，EventSource 订阅无 SDK 形态，生成的返回类型
 * 只有 { 200: unknown } 对调用方毫无表达力）。@ApiExcludeEndpoint 把豁免下沉为可执行
 * 门禁，重跑 generate:api-types 不会把本端点收进 SDK。
 */
@ApiTags('ConversionFileSse')
@Controller('mxcad/conversion')
export class ConversionFileSseController {
  constructor(
    private readonly conversionFileSseService: ConversionFileSseService
  ) {}

  @Public()
  @Get('file-stream')
  @ApiExcludeEndpoint()
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({
    summary: '无节点转换完成实时推送（SSE，per 文件 hash，公开）',
  })
  @ApiQuery({ name: 'hash', required: true, description: '文件 MD5 hash' })
  async streamFile(
    @Query('hash') hash: string,
    @Req() request: ExpressRequest,
    @Res() res: Response
  ): Promise<void> {
    if (!hash || !/^[a-z0-9]{8,128}$/i.test(hash)) {
      throw new BadRequestException('invalid hash');
    }
    await this.conversionFileSseService.streamFile(hash, res, request);
  }
}
