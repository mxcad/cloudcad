///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable, Logger, Inject,
  NotFoundException, UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { FileTypeDetector } from '@cloudcad/contracts';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { AppConfig } from '../../config/app.config';
import { MxcadVersionHistoryService } from '../core/mxcad-version-history.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { ShareService } from '../../share/share.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { I_EXTERNAL_REF_FACADE, IExternalRefFacade } from '../external-ref/interfaces/ext-ref-facade.interface';
import { MXCAD_CONVERSION_SERVICE } from '../interfaces/mxcad-service-tokens';
import type { IMxcadConversionService } from '../interfaces/mxcad-conversion.interface';
import type { MxCadRequest } from '../types/request.types';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { NodeUtils } from '../../common/utils/node-utils';
import { streamFileToResponse } from '../../common/utils/stream-file';
import { FileUtils } from '../../common/utils/file-utils';
import { normalizeMxcadPath } from '../../common/utils/mxcad-path';
import { MxCadRequestAuthService } from '../core/mxcad-request-auth.service';
import { setContentDisposition } from '../../common/utils/content-disposition';
import { resolveOutputFormat } from '../../file-system/file-download/format-policy';

/**
 * MxCAD 文件访问业务逻辑（从 MxcadFileAccessController 下沉）。
 *
 * 控制器只做路由委托（参数解析、守卫、Swagger），鉴权判定 / 节点权限 /
 * 转换编排 / 存储取流 / 流式响应等业务逻辑统一在本服务。
 * 方法直接写 Express Response（与 MxcadFileHandlerService.serveFile 同模式）。
 */
@Injectable()
export class MxcadFileAccessService {
  private readonly logger = new Logger(MxcadFileAccessService.name);
  private readonly mxCadFileExt: string;

  constructor(
    private readonly versionHistoryService: MxcadVersionHistoryService,
    private readonly configService: ConfigService<AppConfig>,
    @Inject(IStorageService) private readonly storageService: IStorageService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly shareService: ShareService,
    @Inject(MXCAD_CONVERSION_SERVICE) private readonly conversionService: IMxcadConversionService,
    @Inject(I_EXTERNAL_REF_FACADE) private readonly externalRefFacade: IExternalRefFacade,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly requestAuthService: MxCadRequestAuthService,
  ) {
    this.mxCadFileExt = this.configService.get('mxcad.fileExt', { infer: true }) || '.mxweb';
  }

  /**
   * filesData 鉴权：shareToken 走分享鉴权，否则按路径提取 nodeId 校验节点访问角色。
   * 失败抛 NotFoundException / UnauthorizedException，由控制器映射为 404 / 401。
   */
  async authorizeFilesDataAccess(filename: string, req: Request): Promise<void> {
    const normalizedFilename = normalizeMxcadPath(filename);
    const shareToken = (req.query.shareToken as string | undefined)
      || (req.headers['x-share-token'] as string | undefined)
      || this.extractShareTokenFromReferer(req);
    if (shareToken) { await this.shareService.validateShareFileAccess(shareToken, normalizedFilename); return; }
    const userId = (req as Request & { user?: { id?: string } }).user?.id;
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

  /**
   * filesData 历史版本 / 当前文件取流（GET/HEAD 共用）。
   * 有版本号走 versionHistoryService，否则直读 filesDataPath。
   */
  async serveFilesDataFile(filename: string, res: Response, req: Request, isHeadRequest: boolean, versionParam?: string, isWarmup = false) {
    try {
      const normalizedFilename = normalizeMxcadPath(filename);
      if (versionParam) return this.versionHistoryService.handleHistoricalVersionRequest(normalizedFilename, versionParam, res, req, isHeadRequest, isWarmup);
      const filesDataPath = this.configService.get('filesDataPath', { infer: true });
      // 路径遍历防护：解析结果必须仍位于 filesDataPath 内，逃逸抛 BadRequestException（catch 归 400）
      const absoluteFilePath = FileUtils.resolveWithinRoot(filesDataPath, normalizedFilename);
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
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number; statusCode?: number };
      this.logger.error(`获取 filesData 文件失败: ${err?.message}`, error);
      if (!res.headersSent) {
        // 遍历逃逸（BadRequestException）保留 400，其余归 500
        const status = err?.status || err?.statusCode || 500;
        res.status(status).json({
          code: -1,
          message:
            status === 400
              ? I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径'
              : I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败',
        });
      }
    }
  }

