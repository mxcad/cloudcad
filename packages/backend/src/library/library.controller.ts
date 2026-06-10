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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { StorageQuotaInterceptor } from '../common/interceptors/storage-quota.interceptor';
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
import { BatchDeleteDto, BatchMoveDto, BatchCopyDto } from '../file-system/dto/batch-operations.dto';
import {
  FileSystemNodeDto,
  NodeListResponseDto,
  BatchOperationResponseDto,
} from '../file-system/dto/file-system-response.dto';
import { FileContentResponseDto } from '../version-control/dto/file-content-response.dto';
import { SaveLibraryNodeDto } from './dto/save-library-node.dto';
import { SaveLibraryAsDto } from './dto/save-library-as.dto';
import {
  IPublicLibraryProvider,
  PUBLIC_LIBRARY_PROVIDER_DRAWING,
  PUBLIC_LIBRARY_PROVIDER_BLOCK,
} from './interfaces/public-library-provider.interface';

/**
 * Public resource library controller
 *
 * Design principles:
 * - The public library is a special global project, not any user's personal resource
 * - Read operations: public access (no login required)
 * - Download: public access (no login required), supports mxweb/dwg/dxf formats
 * - Write operations: requires login + LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE permission
 * - No version control, no recycle bin (delete = permanent delete)
 */
@ApiTags('library', 'Public resource library')
@Controller('library')
export class LibraryController {
  private readonly logger = new Logger(LibraryController.name);

