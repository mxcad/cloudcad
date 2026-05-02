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

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { StorageModule } from '../../storage/storage.module';
import { ChunkUploadService } from './chunk-upload.service';
import { FileCheckService } from './file-check.service';
import { StorageCheckService } from '../../storage/storage-check.service';

/**
 * Mxcad 分片上传子模块
 *
 * 职责: 提供分片上传和文件存在性检查的基础设施服务。
 *
 * 包含的服务:
 * - ChunkUploadService: 分片文件上传、检查、合并和临时目录清理
 * - FileCheckService: 文件存在性检查（存储层和文件系统）
 */
@Module({
  imports: [
    ConfigModule,
    CommonModule,
    StorageModule,
  ],
  providers: [
    ChunkUploadService,
    FileCheckService,
    StorageCheckService,
  ],
  exports: [
    ChunkUploadService,
    FileCheckService,
  ],
})
export class MxcadChunkModule {}
