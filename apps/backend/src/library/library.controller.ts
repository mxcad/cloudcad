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
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  Logger,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { LibraryService } from './library.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { FileSystemService } from '../file-system/file-system.service';
import { FileTreeService } from '../file-system/services/file-tree.service';
import { FileDownloadHandlerService } from '../file-system/file-download-handler.service';
import { MxCadService } from '../mxcad/mxcad.service';
import { MxcadFileHandlerService } from '../mxcad/services/mxcad-file-handler.service';
import { UploadFilesDto } from '../mxcad/dto/upload-files.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { QueryChildrenDto } from '../file-system/dto/query-children.dto';
import { CreateFolderDto } from '../file-system/dto/create-folder.dto';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { MoveNodeDto } from '../file-system/dto/move-node.dto';
import {
  FileSystemNodeDto,
  NodeListResponseDto,
} from '../file-system/dto/file-system-response.dto';
import { FileContentResponseDto } from '../version-control/dto/file-content-response.dto';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import { ExternalReferenceHandler } from '../mxcad/services/external-reference-handler.service';
import { SaveMxwebDto } from '../mxcad/dto/save-mxweb.dto';
import { SaveMxwebResponseDto } from '../mxcad/dto/save-mxweb-response.dto';
import { SaveLibraryAsDto } from './dto/save-library-as.dto';
import { SaveMxwebAsResponseDto } from '../mxcad/dto/save-mxweb-as-response.dto';
import { StorageManager } from '../common/services/storage-manager.service';
import { StorageQuotaInterceptor } from '../common/interceptors/storage-quota.interceptor';

/**
 * 公共资源库控制器
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目，不是某个人的资源库
 * - 上传逻辑完全复用 MxCAD 的分片上传方案（MxCadService）
 * - 读操作：公开访问（无需登录）
 * - 写操作：需要管理员权限
 * - 无版本管理、无回收站（删除即永久删除）
 */
@ApiTags('library', '公共资源库')
@Controller('library')
@UseInterceptors(StorageQuotaInterceptor)
export class LibraryController {
  private readonly logger = new Logger(LibraryController.name);

  constructor(
    private readonly libraryService: LibraryService,
    private readonly fileSystemService: FileSystemService,
    private readonly fileTreeService: FileTreeService,
    private readonly fileDownloadHandler: FileDownloadHandlerService,
    private readonly mxCadService: MxCadService, // 复用 MxCAD 上传逻辑
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly externalReferenceHandler: ExternalReferenceHandler,
    private readonly mxcadFileHandler: MxcadFileHandlerService,
    private readonly storageManager: StorageManager
  ) {}

