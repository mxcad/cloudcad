///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilePermissionModule } from '../file-permission/file-permission.module';
import { FileTreeModule } from '../file-tree/file-tree.module';
import { CommonModule } from '../../common/common.module';
import { SearchService } from './search.service';
import { ISEARCH_SERVICE } from '../interfaces/search.interface';

/**
 * 文件搜索子模块
 *
 * 职责: 全文搜索（项目/文件/资源库），支持多范围搜索。
 * 依赖: DatabaseModule, FilePermissionModule
 */
@Module({
  imports: [DatabaseModule, FilePermissionModule, FileTreeModule, CommonModule],
  providers: [
    SearchService,
    { provide: ISEARCH_SERVICE, useClass: SearchService },
  ],
  exports: [SearchService, ISEARCH_SERVICE],
})
export class SearchModule {}
