import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Options,
  Body,
  Param,
  Request,
  Res,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Response, Request as ExpressRequest } from 'express';

import {
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { FileSystemService } from './file-system.service';
import { ProjectPermissionService } from '../roles/project-permission.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { MoveNodeDto } from './dto/move-node.dto';
import { CopyNodeDto } from './dto/copy-node.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { QueryChildrenDto } from './dto/query-children.dto';
import {
  DownloadNodeQueryDto,
  CadDownloadFormat,
} from './dto/download-node.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import {
  FileSystemNodeDto,
  ProjectDto,
  ProjectListResponseDto,
  NodeListResponseDto,
  NodeTreeResponseDto,
  StorageInfoDto,
  TrashListResponseDto,
  OperationSuccessDto,
  BatchOperationResponseDto,
  ProjectUserPermissionsDto,
  PermissionCheckResponseDto,
  ProjectMemberDto,
} from './dto/file-system-response.dto';
import * as fs from 'fs';
import * as path from 'path';

@Controller('file-system')
@UseGuards(JwtAuthGuard, RequireProjectPermissionGuard, PermissionsGuard)
@ApiTags('文件系统')
@ApiBearerAuth()
export class FileSystemController {
  private readonly logger = new Logger(FileSystemController.name);

  constructor(
    private readonly fileSystemService: FileSystemService,
    private readonly projectPermissionService: ProjectPermissionService
  ) {}

  @Post('projects')
  @RequireProjectPermission(ProjectPermission.FILE_CREATE)
  @ApiOperation({ summary: '创建项目' })
  @ApiResponse({
    status: 201,
    description: '项目创建成功',
    type: ProjectDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 403, description: '无权限创建项目' })
  async createProject(@Request() req, @Body() dto: CreateProjectDto) {
    return this.fileSystemService.createProject(req.user.id, dto);
  }

  @Get('projects')
  @ApiOperation({ summary: '获取项目列表' })
  @ApiResponse({
    status: 200,
    description: '获取项目列表成功',
    type: ProjectListResponseDto,
  })
  async getProjects(@Request() req, @Query() query?: QueryProjectsDto) {
    return this.fileSystemService.getUserProjects(req.user.id, query);
  }

  @Get('projects/trash')
  @ApiOperation({ summary: '获取已删除项目列表' })
  @ApiResponse({
    status: 200,
    description: '获取已删除项目列表成功',
    type: ProjectListResponseDto,
  })
  async getDeletedProjects(@Request() req, @Query() query?: QueryProjectsDto) {
    this.logger.log(
      `获取已删除项目列表 - 用户ID: ${req.user?.id}, 查询参数: ${JSON.stringify(query)}`
    );
    return this.fileSystemService.getUserDeletedProjects(req.user.id, query);
  }

