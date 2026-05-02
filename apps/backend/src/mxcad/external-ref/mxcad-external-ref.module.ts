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
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { ExternalRefService } from './external-ref.service';
import { ExternalReferenceHandler } from './external-reference-handler.service';
import { ExternalReferenceUpdateService } from './external-reference-update.service';

/**
 * Mxcad 外部参照子模块
 *
 * 职责: 提供外部参照文件的处理、访问和更新服务。
 * 依赖 MxcadNodeModule（FileSystemNodeService）和 MxcadInfraModule（FileSystemService）。
 *
 * 包含的服务:
 * - ExternalRefService: 外部参照目录名称解析、文件拷贝
 * - ExternalReferenceHandler: 外部参照文件 HTTP 请求处理与流式传输
 * - ExternalReferenceUpdateService: 上传后外部参照信息更新
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    FileSystemModule,
    MxcadInfraModule,
    MxcadNodeModule,
  ],
  providers: [
    ExternalRefService,
    ExternalReferenceHandler,
    ExternalReferenceUpdateService,
  ],
  exports: [
    ExternalRefService,
    ExternalReferenceHandler,
    ExternalReferenceUpdateService,
  ],
})
export class MxcadExternalRefModule {}
