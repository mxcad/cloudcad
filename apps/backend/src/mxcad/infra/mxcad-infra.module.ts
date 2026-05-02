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
import { FileSystemService } from './file-system.service';
import { CacheManagerService } from './cache-manager.service';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import { LinuxInitService } from './linux-init.service';

/**
 * Mxcad 基础设施子模块
 *
 * 职责: 提供底层 I/O、缓存、缩略图生成和 Linux 环境初始化服务。
 * 本模块只依赖 ConfigModule，不依赖任何其他业务模块。
 *
 * 包含的服务:
 * - FileSystemService: 本地文件系统操作（目录/文件读写、分片合并）
 * - CacheManagerService: 内存缓存（TTL 支持）
 * - ThumbnailGenerationService: CAD 缩略图生成（MxWebDwg2Jpg.exe）
 * - LinuxInitService: Linux 环境初始化（OnModuleInit 自动执行）
 */
@Module({
  imports: [ConfigModule],
  providers: [
    FileSystemService,
    CacheManagerService,
    ThumbnailGenerationService,
    LinuxInitService,
  ],
  exports: [
    FileSystemService,
    ThumbnailGenerationService,
  ],
})
export class MxcadInfraModule {}
