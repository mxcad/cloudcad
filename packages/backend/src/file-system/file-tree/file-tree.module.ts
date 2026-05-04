///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { StorageModule } from '../../storage/storage.module';
import { StorageQuotaModule } from '../storage-quota/storage-quota.module';
import { FileTreeService } from './file-tree.service';

/**
 * 文件树子模块
 *
 * 职责: 文件树节点创建/查询/路径解析。
 * 依赖: StorageQuotaModule
 */
@Module({
  imports: [DatabaseModule, CommonModule, StorageModule, StorageQuotaModule],
  providers: [FileTreeService],
  exports: [FileTreeService],
})
export class FileTreeModule {}
