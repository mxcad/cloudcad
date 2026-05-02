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
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { FileSystemModule } from '../file-system/file-system.module';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';

/**
 * 公共资源库模块（仅保留只读功能）
 *
 * 提供图纸库和图块库的只读访问功能
 * - 图纸库：libraryKey = 'drawing'
 * - 图块库：libraryKey = 'block'
 *
 * 注意：上传/保存/删除等写操作已废弃，统一走文件管理模块
 */
@Module({
  imports: [DatabaseModule, CommonModule, FileSystemModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
