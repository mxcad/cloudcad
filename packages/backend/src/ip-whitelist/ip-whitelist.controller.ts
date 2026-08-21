///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved. The code, documentation, and related materials of this
// software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications
// that include this software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
import { IpWhitelistService } from './ip-whitelist.service';
import {
  CreateIpWhitelistEntryDto,
  IpWhitelistEntryResponseDto,
  IpWhitelistListResponseDto,
  ListIpWhitelistQueryDto,
} from './dto/ip-whitelist.dto';

@ApiTags('管理员 IP 白名单管理')
@ApiBearerAuth()
@Controller('admin/ip-whitelist')
@UseGuards(RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_IP_WHITELIST_MANAGE])
export class IpWhitelistController {
  constructor(private readonly ipWhitelistService: IpWhitelistService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '分页查询管理员 IP 白名单（DB 条目 + 服务器本地文件条目合并展示）',
  })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: IpWhitelistListResponseDto,
  })
  async list(@Query() query: ListIpWhitelistQueryDto) {
    return this.ipWhitelistService.listEntries(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.keyword
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '添加管理员 IP 白名单条目（精确 IP 或 CIDR）' })
  @ApiResponse({
    status: 201,
    description: '添加成功',
    type: IpWhitelistEntryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'IP/CIDR 格式非法' })
  @ApiResponse({ status: 409, description: '条目已存在' })
  async create(@Body() dto: CreateIpWhitelistEntryDto, @Req() req: Request) {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    return this.ipWhitelistService.addEntry(dto, operatorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '移除管理员 IP 白名单条目（物理删除；本地文件条目不可经此移除）',
  })
  @ApiResponse({
    status: 200,
    description: '移除成功',
  })
  @ApiResponse({ status: 400, description: '本地文件条目不可经接口移除' })
  @ApiResponse({ status: 404, description: '条目不存在' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    return this.ipWhitelistService.removeEntry(id, operatorId);
  }
}
