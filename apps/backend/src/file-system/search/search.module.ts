///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilePermissionModule } from '../file-permission/file-permission.module';
import { SearchService } from './search.service';

/**
 * 文件搜索子模块
 *
 * 职责: 全文搜索（项目/文件/资源库），支持多范围搜索。
 * 依赖: DatabaseModule, FilePermissionModule
 */
@Module({
  imports: [DatabaseModule, FilePermissionModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
