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
import { FileSystemModule } from '../../file-system/file-system.module';
import { FileSystemService as MainFileSystemService } from '../../file-system/file-system.service';
import { VersionControlModule } from '../../version-control/version-control.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadChunkModule } from '../chunk/mxcad-chunk.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadUploadModule } from '../upload/mxcad-upload.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { UploadOrchestrator } from './upload.orchestrator';
import { FileUploadManagerFacadeService } from './file-upload-manager-facade.service';

/**
 * Mxcad 上传编排子模块
 *
 * 职责: 提供上传流程的编排服务。
 *
 * 包含的服务:
 * - UploadOrchestrator: 上传流程编排器
 * - FileUploadManagerFacadeService: 上传管理器门面
 */
@Module({
  imports: [
    ConfigModule,
    CommonModule,
    FileSystemModule,
    VersionControlModule,
    MxcadNodeModule,
    MxcadConversionModule,
    MxcadChunkModule,
    MxcadInfraModule,
    MxcadUploadModule,
    MxcadExternalRefModule,
    MxcadSaveModule,
  ],
  providers: [
    UploadOrchestrator,
    FileUploadManagerFacadeService,
    { provide: 'FileSystemServiceMain', useExisting: MainFileSystemService },
  ],
  exports: [
    UploadOrchestrator,
    FileUploadManagerFacadeService,
  ],
})
export class MxcadFacadeModule {}