  // ========== 图纸库接口 ==========

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
    // 公共资源库的读取不需要用户登录
    const mockUserId = 'system';
    // 处理 'root' 字符串：获取图纸库根节点 ID
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
   *
   * 设计思想：
   * - 复用项目文件的文件访问逻辑
   * - 使用 node.path 构建 URL（格式：YYYYMM/nodeId/fileHash.dwg.mxweb）
   * - 公开访问（无需登录）
   * - 自动支持外部参照（从 {fileHash}/{fileName} 查找）
   *
   * 注意：此路由必须在 /:nodeId 和 /:nodeId/download 之前定义，
   * 否则 Express 会先匹配通用路由
   */
  @Get('drawing/filesData/*path')
  @Public()
  @ApiOperation({ summary: '获取图纸库文件（统一入口）' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    content: { 'application/octet-stream': {} },
  })
  async getDrawingFile(@Param('path') path: string[], @Res() res: Response) {
    const filename = path.join('/');
    // 使用共享的文件处理服务（无需权限验证）
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

  /**
   * 创建图纸库文件夹
   */
  @Post('drawing/folders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建图纸库文件夹' })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    type: FileSystemNodeDto,
  })
  async createDrawingFolder(@Request() req, @Body() dto: CreateFolderDto) {
    // 验证是否在图纸库中
    const isLibrary = await this.libraryService.isLibrary(dto.parentId || '');
    if (!isLibrary) {
      throw new BadRequestException('只能在图纸库中操作');
    }

    return this.fileSystemService.createFolder(req.user.id, dto.parentId, dto);
  }

  /**
   * 上传图纸库文件（完整文件上传，复用 MxCAD 逻辑）
   * 支持 conflictStrategy: skip, overwrite, rename
   */
  @Post('drawing/upload')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传图纸库文件' })
  @ApiResponse({ status: 201, description: '上传成功' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDrawingFile(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    // 验证是否在图纸库中
    const isLibrary = await this.libraryService.isLibrary(
      uploadFilesDto.nodeId || ''
    );
    if (!isLibrary) {
      throw new BadRequestException('只能在图纸库中操作');
    }

    // 验证必要参数
    if (!uploadFilesDto.hash || !uploadFilesDto.name || !uploadFilesDto.size) {
      throw new BadRequestException('缺少必要参数: hash, name 或 size');
    }

    if (!file) {
      throw new BadRequestException('缺少上传文件');
    }

    // 构建上下文
    const context = {
      nodeId: uploadFilesDto.nodeId,
      userId: req.user?.id || 'system',
      userRole: 'ADMIN', // 库管理权限用户
      isLibrary: true, // 标记为公开资源库上传，跳过 SVN 提交
    };

    // 完整文件上传
    const result = await this.mxCadService.uploadAndConvertFileWithPermission(
      file.path,
      uploadFilesDto.hash,
      uploadFilesDto.name,
      uploadFilesDto.size,
      context
    );
    return { nodeId: result.nodeId, tz: result.tz };
  }

  /**
   * 上传图纸库文件（分片上传，复用 MxCAD 逻辑）
   */
  @Post('drawing/files/upload-chunk')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传图纸库文件（分片）' })
  @ApiResponse({ status: 201, description: '上传成功' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDrawingChunk(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    // 验证是否在图纸库中
    const isLibrary = await this.libraryService.isLibrary(
      uploadFilesDto.nodeId || ''
    );
    if (!isLibrary) {
      throw new BadRequestException('只能在图纸库中操作');
    }

    // 验证必要参数
    if (!uploadFilesDto.hash || !uploadFilesDto.name || !uploadFilesDto.size) {
      throw new BadRequestException('缺少必要参数: hash, name 或 size');
    }

    // 构建上下文
    const context = {
      nodeId: uploadFilesDto.nodeId,
      userId: req.user?.id || 'system',
      userRole: 'ADMIN', // 库管理权限用户
      isLibrary: true, // 标记为公开资源库上传，跳过 SVN 提交
    };

    // 检查是否为合并请求（没有文件，只有 chunks 信息）
    const isMergeRequest = !file && uploadFilesDto.chunks !== undefined;

    if (isMergeRequest) {
      // 合并分片
      const result = await this.mxCadService.mergeChunksWithPermission(
        uploadFilesDto.hash,
        uploadFilesDto.name,
        uploadFilesDto.size,
        uploadFilesDto.chunks!,
        context
      );
      return { nodeId: result.nodeId, tz: result.tz };
    }

    if (!file) {
      throw new BadRequestException('缺少上传文件');
    }

    if (uploadFilesDto.chunk !== undefined) {
      // 分片上传
      if (uploadFilesDto.chunks === undefined) {
        throw new BadRequestException('缺少必要参数: chunks');
      }
      const result = await this.mxCadService.uploadChunkWithPermission(
        uploadFilesDto.hash,
        uploadFilesDto.name,
        uploadFilesDto.size,
        uploadFilesDto.chunk,
        uploadFilesDto.chunks,
        context
      );
      return { nodeId: result.nodeId, tz: result.tz };
    } else {
      // 完整文件上传
      const result = await this.mxCadService.uploadAndConvertFileWithPermission(
        file.path,
        uploadFilesDto.hash,
        uploadFilesDto.name,
        uploadFilesDto.size,
        context
      );
      return { nodeId: result.nodeId, tz: result.tz };
    }
  }

  /**
   * 删除图纸库节点（永久删除，不走回收站）
   */
  @Delete('drawing/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除图纸库节点' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteDrawingNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently: boolean = true
  ) {
    // 公共资源库直接永久删除，不走回收站
    return this.fileSystemService.deleteNode(nodeId, permanently);
  }

  /**
   * 重命名图纸库节点
   */
  @Patch('drawing/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '重命名图纸库节点' })
  @ApiResponse({ status: 200, description: '重命名成功' })
  async renameDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto
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
  @ApiOperation({ summary: '移动图纸库节点' })
  @ApiResponse({ status: 200, description: '移动成功' })
  async moveDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto
  ) {
    // 验证目标是否在图纸库中
    const isLibrary = await this.libraryService.isLibrary(dto.targetParentId);
    if (!isLibrary) {
      throw new BadRequestException('目标位置必须在图纸库中');
    }
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  /**
   * 复制图纸库节点
   */
  @Post('drawing/nodes/:nodeId/copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '复制图纸库节点' })
  @ApiResponse({ status: 200, description: '复制成功' })
  async copyDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto
  ) {
    // 验证目标是否在图纸库中
    const isLibrary = await this.libraryService.isLibrary(dto.targetParentId);
    if (!isLibrary) {
      throw new BadRequestException('目标位置必须在图纸库中');
    }
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  // ========== 图块库接口 ==========

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
    // 处理 'root' 字符串：获取图块库根节点 ID
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
   *
   * 设计思想：
   * - 复用项目文件的文件访问逻辑
   * - 使用 node.path 构建 URL（格式：YYYYMM/nodeId/fileHash.dwg.mxweb）
   * - 公开访问（无需登录）
   * - 自动支持外部参照（从 {fileHash}/{fileName} 查找）
   *
   * 注意：此路由必须在 /:nodeId 和 /:nodeId/download 之前定义，
   * 否则 Express 会先匹配通用路由
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
    @Param('path') path: string[],
    @Res() res: Response,
    @Request() req: any
  ) {
    const filename = path.join('/');

    // ===== 详细日志: 追踪调用来源 =====
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

    // 使用共享的文件处理服务（无需权限验证）
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

  /**
   * 上传图块库文件（分片上传，复用 MxCAD 逻辑）
   */
  @Post('block/files/upload-chunk')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传图块库文件（分片）' })
  @ApiResponse({ status: 201, description: '上传成功' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadBlockChunk(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    // 验证是否在图块库中
    const isLibrary = await this.libraryService.isLibrary(
      uploadFilesDto.nodeId || ''
    );
    if (!isLibrary) {
      throw new BadRequestException('只能在图块库中操作');
    }

    // 验证必要参数
    if (!uploadFilesDto.hash || !uploadFilesDto.name || !uploadFilesDto.size) {
      throw new BadRequestException('缺少必要参数: hash, name 或 size');
    }

    // 构建上下文
    const context = {
      nodeId: uploadFilesDto.nodeId,
      userId: req.user?.id || 'system',
      userRole: 'ADMIN', // 库管理权限用户
      isLibrary: true, // 标记为公开资源库上传，跳过 SVN 提交
    };

    // 检查是否为合并请求（没有文件，只有 chunks 信息）
    const isMergeRequest = !file && uploadFilesDto.chunks !== undefined;

    if (isMergeRequest) {
      // 合并分片
      const result = await this.mxCadService.mergeChunksWithPermission(
        uploadFilesDto.hash,
        uploadFilesDto.name,
        uploadFilesDto.size,
        uploadFilesDto.chunks!,
        context
      );
      return { nodeId: result.nodeId, tz: result.tz };
    }

    if (!file) {
      throw new BadRequestException('缺少上传文件');
    }

    if (uploadFilesDto.chunk !== undefined) {
      // 分片上传
      if (uploadFilesDto.chunks === undefined) {
        throw new BadRequestException('缺少必要参数: chunks');
      }
      const result = await this.mxCadService.uploadChunkWithPermission(
        uploadFilesDto.hash,
        uploadFilesDto.name,
        uploadFilesDto.size,
        uploadFilesDto.chunk,
        uploadFilesDto.chunks,
        context
      );
      return { nodeId: result.nodeId, tz: result.tz };
    } else {
      // 完整文件上传
      const result = await this.mxCadService.uploadAndConvertFileWithPermission(
        file.path,
        uploadFilesDto.hash,
        uploadFilesDto.name,
        uploadFilesDto.size,
        context
      );
      return { nodeId: result.nodeId, tz: result.tz };
    }
  }

  /**
   * 删除图块库节点（永久删除，不走回收站）
   */
  @Delete('block/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除图块库节点' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteBlockNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently: boolean = true
  ) {
    // 公共资源库直接永久删除，不走回收站
    return this.fileSystemService.deleteNode(nodeId, permanently);
  }

  /**
   * 重命名图块库节点
   */
  @Patch('block/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '重命名图块库节点' })
  @ApiResponse({ status: 200, description: '重命名成功' })
  async renameBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto
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
  @ApiOperation({ summary: '移动图块库节点' })
  @ApiResponse({ status: 200, description: '移动成功' })
  async moveBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto
  ) {
    // 验证目标是否在图块库中
    const isLibrary = await this.libraryService.isLibrary(dto.targetParentId);
    if (!isLibrary) {
      throw new BadRequestException('目标位置必须在图块库中');
    }
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  /**
   * 复制图块库节点
   */
  @Post('block/nodes/:nodeId/copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '复制图块库节点' })
  @ApiResponse({ status: 200, description: '复制成功' })
  async copyBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto
  ) {
    // 验证目标是否在图块库中
    const isLibrary = await this.libraryService.isLibrary(dto.targetParentId);
    if (!isLibrary) {
      throw new BadRequestException('目标位置必须在图块库中');
    }
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  /**
   * 创建图块库文件夹
   */
  @Post('block/folders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建图块库文件夹' })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    type: FileSystemNodeDto,
  })
  async createBlockFolder(@Request() req, @Body() dto: CreateFolderDto) {
    // 验证是否在图块库中
    const isLibrary = await this.libraryService.isLibrary(dto.parentId || '');
    if (!isLibrary) {
      throw new BadRequestException('只能在图块库中操作');
    }

    return this.fileSystemService.createFolder(req.user.id, dto.parentId, dto);
  }

  /**
   * 上传图块库文件（完整文件上传，复用 MxCAD 逻辑）
   * 支持 conflictStrategy: skip, overwrite, rename
   */
  @Post('block/upload')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传图块库文件' })
  @ApiResponse({ status: 201, description: '上传成功' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadBlockFile(
    @Request() req,
    @Body() uploadFilesDto: UploadFilesDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    // 验证是否在图块库中
    const isLibrary = await this.libraryService.isLibrary(
      uploadFilesDto.nodeId || ''
    );
    if (!isLibrary) {
      throw new BadRequestException('只能在图块库中操作');
    }

    // 验证必要参数
    if (!uploadFilesDto.hash || !uploadFilesDto.name || !uploadFilesDto.size) {
      throw new BadRequestException('缺少必要参数: hash, name 或 size');
    }

    if (!file) {
      throw new BadRequestException('缺少上传文件');
    }

    // 构建上下文
    const context = {
      nodeId: uploadFilesDto.nodeId,
      userId: req.user?.id || 'system',
      userRole: 'ADMIN', // 库管理权限用户
      isLibrary: true, // 标记为公开资源库上传，跳过 SVN 提交
    };

    // 完整文件上传
    const result = await this.mxCadService.uploadAndConvertFileWithPermission(
      file.path,
      uploadFilesDto.hash,
      uploadFilesDto.name,
      uploadFilesDto.size,
      context
    );
    return { nodeId: result.nodeId, tz: result.tz };
  }

  // ========== 保存/另存为接口 ==========

  /**
   * 保存图纸到图纸库（覆盖现有文件）
   * 需要图纸库管理权限
   */
  @Post('drawing/save/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存图纸到图纸库' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SaveMxwebDto })
  @ApiResponse({
    status: 200,
    description: '保存成功',
    type: SaveMxwebResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async saveDrawing(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    this.logger.log(`[saveDrawing] 开始保存: nodeId=${nodeId}`);

    // 验证文件扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mxweb') {
      throw new BadRequestException(
        `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`
      );
    }

    // 获取节点信息
    const node = await this.db.fileSystemNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      throw new NotFoundException('节点不存在');
    }

    // 调试日志
    this.logger.log(
      `[saveDrawing] node.path = ${node.path}, node.name = ${node.name}`
    );
    this.logger.log(
      `[saveDrawing] file = ${file}, file.path = ${file?.path}, file.originalname = ${file?.originalname}`
    );

    // 验证节点属于图纸库
    const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
    if (libraryKey !== 'drawing') {
      throw new BadRequestException('节点不属于图纸库');
    }

    // 复用 MxCadService 的保存逻辑
    // 注意：公共资源库保存不传 commitMessage（跳过 SVN），且跳过生成 bin 文件
    const result = await this.mxCadService.saveMxwebFile(
      nodeId,
      file,
      req.user?.id,
      req.user?.username || req.user?.nickname || req.user?.email,
      undefined, // commitMessage
      true // skipBinGeneration
    );

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    this.logger.log(`[saveDrawing] 保存成功: nodeId=${nodeId}`);
    return {
      nodeId,
      path: node.path,
    };
  }

  /**
   * 另存为图纸到图纸库
   * 需要图纸库管理权限
   */
  @Post('drawing/save-as')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '另存为图纸到图纸库' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SaveLibraryAsDto })
  @ApiResponse({
    status: 200,
    description: '保存成功',
    type: SaveMxwebAsResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async saveDrawingAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req: any
  ) {
    this.logger.log(
      `[saveDrawingAs] 开始另存为: targetParentId=${dto.targetParentId}, fileName=${dto.fileName}`
    );

    // 验证文件扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mxweb') {
      throw new BadRequestException(
        `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`
      );
    }

    // 验证目标父节点存在且属于图纸库
    const parentNode = await this.db.fileSystemNode.findUnique({
      where: { id: dto.targetParentId },
    });

    if (!parentNode) {
      throw new NotFoundException('目标文件夹不存在');
    }

    if (parentNode.libraryKey !== 'drawing') {
      throw new BadRequestException('目标位置不在图纸库中');
    }

    // 创建新节点（使用 createFileNode）
    const fileName = dto.fileName || 'untitled';
    const newNode = await this.fileSystemService.createFileNode({
      name: fileName,
      fileHash: '',
      size: file.size,
      mimeType: file.mimetype,
      extension: '.mxweb',
      parentId: parentNode.id,
      ownerId: req.user.id,
      skipFileCopy: true,
    });

    // 分配存储空间并复制文件
    const nodeFullPath = this.storageManager.getFullPath(newNode.path);
    const nodeDir = path.dirname(nodeFullPath);

    if (!fs.existsSync(nodeDir)) {
      fs.mkdirSync(nodeDir, { recursive: true });
    }

    // 文件名格式：{nodeId}.mxweb
    const mxwebFileName = `${newNode.id}.mxweb`;
    const mxwebTargetPath = path.join(nodeDir, mxwebFileName);
    fs.copyFileSync(file.path, mxwebTargetPath);

    // 注意：公开资源库不需要生成 bin 文件，也不需要提交 SVN

    // 删除临时文件
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      this.logger.warn(`[saveDrawingAs] 删除临时文件失败: ${e.message}`);
    }

    return {
      nodeId: newNode.id,
      fileName: newNode.name,
      path: newNode.path,
      parentId: newNode.parentId,
    };
  }

  /**
   * 保存图块到图块库（覆盖现有文件）
   * 需要图块库管理权限
   */
  @Post('block/save/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存图块到图块库' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SaveMxwebDto })
  @ApiResponse({
    status: 200,
    description: '保存成功',
    type: SaveMxwebResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async saveBlock(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    this.logger.log(`[saveBlock] 开始保存: nodeId=${nodeId}`);

    // 验证文件扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mxweb') {
      throw new BadRequestException(
        `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`
      );
    }

    // 验证节点属于图块库
    const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
    if (libraryKey !== 'block') {
      throw new BadRequestException('节点不属于图块库');
    }

    // 获取节点路径信息
    const node = await this.db.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { path: true },
    });

    if (!node) {
      throw new NotFoundException('节点不存在');
    }

    // 复用 MxCadService 的保存逻辑
    // 注意：公共资源库保存不传 commitMessage（跳过 SVN），且跳过生成 bin 文件
    const result = await this.mxCadService.saveMxwebFile(
      nodeId,
      file,
      req.user?.id,
      req.user?.username || req.user?.nickname || req.user?.email,
      undefined, // commitMessage
      true // skipBinGeneration
    );

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    this.logger.log(`[saveBlock] 保存成功: nodeId=${nodeId}`);
    return {
      nodeId,
      path: node.path,
    };
  }

  /**
   * 另存为图块到图块库
   * 需要图块库管理权限
   */
  @Post('block/save-as')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '另存为图块到图块库' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SaveLibraryAsDto })
  @ApiResponse({
    status: 200,
    description: '保存成功',
    type: SaveMxwebAsResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async saveBlockAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req: any
  ) {
    this.logger.log(
      `[saveBlockAs] 开始另存为: targetParentId=${dto.targetParentId}, fileName=${dto.fileName}`
    );

    // 验证文件扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mxweb') {
      throw new BadRequestException(
        `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`
      );
    }

    // 验证目标父节点存在且属于图块库
    const parentNode = await this.db.fileSystemNode.findUnique({
      where: { id: dto.targetParentId },
    });

    if (!parentNode) {
      throw new NotFoundException('目标文件夹不存在');
    }

    if (parentNode.libraryKey !== 'block') {
      throw new BadRequestException('目标位置不在图块库中');
    }

    // 创建新节点（使用 createFileNode）
    const fileName = dto.fileName || 'untitled';
    const newNode = await this.fileSystemService.createFileNode({
      name: fileName,
      fileHash: '',
      size: file.size,
      mimeType: file.mimetype,
      extension: '.mxweb',
      parentId: parentNode.id,
      ownerId: req.user.id,
      skipFileCopy: true,
    });

    // 分配存储空间并复制文件
    const nodeFullPath = this.storageManager.getFullPath(newNode.path);
    const nodeDir = path.dirname(nodeFullPath);

    if (!fs.existsSync(nodeDir)) {
      fs.mkdirSync(nodeDir, { recursive: true });
    }

    // 文件名格式：{nodeId}.mxweb
    const mxwebFileName = `${newNode.id}.mxweb`;
    const mxwebTargetPath = path.join(nodeDir, mxwebFileName);
    fs.copyFileSync(file.path, mxwebTargetPath);

    // 注意：公开资源库不需要生成 bin 文件，也不需要提交 SVN

    // 删除临时文件
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      this.logger.warn(`[saveBlockAs] 删除临时文件失败: ${e.message}`);
    }

    return {
      nodeId: newNode.id,
      fileName: newNode.name,
      path: newNode.path,
      parentId: newNode.parentId,
    };
  }
}
