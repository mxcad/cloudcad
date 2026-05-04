///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../../storage/storage.module';
import { CommonModule } from '../../common/common.module';
import { FilePermissionModule } from '../file-permission/file-permission.module';
import { FileDownloadExportService } from './file-download-export.service';
import { FileDownloadHandlerService } from './file-download-handler.service';

/**
 * 文件下载子模块
 *
 * 职责: 文件下载/导出/ZIP打包/CAD格式转换，HTTP 下载响应处理。
 * 依赖: DatabaseModule, StorageModule, CommonModule, FilePermissionModule
 */
@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, CommonModule, FilePermissionModule],
  providers: [FileDownloadExportService, FileDownloadHandlerService],
  exports: [FileDownloadExportService, FileDownloadHandlerService],
})
export class FileDownloadModule {}