  constructor(
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

  // ========== Drawing library - read ==========

  @Get('drawing')
  @Public()
  @ApiOperation({ summary: 'Get drawing library details' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async getDrawingLibrary() {
    return this.drawingLibraryProvider.getRootNode();
  }

  @Get('drawing/categories')
  @Public()
  @ApiOperation({ summary: 'Get all three-level categories of drawing library (single request)' })
  @ApiResponse({ status: 200, description: 'Success' })
  async getDrawingCategories() {
    const rootId = await this.drawingLibraryProvider.getLibraryId();
    return this.fileSystemService.getCategoryTree(rootId);
  }

  @Get('drawing/children/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get child nodes of drawing library' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getDrawingChildren(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    return this.fileSystemService.getChildren(nodeId, mockUserId, query);
  }

  @Get('drawing/all-files/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Recursively get all files under drawing library node' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getDrawingAllFiles(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    return this.fileSystemService.getAllFilesUnderNode(nodeId, mockUserId, query);
  }

  @Get('drawing/filesData/*path')
  @Public()
  @ApiOperation({ summary: 'Serve drawing library file (unified entry)' })
  @ApiResponse({ status: 200, description: 'Success', content: { 'application/octet-stream': {} } })
  async getDrawingFile(@Param('path') filePath: string[], @Res() res: Response) {
    const filename = filePath.join('/');
    return this.mxcadFileHandler.serveFile(filename, res);
  }

  @Get('drawing/nodes/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get drawing library node details' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async getDrawingNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getNodeTree(nodeId);
  }

  @Get('drawing/nodes/:nodeId/download')
  @Public()
  @ApiOperation({ summary: 'Download drawing library file (public)' })
  @ApiResponse({ status: 200, description: 'Success', type: FileContentResponseDto })
  async downloadDrawingNode(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Res() res: Response
  ) {
    const userId = req.user?.id || 'system';
    await this.fileDownloadHandler.handleDownload(nodeId, userId, res, { clientIp: req.ip });
  }

  @Get('drawing/nodes/:nodeId/thumbnail')
  @Public()
  @ApiOperation({ summary: 'Get drawing library file thumbnail' })
  @ApiResponse({ status: 200, description: 'Success' })
  async getDrawingThumbnail(@Param('nodeId') nodeId: string, @Request() req) {
    const mockUserId = 'system';
    return this.fileSystemService.checkFileAccess(nodeId, mockUserId);
  }

  // ========== Drawing library - write ==========

  @Post('drawing/save/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @UseInterceptors(StorageQuotaInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Overwrite save drawing library file' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: SaveLibraryNodeDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    await this.validateLibraryNode(nodeId, 'drawing');
    return this.saveLibraryNode(nodeId, file, req);
  }

  @Post('drawing/save-as')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @UseInterceptors(StorageQuotaInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Save-as drawing to drawing library' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveDrawingAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req,
  ) {
    return this.saveLibraryAs(file, dto, req, 'drawing');
  }

  @Post('drawing/folders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create folder in drawing library' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async createDrawingFolder(@Body() dto: CreateFolderDto, @Request() req) {
    const userId = req.user.id;
    const parentId = dto.parentId || await this.drawingLibraryProvider.getLibraryId();
    await this.validateLibraryNode(parentId, 'drawing');
    return this.fileSystemService.createFolder(userId, parentId, dto);
  }

  @Delete('drawing/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete drawing library node' })
  @ApiResponse({ status: 200, description: 'Success' })
  async deleteDrawingNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently?: boolean,
  ) {
    return this.fileSystemService.deleteNode(nodeId, permanently ?? true);
  }

  @Patch('drawing/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename drawing library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async renameDrawingNode(@Param('nodeId') nodeId: string, @Body() dto: UpdateNodeDto) {
    return this.fileSystemService.updateNode(nodeId, dto);
  }

  @Post('drawing/nodes/:nodeId/move')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move drawing library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async moveDrawingNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    await this.validateLibraryNode(dto.targetParentId, 'drawing');
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  @Post('drawing/nodes/:nodeId/copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Copy drawing library node' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async copyDrawingNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto) {
    await this.validateLibraryNode(dto.targetParentId, 'drawing');
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  @Post('drawing/nodes/batch-delete')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch delete drawing library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchDeleteDrawingNodes(@Body() dto: BatchDeleteDto) {
    return this.fileSystemService.batchDeleteNodes(dto.nodeIds, dto.permanently);
  }

  @Post('drawing/nodes/batch-move')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch move drawing library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchMoveDrawingNodes(@Body() dto: BatchMoveDto) {
    await this.validateLibraryNode(dto.targetParentId, 'drawing');
    return this.fileSystemService.batchMoveNodes(dto.nodeIds, dto.targetParentId);
  }

  @Post('drawing/nodes/batch-copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Batch copy drawing library nodes' })
  @ApiResponse({ status: 201, description: 'Success', type: BatchOperationResponseDto })
  async batchCopyDrawingNodes(@Body() dto: BatchCopyDto) {
    await this.validateLibraryNode(dto.targetParentId, 'drawing');
    return this.fileSystemService.batchCopyNodes(dto.nodeIds, dto.targetParentId);
  }

  // ========== Block library - read ==========

  @Get('block')
  @Public()
  @ApiOperation({ summary: 'Get block library details' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async getBlockLibrary() {
    return this.blockLibraryProvider.getRootNode();
  }

  @Get('block/categories')
  @Public()
  @ApiOperation({ summary: 'Get all three-level categories of block library (single request)' })
  @ApiResponse({ status: 200, description: 'Success' })
  async getBlockCategories() {
    const rootId = await this.blockLibraryProvider.getLibraryId();
    return this.fileSystemService.getCategoryTree(rootId);
  }

  @Get('block/children/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get child nodes of block library' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getBlockChildren(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    return this.fileSystemService.getChildren(nodeId, mockUserId, query);
  }

  @Get('block/all-files/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Recursively get all files under block library node' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getBlockAllFiles(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    const mockUserId = 'system';
    return this.fileSystemService.getAllFilesUnderNode(nodeId, mockUserId, query);
  }

  @Get('block/filesData/*path')
  @Public()
  @ApiOperation({ summary: 'Serve block library file (unified entry)' })
  @ApiResponse({ status: 200, description: 'Success', content: { 'application/octet-stream': {} } })
  async getBlockFile(
    @Param('path') filePath: string[],
    @Res() res: Response,
    @Request() req: AuthenticatedRequest
  ) {
    const filename = filePath.join('/');
    const expressReq = req as any;
    this.logger.log(`[Block file access] path: ${filename}, from: ${expressReq.get('referer') || 'N/A'}`);
    return this.mxcadFileHandler.serveFile(filename, res);
  }

  @Get('block/nodes/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get block library node details' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async getBlockNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getNodeTree(nodeId);
  }

  @Get('block/nodes/:nodeId/download')
  @Public()
  @ApiOperation({ summary: 'Download block library file (public)' })
  @ApiResponse({ status: 200, description: 'Success', type: FileContentResponseDto })
  async downloadBlockNode(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Res() res: Response
  ) {
    const userId = req.user?.id || 'system';
    await this.fileDownloadHandler.handleDownload(nodeId, userId, res, { clientIp: req.ip });
  }

  @Get('block/nodes/:nodeId/thumbnail')
  @Public()
  @ApiOperation({ summary: 'Get block library file thumbnail' })
  @ApiResponse({ status: 200, description: 'Success' })
  async getBlockThumbnail(@Param('nodeId') nodeId: string, @Request() req) {
    const mockUserId = 'system';
    return this.fileSystemService.checkFileAccess(nodeId, mockUserId);
  }

  // ========== Block library - write ==========

  @Post('block/save/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @UseInterceptors(StorageQuotaInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Overwrite save block library file' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: SaveLibraryNodeDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    await this.validateLibraryNode(nodeId, 'block');
    return this.saveLibraryNode(nodeId, file, req);
  }

  @Post('block/save-as')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @UseInterceptors(StorageQuotaInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Save-as block to block library' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveBlockAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req,
  ) {
    return this.saveLibraryAs(file, dto, req, 'block');
  }

  @Post('block/folders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create folder in block library' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async createBlockFolder(@Body() dto: CreateFolderDto, @Request() req) {
    const userId = req.user.id;
    const parentId = dto.parentId || await this.blockLibraryProvider.getLibraryId();
    await this.validateLibraryNode(parentId, 'block');
    return this.fileSystemService.createFolder(userId, parentId, dto);
  }

  @Delete('block/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete block library node' })
  @ApiResponse({ status: 200, description: 'Success' })
  async deleteBlockNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently?: boolean,
  ) {
    return this.fileSystemService.deleteNode(nodeId, permanently ?? true);
  }

  @Patch('block/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename block library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async renameBlockNode(@Param('nodeId') nodeId: string, @Body() dto: UpdateNodeDto) {
    return this.fileSystemService.updateNode(nodeId, dto);
  }

  @Post('block/nodes/:nodeId/move')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move block library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async moveBlockNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    await this.validateLibraryNode(dto.targetParentId, 'block');
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  @Post('block/nodes/:nodeId/copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Copy block library node' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async copyBlockNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto) {
    await this.validateLibraryNode(dto.targetParentId, 'block');
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  @Post('block/nodes/batch-delete')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch delete block library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchDeleteBlockNodes(@Body() dto: BatchDeleteDto) {
    return this.fileSystemService.batchDeleteNodes(dto.nodeIds, dto.permanently);
  }

  @Post('block/nodes/batch-move')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch move block library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchMoveBlockNodes(@Body() dto: BatchMoveDto) {
    await this.validateLibraryNode(dto.targetParentId, 'block');
    return this.fileSystemService.batchMoveNodes(dto.nodeIds, dto.targetParentId);
  }

  @Post('block/nodes/batch-copy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Batch copy block library nodes' })
  @ApiResponse({ status: 201, description: 'Success', type: BatchOperationResponseDto })
  async batchCopyBlockNodes(@Body() dto: BatchCopyDto) {
    await this.validateLibraryNode(dto.targetParentId, 'block');
    return this.fileSystemService.batchCopyNodes(dto.nodeIds, dto.targetParentId);
  }

  // ========== Private helpers ==========

  private async validateLibraryNode(nodeId: string, expectedKey: string): Promise<void> {
    const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
    if (libraryKey !== expectedKey) {
      throw new BadRequestException(`Node does not belong to ${expectedKey === 'drawing' ? 'drawing library' : 'block library'}`);
    }
  }

  private async saveLibraryNode(
    nodeId: string,
    file: Express.Multer.File,
    req: AuthenticatedRequest,
  ) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mxweb') {
      throw new BadRequestException(`Unsupported format: ${ext}, only .mxweb is supported`);
    }

    const result = await this.mxCadService.saveMxwebFile(
      nodeId,
      file,
      req.user.id,
      req.user.username || req.user.nickname || req.user.email,
      'Overwrite save library file',
      true, // skipBinGeneration
    );

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    return { nodeId, path: result.path };
  }

  private async saveLibraryAs(
    file: Express.Multer.File,
    dto: SaveLibraryAsDto,
    req: any,
    libraryKey: string,
  ) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mxweb') {
      throw new BadRequestException(`Unsupported format: ${ext}, only .mxweb is supported`);
    }

    const parentNode = await this.db.fileSystemNode.findUnique({
      where: { id: dto.targetParentId },
    });
    if (!parentNode) {
      throw new NotFoundException('Target folder does not exist');
    }
    const actualLibraryKey = await this.fileTreeService.getLibraryKey(parentNode.id);
    if (actualLibraryKey !== libraryKey) {
      throw new BadRequestException(`Target is not in ${libraryKey === 'drawing' ? 'drawing library' : 'block library'}`);
    }

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

    if (!newNode.path) {
      throw new BadRequestException('Failed to create file node: path is null');
    }
    const nodeFullPath = this.storageManager.getFullPath(newNode.path);
    const nodeDir = path.dirname(nodeFullPath);
    if (!fs.existsSync(nodeDir)) {
      fs.mkdirSync(nodeDir, { recursive: true });
    }
    const mxwebFileName = `${newNode.id}.mxweb`;
    const mxwebTargetPath = path.join(nodeDir, mxwebFileName);
    fs.copyFileSync(file.path, mxwebTargetPath);

    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      this.logger.warn(`[saveLibraryAs] Failed to delete temp file: ${(e as Error).message}`);
    }

    return { nodeId: newNode.id, fileName: newNode.name, path: newNode.path, parentId: newNode.parentId };
  }
}
