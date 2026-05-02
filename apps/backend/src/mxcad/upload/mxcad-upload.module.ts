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
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { StorageModule } from '../../storage/storage.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { FileMergeService } from './file-merge.service';
import { FileConversionUploadService } from './file-conversion-upload.service';
import { UploadUtilityService } from './upload-utility.service';
import { ChunkUploadManagerService } from './chunk-upload-manager.service';

/**
 * Mxcad 上传核心子模块
 *
 * 职责: 提供文件上传链的完整业务逻辑服务。
 * 包含分片合并、转换上传、上传辅助和分片状态管理。
 *
 * 包含的服务:
 * - FileMergeService: 分片合并+最终存储
 * - FileConversionUploadService: 上传+转换一体化流程
 * - UploadUtilityService: 上传辅助（文件转换判断、非CAD节点创建等）
 * - ChunkUploadManagerService: 分片上传状态管理
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    FileSystemModule,
    VersionControlModule,
    StorageModule,
    MxcadInfraModule,
    MxcadConversionModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
  ],
  providers: [
    FileMergeService,
    FileConversionUploadService,
    UploadUtilityService,
    ChunkUploadManagerService,
  ],
  exports: [
    FileMergeService,
    FileConversionUploadService,
    ChunkUploadManagerService,
  ],
})
export class MxcadUploadModule {}
