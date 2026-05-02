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
  Param,
  Query,
  Request,
  UseGuards,
  Logger,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LibraryService } from './library.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { FileSystemService } from '../file-system/file-system.service';
import { FileDownloadHandlerService } from '../file-system/file-download/file-download-handler.service';
import { MxcadFileHandlerService } from '../mxcad/core/mxcad-file-handler.service';
import { QueryChildrenDto } from '../file-system/dto/query-children.dto';
import {
  FileSystemNodeDto,
  NodeListResponseDto,
} from '../file-system/dto/file-system-response.dto';
import { FileContentResponseDto } from '../version-control/dto/file-content-response.dto';
import { StorageQuotaInterceptor } from '../common/interceptors/storage-quota.interceptor';

/**
 * 公共资源库控制器（仅保留只读接口）
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目，不是某个人的资源库
 * - 读操作：公开访问（无需登录）
 * - 写操作：已废弃，统一走文件管理模块
 * - 无版本管理、无回收站（删除即永久删除）
 */
@ApiTags('library', '公共资源库')
@Controller('v1/library')
@UseInterceptors(StorageQuotaInterceptor)
export class LibraryController {
  private readonly logger = new Logger(LibraryController.name);

  constructor(
    private readonly libraryService: LibraryService,
    private readonly fileSystemService: FileSystemService,
    private readonly fileDownloadHandler: FileDownloadHandlerService,
    private readonly mxcadFileHandler: MxcadFileHandlerService
  ) {}

  // ========== 图纸库接口（只读） ==========

  /**
   * 获取图纸库详情
   */
  @Get('drawing')
  @Public()
  @ApiOperation({ summary: '获取图纸库详情' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: FileSystemNodeDto,
  })
  async getDrawingLibrary() {
    return this.libraryService.getLibrary('drawing');
  }

  /**
   * 获取图纸库子节点列表
   */
  @Get('drawing/children/:nodeId')
  @Public()
  @ApiOperation({ summary: '获取图纸库子节点列表' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: NodeListResponseDto,
  })
  async getDrawingChildren(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    const actualNodeId =
      nodeId === 'root'
        ? await this.libraryService.getLibraryId('drawing')
        : nodeId;
    return this.fileSystemService.getChildren(actualNodeId, mockUserId, query);
  }

  /**
   * 递归获取图纸库节点下的所有文件（包括子目录）
   */
  @Get('drawing/all-files/:nodeId')
  @Public()
  @ApiOperation({ summary: '递归获取图纸库节点下的所有文件' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: NodeListResponseDto,
  })
  async getDrawingAllFiles(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    const actualNodeId =
      nodeId === 'root'
        ? await this.libraryService.getLibraryId('drawing')
        : nodeId;
    return this.fileSystemService.getAllFilesUnderNode(
      actualNodeId,
      mockUserId,
      query
    );
  }

  /**
   * 图纸库统一文件访问路由（公开访问）
   *
   * URL 格式：/api/library/drawing/filesData/*path
   */
  @Get('drawing/filesData/*path')
  @Public()
  @ApiOperation({ summary: '获取图纸库文件（统一入口）' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    content: { 'application/octet-stream': {} },
  })
  async getDrawingFile(
    @Param('path') filePath: string[],
    @Res() res: Response
  ) {
    const filename = filePath.join('/');
    return this.mxcadFileHandler.serveFile(filename, res);
  }

