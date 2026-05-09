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
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {
  AuthenticatedRequest,
} from '../common/types/request.types';
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
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../common/services/storage-manager.service';
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
import { SaveLibraryAsDto } from './dto/save-library-as.dto';
import { UploadFilesDto } from '../mxcad/dto/upload-files.dto';
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
    private readonly fileTreeService: FileTreeService,
    private readonly db: DatabaseService,
    private readonly storageManager: StorageManager,
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
   * 获取图纸库全部三级分类（一次请求返回完整分类树）
   *
   * 使用递归 CTE 在数据库层面一次查询全部层级，避免前端多次 API 调用。
   * 分类深度最多 3 层（一级 / 二级 / 三级）。
   */
  @Get('drawing/categories')
  @Public()
  @ApiOperation({ summary: '获取图纸库全部三级分类（一次请求）' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getDrawingCategories() {
    const rootId = await this.drawingLibraryProvider.getLibraryId();
    return this.fileSystemService.getCategoryTree(rootId);
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
   * 下载图纸库文件（公开访问）
   */
  @Get('drawing/nodes/:nodeId/download')
  @Public()
  @ApiOperation({ summary: '下载图纸库文件（公开）' })
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
    const userId = req.user?.id || 'system';
    await this.fileDownloadHandler.handleDownload(nodeId, userId, res, {
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
    await this.validateLibraryNode(nodeId, 'drawing');
    return this.saveLibraryNode(nodeId, file, req);
  }

  /**
   * 另存为图纸到图纸库（需要图纸库管理权限）
   */
  @Post('drawing/save-as')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '另存为图纸到图纸库' })
  @ApiResponse({ status: 200, description: '保存成功' })
  async saveDrawingAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req,
  ) {
    return this.saveLibraryAs(file, dto, req, 'drawing');
  }

  /**
   * 上传图纸库文件（完整文件上传，复用 MxCAD 转换逻辑）
   */
  @Post('drawing/upload')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图纸库文件' })
  @ApiResponse({ status: 201, description: '上传成功' })
  async uploadDrawingFile(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.uploadLibraryFile(uploadFilesDto, file, req);
  }

  /**
   * 上传图纸库文件（分片上传，复用 MxCAD 转换逻辑）
   */
  @Post('drawing/upload-chunk')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图纸库文件（分片）' })
  @ApiResponse({ status: 201, description: '上传成功' })
  async uploadDrawingChunk(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.uploadLibraryChunk(uploadFilesDto, file, req);
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
    await this.validateLibraryParent(parentId, 'drawing');
    return this.fileSystemService.createFolder(userId, parentId, dto);
  }

  /**
   * 删除图纸库节点
   */
  @Delete('drawing/nodes/:nodeId')

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
   * 获取图块库全部三级分类（一次请求返回完整分类树）
   *
   * 使用递归 CTE 在数据库层面一次查询全部层级，避免前端多次 API 调用。
   * 分类深度最多 3 层（一级 / 二级 / 三级）。
   */
  @Get('block/categories')
  @Public()
  @ApiOperation({ summary: '获取图块库全部三级分类（一次请求）' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getBlockCategories() {
    const rootId = await this.blockLibraryProvider.getLibraryId();
    return this.fileSystemService.getCategoryTree(rootId);
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
    @Request() req: AuthenticatedRequest
  ) {
    const filename = filePath.join('/');
    const expressReq = req as any;

    this.logger.log(`
========================================
[图块库文件访问] 收到请求
- 完整URL: ${expressReq.protocol}://${expressReq.get('host')}${expressReq.originalUrl}
- 请求路径: ${filename}
- 请求方法: ${expressReq.method}
- 来源页面(Referer): ${expressReq.get('referer') || '无'}
- 客户端IP: ${expressReq.ip}
- User-Agent: ${expressReq.get('user-agent')}
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
   * 下载图块库文件（公开访问）
   */
  @Get('block/nodes/:nodeId/download')
  @Public()
  @ApiOperation({ summary: '下载图块库文件（公开）' })
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
    const userId = req.user?.id || 'system';
    await this.fileDownloadHandler.handleDownload(nodeId, userId, res, {
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
    await this.validateLibraryNode(nodeId, 'block');
    return this.saveLibraryNode(nodeId, file, req);
  }

  /**
   * 另存为图块到图块库（需要图块库管理权限）
   */
  @Post('block/save-as')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '另存为图块到图块库' })
  @ApiResponse({ status: 200, description: '保存成功' })
  async saveBlockAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req,
  ) {
    return this.saveLibraryAs(file, dto, req, 'block');
  }

  /**
   * 上传图块库文件（完整文件上传，复用 MxCAD 转换逻辑）
   */
  @Post('block/upload')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图块库文件' })
  @ApiResponse({ status: 201, description: '上传成功' })
  async uploadBlockFile(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.uploadLibraryFile(uploadFilesDto, file, req);
  }

  /**
   * 上传图块库文件（分片上传，复用 MxCAD 转换逻辑）
   */
  @Post('block/upload-chunk')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图块库文件（分片）' })
  @ApiResponse({ status: 201, description: '上传成功' })
  async uploadBlockChunk(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.uploadLibraryChunk(uploadFilesDto, file, req);
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

  /**
   * 验证节点属于指定库类型，不属于则抛出异常
   */
  private async validateLibraryNode(nodeId: string, expectedKey: string): Promise<void> {
    const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
    if (libraryKey !== expectedKey) {
      throw new BadRequestException(`节点不属于${expectedKey === 'drawing' ? '图纸库' : '图块库'}`);
    }
  }

  private async saveLibraryNode(
    nodeId: string,
    file: Express.Multer.File,
    req: AuthenticatedRequest,
  ) {
    // 1. 验证文件扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mxweb') {
      throw new BadRequestException(`不支持的文件格式: ${ext}，仅支持 .mxweb 文件`);
    }

    // 2. 保存（跳过 SVN + bin 生成）
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
