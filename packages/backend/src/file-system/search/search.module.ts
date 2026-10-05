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

/**
 * 文件搜索子模块
 *
 * 职责: 全文搜索（项目/文件/资源库），支持多范围搜索。
 * 依赖: DatabaseModule, FilePermissionModule
 *
 * 曾额外注册并提供 DI token ISEARCH_SERVICE，但唯一消费者 node.controller.ts
 * 注入的是具体类，token 从未 @Inject，已按 ADR-0020 删除死 token 同口径清掉。
 */
@Module({
  imports: [DatabaseModule, FilePermissionModule, FileTreeModule, CommonModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
