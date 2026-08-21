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
import { IpBlacklistService } from './ip-blacklist.service';
import {
  CreateIpBlacklistEntryDto,
  IpBlacklistEntryResponseDto,
  IpBlacklistListResponseDto,
  ListIpBlacklistQueryDto,
} from './dto/ip-blacklist.dto';

@ApiTags('IP 黑名单管理')
@ApiBearerAuth()
@Controller('admin/ip-blacklist')
@UseGuards(RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_IP_BLACKLIST_MANAGE])
export class IpBlacklistController {
  constructor(private readonly ipBlacklistService: IpBlacklistService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分页查询 IP 黑名单（仅未过期条目）' })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: IpBlacklistListResponseDto,
  })
  async list(@Query() query: ListIpBlacklistQueryDto) {
    return this.ipBlacklistService.listEntries(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.keyword
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '添加 IP 黑名单条目（精确 IP 或 CIDR）' })
  @ApiResponse({
    status: 201,
    description: '添加成功',
    type: IpBlacklistEntryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'IP/CIDR 格式非法' })
  @ApiResponse({ status: 409, description: '条目已存在' })
  async create(@Body() dto: CreateIpBlacklistEntryDto, @Req() req: Request) {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    return this.ipBlacklistService.addEntry(dto, operatorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移除 IP 黑名单条目（物理删除）' })
  @ApiResponse({
    status: 200,
    description: '移除成功',
  })
  @ApiResponse({ status: 404, description: '条目不存在' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    return this.ipBlacklistService.removeEntry(id, operatorId);
  }
}
