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
import { FileConversionService } from './file-conversion.service';

/**
 * Mxcad 文件转换子模块
 *
 * 职责: CAD 文件格式转换（DWG/DXF → MxWeb）。
 * 本模块只依赖 ConfigModule，不依赖其他业务模块。
 *
 * 包含的服务:
 * - FileConversionService: DWG→MxWeb 格式转换，支持并发限流
 */
@Module({
  imports: [ConfigModule],
  providers: [FileConversionService],
  exports: [FileConversionService],
})
export class MxcadConversionModule {}
