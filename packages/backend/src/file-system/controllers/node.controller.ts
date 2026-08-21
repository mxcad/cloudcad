import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { CsrfProtected } from '../../auth/decorators/csrf-protected.decorator';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { ProjectCrudService } from '../../file-operations/project-crud.service';
import { NodeTrashService } from '../../file-operations/node-trash.service';
import { NodeCopyMoveService } from '../../file-operations/node-copy-move.service';
import { NodeUpdateService } from '../../file-operations/file-operations.service';
import { FileTreeService } from '../file-tree/file-tree.service';
import { SearchService } from '../search/search.service';
import { CreateNodeDto } from '../dto/create-node.dto';
import { CreateFolderDto } from '../dto/create-folder.dto';
import { CreateDrawingDto } from '../dto/create-drawing.dto';
import { QueryChildrenDto } from '../dto/query-children.dto';
import { UpdateNodeDto } from '../dto/update-node.dto';
import { MoveNodeDto } from '../dto/move-node.dto';
import { CopyNodeDto } from '../dto/copy-node.dto';
import {
  BatchDeleteDto,
  BatchMoveDto,
  BatchCopyDto,
} from '../dto/batch-operations.dto';
import { SearchDto } from '../dto/search.dto';
import { ResolvePathDto } from '../dto/resolve-path.dto';
import {
  BatchOperationResponseDto,
  FileSystemNodeDto,
  NodeListResponseDto,
  NodeTreeResponseDto,
  OperationSuccessDto,
} from '../dto/file-system-response.dto';
import { ParentContextDto } from '../dto/parent-context.dto';

@Controller('file-system')
@UseGuards(RequireProjectPermissionGuard, PermissionsGuard)
@ApiTags('文件系统 - 节点')
@ApiBearerAuth()
export class NodeController {
  private readonly logger = new Logger(NodeController.name);

  constructor(
    private readonly projectCrudService: ProjectCrudService,
    private readonly nodeTrashService: NodeTrashService,
    private readonly nodeCopyMoveService: NodeCopyMoveService,
    private readonly nodeUpdateService: NodeUpdateService,
    private readonly fileTreeService: FileTreeService,
    private readonly searchService: SearchService
  ) {}

