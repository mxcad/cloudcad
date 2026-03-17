///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { VersionControlService } from './version-control.service';
import { SvnLogResponseDto, FileContentResponseDto } from './dto';

@ApiTags('version-control')
@Controller('version-control')
@UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
export class VersionControlController {
  constructor(private readonly versionControlService: VersionControlService) {}

  /**
   * 获取节点的 SVN 提交历史（自动提取目录路径）
   * 传入文件路径时，会自动提取所在目录的历史记录
   * 这样可以看到节点目录下所有文件的变更记录
   */
  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取节点的 SVN 提交历史' })
  @ApiQuery({ name: 'projectId', required: true, description: '项目ID' })
  @ApiQuery({
    name: 'filePath',
    required: true,
    description: '节点路径（文件或目录路径，后端自动提取目录）',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '限制返回的记录数量',
    type: Number,
  })
  @ApiOkResponse({
    description: '获取成功',
    type: SvnLogResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '无权限' })
  @RequireProjectPermission(ProjectPermission.VERSION_READ)
  async getFileHistory(
    @Query('projectId') projectId: string,
    @Query('filePath') filePath: string,
    @Query('limit') limit?: number
  ): Promise<SvnLogResponseDto> {
    return this.versionControlService.getFileHistory(filePath, limit);
  }

  /**
   * 获取指定版本的文件内容
   */
  @Get('file/:revision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取指定版本的文件内容' })
  @ApiParam({
    name: 'revision',
    required: true,
    description: '修订版本号',
    type: Number,
  })
  @ApiQuery({ name: 'projectId', required: true, description: '项目ID' })
  @ApiQuery({ name: 'filePath', required: true, description: '文件路径' })
  @ApiOkResponse({
    description: '获取成功',
    type: FileContentResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '无权限' })
  @RequireProjectPermission(ProjectPermission.VERSION_READ)
  async getFileContentAtRevision(
    @Param('revision', ParseIntPipe) revision: number,
    @Query('projectId') projectId: string,
    @Query('filePath') filePath: string
  ): Promise<FileContentResponseDto> {
    return this.versionControlService.getFileContentAtRevision(
      filePath,
      revision
    ) as unknown as Promise<FileContentResponseDto>;
  }
}
