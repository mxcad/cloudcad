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
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Options,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request as ExpressRequest, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { CsrfProtected } from "../auth/decorators/csrf-protected.decorator";
import { OptionalAuth } from "../auth/decorators/optional-auth.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireProjectPermission } from "../common/decorators/require-project-permission.decorator";
import { StorageInfoDto } from "../common/dto/storage-info.dto";
import {
  ProjectPermission,
  SystemPermission,
} from "../common/enums/permissions.enum";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequireProjectPermissionGuard } from "../common/guards/require-project-permission.guard";
import { StorageQuotaInterceptor } from "../common/interceptors/storage-quota.interceptor";
import { PermissionService } from "../common/services/permission.service";
import {
  findThumbnailSync,
} from "../mxcad/infra/thumbnail-utils";
import { ProjectPermissionService } from "../roles/project-permission.service";
import { CopyNodeDto } from "./dto/copy-node.dto";
import { CreateDrawingDto } from "./dto/create-drawing.dto";
import { CreateFolderDto } from "./dto/create-folder.dto";
import { CreateNodeDto } from "./dto/create-node.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import {
  CadDownloadFormat,
  type DownloadNodeQueryDto,
} from "./dto/download-node.dto";
import {
  BatchOperationResponseDto,
  FileSystemNodeDto,
  NodeListResponseDto,
  NodeTreeResponseDto,
  OperationSuccessDto,
  PermissionCheckResponseDto,
  ProjectDto,
  ProjectListResponseDto,
  ProjectMemberDto,
  ProjectTrashResponseDto,
  ProjectUserPermissionsDto,
  TrashListResponseDto,
} from "./dto/file-system-response.dto";
import { MoveNodeDto } from "./dto/move-node.dto";
import { QueryChildrenDto } from "./dto/query-children.dto";
import { QueryProjectsDto } from "./dto/query-projects.dto";
import { SearchDto } from "./dto/search.dto";
import { UpdateNodeDto } from "./dto/update-node.dto";
import { UpdateProjectMemberDto } from "./dto/update-project-member.dto";
import { UpdateStorageQuotaDto } from "./dto/update-storage-quota.dto";
import { ProjectCrudService } from "../file-operations/project-crud.service";
import { FileOperationsService } from "../file-operations/file-operations.service";
import { FileTreeService } from "./file-tree/file-tree.service";
import { SearchService } from "./search/search.service";
import { FileDownloadHandlerService } from "./file-download/file-download-handler.service";
import { FileDownloadExportService } from "./file-download/file-download-export.service";
import { ProjectMemberService } from "./project-member/project-member.service";
import { StorageInfoService } from "./storage-quota/storage-info.service";

@Controller('file-system')
@UseGuards(JwtAuthGuard, RequireProjectPermissionGuard, PermissionsGuard)
@UseInterceptors(StorageQuotaInterceptor)
@ApiTags("文件系统")
@ApiBearerAuth()
export class FileSystemController {
  private readonly logger = new Logger(FileSystemController.name);

  private readonly DEFAULT_THUMBNAILS_DIR = path.join(
    __dirname, '..', 'assets', 'default-thumbnails',
  );

  constructor(
    private readonly projectCrudService: ProjectCrudService,
    private readonly fileOperationsService: FileOperationsService,
    private readonly fileTreeService: FileTreeService,
    private readonly searchService: SearchService,
    private readonly projectPermissionService: ProjectPermissionService,
    private readonly systemPermissionService: PermissionService,
    private readonly fileDownloadHandler: FileDownloadHandlerService,
    private readonly fileDownloadExportService: FileDownloadExportService,
    private readonly projectMemberService: ProjectMemberService,
    private readonly storageInfoService: StorageInfoService,
  ) {}

  // ==================== 项目 CRUD ====================

  @Post("projects")
  @RequirePermissions([SystemPermission.PROJECT_CREATE])
  @CsrfProtected()
  @ApiOperation({ summary: "创建项目" })
  @ApiResponse({
    status: 201,
    description: "项目创建成功",
    type: ProjectDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 403, description: "无权限创建项目" })
  async createProject(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectCrudService.createProject(req.user.id, dto);
  }

