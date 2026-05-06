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
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  Logger,
  Res,
  UseInterceptors,
  Inject,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { LibraryService } from './library.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { FileSystemService } from '../file-system/file-system.service';
import { FileDownloadHandlerService } from '../file-system/file-download/file-download-handler.service';
import { MxcadFileHandlerService } from '../mxcad/core/mxcad-file-handler.service';
import { MxCadService } from '../mxcad/core/mxcad.service';
import { CreateFolderDto } from '../file-system/dto/create-folder.dto';
import { MoveNodeDto } from '../file-system/dto/move-node.dto';
import { CopyNodeDto } from '../file-system/dto/copy-node.dto';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { QueryChildrenDto } from '../file-system/dto/query-children.dto';
import {
  FileSystemNodeDto,
  NodeListResponseDto,
} from '../file-system/dto/file-system-response.dto';
import { FileContentResponseDto } from '../version-control/dto/file-content-response.dto';
import { SaveLibraryNodeDto } from './dto/save-library-node.dto';
import {
  IPublicLibraryProvider,
  PUBLIC_LIBRARY_PROVIDER_DRAWING,
  PUBLIC_LIBRARY_PROVIDER_BLOCK,
} from './interfaces/public-library-provider.interface';

/**
 * 公共资源库控制器
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目，不是某个人的资源库
 * - 读操作：公开访问（无需登录）
 * - 写操作：需要登录 + LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE 权限
 * - 无版本管理、无回收站（删除即永久删除）
 */
@ApiTags('library', '公共资源库')
@Controller('library')
export class LibraryController {
  private readonly logger = new Logger(LibraryController.name);

  constructor(
    private readonly libraryService: LibraryService,
    private readonly fileSystemService: FileSystemService,
    private readonly fileDownloadHandler: FileDownloadHandlerService,
    private readonly mxcadFileHandler: MxcadFileHandlerService,
    private readonly mxCadService: MxCadService,
    @Inject(PUBLIC_LIBRARY_PROVIDER_DRAWING)
    private readonly drawingLibraryProvider: IPublicLibraryProvider,
    @Inject(PUBLIC_LIBRARY_PROVIDER_BLOCK)
    private readonly blockLibraryProvider: IPublicLibraryProvider
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
    return this.drawingLibraryProvider.getRootNode();
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
        ? await this.drawingLibraryProvider.getLibraryId()
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
        ? await this.drawingLibraryProvider.getLibraryId()
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

  // ========== 图纸库写接口 ==========

  /**
   * 覆盖保存图纸库文件（需要图纸库管理权限）
   */
  @Post('drawing/save/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '覆盖保存图纸库文件' })
  @ApiResponse({ status: 200, description: '保存成功' })
  async saveDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: SaveLibraryNodeDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    return this.saveLibraryNode(nodeId, file, req);
  }

  /**
   * 创建图纸库文件夹
   */
  @Post('drawing/folders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建图纸库文件夹' })
  @ApiResponse({
    status: 201,
    description: '文件夹创建成功',
    type: FileSystemNodeDto,
  })
  async createDrawingFolder(
    @Body() dto: CreateFolderDto,
    @Request() req,
  ) {
    const userId = req.user.id;
    const parentId =
      !dto.parentId || dto.parentId === 'root'
        ? await this.drawingLibraryProvider.getLibraryId()
        : dto.parentId;
    return this.fileSystemService.createFolder(userId, parentId, dto);
  }

  /**
   * 删除图纸库节点
   */
  @Delete('drawing/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除图纸库节点' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteDrawingNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently?: boolean,
  ) {
    return this.fileSystemService.deleteNode(nodeId, permanently ?? true);
  }

  /**
   * 重命名图纸库节点
   */
  @Patch('drawing/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重命名图纸库节点' })
  @ApiResponse({ status: 200, description: '重命名成功', type: FileSystemNodeDto })
  async renameDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.fileSystemService.updateNode(nodeId, dto);
  }

  /**
   * 移动图纸库节点
   */
  @Post('drawing/nodes/:nodeId/move')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移动图纸库节点' })
  @ApiResponse({ status: 200, description: '移动成功', type: FileSystemNodeDto })
  async moveDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto,
  ) {
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  /**
   * 复制图纸库节点
   */
  @Post('drawing/nodes/:nodeId/copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '复制图纸库节点' })
  @ApiResponse({ status: 201, description: '复制成功', type: FileSystemNodeDto })
  async copyDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: CopyNodeDto,
  ) {
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
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
    return this.blockLibraryProvider.getRootNode();
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
        ? await this.blockLibraryProvider.getLibraryId()
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
        ? await this.blockLibraryProvider.getLibraryId()
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

  // ========== 图块库写接口 ==========

  /**
   * 覆盖保存图块库文件（需要图块库管理权限）
   */
  @Post('block/save/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '覆盖保存图块库文件' })
  @ApiResponse({ status: 200, description: '保存成功' })
  async saveBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: SaveLibraryNodeDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    return this.saveLibraryNode(nodeId, file, req);
  }

  /**
   * 创建图块库文件夹
   */
  @Post('block/folders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建图块库文件夹' })
  @ApiResponse({
    status: 201,
    description: '文件夹创建成功',
    type: FileSystemNodeDto,
  })
  async createBlockFolder(
    @Body() dto: CreateFolderDto,
    @Request() req,
  ) {
    const userId = req.user.id;
    const parentId =
      !dto.parentId || dto.parentId === 'root'
        ? await this.blockLibraryProvider.getLibraryId()
        : dto.parentId;
    return this.fileSystemService.createFolder(userId, parentId, dto);
  }

  /**
   * 删除图块库节点
   */
  @Delete('block/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除图块库节点' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteBlockNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently?: boolean,
  ) {
    return this.fileSystemService.deleteNode(nodeId, permanently ?? true);
  }

  /**
   * 重命名图块库节点
   */
  @Patch('block/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重命名图块库节点' })
  @ApiResponse({ status: 200, description: '重命名成功', type: FileSystemNodeDto })
  async renameBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.fileSystemService.updateNode(nodeId, dto);
  }

  /**
   * 移动图块库节点
   */
  @Post('block/nodes/:nodeId/move')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移动图块库节点' })
  @ApiResponse({ status: 200, description: '移动成功', type: FileSystemNodeDto })
  async moveBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto,
  ) {
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  /**
   * 复制图块库节点
   */
  @Post('block/nodes/:nodeId/copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '复制图块库节点' })
  @ApiResponse({ status: 201, description: '复制成功', type: FileSystemNodeDto })
  async copyBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: CopyNodeDto,
  ) {
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  // ========== 公共方法 ==========

  private async saveLibraryNode(
    nodeId: string,
    file: Express.Multer.File,
    req: any,
  ) {
    const result = await this.mxCadService.saveMxwebFile(
      nodeId,
      file,
      req.user.id,
      req.user.username || req.user.nickname || req.user.email,
      '覆盖保存资源库文件',
      true, // skipBinGeneration
    );

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    return { nodeId, path: result.path };
  }
}