  @Post('nodes')
  @CsrfProtected()
  @ApiOperation({ summary: '创建节点（文件或文件夹）' })
  @ApiResponse({
    status: 201,
    description: '节点创建成功',
    type: FileSystemNodeDto,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '节点名称' },
        parentId: { type: 'string', description: '父节点ID（可选）' },
        description: { type: 'string', description: '节点描述（可选）' },
      },
      required: ['name'],
    },
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async createNode(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: CreateNodeDto
  ) {
    return this.projectCrudService.createNode(req.user.id, dto.name, {
      parentId: dto.parentId,
      description: dto.description,
    });
  }

  @Post('nodes/:parentId/folders')
  @CsrfProtected()
  @ApiOperation({ summary: '创建文件夹' })
  @ApiResponse({
    status: 201,
    description: '文件夹创建成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async createFolder(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Param('parentId') parentId: string,
    @Body() dto: CreateFolderDto
  ) {
    return this.projectCrudService.createFolder(req.user.id, parentId, dto);
  }

  @Post('nodes/create-drawing')
  @RequireProjectPermission(ProjectPermission.FILE_CREATE)
  @CsrfProtected()
  @ApiOperation({ summary: '创建新图纸（从空白模板）' })
  @ApiResponse({
    status: 201,
    description: '图纸创建成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async createDrawing(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: CreateDrawingDto
  ) {
    return this.fileTreeService.createDrawingFromTemplate({
      parentId: dto.parentId,
      name: dto.name,
      ownerId: req.user.id,
    });
  }

  @Get('nodes/:nodeId/root')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取节点的根节点' })
  @ApiResponse({
    status: 200,
    description: '获取根节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async getRootNode(@Param('nodeId') nodeId: string) {
    return this.fileTreeService.getRootNode(nodeId);
  }

  @Get('nodes/:nodeId/parent-context')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({
    summary: '获取节点在父目录中的分页上下文（用于搜索结果高亮定位）',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: '每页数量，默认50',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: '排序字段：name/createdAt/updatedAt/size',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: '排序方向',
  })
  @ApiResponse({
    status: 200,
    description: '获取分页上下文成功',
    type: ParentContextDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在或没有父节点' })
  async getParentContext(
    @Param('nodeId') nodeId: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc'
  ) {
    return this.fileTreeService.getParentContext(
      nodeId,
      pageSize ? parseInt(pageSize, 10) : 50,
      sortBy,
      sortOrder
    );
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
    return this.fileTreeService.getNodeTree(nodeId);
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
    return this.fileTreeService.getChildren(nodeId, req.user.id, query);
  }

  @Patch('nodes/:nodeId')
  @CsrfProtected()
  @ApiOperation({ summary: '更新节点' })
  @ApiResponse({
    status: 200,
    description: '更新节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async updateNode(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.nodeUpdateService.updateNode(nodeId, dto, req.user?.id);
  }

  @Delete('nodes/:nodeId')
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除节点' })
  @ApiResponse({
    status: 200,
    description: '删除节点成功',
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async deleteNode(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Param('nodeId') nodeId: string,
    @Body() body?: { permanently?: boolean },
    @Query('permanently') permanentlyQuery?: boolean
  ) {
    const permanently = body?.permanently ?? permanentlyQuery ?? false;
    return this.nodeTrashService.deleteNode(nodeId, permanently, req.user?.id);
  }

  @Post('nodes/:nodeId/move')
  @CsrfProtected()
  @ApiOperation({ summary: '移动节点' })
  @ApiResponse({
    status: 200,
    description: '移动节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async moveNode(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto
  ) {
    return this.nodeCopyMoveService.moveNode(
      nodeId,
      dto.targetParentId,
      req.user?.id
    );
  }

  @Post('nodes/:nodeId/copy')
  @CsrfProtected()
  @ApiOperation({ summary: '复制节点' })
  @ApiResponse({
    status: 201,
    description: '复制节点成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async copyNode(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Param('nodeId') nodeId: string,
    @Body() dto: CopyNodeDto
  ) {
    return this.nodeCopyMoveService.copyNode(
      nodeId,
      dto.targetParentId,
      req.user?.id
    );
  }

  @Post('nodes/:nodeId/restore')
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复单个节点' })
  @ApiResponse({
    status: 200,
    description: '节点恢复成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async restoreNode(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest & { user: { id: string } }
  ) {
    return this.nodeTrashService.restoreNode(nodeId, req.user.id);
  }

  @Post('nodes/batch-delete')
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量删除节点' })
  @ApiResponse({
    status: 200,
    description: '批量删除成功',
    type: BatchOperationResponseDto,
  })
  async batchDeleteNodes(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: BatchDeleteDto
  ) {
    return this.nodeTrashService.batchDeleteNodes(
      dto.nodeIds,
      dto.permanently,
      req.user?.id
    );
  }

  @Post('nodes/batch-move')
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量移动节点' })
  @ApiResponse({
    status: 200,
    description: '批量移动成功',
    type: BatchOperationResponseDto,
  })
  async batchMoveNodes(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: BatchMoveDto
  ) {
    return this.nodeCopyMoveService.batchMoveNodes(
      dto.nodeIds,
      dto.targetParentId,
      req.user?.id
    );
  }

  @Post('nodes/batch-copy')
  @CsrfProtected()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '批量复制节点' })
  @ApiResponse({
    status: 201,
    description: '批量复制成功',
    type: BatchOperationResponseDto,
  })
  async batchCopyNodes(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: BatchCopyDto
  ) {
    return this.nodeCopyMoveService.batchCopyNodes(
      dto.nodeIds,
      dto.targetParentId,
      req.user?.id
    );
  }

  @Get('search')
  @ApiOperation({
    summary: '统一搜索接口',
    description: `支持多种搜索范围：
- project: 搜索项目列表
- project_files: 搜索指定项目内的文件（需提供 projectId）
- all_projects: 搜索所有有权限访问的项目中的文件
- library: 搜索公共资源库（提供 libraryKey: drawing|block）
- global: 合并项目和跨项目文件搜索（用于项目列表页面）
- personal_space: 搜索个人空间内的文件`,
  })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: NodeListResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async search(@Request() req, @Query() dto: SearchDto) {
    this.logger.log(
      `[统一搜索] 用户ID: ${req.user.id}, 关键词: ${dto.keyword}, 范围: ${dto.scope}, 项目ID: ${dto.projectId}`
    );

    return this.searchService.search(req.user.id, dto, req.signal);
  }

  @Get('resolve-path')
  @ApiOperation({
    summary: '解析面包屑路径到目标节点',
    description:
      '将形如「项目A > 文件夹1 > 子文件夹」的面包屑路径解析为目标节点的 ID，用于可编辑面包屑导航',
  })
  @ApiResponse({
    status: 200,
    description: '路径对应的节点',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: '路径或项目不存在' })
  async resolvePath(@Request() req, @Query() dto: ResolvePathDto) {
    return this.fileTreeService.resolvePath(
      dto.projectId,
      dto.path,
      req.user.id
    );
  }
}
