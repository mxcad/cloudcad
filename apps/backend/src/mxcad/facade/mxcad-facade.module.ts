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
import { MxcadChunkModule } from '../chunk/mxcad-chunk.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { UploadOrchestrator } from './upload.orchestrator';

/**
 * Mxcad 上传编排子模块
 *
 * 职责: 提供上传流程的编排服务。
 *
 * 注意: FileUploadManagerFacadeService 因依赖仍在 MxCadModule 中的服务
 * （ChunkUploadManagerService, FileMergeService, UploadUtilityService,
 *  FileConversionUploadService），暂保留在 MxCadModule 中注册。
 * 待 Phase 6（MxcadUploadModule）完成后迁移至此模块。
 *
 * 包含的服务:
 * - UploadOrchestrator: 上传流程编排器
 */
@Module({
  imports: [
    ConfigModule,
    CommonModule,
    MxcadChunkModule,
    MxcadNodeModule,
    MxcadConversionModule,
  ],
  providers: [
    UploadOrchestrator,
  ],
  exports: [
    UploadOrchestrator,
  ],
})
export class MxcadFacadeModule {}