  /**
   * file/*path 外参取数：会话或 token 解析用户 → 节点存活 + 权限 fail-closed →
   * 存储候选路径探测 → HEAD 元信息 / GET 取流。
   */
  async serveNodeFile(filename: string, res: Response, req: MxCadRequest, isHeadRequest: boolean) {
    try {
      let userId: string;
      if (req.session?.userId) { userId = req.session.userId; } else {
        try { userId = await this.requestAuthService.resolveUserId(req); } catch (authError) { return res.status(401).json({ code: -1, message: authError.message }); }
      }
      const normalizedFilename = normalizeMxcadPath(filename);
      const pathParts = normalizedFilename.split('/');
      const nodeId = pathParts[0];
      const node = await this.fileSystemNodeService.findFileByIdNotDeleted(nodeId, { id: true, name: true, ownerId: true, parentId: true, nodeType: true });
      // fail-closed：节点查不到/已删除/非 FILE 一律 404。此前 node 查不到会跳过
      // 权限检查直接落存储，任何登录用户知道已删文件的 nodeId 仍可读取磁盘文件
      // （IDOR，与 folder-expander 同类）。合法外参文件必有存活 FILE 节点，不受影响。
      if (!node) {
        return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
      }
      const permission = await this.requestAuthService.canAccessNode(userId, node.id);
      if (!permission) return res.status(401).json({ code: -1, message: 'Unauthorized' });
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

  /**
   * 外部参照下载：mxweb/图片直取源文件；其余格式走转换（会员频控占位 + 失败归还）
   * 后流式返回产物并清理临时文件。
   */
  async serveExternalRefDownload(
    nodeId: string,
    fileName: string,
    params: {
      format?: string;
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: string;
    },
    res: Response,
    req: MxCadRequest,
  ) {
    const { format, width, height, colorPolicy, dwgVersion } = params;
    let userId: string | undefined;
    try {
      userId = await this.requestAuthService.resolveUserId(req);
      const node = await this.fileSystemNodeService.findFileByIdNotDeleted(nodeId, { id: true, name: true, ownerId: true, parentId: true, nodeType: true });
      if (node) {
        const permission = await this.requestAuthService.canAccessNode(userId, node.id);
        if (!permission) return res.status(401).json({ code: -1, message: 'Unauthorized' });
      }
    } catch (authError) {
      return res.status(401).json({ code: -1, message: authError.message });
    }

    const ext = path.extname(fileName).toLowerCase();
    const isImageFile = FileTypeDetector.isImageFile(fileName);
    const downloadFormat = format || 'mxweb';

    const filePath = await this.externalRefFacade.getExternalRefDownloadPath(nodeId, fileName);
    if (!filePath) {
      return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
    }

    if (downloadFormat === 'mxweb' || isImageFile) {
      // 传输编排回归 streamFileToResponse 唯一出口（顺带补上原裸 pipe 缺失的流错误处理）
      void streamFileToResponse(res, filePath, fileName, 'application/octet-stream').catch(
        (err: unknown) => {
          this.logger.error(`[serveExternalRefDownload] 文件读取失败: ${(err as Error).message}`);
          if (!res.headersSent) {
            res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
          }
        }
      );
      return;
    }

    const srcPath = filePath;
    const outDir = path.dirname(filePath);
    const baseName = path.basename(fileName, ext);
    // 格式决策（引擎参数默认值 / 产物扩展名 / 格式白名单）走 FormatPolicy 单一出口，
    // 与单文件导出/批量下载同口径：pdf 补齐 2000/2000/mono，未知格式显式 400。
    const resolved = resolveOutputFormat(downloadFormat, {
      width,
      height,
      colorPolicy,
      dwgVersion: dwgVersion ? Number(dwgVersion) : undefined,
    });
    const outName = `${baseName}${resolved.targetExt}`;
    const outPath = path.join(outDir, outName);

    // 频率占位（打开/导出共用窗口）；导出下载方向会员门控由转换服务按源文件类型自动执行。
    // 占位/释放走 withConversionQuota 单点：成功消耗占位，任何失败（引擎原始异常 /
    // 引擎 code≠0 / 产物缺失）保证释放；校验与错误文案在占位作用域内完成。
    // 注：外部参照源为 .dwg/.dxf（非 .mxweb 快照），产物不进转换结果缓存，
    // 故此处保留直调 convertServerFile + cmd，未走 runConversionCore
    // （其 engineParams 已含 cmd，类型层不再构成阻碍）——待产物进缓存后再收敛。
    await this.restrictionEngine.withConversionQuota(
      { userId },
      async () => {
        const convertResult = await this.conversionService.convertServerFile({
          srcPath,
          fileHash: '',
          nodeId,
          userId,
          createPreloadingData: false,
          outname: outName,
          cmd: downloadFormat === 'pdf' ? 'toPdf' : 'toDwg',
          ...resolved.engineParams,
        });
        if (convertResult?.code !== 0) {
          throw new InternalServerErrorException(I18nContext.current()?.t('error.mxcad.conversion_failed') ?? '文件转换失败');
        }
        try {
          await fsPromises.access(outPath);
        } catch {
          throw new InternalServerErrorException(I18nContext.current()?.t('error.mxcad.conversion_output_not_found') ?? '转换输出文件不存在');
        }
      }
    );

    // 传输编排回归 streamFileToResponse 唯一出口：流关闭后清理转换临时产物
    void streamFileToResponse(
      res,
      outPath,
      outName,
      'application/octet-stream',
      () => {
        fsPromises.unlink(outPath).catch((err) => {
          this.logger.warn(`清理转换临时文件失败: ${err.message}`);
        });
      }
    ).catch((err: unknown) => {
      this.logger.error(`[serveExternalRefDownload] 文件读取失败: ${(err as Error).message}`);
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
      }
    });
  }

  /**
   * 外部参照查看（图片/mxweb 图纸）：解析路径 → MIME/元信息 → 禁缓存流式返回。
   */
  async serveExternalRefView(nodeId: string, fileName: string, res: Response) {
    const filePath = await this.externalRefFacade.getExternalRefDownloadPath(nodeId, fileName);
    if (!filePath) {
      return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
    }

    const ext = path.extname(filePath).toLowerCase();
    // MIME 单一事实源走 NodeUtils（与 getContentType 同源）
    const contentType = NodeUtils.getMimeType(ext);

    // 传输编排回归 streamFileToResponse 唯一出口：显示逻辑文件名（A1.dwg，而非磁盘
    // A1.dwg.mxweb）+ 禁缓存（外部参照可被替换，URL 不变内容会变）+ 跨域 + inline
    void streamFileToResponse(
      res,
      filePath,
      fileName,
      contentType,
      undefined,
      {
        cacheControl: 'no-store',
        allowOrigin: '*',
        disposition: 'inline',
        errorCode: -1,
        errorMessage:
          I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败',
      }
    ).catch((error: unknown) => {
      this.logger.error(`[serveExternalRefView] 文件读取失败: ${(error as Error).message}`);
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
      }
    });
  }

