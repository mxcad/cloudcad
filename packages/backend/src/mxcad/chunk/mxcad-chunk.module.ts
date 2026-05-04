///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { StorageModule } from '../../storage/storage.module';
import { ChunkUploadService } from './chunk-upload.service';
import { FileCheckService } from './file-check.service';

/**
 * Mxcad 分片上传子模块
 *
 * 职责: 分片上传的存储、检查、合并。
 *
 * 包含的服务:
 * - ChunkUploadService: 分片存储和合并
 * - FileCheckService: 文件存在性检查
 */
@Module({
  imports: [DatabaseModule, ConfigModule, CommonModule, StorageModule],
  providers: [ChunkUploadService, FileCheckService],
  exports: [ChunkUploadService, FileCheckService],
})
export class MxcadChunkModule {}
