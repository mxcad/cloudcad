///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller, Get, Head, Param, Query, Req, Res, UseGuards, Logger,
  NotFoundException, UnauthorizedException, ForbiddenException, Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiTags, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { AppConfig } from '../../config/app.config';
import { MxcadFileHandlerService } from '../core/mxcad-file-handler.service';
import { MxcadVersionHistoryService } from '../core/mxcad-version-history.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { ShareService } from '../../share/share.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator';
import { I_EXTERNAL_REF_FACADE, IExternalRefFacade } from '../external-ref/interfaces/ext-ref-facade.interface';
import { MXCAD_CONVERSION_SERVICE } from '../interfaces/mxcad-service-tokens';
import type { IMxcadConversionService } from '../interfaces/mxcad-conversion.interface';
import type { MxCadConversionResult } from '../interfaces/file-conversion.interface';
import type { MxCadRequest } from '../types/request.types';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';

@ApiTags('MxCAD 文件访问')
@Controller('mxcad')
export class MxcadFileAccessController {
  private readonly logger = new Logger(MxcadFileAccessController.name);
  private readonly mxCadFileExt: string;

  constructor(
    private readonly mxcadFileHandler: MxcadFileHandlerService,
    private readonly versionHistoryService: MxcadVersionHistoryService,
    private readonly configService: ConfigService<AppConfig>,
    @Inject(IStorageService) private readonly storageService: IStorageService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly shareService: ShareService,
    @Inject(MXCAD_CONVERSION_SERVICE) private readonly conversionService: IMxcadConversionService,
    @Inject(I_EXTERNAL_REF_FACADE) private readonly externalRefFacade: IExternalRefFacade,
    private readonly restrictionEngine: RestrictionEngine,
  ) {
    this.mxCadFileExt = this.configService.get('mxcad.fileExt', { infer: true }) || '.mxweb';
  }

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
    const filename = this.extractPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    if (req.method !== 'HEAD') {
      try {
        await this.authorizeFilesDataAccess(filename, req);
      } catch (error) {
        if (error instanceof NotFoundException) return res.status(404).json({ code: -1, message: error.message });
        if (error instanceof UnauthorizedException || error instanceof ForbiddenException) return res.status(401).json({ code: -1, message: error.message });
        throw error;
      }
    }
    if (version) return this.handleFilesDataFileRequest(filename, res, req, false, version, warmup === '1' || warmup === 'true');
    return this.mxcadFileHandler.serveFile(filename, res);
  }

  @Head('filesData/*path')
  @ApiResponse({ status: 200, description: '成功获取文件信息' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  @ApiQuery({ name: 'v', required: false, description: '历史版本号' })
  @ApiQuery({ name: 'shareToken', required: false, description: '分享访问令牌' })
  async getFilesDataFileHead(
    @Res() res: Response,
    @Req() req: Request,
    @Param('path') path: string,
    @Query('v') version?: string,
    @Query('shareToken') shareToken?: string
  ) {
    const filename = this.extractPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    if (shareToken) {
      try { await this.authorizeFilesDataAccess(filename, req); } catch { return res.status(401).json({ code: -1, message: I18nContext.current()?.t('error.file.no_access') ?? '没有文件访问权限' }); }
    }
    if (version) return this.handleFilesDataFileRequest(filename, res, req, true, version);
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
    let userId: string | undefined;
    try {
      userId = await this.externalRefFacade.validateTokenAndGetUserId(req);
      const node = await this.fileSystemNodeService.findFileByIdNotDeleted(nodeId, { id: true, name: true, ownerId: true, parentId: true, nodeType: true });
      if (node) {
        const permission = await this.externalRefFacade.checkFileAccessPermission(node.id, userId, userId);
        if (!permission) return res.status(401).json({ code: -1, message: 'Unauthorized' });
      }
    } catch (authError) {
      return res.status(401).json({ code: -1, message: authError.message });
    }

    const ext = path.extname(fileName).toLowerCase();
    const isImageFile = ['.png', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.bmp'].includes(ext);
    const downloadFormat = format || 'mxweb';

    const filePath = await this.externalRefFacade.getExternalRefDownloadPath(nodeId, fileName);
    if (!filePath) {
      return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
    }

    if (downloadFormat === 'mxweb' || isImageFile) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      const readStream = createReadStream(filePath);
      readStream.pipe(res);
      return;
    }

    // 频率占位（打开/导出共用窗口）；导出下载方向会员门控由转换服务按源文件类型自动执行
    if (userId) {
      await this.restrictionEngine.reserveConversionCountOrThrow(userId);
    }

    const srcPath = filePath;
    const outDir = path.dirname(filePath);
    const baseName = path.basename(fileName, ext);
    const outName = `${baseName}.${downloadFormat}`;
    const outPath = path.join(outDir, outName);

    let convertResult: MxCadConversionResult | undefined;
    try {
      convertResult = await this.conversionService.convertServerFile({
        srcPath,
        fileHash: '',
        nodeId,
        userId,
        createPreloadingData: false,
        outname: outName,
        cmd: downloadFormat === 'pdf' ? 'toPdf' : 'toDwg',
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        colorPolicy: colorPolicy as 'mono' | 'color' | undefined,
        dwgVersion: dwgVersion ? Number(dwgVersion) : undefined,
      });
    } catch (error) {
      if (userId) {
        await this.restrictionEngine.releaseConversionCount(userId);
      }
      throw error;
    }

    if (convertResult?.code !== 0) {
      if (userId) {
        await this.restrictionEngine.releaseConversionCount(userId);
      }
      throw new InternalServerErrorException(I18nContext.current()?.t('error.mxcad.conversion_failed') ?? '文件转换失败');
    }

    try {
      await fsPromises.access(outPath);
    } catch {
      if (userId) {
        await this.restrictionEngine.releaseConversionCount(userId);
      }
      throw new InternalServerErrorException(I18nContext.current()?.t('error.mxcad.conversion_output_not_found') ?? '转换输出文件不存在');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);
    const readStream = createReadStream(outPath);
    readStream.pipe(res);

    readStream.on('end', () => {
      fsPromises.unlink(outPath).catch((err) => {
        this.logger.warn(`清理转换临时文件失败: ${err.message}`);
      });
    });
    readStream.on('error', () => {
      fsPromises.unlink(outPath).catch(() => {});
    });
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
    const filePath = await this.externalRefFacade.getExternalRefDownloadPath(nodeId, fileName);
    if (!filePath) {
      return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.mxweb': 'application/octet-stream', '.dwg': 'application/dwg', '.dxf': 'application/dxf',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    try {
      const fileStats = fs.statSync(filePath);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileStats.size);
      // 显示逻辑文件名（A1.dwg），而非磁盘文件名（A1.dwg.mxweb）
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      // 外部参照可被替换，URL 不变但内容会变，禁止浏览器 HTTP 缓存，否则替换后查看仍显示旧图
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const readStream = createReadStream(filePath);
      readStream.pipe(res);
    } catch (error) {
      this.logger.error(`[viewExternalRef] 文件读取失败: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
      }
    }
  }

  @Get('file/*path')
  @ApiResponse({ status: 200, description: '成功获取文件' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getFile(
    @Res() res: Response,
    @Req() req: MxCadRequest,
    @Param('path') path: string
  ) {
    const filename = this.extractPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    return this.handleFileRequest(filename, res, req, false);
  }

  @Head('file/*path')
  @ApiResponse({ status: 200, description: '成功获取文件信息' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getFileHead(
    @Res() res: Response,
    @Req() req: MxCadRequest,
    @Param('path') path: string
  ) {
    const filename = this.extractPath(path);
    if (!filename) return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
    return this.handleFileRequest(filename, res, req, true);
  }

  @Get('files/:storageKey')
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '成功获取文件' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getNonCadFile(@Param('storageKey') storageKey: string, @Res() res: Response) {
    try {
      if (!storageKey || storageKey.includes('..') || storageKey.includes('\\')) {
        return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
      }
      let actualStorageKey = storageKey;
      if (storageKey.startsWith('files/')) {
        try {
          const node = await this.fileSystemNodeService.findByPath(storageKey);
          if (node) {
            const extension = node.extension?.toLowerCase() || '';
            actualStorageKey = `mxcad/file/${node.id}${extension}`;
          }
        } catch (queryError) {
          this.logger.warn(`[getNonCadFile] 查询节点失败: ${queryError.message}`);
        }
      }
      const fileStream = await this.storageService.getFileStream(actualStorageKey);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(actualStorageKey)}"`);
      fileStream.pipe(res);
    } catch (error) {
      this.logger.error(`[getNonCadFile] 获取文件失败: ${error.message}`);
      if (!res.headersSent) res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
    }
  }

  private async authorizeFilesDataAccess(filename: string, req: Request): Promise<void> {
    const normalizedFilename = filename.replace(/,/g, '/');
    const shareToken = (req.query.shareToken as string | undefined)
      || (req.headers['x-share-token'] as string | undefined)
      || this.extractShareTokenFromReferer(req);
    if (shareToken) { await this.shareService.validateShareFileAccess(shareToken, normalizedFilename); return; }
    const userId = (req as any).user?.id;
    if (!userId) throw new UnauthorizedException(I18nContext.current()?.t('error.auth.login_required') ?? '请先登录');

    // 路径格式: YYYYMM/{nodeId}/... 从路径提取 nodeId 校验节点权限
    const parts = normalizedFilename.split('/');
    const nodeId = parts.length >= 2 ? parts[1] : null;
    if (!nodeId) throw new NotFoundException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');

    const node = await this.fileSystemNodeService.findById(nodeId);
    if (!node) throw new NotFoundException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');

    const hasAccess = await this.permissionService.getNodeAccessRole(userId, node.id);
    if (!hasAccess) throw new UnauthorizedException(I18nContext.current()?.t('error.file.no_access') ?? '没有文件访问权限');
  }

  /**
   * 从 referer header 中提取 shareToken（WASM 引擎外部参照请求 fallback）
   * WASM 层的 HTTP 请求可能无法正确传递自定义 header 或 URL 参数，
   * 但浏览器会自动携带 referer，其中包含原始页面的 query 参数
   */
  private extractShareTokenFromReferer(req: Request): string | undefined {
    const referer = req.headers.referer as string | undefined;
    if (!referer) return undefined;
    try {
      const url = new URL(referer);
      return url.searchParams.get('shareToken') || undefined;
    } catch {
      return undefined;
    }
  }

  private async handleFilesDataFileRequest(filename: string, res: Response, req: Request, isHeadRequest: boolean, versionParam?: string, isWarmup = false) {
    try {
      const normalizedFilename = filename.replace(/,/g, '/');
      if (versionParam) return this.versionHistoryService.handleHistoricalVersionRequest(normalizedFilename, versionParam, res, req, isHeadRequest, isWarmup);
      const filesDataPath = this.configService.get('filesDataPath', { infer: true });
      const absoluteFilePath = path.resolve(filesDataPath, normalizedFilename);
      if (!fs.existsSync(absoluteFilePath)) return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
      const fileStats = fs.statSync(absoluteFilePath);
      const contentType = this.getContentType(absoluteFilePath);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileStats.size);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (isHeadRequest) { res.end(); return; }
      const fileStream = fs.createReadStream(absoluteFilePath);
      fileStream.on('error', (error) => {
        this.logger.error(`文件流错误: ${error.message}`, error);
        if (!res.headersSent) res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
      });
      fileStream.pipe(res);
    } catch (error) {
      this.logger.error(`获取 filesData 文件失败: ${error.message}`, error);
      if (!res.headersSent) res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
    }
  }

  private async handleFileRequest(filename: string, res: Response, req: MxCadRequest, isHeadRequest: boolean) {
    try {
      let userId: string;
      if (req.session?.userId) { userId = req.session.userId; } else {
        try { userId = await this.externalRefFacade.validateTokenAndGetUserId(req); } catch (authError) { return res.status(401).json({ code: -1, message: authError.message }); }
      }
      const normalizedFilename = filename.replace(/,/g, '/');
      const pathParts = normalizedFilename.split('/');
      const nodeId = pathParts[0];
      const node = await this.fileSystemNodeService.findFileByIdNotDeleted(nodeId, { id: true, name: true, ownerId: true, parentId: true, nodeType: true });
      if (node) {
        const permission = await this.externalRefFacade.checkFileAccessPermission(node.id, userId, userId);
        if (!permission) return res.status(401).json({ code: -1, message: 'Unauthorized' });
      }
      const ext = path.extname(normalizedFilename).toLowerCase();
      const possiblePaths: string[] = [];
      if (ext === this.mxCadFileExt) possiblePaths.push(`mxcad/file/${normalizedFilename}`);
      else if (ext === '.jpg') possiblePaths.push(`mxcad/file/${normalizedFilename}`);
      else if (ext === '.json') { possiblePaths.push(`mxcad/file/${normalizedFilename}`); possiblePaths.push(normalizedFilename); }
      else { possiblePaths.push(`mxcad/file/${normalizedFilename}`); possiblePaths.push(normalizedFilename); }
      let foundStoragePath: string | null = null;
      for (const mxcadPath of possiblePaths) {
        try {
          if (await this.storageService.fileExists(mxcadPath)) {
            foundStoragePath = mxcadPath;
            break;
          }
        } catch {
          // 单个候选路径探测失败时忽略，继续尝试其他路径
        }
      }
      if (foundStoragePath) {
        if (isHeadRequest) {
          try {
            const fileInfo = await this.storageService.getFileInfo(foundStoragePath);
            if (fileInfo) {
              res.setHeader('Content-Type', fileInfo.contentType);
              res.setHeader('Content-Length', fileInfo.contentLength);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(); return;
            }
          } catch (error) { this.logger.error(`获取存储文件信息失败: ${error.message}`, error); throw error; }
        } else {
          try {
            const fileStream = await this.storageService.getFileStream(foundStoragePath);
            const fileInfo = await this.storageService.getFileInfo(foundStoragePath);
            if (fileInfo) {
              res.setHeader('Content-Type', fileInfo.contentType);
              res.setHeader('Content-Length', fileInfo.contentLength);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.setHeader('Access-Control-Allow-Origin', '*');
            }
            fileStream.on('error', (error) => {
              this.logger.error(`文件流错误: ${error.message}`, error);
              if (!res.headersSent) res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.file_stream_error') ?? '文件流错误' });
            });
            fileStream.pipe(res); return;
          } catch (error) { this.logger.error(`获取存储文件流失败: ${error.message}`, error); throw error; }
        }
      }
      return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
    } catch (error) {
      this.logger.error(`访问文件失败: ${error.message}`, error);
      if (!res.headersSent) res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.access_failed') ?? '访问文件失败' });
    }
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mxweb': 'application/octet-stream', '.dwg': 'application/dwg', '.dxf': 'application/dxf',
      '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 还原 Express 通配符路径参数为「/」分隔的 filesData 路径。
   *
   * 不同 Express/环境对 `*path` 通配符的注入形态不一：可能为字符串数组
   * （Array → join('/')），也可能为数组被内部 toString() 成的逗号字符串
   * （"YYYYMM,nodeId,file.mxweb"）。统一在此还原为斜杠路径，
   * 与 authorizeFilesDataAccess / handleFilesDataFileRequest 的
   * `replace(/,/g, '/')` 保持一致，避免 seek 到带逗号的路径导致 404。
   */
  private extractPath(params: unknown): string {
    const pathArray = params as string | string[];
    const joined = Array.isArray(pathArray)
      ? pathArray.join('/')
      : (pathArray || '').replace(/,/g, '/');
    return joined.replace(/,/g, '/');
  }
}