  @Get("projects")
  @ApiOperation({ summary: "获取项目列表" })
  @ApiResponse({
    status: 200,
    description: "获取项目列表成功",
    type: ProjectListResponseDto,
  })
  async getProjects(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Query() query?: QueryProjectsDto,
  ) {
    return this.projectCrudService.getUserProjects(req.user.id, query);
  }

  @Get("projects/trash")
  @ApiOperation({ summary: "获取已删除项目列表" })
  @ApiResponse({
    status: 200,
    description: "获取已删除项目列表成功",
    type: ProjectListResponseDto,
  })
  async getDeletedProjects(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Query() query?: QueryProjectsDto,
  ) {
    return this.projectCrudService.getUserDeletedProjects(req.user.id, query);
  }

  @Get('personal-space')
  @ApiOperation({ summary: '获取当前用户的私人空间' })
  @ApiResponse({
    status: 200,
    description: '获取私人空间成功',
    type: FileSystemNodeDto,
  })
  async getPersonalSpace(
    @Request() req: ExpressRequest & { user: { id: string } }
  ) {
    return this.projectCrudService.getPersonalSpace(req.user.id);
  }

  @Get('personal-space/by-user/:userId')
  @RequirePermissions([SystemPermission.SYSTEM_USER_UPDATE, SystemPermission.STORAGE_QUOTA])
  @ApiOperation({ summary: '获取指定用户的私人空间（管理员）' })
  @ApiResponse({
    status: 200,
    description: '获取私人空间成功',
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 403, description: '无权限' })
  async getUserPersonalSpace(
    @Param('userId') userId: string
  ) {
    return this.projectCrudService.getPersonalSpace(userId);
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
    return this.projectCrudService.getProject(projectId);
  }

