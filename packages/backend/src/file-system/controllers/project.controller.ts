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
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { CsrfProtected } from '../../auth/decorators/csrf-protected.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { StorageInfoDto } from '../../common/dto/storage-info.dto';
import { ProjectQuotaDto } from '../../common/dto/project-quota.dto';
import {
  ProjectPermission,
  SystemPermission,
} from '../../common/enums/permissions.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { ProjectCrudService } from '../../file-operations/project-crud.service';
import { NodeTrashService } from '../../file-operations/node-trash.service';
import { FileTreeService } from '../file-tree/file-tree.service';
import { StorageInfoService } from '../storage-quota/storage-info.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { QueryProjectsDto } from '../dto/query-projects.dto';
import { UpdateNodeDto } from '../dto/update-node.dto';
import { UpdateTransferSettingsDto } from '../dto/update-transfer-settings.dto';
import {
  FileSystemNodeDto,
  OperationSuccessDto,
  ProjectDto,
  ProjectListResponseDto,
} from '../dto/file-system-response.dto';

@Controller('file-system')
@UseGuards(RequireProjectPermissionGuard, PermissionsGuard)
@ApiTags('文件系统 - 项目')
@ApiBearerAuth()
export class ProjectController {
  private readonly logger = new Logger(ProjectController.name);

  constructor(
    private readonly projectCrudService: ProjectCrudService,
    private readonly nodeTrashService: NodeTrashService,
    private readonly fileTreeService: FileTreeService,
    private readonly storageInfoService: StorageInfoService
  ) {}

  @Post('projects')
  @RequirePermissions([SystemPermission.PROJECT_CREATE])
  @CsrfProtected()
  @ApiOperation({ summary: '创建项目' })
  @ApiResponse({
    status: 201,
    description: '项目创建成功',
    type: ProjectDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 403, description: '无权限创建项目' })
  async createProject(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Body() dto: CreateProjectDto
  ) {
    return this.projectCrudService.createProject(req.user.id, dto);
  }

  @Get('projects')
  @ApiOperation({ summary: '获取项目列表' })
  @ApiResponse({
    status: 200,
    description: '获取项目列表成功',
    type: ProjectListResponseDto,
  })
  async getProjects(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Query() query?: QueryProjectsDto
  ) {
    return this.projectCrudService.getUserProjects(req.user.id, query);
  }

  @Get('projects/trash')
  @ApiOperation({ summary: '获取已删除项目列表' })
  @ApiResponse({
    status: 200,
    description: '获取已删除项目列表成功',
    type: ProjectListResponseDto,
  })
  async getDeletedProjects(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Query() query?: QueryProjectsDto
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
  @CsrfProtected()
  @ApiOperation({ summary: '更新项目信息' })
  @ApiResponse({
    status: 200,
    description: '更新项目信息成功',
    type: ProjectDto,
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async updateProject(
    @Request() req: ExpressRequest & { user: { id: string } },
    @Param('projectId') projectId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.projectCrudService.updateProject(projectId, dto, req.user?.id);
  }

  @Put('projects/:projectId/transfer-settings')
  @RequireProjectPermission(ProjectPermission.PROJECT_TRANSFER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: '更新跨项目转移设置（6 域模式矩阵）' })
  @ApiResponse({
    status: 200,
    description: '更新跨项目转移设置成功',
    type: ProjectDto,
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async updateTransferSettings(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateTransferSettingsDto,
    @Request() req: ExpressRequest & { user: { id: string } }
  ) {
    return this.projectCrudService.updateTransferSettings(
      projectId,
      dto,
      req.user?.id
    );
  }

  @Delete('projects/:projectId')
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
    @Request() req,
    @Query('permanently') permanently?: boolean
  ) {
    return this.nodeTrashService.deleteProject(
      projectId,
      permanently ?? false,
      req.user.id
    );
  }

  @Get('quota')
  @ApiOperation({ summary: '获取个人空间存储配额信息' })
  @ApiResponse({
    status: 200,
    description: '获取配额信息成功',
    type: StorageInfoDto,
  })
  async getStorageQuota(@Request() req) {
    return this.storageInfoService.getUserStorageInfo(req.user.id);
  }

  @Get('quota/project/:projectId')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取项目上传上限信息' })
  @ApiResponse({
    status: 200,
    description: '获取项目上传上限成功',
    type: ProjectQuotaDto,
  })
  async getProjectQuota(@Param('projectId') projectId: string, @Request() req) {
    return this.storageInfoService.getProjectQuota(projectId, req.user.id);
  }
}
