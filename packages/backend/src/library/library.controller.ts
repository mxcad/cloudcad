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
  UploadedFile,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
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
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { CreateFolderDto } from '../file-system/dto/create-folder.dto';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { MoveNodeDto } from '../file-system/dto/move-node.dto';
import { CopyNodeDto } from '../file-system/dto/copy-node.dto';
import { QueryChildrenDto } from '../file-system/dto/query-children.dto';
import { BatchDeleteDto, BatchMoveDto, BatchCopyDto } from '../file-system/dto/batch-operations.dto';
import { ResolvePathDto } from '../file-system/dto/resolve-path.dto';
import {
  FileSystemNodeDto,
  NodeListResponseDto,
  BatchOperationResponseDto,
} from '../file-system/dto/file-system-response.dto';
import { FileContentResponseDto } from '../version-control/dto/file-content-response.dto';
import { SaveLibraryNodeDto } from './dto/save-library-node.dto';
import { SaveLibraryAsDto } from './dto/save-library-as.dto';
import { LibraryService } from './library.service';
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
    private readonly libraryService: LibraryService,
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
    return this.libraryService.getCategoryTree(rootId);
  }

  @Get('drawing/children/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get child nodes of drawing library' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getDrawingChildren(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    return this.libraryService.getChildren(nodeId, query);
  }

  @Get('drawing/all-files/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Recursively get all files under drawing library node' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getDrawingAllFiles(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    return this.libraryService.getAllFilesUnderNode(nodeId, query);
  }

  @Get('drawing/filesData/*path')
  @Public()
  @ApiOperation({ summary: 'Serve drawing library file (unified entry)' })
  @ApiResponse({ status: 200, description: 'Success', content: { 'application/octet-stream': {} } })
  async getDrawingFile(@Param('path') filePath: string[] | string, @Res() res: Response) {
    // 兼容 Express 通配符参数的两种形态：数组或内部 toString() 成的逗号字符串
    const filename = (Array.isArray(filePath) ? filePath.join('/') : filePath).replace(/,/g, '/');
    return this.libraryService.serveFile(filename, res);
  }

  @Get('drawing/nodes/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get drawing library node details' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async getDrawingNode(@Param('nodeId') nodeId: string) {
    return this.libraryService.getNodeTree(nodeId);
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
    await this.libraryService.downloadNode(nodeId, userId, res, { clientIp: req.ip });
  }

  @Get('drawing/nodes/:nodeId/thumbnail')
  @Public()
  @ApiOperation({ summary: 'Get drawing library file thumbnail' })
  @ApiResponse({ status: 200, description: 'Success' })
  @ApiResponse({ status: 204, description: 'No thumbnail' })
  async getDrawingThumbnail(
    @Param('nodeId') nodeId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    await this.libraryService.serveLibraryThumbnail(nodeId, res, req);
  }

  @Get('drawing/resolve-path')
  @Public()
  @ApiOperation({
    summary: 'Resolve breadcrumb path to target node in drawing library',
    description: '将面包屑路径解析为目标节点，如 "交通/其它" → 返回对应节点',
  })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  @ApiResponse({ status: 404, description: 'Path not found' })
  async resolveDrawingPath(@Query() dto: ResolvePathDto) {
    const libraryId = await this.drawingLibraryProvider.getLibraryId();
    return this.libraryService.resolvePath(libraryId, dto.path);
  }

  // ========== Drawing library - write ==========

  @Post('drawing/save/:nodeId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Overwrite save drawing library file' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveDrawingNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: SaveLibraryNodeDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    await this.libraryService.validateLibraryNode(nodeId, 'drawing');
    return this.libraryService.saveLibraryNode(nodeId, file, req.user.id, req.user.username || req.user.nickname || req.user.email);
  }

  @Post('drawing/save-as')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Save-as drawing to drawing library' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveDrawingAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req,
  ) {
    return this.libraryService.saveLibraryAs(file, dto, req, 'drawing');
  }

  @Post('drawing/folders')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create folder in drawing library' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async createDrawingFolder(@Body() dto: CreateFolderDto, @Request() req) {
    const userId = req.user.id;
    const parentId = dto.parentId || await this.drawingLibraryProvider.getLibraryId();
    await this.libraryService.validateLibraryNode(parentId, 'drawing');
    return this.libraryService.createFolder(userId, parentId, dto);
  }

  @Delete('drawing/nodes/:nodeId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete drawing library node' })
  @ApiResponse({ status: 200, description: 'Success' })
  async deleteDrawingNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently?: boolean,
  ) {
    return this.libraryService.deleteNode(nodeId, permanently);
  }

  @Patch('drawing/nodes/:nodeId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename drawing library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async renameDrawingNode(@Param('nodeId') nodeId: string, @Body() dto: UpdateNodeDto) {
    return this.libraryService.updateNode(nodeId, dto);
  }

  @Post('drawing/nodes/:nodeId/move')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move drawing library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async moveDrawingNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.moveNode(nodeId, dto.targetParentId, req.user?.id);
  }

  @Post('drawing/nodes/:nodeId/copy')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Copy drawing library node' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async copyDrawingNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.copyNode(nodeId, dto.targetParentId, req.user?.id);
  }

  @Post('drawing/nodes/batch-delete')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch delete drawing library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchDeleteDrawingNodes(@Body() dto: BatchDeleteDto) {
    return this.libraryService.batchDeleteNodes(dto.nodeIds, dto.permanently);
  }

  @Post('drawing/nodes/batch-move')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch move drawing library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchMoveDrawingNodes(@Body() dto: BatchMoveDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.batchMoveNodes(dto.nodeIds, dto.targetParentId, req.user?.id);
  }

  @Post('drawing/nodes/batch-copy')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Batch copy drawing library nodes' })
  @ApiResponse({ status: 201, description: 'Success', type: BatchOperationResponseDto })
  async batchCopyDrawingNodes(@Body() dto: BatchCopyDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.batchCopyNodes(dto.nodeIds, dto.targetParentId, req.user?.id);
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
    return this.libraryService.getCategoryTree(rootId);
  }

  @Get('block/children/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get child nodes of block library' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getBlockChildren(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    return this.libraryService.getChildren(nodeId, query);
  }

  @Get('block/all-files/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Recursively get all files under block library node' })
  @ApiResponse({ status: 200, description: 'Success', type: NodeListResponseDto })
  async getBlockAllFiles(
    @Param('nodeId') nodeId: string,
    @Query() query?: QueryChildrenDto
  ) {
    return this.libraryService.getAllFilesUnderNode(nodeId, query);
  }

  @Get('block/resolve-path')
  @Public()
  @ApiOperation({
    summary: 'Resolve breadcrumb path to target node in block library',
    description: '将面包屑路径解析为目标节点，如 "交通/其它" → 返回对应节点',
  })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  @ApiResponse({ status: 404, description: 'Path not found' })
  async resolveBlockPath(@Query() dto: ResolvePathDto) {
    const libraryId = await this.blockLibraryProvider.getLibraryId();
    return this.libraryService.resolvePath(libraryId, dto.path);
  }

  @Get('block/filesData/*path')
  @Public()
  @ApiOperation({ summary: 'Serve block library file (unified entry)' })
  @ApiResponse({ status: 200, description: 'Success', content: { 'application/octet-stream': {} } })
  async getBlockFile(
    @Param('path') filePath: string[] | string,
    @Res() res: Response,
    @Request() req: AuthenticatedRequest
  ) {
    // 兼容 Express 通配符参数的两种形态：数组或内部 toString() 成的逗号字符串
    const filename = (Array.isArray(filePath) ? filePath.join('/') : filePath).replace(/,/g, '/');
    const referer = (req as any)?.headers?.referer || 'N/A';
    this.logger.log(`[Block file access] path: ${filename}, from: ${referer}`);
    return this.libraryService.serveFile(filename, res);
  }

  @Get('block/nodes/:nodeId')
  @Public()
  @ApiOperation({ summary: 'Get block library node details' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async getBlockNode(@Param('nodeId') nodeId: string) {
    return this.libraryService.getNodeTree(nodeId);
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
    await this.libraryService.downloadNode(nodeId, userId, res, { clientIp: req.ip });
  }

  @Get('block/nodes/:nodeId/thumbnail')
  @Public()
  @ApiOperation({ summary: 'Get block library file thumbnail' })
  @ApiResponse({ status: 200, description: 'Success' })
  @ApiResponse({ status: 204, description: 'No thumbnail' })
  async getBlockThumbnail(
    @Param('nodeId') nodeId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    await this.libraryService.serveLibraryThumbnail(nodeId, res, req);
  }

  // ========== Block library - write ==========

  @Post('block/save/:nodeId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Overwrite save block library file' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveBlockNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: SaveLibraryNodeDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    await this.libraryService.validateLibraryNode(nodeId, 'block');
    return this.libraryService.saveLibraryNode(nodeId, file, req.user.id, req.user.username || req.user.nickname || req.user.email);
  }

  @Post('block/save-as')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Save-as block to block library' })
  @ApiResponse({ status: 200, description: 'Success' })
  async saveBlockAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveLibraryAsDto,
    @Request() req,
  ) {
    return this.libraryService.saveLibraryAs(file, dto, req, 'block');
  }

  @Post('block/folders')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create folder in block library' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async createBlockFolder(@Body() dto: CreateFolderDto, @Request() req) {
    const userId = req.user.id;
    const parentId = dto.parentId || await this.blockLibraryProvider.getLibraryId();
    await this.libraryService.validateLibraryNode(parentId, 'block');
    return this.libraryService.createFolder(userId, parentId, dto);
  }

  @Delete('block/nodes/:nodeId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete block library node' })
  @ApiResponse({ status: 200, description: 'Success' })
  async deleteBlockNode(
    @Param('nodeId') nodeId: string,
    @Query('permanently') permanently?: boolean,
  ) {
    return this.libraryService.deleteNode(nodeId, permanently);
  }

  @Patch('block/nodes/:nodeId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename block library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async renameBlockNode(@Param('nodeId') nodeId: string, @Body() dto: UpdateNodeDto) {
    return this.libraryService.updateNode(nodeId, dto);
  }

  @Post('block/nodes/:nodeId/move')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move block library node' })
  @ApiResponse({ status: 200, description: 'Success', type: FileSystemNodeDto })
  async moveBlockNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.moveNode(nodeId, dto.targetParentId, req.user?.id);
  }

  @Post('block/nodes/:nodeId/copy')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Copy block library node' })
  @ApiResponse({ status: 201, description: 'Success', type: FileSystemNodeDto })
  async copyBlockNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.copyNode(nodeId, dto.targetParentId, req.user?.id);
  }

  @Post('block/nodes/batch-delete')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch delete block library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchDeleteBlockNodes(@Body() dto: BatchDeleteDto) {
    return this.libraryService.batchDeleteNodes(dto.nodeIds, dto.permanently);
  }

  @Post('block/nodes/batch-move')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch move block library nodes' })
  @ApiResponse({ status: 200, description: 'Success', type: BatchOperationResponseDto })
  async batchMoveBlockNodes(@Body() dto: BatchMoveDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.batchMoveNodes(dto.nodeIds, dto.targetParentId, req.user?.id);
  }

  @Post('block/nodes/batch-copy')
  @UseGuards(PermissionsGuard)
  @RequirePermissions([SystemPermission.LIBRARY_BLOCK_MANAGE])
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Batch copy block library nodes' })
  @ApiResponse({ status: 201, description: 'Success', type: BatchOperationResponseDto })
  async batchCopyBlockNodes(@Body() dto: BatchCopyDto, @Request() req: AuthenticatedRequest) {
    return this.libraryService.batchCopyNodes(dto.nodeIds, dto.targetParentId, req.user?.id);
  }


}
