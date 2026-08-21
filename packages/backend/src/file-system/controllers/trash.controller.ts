import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request as ExpressRequest } from "express";
import { CsrfProtected } from "../../auth/decorators/csrf-protected.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { RequireProjectPermission } from "../../common/decorators/require-project-permission.decorator";
import {
  ProjectPermission,
  SystemPermission,
} from "../../common/enums/permissions.enum";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequireProjectPermissionGuard } from "../../common/guards/require-project-permission.guard";
import { NodeTrashService } from "../../file-operations/node-trash.service";
import { FileTreeService } from "../file-tree/file-tree.service";
import { QueryChildrenDto } from "../dto/query-children.dto";
import {
  BatchOperationResponseDto,
  OperationSuccessDto,
  ProjectTrashResponseDto,
  TrashListResponseDto,
} from "../dto/file-system-response.dto";

@Controller('file-system')
@UseGuards(RequireProjectPermissionGuard, PermissionsGuard)
@ApiTags("文件系统 - 回收站")
@ApiBearerAuth()
export class TrashController {
  private readonly logger = new Logger(TrashController.name);

  constructor(
    private readonly nodeTrashService: NodeTrashService,
    private readonly fileTreeService: FileTreeService,
  ) {}

  @Get('trash')
  @ApiOperation({ summary: '获取回收站列表（统一回收站）' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'extension', required: false })
  @ApiQuery({ name: 'fileStatus', required: false })
  @ApiResponse({
    status: 200,
    description: '获取回收站列表成功',
    type: TrashListResponseDto,
  })
  async getTrash(
    @Request() req,
    @Query('projectId') projectId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('search') search?: string,
    @Query('extension') extension?: string,
    @Query('fileStatus') fileStatus?: string,
  ) {
    return this.fileTreeService.getTrashItems(req.user.id, { projectId, page, limit, sortBy, sortOrder, search, extension, fileStatus });
  }

  @Post("trash/restore")
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
    return this.nodeTrashService.restoreTrashItems(body.itemIds, req.user.id);
  }

  @Delete('trash/items')
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
  async permanentlyDeleteTrashItems(
    @Body() body: { itemIds: string[] },
    @Request() req: ExpressRequest & { user: { id: string } },
  ) {
    return this.nodeTrashService.permanentlyDeleteTrashItems(body.itemIds, req.user.id);
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
    return this.nodeTrashService.clearTrash(req.user.id);
  }

  @Get('projects/:projectId/trash')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取项目回收站列表（已废弃，请使用 GET /trash?projectId=）' })
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
    return this.fileTreeService.getTrashItems(req.user.id, {
      projectId,
      page: query?.page,
      limit: query?.limit,
      sortBy: query?.sortBy,
      sortOrder: query?.sortOrder,
      search: query?.search,
    });
  }

  @Delete('projects/:projectId/trash')
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
    return this.nodeTrashService.clearProjectTrash(projectId, req.user.id);
  }
}