  /**
   * 非 CAD 文件取数（files/:storageKey）：storageKey 必须解析到存活节点且用户
   * 有访问角色才 serve（fail-closed，防根目录裸读 IDOR）。
   */
  async serveNonCadFile(storageKey: string, res: Response, req: MxCadRequest) {
    try {
      if (!storageKey || storageKey.includes('..') || storageKey.includes('\\')) {
        return res.status(400).json({ code: -1, message: I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径' });
      }
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ code: -1, message: I18nContext.current()?.t('error.auth.login_required') ?? '请先登录' });
      }
      let node: any = null;
      if (storageKey.startsWith('files/')) {
        try {
          node = await this.fileSystemNodeService.findByPath(storageKey);
        } catch (queryError) {
          this.logger.warn(`[serveNonCadFile] 查询节点失败: ${queryError.message}`);
        }
      }
      // fail-closed：storageKey 必须解析到存活节点且用户有访问权限才 serve。
      // 此前未解析到节点时直接 getFileStream(storageKey) 直读 filesDataPath 根目录
      // 任意文件且零权限检查（IDOR，与 folder-expander 同类）——任何登录用户可读。
      if (!node) {
        return res.status(404).json({ code: -1, message: I18nContext.current()?.t('error.file.not_found') ?? '文件不存在' });
      }
      const hasAccess = await this.permissionService.getNodeAccessRole(userId, node.id);
      if (!hasAccess) {
        return res.status(401).json({ code: -1, message: I18nContext.current()?.t('error.file.no_access') ?? '没有文件访问权限' });
      }
      const extension = node.extension?.toLowerCase() || '';
      const actualStorageKey = `mxcad/file/${node.id}${extension}`;
      const fileStream = await this.storageService.getFileStream(actualStorageKey);
      res.setHeader('Content-Type', 'application/octet-stream');
      setContentDisposition(res, path.basename(actualStorageKey), 'inline');
      fileStream.pipe(res);
    } catch (error) {
      this.logger.error(`[serveNonCadFile] 获取文件失败: ${error.message}`);
      if (!res.headersSent) res.status(500).json({ code: -1, message: I18nContext.current()?.t('error.file.fetch_failed') ?? '获取文件失败' });
    }
  }

  // MIME 单一事实源走 NodeUtils（此前本控制器 + version-history + file-handler 各一份，
  // .dwg 值在 application/dwg 与 application/acad 间漂移）
  private getContentType(filePath: string): string {
    return NodeUtils.getMimeType(path.extname(filePath));
  }
}
