import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VersionControlPermissionGuard } from './version-control-permission.guard';
import { NodePermission } from '../common/decorators/project-permission.decorator';
import { ProjectRole } from '../common/enums/permissions.enum';
import { VersionControlService, SvnLogEntry, SvnLogResponse } from './version-control.service';

@ApiTags('version-control')
@Controller('version-control')
@UseGuards(JwtAuthGuard, VersionControlPermissionGuard)
export class VersionControlController {
  constructor(private readonly versionControlService: VersionControlService) {}

  /**
   * 获取文件的 SVN 提交历史
   */
  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取文件的 SVN 提交历史' })
  @ApiQuery({ name: 'projectId', required: true, description: '项目ID' })
  @ApiQuery({ name: 'filePath', required: true, description: '文件路径' })
  @ApiQuery({ name: 'limit', required: false, description: '限制返回的记录数量', type: Number })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '无权限' })
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.EDITOR, ProjectRole.MEMBER, ProjectRole.VIEWER)
  async getFileHistory(
    @Query('projectId') projectId: string,
    @Query('filePath') filePath: string,
    @Query('limit') limit?: number,
  ): Promise<SvnLogResponse> {
    return this.versionControlService.getFileHistory(filePath, limit);
  }

  /**
   * 获取指定版本的文件内容
   */
  @Get('file/:revision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取指定版本的文件内容' })
  @ApiParam({ name: 'revision', required: true, description: '修订版本号', type: Number })
  @ApiQuery({ name: 'projectId', required: true, description: '项目ID' })
  @ApiQuery({ name: 'filePath', required: true, description: '文件路径' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '无权限' })
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.EDITOR, ProjectRole.MEMBER, ProjectRole.VIEWER)
  async getFileContentAtRevision(
    @Param('revision', ParseIntPipe) revision: number,
    @Query('projectId') projectId: string,
    @Query('filePath') filePath: string,
  ): Promise<{ success: boolean; message: string; content?: Buffer }> {
    return this.versionControlService.getFileContentAtRevision(filePath, revision);
  }
}