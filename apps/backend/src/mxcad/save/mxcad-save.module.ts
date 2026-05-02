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
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { SaveAsService } from './save-as.service';

/**
 * Mxcad 另存为子模块
 *
 * 职责: 提供 CAD 文件的另存为功能。
 * 将 mxweb 文件转换为 dwg/dxf 格式并保存到目标位置。
 *
 * 包含的服务:
 * - SaveAsService: CAD 另存为主服务
 */
@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    CommonModule,
    FileSystemModule,
    VersionControlModule,
    MxcadConversionModule,
    MxcadNodeModule,
  ],
  providers: [SaveAsService],
  exports: [SaveAsService],
})
export class MxcadSaveModule {}