  @Patch('projects/:projectId')
  @RequireProjectPermission(ProjectPermission.PROJECT_UPDATE)
  @CsrfProtected()
  @ApiOperation({ summary: '更新项目信息' })
  @ApiResponse({
    status: 200,
    description: '更新项目信息成功',
    type: ProjectDto,
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async updateProject(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.projectCrudService.updateProject(projectId, dto);
  }

  @Delete('projects/:projectId')
  @RequireProjectPermission(ProjectPermission.PROJECT_DELETE)
  @CsrfProtected()
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
    @Query('permanently') permanently?: boolean,
  ) {
    return this.fileOperationsService.deleteProject(
      projectId,
      permanently ?? false,
    );
  }

  // ==================== 回收站管理 ====================

  @Get('trash')
  @ApiOperation({ summary: '获取回收站列表' })
  @ApiResponse({
    status: 200,
    description: '获取回收站列表成功',
    type: TrashListResponseDto,
  })
  async getTrash(@Request() req) {
    return this.fileTreeService.getTrashItems(req.user.id);
  }

  @Post("trash/restore")
  @RequirePermissions([SystemPermission.PROJECT_CREATE])
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "恢复回收站项目" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        itemIds: { type: "array", items: { type: "string" }, description: "要恢复的回收站项ID列表" },
      },
      required: ["itemIds"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "恢复项目成功",
    type: BatchOperationResponseDto,
  })
  async restoreTrashItems(
    @Body() body: { itemIds: string[] },
    @Request() req: ExpressRequest & { user: { id: string } },
  ) {
    return this.fileOperationsService.restoreTrashItems(body.itemIds, req.user.id);
  }

  @Delete('trash/items')
  @RequirePermissions([SystemPermission.PROJECT_CREATE])
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '永久删除回收站项目' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' }, description: '要永久删除的回收站项ID列表' },
      },
      required: ['itemIds'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '永久删除项目成功',
    type: BatchOperationResponseDto,
  })
  async permanentlyDeleteTrashItems(@Body() body: { itemIds: string[] }) {
    return this.fileOperationsService.permanentlyDeleteTrashItems(body.itemIds);
  }

  @Delete('trash')
  @RequirePermissions([SystemPermission.PROJECT_CREATE])
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清空回收站' })
  @ApiResponse({
    status: 200,
    description: '清空回收站成功',
    type: OperationSuccessDto,
  })
  async clearTrash(@Request() req) {
    return this.fileOperationsService.clearTrash(req.user.id);
  }

  @Get('projects/:projectId/trash')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取项目回收站列表' })
  @ApiResponse({
    status: 200,
    description: '获取项目回收站列表成功',
    type: ProjectTrashResponseDto,
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getProjectTrash(
    @Param('projectId') projectId: string,
    @Request() req,
    @Query() query?: QueryChildrenDto,
  ) {
    return this.fileOperationsService.getProjectTrash(projectId, req.user.id, query);
  }

  @Delete('projects/:projectId/trash')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清空项目回收站' })
  @ApiResponse({
    status: 200,
    description: '项目回收站已清空',
    type: OperationSuccessDto,
  })
  async clearProjectTrash(
    @Request() req,
    @Param('projectId') projectId: string,
  ) {
    return this.fileOperationsService.clearProjectTrash(projectId, req.user.id);
  }

  // ==================== 节点操作 ====================

  @Post("nodes")
  @RequireProjectPermission(ProjectPermission.FILE_CREATE)
  @CsrfProtected()
  @ApiOperation({ summary: "创建节点（文件或文件夹）" })
  @ApiResponse({
    status: 201,
    description: "节点创建成功",
    type: FileSystemNodeDto,
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "节点名称" },
        parentId: { type: "string", description: "父节点ID（可选）" },
        description: { type: "string", description: "节点描述（可选）" },
      },
      required: ["name"],
    },
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  async createNode(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: CreateNodeDto,
  ) {
    return this.projectCrudService.createNode(req.user.id, dto.name, {
      parentId: dto.parentId,
      description: dto.description,
    });
  }

  @Post("nodes/:parentId/folders")
  @RequireProjectPermission(ProjectPermission.FILE_CREATE)
  @CsrfProtected()
  @ApiOperation({ summary: "创建文件夹" })
  @ApiResponse({
    status: 201,
    description: "文件夹创建成功",
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  async createFolder(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Param('parentId') parentId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.projectCrudService.createFolder(req.user.id, parentId, dto);
  }

  @Post("nodes/create-drawing")
  @RequireProjectPermission(ProjectPermission.FILE_CREATE)
  @CsrfProtected()
  @ApiOperation({ summary: "创建新图纸（从空白模板）" })
  @ApiResponse({
    status: 201,
    description: "图纸创建成功",
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  async createDrawing(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: CreateDrawingDto,
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
  @ApiResponse({ status: 200, description: '获取根节点成功', type: FileSystemNodeDto })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async getRootNode(@Param('nodeId') nodeId: string) {
    return this.fileTreeService.getRootNode(nodeId);
  }

  @Post("nodes/:nodeId/restore")
  @RequirePermissions([SystemPermission.PROJECT_CREATE])
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "恢复单个节点" })
  @ApiResponse({
    status: 200,
    description: "节点恢复成功",
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: "节点不存在" })
  async restoreNode(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest & { user: { id: string } },
  ) {
    return this.fileOperationsService.restoreNode(nodeId, req.user.id);
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

  @Get("nodes/:nodeId/children")
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: "获取子节点列表" })
  @ApiResponse({
    status: 200,
    description: "获取子节点列表成功",
    type: NodeListResponseDto,
  })
  @ApiResponse({ status: 404, description: "节点不存在" })
  async getChildren(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Query() query?: QueryChildrenDto,
  ) {
    return this.fileTreeService.getChildren(nodeId, req.user.id, query);
  }

  @Patch("nodes/:nodeId")
  @RequireProjectPermission(ProjectPermission.FILE_EDIT)
  @CsrfProtected()
  @ApiOperation({ summary: "更新节点" })
  @ApiResponse({
    status: 200,
    description: "更新节点成功",
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: "节点不存在" })
  async updateNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.fileOperationsService.updateNode(nodeId, dto);
  }

  @Delete("nodes/:nodeId")
  @RequireProjectPermission(ProjectPermission.FILE_DELETE)
  @CsrfProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "删除节点" })
  @ApiResponse({
    status: 200,
    description: "删除节点成功",
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 404, description: "节点不存在" })
  async deleteNode(
    @Param('nodeId') nodeId: string,
    @Body() body?: { permanently?: boolean },
    @Query('permanently') permanentlyQuery?: boolean,
  ) {
    const permanently = body?.permanently ?? permanentlyQuery ?? false;
    return this.fileOperationsService.deleteNode(nodeId, permanently);
  }

  @Post("nodes/:nodeId/move")
  @RequireProjectPermission(ProjectPermission.FILE_MOVE)
  @CsrfProtected()
  @ApiOperation({ summary: "移动节点" })
  @ApiResponse({
    status: 200,
    description: "移动节点成功",
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: "节点不存在" })
  async moveNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    return this.fileOperationsService.moveNode(nodeId, dto.targetParentId);
  }

  @Post("nodes/:nodeId/copy")
  @RequireProjectPermission(ProjectPermission.FILE_COPY)
  @CsrfProtected()
  @ApiOperation({ summary: "复制节点" })
  @ApiResponse({
    status: 201,
    description: "复制节点成功",
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 404, description: "节点不存在" })
  async copyNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto) {
    return this.fileOperationsService.copyNode(nodeId, dto.targetParentId);
  }

  // ==================== 配额管理 ====================

  @Get("quota")
  @ApiOperation({ summary: "获取存储配额信息" })
  @ApiResponse({
    status: 200,
    description: "获取配额信息成功",
    type: StorageInfoDto,
  })
  async getStorageQuota(@Request() req, @Query('nodeId') nodeId?: string, @Query('userId') userId?: string) {
    if (nodeId) {
      const node = await this.fileTreeService.getNode(nodeId);
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    return this.storageInfoService.getStorageQuota(req.user.id, nodeId, node);
    }
    const targetUserId = userId || req.user.id;
    return this.storageInfoService.getUserStorageInfo(targetUserId);
  }

  @Post("quota/update")
  @RequirePermissions([SystemPermission.STORAGE_QUOTA])
  @CsrfProtected()
  @ApiOperation({ summary: "更新节点存储配额" })
  @ApiResponse({
    status: 200,
    description: "更新配额成功",
    type: FileSystemNodeDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限更新配额" })
  @ApiResponse({ status: 404, description: "节点不存在" })
  async updateStorageQuota(@Request() req, @Body() dto: UpdateStorageQuotaDto) {
    return this.storageInfoService.updateNodeStorageQuota(dto.nodeId, dto.quota);
  }

  // ==================== 项目成员管理 ====================

  @Get('projects/:projectId/members')
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
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
    return this.projectMemberService.getProjectMembers(projectId);
  }

  @Post("projects/:projectId/members")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: "添加项目成员" })
  @ApiResponse({
    status: 201,
    description: "添加成员成功",
    type: ProjectMemberDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限添加成员" })
  @ApiResponse({ status: 404, description: "项目或用户不存在" })
  async addProjectMember(
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
    @Request() req,
  ) {
    const { userId, projectRoleId } = dto;
    return this.projectMemberService.addProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id,
    );
  }

  @Patch("projects/:projectId/members/:userId")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_ASSIGN)
  @CsrfProtected()
  @ApiOperation({ summary: "更新项目成员角色" })
  @ApiResponse({
    status: 200,
    description: "更新成员角色成功",
    type: ProjectMemberDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限修改成员角色" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectRoleId: { type: "string", description: "项目角色ID" },
        roleId: { type: "string", description: "角色ID（兼容旧字段）" },
        roleName: { type: "string", description: "角色名称" },
      },
    },
  })
  @ApiResponse({ status: 404, description: "项目或成员不存在" })
  async updateProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberDto & { roleId?: string },
    @Request() req,
  ) {
    const projectRoleId = dto.projectRoleId || dto.roleId;
    if (!projectRoleId) {
      throw new BadRequestException("projectRoleId 或 roleId 不能为空");
    }
    return this.projectMemberService.updateProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id,
    );
  }

  @Delete("projects/:projectId/members/:userId")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: "移除项目成员" })
  @ApiResponse({
    status: 200,
    description: "移除成员成功",
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限移除成员" })
  @ApiResponse({ status: 404, description: "项目或成员不存在" })
  @HttpCode(HttpStatus.OK)
  async removeProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.projectMemberService.removeProjectMember(
      projectId,
      userId,
      req.user.id,
    );
  }

  @Post("projects/:projectId/transfer")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: "转移项目所有权" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        newOwnerId: { type: "string", description: "新所有者用户ID" },
      },
      required: ["newOwnerId"],
    },
  })
  @ApiResponse({ status: 200, description: "转移所有权成功" })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限转移项目所有权" })
  @ApiResponse({ status: 404, description: "项目或用户不存在" })
  async transferProject(
    @Param('projectId') projectId: string,
    @Body() body: { newOwnerId: string },
    @Request() req,
  ) {
    return this.projectMemberService.transferProjectOwnership(
      projectId,
      body.newOwnerId,
      req.user.id,
    );
  }

  @Post("projects/:projectId/members/batch")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: "批量添加项目成员" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "string", description: "用户ID" },
              projectRoleId: { type: "string", description: "项目角色ID" },
            },
          },
          description: "要添加的成员列表",
        },
      },
      required: ["members"],
    },
  })
  @ApiResponse({ status: 201, description: "批量添加成员成功" })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限添加成员" })
  @ApiResponse({ status: 404, description: "项目不存在" })
  async addProjectMembersBatch(
    @Param('projectId') projectId: string,
    @Body() body: { members: Array<{ userId: string; projectRoleId: string }> },
    @Request() req,
  ) {
    return this.projectMemberService.batchAddProjectMembers(
      projectId,
      body.members,
      req.user.id,
    );
  }

  @Patch("projects/:projectId/members/batch")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_ASSIGN)
  @CsrfProtected()
  @ApiOperation({ summary: "批量更新项目成员角色" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "string", description: "用户ID" },
              projectRoleId: { type: "string", description: "项目角色ID" },
            },
          },
          description: "要更新的成员列表",
        },
      },
      required: ["members"],
    },
  })
  @ApiResponse({ status: 200, description: "批量更新成员角色成功" })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限修改成员角色" })
  @ApiResponse({ status: 404, description: "项目或成员不存在" })
  async updateProjectMembersBatch(
    @Param('projectId') projectId: string,
    @Body() body: { members: Array<{ userId: string; projectRoleId: string }> },
    @Request() req,
  ) {
    return this.projectMemberService.batchUpdateProjectMembers(
      projectId,
      body.members,
      req.user.id,
    );
  }

  // ==================== 缩略图 ====================

  @Get("nodes/:nodeId/thumbnail")
  @OptionalAuth()
  @ApiOperation({ summary: "获取文件节点缩略图" })
  @ApiProduces("image/*")
  @ApiResponse({ status: 200, description: "获取缩略图成功" })
  @ApiResponse({ status: 204, description: "缩略图不存在" })
  @ApiResponse({ status: 401, description: "未登录（项目文件需要登录）" })
  @ApiResponse({ status: 403, description: "无权限访问该文件" })
  @ApiResponse({ status: 404, description: "文件节点不存在" })
  async getThumbnail(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const userId = (req.user as { id?: string })?.id;

    const node = await this.fileTreeService.getNode(nodeId);
    if (!node) {
      throw new NotFoundException("文件节点不存在");
    }

    const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
    const isLibraryNode = libraryKey !== null;

    if (!userId) {
      if (isLibraryNode) {
        // 资源库允许未登录用户查看缩略图
      } else {
        throw new UnauthorizedException("未登录");
      }
    } else {
      // 使用统一的文件访问权限检查（适用于资源库和项目文件）
      const hasAccess = await this.fileDownloadExportService.checkFileAccess(
        nodeId,
        userId,
      );
      if (!hasAccess) {
        throw new ForbiddenException("无权限访问该文件");
      }
    }

    if (node.isFolder || !node.path) {
      throw new NotFoundException("文件节点不存在");
    }

    const nodeFullPath = this.fileDownloadExportService.getFullPath(node.path);
    const nodeDir = path.dirname(nodeFullPath);
    const thumbnail = findThumbnailSync(nodeDir);

    if (!thumbnail) {
      const ext = path.extname(node.name || '').toLowerCase();
      const defaultMap: Record<string, string> = {
        '.dwg': 'dwg.jpg',
        '.dxf': 'dxf.jpg',
        '.mxweb': 'mxweb.jpg',
      };
      const defaultFile = defaultMap[ext] || 'default.svg';
      const defaultPath = path.join(this.DEFAULT_THUMBNAILS_DIR, defaultFile);

      if (fs.existsSync(defaultPath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        return res.sendFile(defaultPath);
      }
      return res.status(204).end();
    }

    const thumbnailPath = thumbnail.path;

    const stats = fs.statSync(thumbnailPath);
    if (stats.isDirectory()) {
      this.logger.warn(`缩略图路径是目录而非文件: ${thumbnailPath}`);
      return res.status(204).end();
    }

    const fileStream = fs.createReadStream(thumbnailPath);

    res.setHeader("Content-Type", thumbnail.mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");

    fileStream.pipe(res);

    fileStream.on("error", (error) => {
      this.logger.error(`读取缩略图失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        res.status(500).json({ message: "读取缩略图失败" });
      }
    });
  }

  // ==================== 文件下载 ====================

  @Options("nodes/:nodeId/download")
  @ApiOperation({ summary: "下载接口 OPTIONS 预检" })
  async downloadNodeOptions(
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
  }

  @Get("nodes/:nodeId/download")
  @ApiOperation({ summary: "下载节点（文件或目录）" })
  @ApiProduces("application/octet-stream")
  @ApiResponse({ status: 200, description: "下载成功" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限访问该节点" })
  @ApiResponse({ status: 404, description: "节点不存在" })
  @RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)
  async downloadNode(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const userId = (req.user as { id: string }).id;
    const clientIp = req.ip || req.connection.remoteAddress;

    await this.fileDownloadHandler.handleDownload(nodeId, userId, res, {
      clientIp,
    });
  }

  @Get("nodes/:nodeId/download-with-format")
  @ApiOperation({
    summary: "下载节点（支持多格式转换）",
    description:
      "支持下载 CAD 文件的多种格式：DWG、MXWEB、PDF。对于 PDF 格式，可以自定义宽度、高度和颜色策略。",
  })
  @ApiProduces("application/octet-stream")
  @ApiQuery({ name: "format", required: false })
  @ApiQuery({ name: "width", required: false })
  @ApiQuery({ name: "height", required: false })
  @ApiQuery({ name: "colorPolicy", required: false })
  @ApiQuery({ name: "dwgVersion", required: false })
  @ApiResponse({ status: 200, description: "下载成功" })
  @ApiResponse({ status: 400, description: "参数错误或转换失败" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权访问该节点" })
  @ApiResponse({ status: 404, description: "节点不存在或文件不存在" })
  @RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)
  async downloadNodeWithFormat(
    @Param('nodeId') nodeId: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
    @Query() query: DownloadNodeQueryDto,
  ) {
    const userId =
      (req.user as { id?: string })?.id ||
      (req.session as { userId?: string })?.userId;
    const clientIp =
      req.ip || (req.connection as { remoteAddress?: string })?.remoteAddress;

    if (!userId) {
      throw new UnauthorizedException("未登录");
    }

    try {
      const format = query.format || CadDownloadFormat.MXWEB;

      const pdfParams =
        format === CadDownloadFormat.PDF
          ? {
              width: query.width || "2000",
              height: query.height || "2000",
              colorPolicy: query.colorPolicy || "mono",
            }
          : (format === CadDownloadFormat.DWG ||
              format === CadDownloadFormat.DXF) &&
              query.dwgVersion
            ? { dwgVersion: query.dwgVersion }
            : undefined;

      const { stream, filename, mimeType } =
        await this.fileDownloadExportService.downloadNodeWithFormat(
          nodeId,
          userId,
          format,
          pdfParams,
        );

      const origin = req.headers.origin || "*";
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );

      this.logger.log(`[下载] CORS 头已设置: ${origin}`);

      res.setHeader("Content-Type", mimeType);

      const encodedFilename = encodeURIComponent(filename);
      const fallbackFilename = filename.replace(/[^\x20-\x7E]/g, "_");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
      );

      const node = await this.fileTreeService.getNode(nodeId);
      if (node && !node.isFolder && (node.fileHash || node.id)) {
        const etag = `"${node.fileHash || node.id}_${format}"`;
        res.setHeader("ETag", etag);

        if (req.headers["if-none-match"] === etag) {
          if (
            stream &&
            typeof (stream as NodeJS.ReadableStream & { destroy?: () => void })
              .destroy === "function"
          ) {
            (
              stream as NodeJS.ReadableStream & { destroy: () => void }
            ).destroy();
          }
          return res.status(304).end();
        }

        res.setHeader("Cache-Control", "public, max-age=3600");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }

      this.logger.log(
        `多格式下载开始: ${filename} (格式: ${format}) (${nodeId}) by user ${userId} from IP ${clientIp}`,
      );

      stream.pipe(res);

      stream.on("error", (error) => {
        this.logger.error(`文件流传输错误: ${error.message}`, error.stack);

        if (
          stream &&
          typeof (stream as NodeJS.ReadableStream & { destroy?: () => void })
            .destroy === "function"
        ) {
          (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
        }

        if (!res.headersSent) {
          res.status(500).json({ message: "文件下载失败" });
        } else if (!res.writableEnded) {
          res.end();
        }
      });

      stream.on("finish", () => {
        this.logger.log(
          `多格式下载完成: ${filename} (格式: ${format}) (${nodeId}) by user ${userId}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `多格式下载失败: ${nodeId} by user ${userId} - ${error.message}`,
        error.stack,
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
          message: error.message || "文件下载失败",
        });
      }
    }
  }



  // ==================== 权限检查 ====================

  @Get("projects/:projectId/permissions")
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: "获取用户在项目中的权限列表" })
  @ApiResponse({
    status: 200,
    description: "成功获取用户权限列表",
    type: ProjectUserPermissionsDto,
  })
  async getUserProjectPermissions(
    @Request() req,
    @Param('projectId') projectId: string,
  ) {
    const permissions = await this.projectPermissionService.getUserPermissions(
      req.user.id,
      projectId,
    );
    return {
      projectId,
      userId: req.user.id,
      permissions,
    };
  }

  @Get("projects/:projectId/permissions/check")
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: "检查用户是否具有特定权限" })
  @ApiQuery({
    name: "permission",
    enum: Object.values(ProjectPermission),
    enumName: "ProjectPermissionEnum",
    description: "要检查的权限",
  })
  @ApiResponse({
    status: 200,
    description: "权限检查结果",
    type: PermissionCheckResponseDto,
  })
  async checkProjectPermission(
    @Request() req,
    @Param('projectId') projectId: string,
    @Query('permission') permission: ProjectPermission,
  ) {
    if (!permission) {
      throw new BadRequestException("缺少 permission 参数");
    }

    const hasPermission = await this.projectPermissionService.checkPermission(
      req.user.id,
      projectId,
      permission as ProjectPermission,
    );

    return {
      projectId,
      userId: req.user.id,
      permission,
      hasPermission,
    };
  }

  @Get("projects/:projectId/role")
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: "获取用户在项目中的角色" })
  @ApiResponse({ status: 200, description: "成功获取用户角色" })
  async getUserProjectRole(
    @Request() req,
    @Param('projectId') projectId: string,
  ) {
    const role = await this.projectPermissionService.getUserRole(
      req.user.id,
      projectId,
    );

    return {
      projectId,
      userId: req.user.id,
      role,
    };
  }

  // ==================== 搜索 ====================

  @Get("search")
  @ApiOperation({
    summary: "统一搜索接口",
    description: `支持多种搜索范围：
- project: 搜索项目列表
- project_files: 搜索指定项目内的文件（需提供 projectId）
- all_projects: 搜索所有有权限访问的项目中的文件`,
  })
  @ApiResponse({
    status: 200,
    description: "搜索成功",
    type: NodeListResponseDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  async search(@Request() req, @Query() dto: SearchDto) {
    this.logger.log(
      `[统一搜索] 用户ID: ${req.user.id}, 关键词: ${dto.keyword}, 范围: ${dto.scope}, 项目ID: ${dto.projectId}`,
    );

    return this.searchService.search(req.user.id, dto, req.signal);
  }

  // ==================== Helper ====================

  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      dwg: "application/acad",
      dxf: "application/dxf",
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      txt: "text/plain",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }
}
