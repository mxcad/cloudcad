///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller, Get, Head, Param, Query, Req, Res, UseGuards,
  NotFoundException, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiTags, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MxcadFileHandlerService } from '../core/mxcad-file-handler.service';
import { MxcadFileAccessService } from './mxcad-file-access.service';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator';
import type { MxCadRequest } from '../types/request.types';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { normalizeMxcadPath } from '../../common/utils/mxcad-path';
import { I18nContext } from 'nestjs-i18n';

@ApiTags('MxCAD 文件访问')
@Controller('mxcad')
export class MxcadFileAccessController {
  constructor(
    private readonly fileAccessService: MxcadFileAccessService,
    private readonly mxcadFileHandler: MxcadFileHandlerService,
  ) {}

  @Get('filesData/*path')
  @OptionalAuth()
  @ApiResponse({ status: 200, description: '成功获取文件' })
  @ApiResponse({ status: 202, description: '预热中（warmup=1 时历史版本转换已发起/在途，前端轮询本端点直到 204）' })
  @ApiResponse({ status: 204, description: '预热成功（warmup=1 时不返回内容）' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  @ApiQuery({ name: 'v', required: false, description: '历史版本号，存在时返回指定版本文件' })
  @ApiQuery({ name: 'warmup', required: false, description: '预热模式（1/true）：确认版本缓存就绪；转换已发起/在途时返回 202 供前端轮询' })
  @ApiQuery({ name: 'shareToken', required: false, description: '分享访问令牌' })
  async getFilesDataFile(
    @Res() res: Response,
    @Req() req: Request,
    @Param('path') path: string,
    @Query('v') version?: string,
    @Query('warmup') warmup?: string
  ) {
    const filename = normalizeMxcadPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    if (!(await this.authorizeFilesDataOrRespond(res, filename, req))) return;
    if (version) return this.fileAccessService.serveFilesDataFile(filename, res, req, false, version, warmup === '1' || warmup === 'true');
    return this.mxcadFileHandler.serveFile(filename, res);
  }

  @Head('filesData/*path')
  @OptionalAuth()
  @ApiResponse({ status: 200, description: '成功获取文件信息' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  @ApiQuery({ name: 'v', required: false, description: '历史版本号' })
  @ApiQuery({ name: 'shareToken', required: false, description: '分享访问令牌' })
  async getFilesDataFileHead(
    @Res() res: Response,
    @Req() req: Request,
    @Param('path') path: string,
    @Query('v') version?: string
  ) {
    const filename = normalizeMxcadPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    // HEAD 与 GET 同一鉴权：此前仅 shareToken 存在时才鉴权，匿名 HEAD 可探测
    // filesData 文件存在性（200/404）与 Content-Length。authorizeFilesDataAccess
    // 内部已读 req.query.shareToken / x-share-token / referer，无需单独传参。
    if (!(await this.authorizeFilesDataOrRespond(res, filename, req))) return;
    if (version) return this.fileAccessService.serveFilesDataFile(filename, res, req, true, version);
    return this.mxcadFileHandler.serveFile(filename, res);
  }

  // preloading 端点由 MxcadExternalRefController.getPreloadingData 处理（含缓存 + 守卫）
  // 此 Controller 不重复注册以避免与 file/*path 路由冲突

  @Get('file/:nodeId/download-external-ref/:fileName')
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
  @ApiResponse({ status: 200, description: '下载外部参照文件' })
  @ApiQuery({ name: 'format', required: false })
  @ApiQuery({ name: 'width', required: false })
  @ApiQuery({ name: 'height', required: false })
  @ApiQuery({ name: 'colorPolicy', required: false })
  @ApiQuery({ name: 'dwgVersion', required: false })
  async getFileDownloadExternalRef(
    @Param('nodeId') nodeId: string,
    @Param('fileName') fileName: string,
    @Query('format') format: string,
    @Query('width') width: string,
    @Query('height') height: string,
    @Query('colorPolicy') colorPolicy: string,
    @Query('dwgVersion') dwgVersion: string,
    @Res() res: Response,
    @Req() req: MxCadRequest,
  ) {
    return this.fileAccessService.serveExternalRefDownload(
      nodeId,
      fileName,
      { format, width, height, colorPolicy, dwgVersion },
      res,
      req,
    );
  }

  @Get('external-ref-view/:nodeId/:fileName')
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
  @ApiResponse({ status: 200, description: '查看外部参照文件（图片/mxweb 图纸）' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限查看外部参照' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async viewExternalRef(
    @Param('nodeId') nodeId: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    return this.fileAccessService.serveExternalRefView(nodeId, fileName, res);
  }

  @Get('file/*path')
  @ApiResponse({ status: 200, description: '成功获取文件' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getFile(
    @Res() res: Response,
    @Req() req: MxCadRequest,
    @Param('path') path: string
  ) {
    const filename = normalizeMxcadPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    return this.fileAccessService.serveNodeFile(filename, res, req, false);
  }

  @Head('file/*path')
  @ApiResponse({ status: 200, description: '成功获取文件信息' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getFileHead(
    @Res() res: Response,
    @Req() req: MxCadRequest,
    @Param('path') path: string
  ) {
    const filename = normalizeMxcadPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    return this.fileAccessService.serveNodeFile(filename, res, req, true);
  }

  @Get('files/:storageKey')
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '成功获取文件' })
  @ApiResponse({ status: 401, description: '未登录或无权限' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getNonCadFile(
    @Res() res: Response,
    @Req() req: MxCadRequest,
    @Param('storageKey') storageKey: string
  ) {
    return this.fileAccessService.serveNonCadFile(storageKey, res, req);
  }

  /**
   * filesData 鉴权 + 异常→HTTP 映射（GET/HEAD 共用）。
   * 鉴权判定在 service；此处只把异常映射为 404/401 响应，非鉴权异常向上抛。
   * @returns true 表示已授权可继续取流；false 表示已写错误响应。
   */
  private async authorizeFilesDataOrRespond(res: Response, filename: string, req: Request): Promise<boolean> {
    try {
      await this.fileAccessService.authorizeFilesDataAccess(filename, req);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) { res.status(404).json({ code: -1, message: error.message }); return false; }
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) { res.status(401).json({ code: -1, message: error.message }); return false; }
      throw error;
    }
  }
}
