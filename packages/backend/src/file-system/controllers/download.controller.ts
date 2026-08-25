import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Options,
  Param,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { LibraryPublicAccess } from '../../common/decorators/library-public.decorator';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { FileTreeService } from '../file-tree/file-tree.service';
import { FileDownloadHandlerService } from '../file-download/file-download-handler.service';
import { FileDownloadExportService } from '../file-download/file-download-export.service';
import {
  CadDownloadFormat,
  type DownloadNodeQueryDto,
} from '../dto/download-node.dto';
import { NodeType } from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import {
  findThumbnailSync,
  getDefaultThumbnailFileName,
} from '../../mxcad/infra/thumbnail-utils';

@Controller('file-system')
@UseGuards(RequireProjectPermissionGuard, PermissionsGuard)
@ApiTags('文件系统 - 下载')
@ApiBearerAuth()
export class DownloadController {
  private readonly logger = new Logger(DownloadController.name);

  private readonly DEFAULT_THUMBNAILS_DIR = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'default-thumbnails'
  );

  constructor(
    private readonly fileTreeService: FileTreeService,
    private readonly fileDownloadHandler: FileDownloadHandlerService,
    private readonly fileDownloadExportService: FileDownloadExportService
  ) {}

  @Get('nodes/:nodeId/thumbnail')
  @OptionalAuth()
  @LibraryPublicAccess()
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取文件节点缩略图' })
  @ApiProduces('image/*')
  @ApiResponse({ status: 200, description: '获取缩略图成功' })
  @ApiResponse({ status: 204, description: '缩略图不存在' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限访问该文件' })
  @ApiResponse({ status: 404, description: '文件节点不存在' })
  async getThumbnail(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId = (req.user as { id?: string })?.id;

    let node: any;
    try {
      node = await this.fileTreeService.getNodeIgnoreDeleted(nodeId);
    } catch {
      return this.sendDefaultFallback(res, req);
    }

    // 未登录用户（<img> 请求无法携带 Authorization 头，仅靠 cookie token 认证）：
    // 不泄露项目文件缩略图，降级返回与扩展名匹配的默认图
    if (!userId) {
      return this.sendDefaultFallback(res, req, node);
    }

    if (node.nodeType !== NodeType.FILE || !node.path) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file_extra.file_node_not_exist') ??
          '文件节点不存在'
      );
    }

    const nodeFullPath = this.fileDownloadExportService.getFullPath(node.path);
    const nodeDir = path.dirname(nodeFullPath);
    const thumbnail = findThumbnailSync(nodeDir);

    if (!thumbnail) {
      const ext = node.extension || path.extname(node.name || '').toLowerCase();
      const defaultFile = getDefaultThumbnailFileName(ext);
      const defaultPath = path.join(this.DEFAULT_THUMBNAILS_DIR, defaultFile);

      if (fs.existsSync(defaultPath)) {
        const stats = fs.statSync(defaultPath);
        const etag = `"${stats.mtimeMs}-${stats.size}"`;

        res.setHeader('Last-Modified', stats.mtime.toUTCString());

        if (req.headers['if-none-match'] === etag) {
          res.setHeader('ETag', etag);
          res.setHeader('Cache-Control', 'no-cache');
          return res.status(304).end();
        }

        const fileStream = fs.createReadStream(defaultPath);
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', stats.mtime.toUTCString());
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Length', stats.size.toString());
        res.setHeader('Cache-Control', 'no-cache');
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
          this.logger.error(
            `读取默认缩略图失败: ${error.message}`,
            error.stack
          );
          if (!res.headersSent) {
            res.status(500).json({ message: '读取默认缩略图失败' });
          }
        });
        return;
      }
      return res.status(204).end();
    }

    const thumbnailPath = thumbnail.path;

    const stats = fs.statSync(thumbnailPath);
    if (stats.isDirectory()) {
      this.logger.warn(`缩略图路径是目录而非文件: ${thumbnailPath}`);
      return res.status(204).end();
    }

    const etag = `"${stats.mtimeMs}-${stats.size}"`;

    res.setHeader('Last-Modified', stats.mtime.toUTCString());

    if (req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(304).end();
    }

    const fileStream = fs.createReadStream(thumbnailPath);

    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    res.setHeader('Content-Type', thumbnail.mimeType);
    res.setHeader('Content-Length', stats.size.toString());
    res.setHeader('Cache-Control', 'no-cache');

    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      this.logger.error(`读取缩略图失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        res.status(500).json({
          message:
            I18nContext.current()?.t(
              'error.file_extra_v2.read_thumbnail_failed'
            ) ?? '读取缩略图失败',
        });
      }
    });
  }

  private sendDefaultFallback(res: Response, req?: ExpressRequest, node?: any) {
    const ext = node?.extension || path.extname(node?.name || '').toLowerCase();
    const defaultFile = getDefaultThumbnailFileName(ext);
    const defaultPath = path.join(this.DEFAULT_THUMBNAILS_DIR, defaultFile);
    if (fs.existsSync(defaultPath)) {
      const stats = fs.statSync(defaultPath);
      const etag = `"${stats.mtimeMs}-${stats.size}"`;

      res.setHeader('Last-Modified', stats.mtime.toUTCString());

      if (req?.headers['if-none-match'] === etag) {
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(304).end();
      }

      const fileStream = fs.createReadStream(defaultPath);
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', stats.mtime.toUTCString());
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', stats.size.toString());
      res.setHeader('Cache-Control', 'no-cache');
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        this.logger.error(`读取默认缩略图失败: ${error.message}`, error.stack);
        if (!res.headersSent) {
          res.status(500).json({ message: '读取默认缩略图失败' });
        }
      });
      return;
    }
    return res.status(204).end();
  }

  @Options('nodes/:nodeId/download')
  @ApiOperation({ summary: '下载接口 OPTIONS 预检' })
  async downloadNodeOptions(
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
  }

  @Get('nodes/:nodeId/download')
  @ApiOperation({ summary: '下载节点（文件或目录）' })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: '下载成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限访问该节点' })
  @ApiResponse({ status: 404, description: '节点不存在' })
  @RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)
  async downloadNode(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId = (req.user as { id: string }).id;
    const clientIp = req.ip || req.connection.remoteAddress;

    await this.fileDownloadHandler.handleDownload(nodeId, userId, res, {
      clientIp,
    });
  }

  @Get('nodes/:nodeId/download-with-format')
  @ApiOperation({
    summary: '下载节点（支持多格式转换）',
    description:
      '支持下载 CAD 文件的多种格式：DWG、MXWEB、PDF。对于 PDF 格式，可以自定义宽度、高度和颜色策略。',
  })
  @ApiProduces('application/octet-stream')
  @ApiQuery({ name: 'format', required: false })
  @ApiQuery({ name: 'width', required: false })
  @ApiQuery({ name: 'height', required: false })
  @ApiQuery({ name: 'colorPolicy', required: false })
  @ApiQuery({ name: 'dwgVersion', required: false })
  @ApiResponse({ status: 200, description: '下载成功' })
  @ApiResponse({ status: 400, description: '参数错误或转换失败' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权访问该节点' })
  @ApiResponse({ status: 404, description: '节点不存在或文件不存在' })
  @RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)
  async downloadNodeWithFormat(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
    @Query() query: DownloadNodeQueryDto
  ) {
    const userId =
      (req.user as { id?: string })?.id ||
      (req.session as { userId?: string })?.userId;
    const clientIp =
      req.ip || (req.connection as { remoteAddress?: string })?.remoteAddress;

    if (!userId) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth_extra.user_not_logged_in') ??
          '未登录'
      );
    }

    try {
      const format = query.format || CadDownloadFormat.MXWEB;

      const pdfParams =
        format === CadDownloadFormat.PDF
          ? {
              width: query.width || '2000',
              height: query.height || '2000',
              colorPolicy: query.colorPolicy || 'mono',
            }
          : (format === CadDownloadFormat.DWG ||
                format === CadDownloadFormat.DXF) &&
              query.dwgVersion
            ? { dwgVersion: query.dwgVersion }
            : undefined;

      const { stream, filename, mimeType, cacheKey } =
        await this.fileDownloadExportService.downloadNodeWithFormat(
          nodeId,
          userId,
          format,
          pdfParams
        );

      const origin = req.headers.origin || '*';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );

      this.logger.log(`[下载] CORS 头已设置: ${origin}`);

      res.setHeader('Content-Type', mimeType);

      const encodedFilename = encodeURIComponent(filename);
      const fallbackFilename = filename.replace(/[^\x20-\x7E]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
      );

      const node = await this.fileTreeService.getNode(nodeId);
      if (
        node &&
        node.nodeType === NodeType.FILE &&
        (node.fileHash || node.id)
      ) {
        // ETag 基于节点更新时间（fileHash 在编辑器保存时不变化，会导致 304 脏读）+
        // 格式参数（cacheKey 已编码 pdf 尺寸/颜色、dwg 版本），节点更新后 ETag 必然变化
        const updatedAtMs = node.updatedAt ? node.updatedAt.getTime() : 0;
        const etag = `"${node.id}_${updatedAtMs}_${cacheKey ?? format}"`;
        res.setHeader('ETag', etag);

        if (req.headers['if-none-match'] === etag) {
          if (
            stream &&
            typeof (stream as NodeJS.ReadableStream & { destroy?: () => void })
              .destroy === 'function'
          ) {
            (
              stream as NodeJS.ReadableStream & { destroy: () => void }
            ).destroy();
          }
          return res.status(304).end();
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }

      this.logger.log(
        `多格式下载开始: ${filename} (格式: ${format}) (${nodeId}) by user ${userId} from IP ${clientIp}`
      );

      stream.pipe(res);

      stream.on('error', (error) => {
        this.logger.error(`文件流传输错误: ${error.message}`, error.stack);

        if (
          stream &&
          typeof (stream as NodeJS.ReadableStream & { destroy?: () => void })
            .destroy === 'function'
        ) {
          (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
        }

        if (!res.headersSent) {
          res.status(500).json({
            message:
              I18nContext.current()?.t('error.file.download_failed') ??
              '文件下载失败',
          });
        } else if (!res.writableEnded) {
          res.end();
        }
      });

      stream.on('finish', () => {
        this.logger.log(
          `多格式下载完成: ${filename} (格式: ${format}) (${nodeId}) by user ${userId}`
        );
      });
    } catch (error) {
      this.logger.error(
        `多格式下载失败: ${nodeId} by user ${userId} - ${error.message}`,
        error.stack
      );

      if (!res.headersSent) {
        const status =
          error instanceof NotFoundException
            ? 404
            : error instanceof ForbiddenException
              ? 403
              : error instanceof BadRequestException
                ? 400
                : 500;
        res.status(status).json({
          message: error.message || '文件下载失败',
        });
      }
    }
  }
}