  @Get('projects/:projectId')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取项目详情' })
  @ApiResponse({
    status: 200,
    description: '获取项目详情成功',
    type: ProjectDto,
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getProject(@Param('projectId') projectId: string) {
    return this.fileSystemService.getProject(projectId);
  }

  @Patch('projects/:projectId')
  @RequireProjectPermission(ProjectPermission.PROJECT_UPDATE)
  @ApiOperation({ summary: '更新项目信息' })
  @ApiResponse({
    status: 200,
    description: '更新项目信息成功',
    type: ProjectDto,
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async updateProject(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.fileSystemService.updateProject(projectId, dto);
  }

  @Delete('projects/:projectId')
  @RequireProjectPermission(ProjectPermission.PROJECT_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除项目' })
  @ApiResponse({
    status: 200,
    description: '删除项目成功',
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async deleteProject(
    @Param('projectId') projectId: string,
    @Query('permanently') permanently?: boolean
  ) {
    this.logger.log(
      `删除项目请求: projectId=${projectId}, permanently=${permanently}, userId=${this['request']?.user?.id}`
    );
    const result = await this.fileSystemService.deleteProject(
      projectId,
      permanently
    );
    this.logger.log(`删除项目响应: ${JSON.stringify(result)}`);
    return result;
  }

  @Get('trash')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  @ApiOperation({ summary: '获取回收站列表' })
  @ApiResponse({
    status: 200,
    description: '获取回收站列表成功',
    type: TrashListResponseDto,
  })
  async getTrash(@Request() req) {
    return this.fileSystemService.getTrashItems(req.user.id);
  }

  @Post('trash/restore')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复回收站项目' })
  @ApiResponse({
    status: 200,
    description: '恢复项目成功',
    type: BatchOperationResponseDto,
  })
  async restoreTrashItems(@Body() body: { itemIds: string[] }) {
    return this.fileSystemService.restoreTrashItems(body.itemIds);
  }

  @Delete('trash/items')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '永久删除回收站项目' })
  @ApiResponse({
    status: 200,
    description: '永久删除项目成功',
    type: BatchOperationResponseDto,
  })
  async permanentlyDeleteTrashItems(@Body() body: { itemIds: string[] }) {
    return this.fileSystemService.permanentlyDeleteTrashItems(body.itemIds);
  }

  @Delete('trash')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清空回收站' })
  @ApiResponse({
    status: 200,
    description: '清空回收站成功',
    type: OperationSuccessDto,
  })
  async clearTrash(@Request() req) {
    return this.fileSystemService.clearTrash(req.user.id);
  }

  // ========== 项目内回收站端点 ==========

  /**
   * 获取项目内回收站内容
   */
  @Get('projects/:projectId/trash')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取项目内回收站内容' })
  @ApiResponse({
    status: 200,
    description: '成功获取项目回收站内容',
    type: TrashListResponseDto,
  })
  async getProjectTrash(
    @Request() req,
    @Param('projectId') projectId: string,
    @Query() query?: QueryChildrenDto
  ) {
    return this.fileSystemService.getProjectTrash(
      projectId,
      req.user.id,
      query
    );
  }

  /**
   * 恢复已删除的节点
   */
  @Post('nodes/:nodeId/restore')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复已删除的节点' })
  @ApiResponse({
    status: 200,
    description: '节点恢复成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async restoreNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.restoreNode(nodeId);
  }

  /**
   * 清空项目回收站
   */
  @Delete('projects/:projectId/trash')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清空项目回收站' })
  @ApiResponse({
    status: 200,
    description: '项目回收站已清空',
    type: OperationSuccessDto,
  })
  async clearProjectTrash(
    @Request() req,
    @Param('projectId') projectId: string
  ) {
    return this.fileSystemService.clearProjectTrash(projectId, req.user.id);
  }

  // ========== 统一节点操作接口 ==========

  /**
   * 统一创建节点接口
   *
   * 规则：
   * - parentId 为空 → 创建项目（isRoot=true）
   * - parentId 有值 → 创建文件夹（isRoot=false）
   *
   * 项目 = 特殊的文件夹（有成员管理）
   */
  @Post('nodes')
  @ApiOperation({ summary: '创建节点（项目或文件夹）' })
  @ApiResponse({
    status: 201,
    description: '节点创建成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async createNode(@Request() req, @Body() dto: CreateNodeDto) {
    return this.fileSystemService.createNode(req.user.id, dto.name, {
      parentId: dto.parentId,
      description: dto.description,
    });
  }

  /**
   * 创建文件夹（兼容旧 API）
   */
  @Post('nodes/:parentId/folders')
  @RequireProjectPermission(ProjectPermission.FILE_CREATE)
  @ApiOperation({ summary: '创建文件夹' })
  @ApiResponse({
    status: 201,
    description: '创建文件夹成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '父节点不存在' })
  async createFolder(
    @Request() req,
    @Param('parentId') parentId: string,
    @Body() dto: CreateFolderDto
  ) {
    return this.fileSystemService.createFolder(req.user.id, parentId, dto);
  }

  @Get('nodes/:nodeId')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取节点详情' })
  @ApiResponse({
    status: 200,
    description: '获取节点详情成功',
    type: NodeTreeResponseDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async getNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getNodeTree(nodeId);
  }

  @Get('nodes/:nodeId/root')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取根节点' })
  @ApiResponse({
    status: 200,
    description: '获取根节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async getRootNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getRootNode(nodeId);
  }

  @Get('nodes/:nodeId/children')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取子节点列表' })
  @ApiResponse({
    status: 200,
    description: '获取子节点列表成功',
    type: NodeListResponseDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async getChildren(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Query() query?: QueryChildrenDto
  ) {
    return this.fileSystemService.getChildren(nodeId, req.user.id, query);
  }
  @Patch('nodes/:nodeId')
  @RequireProjectPermission(ProjectPermission.FILE_EDIT)
  @ApiOperation({ summary: '更新节点' })
  @ApiResponse({
    status: 200,
    description: '更新节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async updateNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.fileSystemService.updateNode(nodeId, dto);
  }

  @Delete('nodes/:nodeId')
  @RequireProjectPermission(ProjectPermission.FILE_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除节点' })
  @ApiResponse({
    status: 200,
    description: '删除节点成功',
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async deleteNode(
    @Param('nodeId') nodeId: string,
    @Body() body?: { permanently?: boolean },
    @Query('permanently') permanentlyQuery?: boolean
  ) {
    const permanently = body?.permanently ?? permanentlyQuery ?? false;
    return this.fileSystemService.deleteNode(nodeId, permanently);
  }

  @Post('nodes/:nodeId/move')
  @RequireProjectPermission(ProjectPermission.FILE_MOVE)
  @ApiOperation({ summary: '移动节点' })
  @ApiResponse({
    status: 200,
    description: '移动节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async moveNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  @Post('nodes/:nodeId/copy')
  @RequireProjectPermission(ProjectPermission.FILE_COPY)
  @ApiOperation({ summary: '复制节点' })
  @ApiResponse({
    status: 201,
    description: '复制节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async copyNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto) {
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  @Post('files/upload')
  @RequireProjectPermission(ProjectPermission.FILE_UPLOAD)
  @ApiOperation({ summary: '上传文件' })
  @ApiResponse({
    status: 201,
    description: '文件上传成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async uploadFile(
    @Request() req,
    @Body() dto: UploadFileDto
  ) {
    const { parentId, fileName, fileContent } = dto;
    if (!fileName) {
      throw new BadRequestException('缺少文件名称');
    }

    if (!parentId) {
      throw new BadRequestException('缺少父节点ID');
    }

    const parentNode = await this.fileSystemService.getNode(parentId);
    if (!parentNode) {
      throw new NotFoundException('父节点不存在');
    }

    if (!parentNode.isFolder) {
      throw new BadRequestException('只能上传文件到文件夹');
    }

    let buffer: Buffer;
    if (fileContent) {
      buffer = Buffer.from(fileContent, 'base64');
    } else {
      buffer = Buffer.from(`文件内容: ${fileName}`, 'utf-8');
    }

    const mockFile = {
      originalname: fileName,
      filename: `${Date.now()}-${fileName}`,
      mimetype: this.getMimeType(fileName),
      size: buffer.length,
      buffer: buffer,
    } as any;

    return this.fileSystemService.uploadFile(req.user.id, parentId, mockFile);
  }

  @Get('storage')
  @ApiOperation({ summary: '获取存储空间信息' })
  @ApiResponse({
    status: 200,
    description: '获取存储空间信息成功',
    type: StorageInfoDto,
  })
  async getStorageInfo(@Request() req) {
    return this.fileSystemService.getUserStorageInfo(req.user.id);
  }

  @Get('projects/:projectId/members')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取项目成员列表' })
  @ApiResponse({
    status: 200,
    description: '获取成员列表成功',
    type: [ProjectMemberDto],
  })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限访问该项目' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getProjectMembers(@Param('projectId') projectId: string) {
    return this.fileSystemService.getProjectMembers(projectId);
  }

  @Post('projects/:projectId/members')
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @ApiOperation({ summary: '添加项目成员' })
  @ApiResponse({
    status: 201,
    description: '添加成员成功',
    type: ProjectMemberDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限添加成员' })
  @ApiResponse({ status: 404, description: '项目或用户不存在' })
  async addProjectMember(
    @Param('projectId') projectId: string,
    @Body() body: { userId: string; projectRoleId: string },
    @Request() req
  ) {
    const { userId, projectRoleId } = body;
    return this.fileSystemService.addProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id
    );
  }

  @Patch('projects/:projectId/members/:userId')
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_ASSIGN)
  @ApiOperation({ summary: '更新项目成员角色' })
  @ApiResponse({
    status: 200,
    description: '更新成员角色成功',
    type: ProjectMemberDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限修改成员角色' })
  @ApiResponse({ status: 404, description: '项目或成员不存在' })
  async updateProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberDto & { roleId?: string },
    @Request() req
  ) {
    // 兼容处理：优先使用 projectRoleId，如果不存在则使用 roleId
    const projectRoleId = dto.projectRoleId || dto.roleId;
    if (!projectRoleId) {
      throw new BadRequestException('projectRoleId 或 roleId 不能为空');
    }
    return this.fileSystemService.updateProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id
    );
  }

  @Delete('projects/:projectId/members/:userId')
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @ApiOperation({ summary: '移除项目成员' })
  @ApiResponse({
    status: 200,
    description: '移除成员成功',
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限移除成员' })
  @ApiResponse({ status: 404, description: '项目或成员不存在' })
  @HttpCode(HttpStatus.OK)
  async removeProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Request() req
  ) {
    return this.fileSystemService.removeProjectMember(
      projectId,
      userId,
      req.user.id
    );
  }

  @Post('projects/:projectId/transfer')
  @RequireProjectPermission(ProjectPermission.PROJECT_TRANSFER)
  @ApiOperation({ summary: '转移项目所有权' })
  @ApiResponse({
    status: 200,
    description: '转移成功',
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限转移' })
  @ApiResponse({ status: 400, description: '转移目标无效' })
  @ApiResponse({ status: 404, description: '项目或成员不存在' })
  @HttpCode(HttpStatus.OK)
  async transferProjectOwnership(
    @Param('projectId') projectId: string,
    @Body('newOwnerId') newOwnerId: string,
    @Request() req
  ) {
    return this.fileSystemService.transferProjectOwnership(
      projectId,
      newOwnerId,
      req.user.id
    );
  }

  @Post('projects/:projectId/members/batch')
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @ApiOperation({ summary: '批量添加项目成员' })
  @ApiResponse({
    status: 201,
    description: '批量添加成员成功',
    type: BatchOperationResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限添加成员' })
  @ApiResponse({ status: 404, description: '项目或用户不存在' })
  async batchAddProjectMembers(
    @Param('projectId') projectId: string,
    @Body() body: { members: Array<{ userId: string; projectRoleId: string }> },
    @Request() req
  ) {
    return this.fileSystemService.batchAddProjectMembers(
      projectId,
      body.members
    );
  }

  @Patch('projects/:projectId/members/batch')
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_ASSIGN)
  @ApiOperation({ summary: '批量更新项目成员角色' })
  @ApiResponse({
    status: 200,
    description: '批量更新成员角色成功',
    type: BatchOperationResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限修改成员角色' })
  @ApiResponse({ status: 404, description: '项目或成员不存在' })
  async batchUpdateProjectMembers(
    @Param('projectId') projectId: string,
    @Body() body: { updates: Array<{ userId: string; projectRoleId: string }> },
    @Request() req
  ) {
    return this.fileSystemService.batchUpdateProjectMembers(
      projectId,
      body.updates
    );
  }

  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      dwg: 'application/acad',
      dxf: 'application/dxf',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      txt: 'text/plain',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * 获取文件节点的缩略图
   * 缩略图文件固定为 thumbnail.jpg，位于节点目录下
   */
  @Get('nodes/:nodeId/thumbnail')
  @ApiOperation({ summary: '获取文件节点缩略图' })
  @ApiProduces('image/jpeg')
  @ApiResponse({ status: 200, description: '获取缩略图成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限访问该文件' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getThumbnail(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId = (req.session as { userId?: string })?.userId;

    if (!userId) {
      throw new UnauthorizedException('未登录');
    }

    const hasAccess = await this.fileSystemService.checkFileAccess(
      nodeId,
      userId
    );

    if (!hasAccess) {
      throw new ForbiddenException('无权限访问该文件');
    }

    const node = await this.fileSystemService.getNode(nodeId);

    if (!node || node.isFolder || !node.path) {
      throw new NotFoundException('文件节点不存在');
    }

    // 构建缩略图完整路径：filesData/YYYYMM[/N]/nodeId/thumbnail.jpg
    // 注意：node.path 包含文件名，需要先提取目录路径
    const nodeFullPath = this.fileSystemService.getFullPath(node.path);
    const nodeDir = path.dirname(nodeFullPath);
    const thumbnailPath = path.join(nodeDir, 'thumbnail.jpg');

    // 检查缩略图文件是否存在
    if (!fs.existsSync(thumbnailPath)) {
      this.logger.warn(`缩略图不存在: ${thumbnailPath}`);
      throw new NotFoundException('缩略图不存在');
    }

    // 检查路径是否是目录
    const stats = fs.statSync(thumbnailPath);
    if (stats.isDirectory()) {
      this.logger.warn(`缩略图路径是目录而非文件: ${thumbnailPath}`);
      throw new NotFoundException('缩略图不存在');
    }

    // 创建文件流
    const fileStream = fs.createReadStream(thumbnailPath);

    // 设置响应头
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // 返回文件流
    fileStream.pipe(res);

    // 处理错误
    fileStream.on('error', (error) => {
      this.logger.error(`读取缩略图失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        res.status(500).json({ message: '读取缩略图失败' });
      }
    });
  }

  /**
   * 下载节点（文件或目录）
   * 文件直接下载，目录压缩为 ZIP 下载
   */
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
    res.setHeader('Access-Control-Max-Age', '86400'); // 24小时
    res.status(204).end();
  }

  @Get('nodes/:nodeId/download')
  @ApiOperation({ summary: '下载节点（文件或目录）' })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: '下载成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限访问该节点' })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async downloadNode(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response
  ) {
    const userId =
      (req.user as { id?: string })?.id ||
      (req.session as { userId?: string })?.userId;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!userId) {
      throw new UnauthorizedException('未登录');
    }

    try {
      const { stream, filename, mimeType } =
        await this.fileSystemService.downloadNode(nodeId, userId);

      // 设置必要的响应头后再开始传输
      // 1. CORS 头（必须在最前面）
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

      this.logger.log(`[下载] CORS 头设置完成: ${origin}`);

      // 2. Content-Type
      res.setHeader('Content-Type', mimeType);

      // 3. Content-Disposition
      const encodedFilename = encodeURIComponent(filename);
      // eslint-disable-next-line no-control-regex
      const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
      );

      // 4. Cache-Control 和 ETag
      const node = await this.fileSystemService.getNode(nodeId);
      if (node && !node.isFolder && (node.fileHash || node.id)) {
        const etag = `"${node.fileHash || node.id}"`;
        res.setHeader('ETag', etag);

        // 检查 If-None-Match
        if (req.headers['if-none-match'] === etag) {
          if (typeof (stream as any).destroy === 'function') {
            (stream as any).destroy();
          }
          return res.status(304).end();
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        // 对于动态生成的 ZIP，禁用缓存
        res.setHeader('Cache-Control', 'no-cache');
      }

      // 记录下载开始
      this.logger.log(
        `下载开始: ${filename} (${nodeId}) by user ${userId} from IP ${clientIp}`
      );

      // 开始传输
      stream.pipe(res);

      // 错误处理
      stream.on('error', (error) => {
        this.logger.error(`文件流传输错误: ${error.message}`, error.stack);

        // 清理资源
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }

        if (!res.headersSent) {
          res.status(500).json({ message: '文件下载失败' });
        } else if (!res.writableEnded) {
          // 如果响应已发送但未结束，尝试结束响应
          res.end();
        }
      });

      // 记录下载完成
      stream.on('finish', () => {
        this.logger.log(
          `下载完成: ${filename} (${nodeId}) by user ${userId}, size: ${node?.size || 0} bytes`
        );
      });
    } catch (error) {
      this.logger.error(
        `下载失败: ${nodeId} by user ${userId} - ${error.message}`,
        error.stack
      );

      if (!res.headersSent) {
        const status =
          error instanceof NotFoundException
            ? 404
            : error instanceof ForbiddenException
              ? 403
              : 500;
        res.status(status).json({
          message: error.message || '文件下载失败',
        });
      }
    }
  }

  /**
   * 下载节点（支持多格式转换）
   * @param nodeId 节点 ID
   * @param req 请求对象
   * @param res 响应对象
   * @param query 查询参数（format、width、height、colorPolicy）
   */
  @Get('nodes/:nodeId/download-with-format')
  @ApiOperation({
    summary: '下载节点（支持多格式转换）',
    description:
      '支持下载 CAD 文件的多种格式：DWG、MXWEB、PDF。对于 PDF 格式，可以自定义宽度、高度和颜色策略。',
  })
  @ApiQuery({
    name: 'format',
    enum: CadDownloadFormat,
    required: false,
    description:
      '下载格式：dwg（DWG格式）、mxweb（MXWEB格式，默认）、pdf（PDF格式）',
  })
  @ApiQuery({
    name: 'width',
    required: false,
    description: 'PDF 输出宽度（像素），仅当 format=pdf 时有效，默认：2000',
  })
  @ApiQuery({
    name: 'height',
    required: false,
    description: 'PDF 输出高度（像素），仅当 format=pdf 时有效，默认：2000',
  })
  @ApiQuery({
    name: 'colorPolicy',
    required: false,
    description:
      'PDF 颜色策略（mono/color），仅当 format=pdf 时有效，默认：mono',
  })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: '下载成功' })
  @ApiResponse({ status: 400, description: '参数错误或转换失败' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权访问该节点' })
  @ApiResponse({ status: 404, description: '节点不存在或文件不存在' })
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
      throw new UnauthorizedException('未登录');
    }

    try {
      // 设置默认格式
      const format = query.format || CadDownloadFormat.MXWEB;

      // 构建 PDF 参数
      const pdfParams =
        format === CadDownloadFormat.PDF
          ? {
              width: query.width || '2000',
              height: query.height || '2000',
              colorPolicy: query.colorPolicy || 'mono',
            }
          : undefined;

      // 调用服务方法
      const { stream, filename, mimeType } =
        await this.fileSystemService.downloadNodeWithFormat(
          nodeId,
          userId,
          format,
          pdfParams
        );

      // 设置响应头（在开始流传输之前）
      // 1. CORS 头（放在最前面）
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

      // 2. Content-Type
      res.setHeader('Content-Type', mimeType);

      // 3. Content-Disposition
      const encodedFilename = encodeURIComponent(filename);
      // eslint-disable-next-line no-control-regex
      const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
      );

      // 4. Cache-Control 和 ETag
      const node = await this.fileSystemService.getNode(nodeId);
      if (node && !node.isFolder && (node.fileHash || node.id)) {
        const etag = `"${node.fileHash || node.id}_${format}"`;
        res.setHeader('ETag', etag);

        // 处理 If-None-Match
        if (req.headers['if-none-match'] === etag) {
          if (typeof (stream as any).destroy === 'function') {
            (stream as any).destroy();
          }
          return res.status(304).end();
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        // 对于动态生成的文件或文件夹，不缓存
        res.setHeader('Cache-Control', 'no-cache');
      }

      // 记录下载开始
      this.logger.log(
        `多格式下载开始: ${filename} (格式: ${format}) (${nodeId}) by user ${userId} from IP ${clientIp}`
      );

      // 管道流传输
      stream.pipe(res);

      // 错误处理
      stream.on('error', (error) => {
        this.logger.error(`文件流传输错误: ${error.message}`, error.stack);

        // 清理资源
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }

        if (!res.headersSent) {
          res.status(500).json({ message: '文件下载失败' });
        } else if (!res.writableEnded) {
          // 如果响应已发送但未结束，可以结束响应
          res.end();
        }
      });

      // 完成处理
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

  // ========== 项目权限检查端点 ==========

  /**
   * 获取用户在项目中的所有权限
   */
  @Get('projects/:projectId/permissions')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取用户在项目中的权限列表' })
  @ApiResponse({
    status: 200,
    description: '成功获取用户权限列表',
    type: ProjectUserPermissionsDto,
  })
  async getUserProjectPermissions(
    @Request() req,
    @Param('projectId') projectId: string
  ) {
    const permissions = await this.projectPermissionService.getUserPermissions(
      req.user.id,
      projectId
    );
    return {
      projectId,
      userId: req.user.id,
      permissions,
    };
  }

  /**
   * 检查用户是否具有特定权限
   */
  @Get('projects/:projectId/permissions/check')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '检查用户是否具有特定权限' })
  @ApiResponse({
    status: 200,
    description: '权限检查结果',
    type: PermissionCheckResponseDto,
  })
  async checkProjectPermission(
    @Request() req,
    @Param('projectId') projectId: string,
    @Query('permission') permission: ProjectPermission
  ) {
    if (!permission) {
      throw new BadRequestException('缺少 permission 参数');
    }

    const hasPermission = await this.projectPermissionService.checkPermission(
      req.user.id,
      projectId,
      permission
    );

    return {
      projectId,
      userId: req.user.id,
      permission,
      hasPermission,
    };
  }

  /**
   * 获取用户在项目中的角色
   */
  @Get('projects/:projectId/role')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取用户在项目中的角色' })
  @ApiResponse({ status: 200, description: '成功获取用户角色' })
  async getUserProjectRole(
    @Request() req,
    @Param('projectId') projectId: string
  ) {
    const role = await this.projectPermissionService.getUserRole(
      req.user.id,
      projectId
    );

    return {
      projectId,
      userId: req.user.id,
      role,
    };
  }
}