  /**
   * 获取图纸库节点详情
   */
  @Get('drawing/nodes/:nodeId')
  @Public()
  @ApiOperation({ summary: '获取图纸库节点详情' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: FileSystemNodeDto,
  })
  async getDrawingNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getNodeTree(nodeId);
  }

  /**
   * 下载图纸库文件（需要图纸库管理权限）
   */
  @Get('drawing/nodes/:nodeId/download')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '下载图纸库文件' })
  @ApiResponse({
    status: 200,
    description: '下载成功',
    type: FileContentResponseDto,
  })
  async downloadDrawingNode(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Res() res: Response
  ) {
    await this.fileDownloadHandler.handleDownload(nodeId, req.user.id, res, {
      clientIp: req.ip,
    });
  }

  /**
   * 获取图纸库文件缩略图
   */
  @Get('drawing/nodes/:nodeId/thumbnail')
  @Public()
  @ApiOperation({ summary: '获取图纸库文件缩略图' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getDrawingThumbnail(@Param('nodeId') nodeId: string, @Request() req) {
    const mockUserId = 'system';
    return this.fileSystemService.checkFileAccess(nodeId, mockUserId);
  }

  // ========== 图块库接口（只读） ==========

  /**
   * 获取图块库详情
   */
  @Get('block')
  @Public()
  @ApiOperation({ summary: '获取图块库详情' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: FileSystemNodeDto,
  })
  async getBlockLibrary() {
    return this.libraryService.getLibrary('block');
  }

  /**
   * 获取图块库子节点列表
   */
  @Get('block/children/:nodeId')
  @Public()
  @ApiOperation({ summary: '获取图块库子节点列表' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: NodeListResponseDto,
  })
  async getBlockChildren(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    const actualNodeId =
      nodeId === 'root'
        ? await this.libraryService.getLibraryId('block')
        : nodeId;
    return this.fileSystemService.getChildren(actualNodeId, mockUserId, query);
  }

  /**
   * 递归获取图块库节点下的所有文件（包括子目录）
   */
  @Get('block/all-files/:nodeId')
  @Public()
  @ApiOperation({ summary: '递归获取图块库节点下的所有文件' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: NodeListResponseDto,
  })
  async getBlockAllFiles(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    const actualNodeId =
      nodeId === 'root'
        ? await this.libraryService.getLibraryId('block')
        : nodeId;
    return this.fileSystemService.getAllFilesUnderNode(
      actualNodeId,
      mockUserId,
      query
    );
  }

  /**
   * 图块库统一文件访问路由（公开访问）
   *
   * URL 格式：/api/library/block/filesData/*path
   */
  @Get('block/filesData/*path')
  @Public()
  @ApiOperation({ summary: '获取图块库文件（统一入口）' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    content: { 'application/octet-stream': {} },
  })
  async getBlockFile(
    @Param('path') filePath: string[],
    @Res() res: Response,
    @Request() req: any
  ) {
    const filename = filePath.join('/');

    this.logger.log(`
========================================
[图块库文件访问] 收到请求
- 完整URL: ${req.protocol}://${req.get('host')}${req.originalUrl}
- 请求路径: ${filename}
- 请求方法: ${req.method}
- 来源页面(Referer): ${req.get('referer') || '无'}
- 客户端IP: ${req.ip}
- User-Agent: ${req.get('user-agent')}
- 时间: ${new Date().toISOString()}
========================================
    `);

    return this.mxcadFileHandler.serveFile(filename, res);
  }

  /**
   * 获取图块库节点详情
   */
  @Get('block/nodes/:nodeId')
  @Public()
  @ApiOperation({ summary: '获取图块库节点详情' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: FileSystemNodeDto,
  })
  async getBlockNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getNodeTree(nodeId);
  }

  /**
   * 下载图块库文件（需要图块库管理权限）
   */
  @Get('block/nodes/:nodeId/download')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '下载图块库文件' })
  @ApiResponse({
    status: 200,
    description: '下载成功',
    type: FileContentResponseDto,
  })
  async downloadBlockNode(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Res() res: Response
  ) {
    await this.fileDownloadHandler.handleDownload(nodeId, req.user.id, res, {
      clientIp: req.ip,
    });
  }

  /**
   * 获取图块库文件缩略图
   */
  @Get('block/nodes/:nodeId/thumbnail')
  @Public()
  @ApiOperation({ summary: '获取图块库文件缩略图' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getBlockThumbnail(@Param('nodeId') nodeId: string, @Request() req) {
    const mockUserId = 'system';
    return this.fileSystemService.checkFileAccess(nodeId, mockUserId);
  }
}
