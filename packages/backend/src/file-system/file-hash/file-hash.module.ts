///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { FileHashService } from './file-hash.service';

/**
 * 文件哈希子模块
 *
 * 职责: 提供文件 MD5 哈希计算功能（Buffer 和 Stream）。
 * 本模块无任何外部模块依赖，为纯工具模块。
 */
@Module({
  providers: [FileHashService],
  exports: [FileHashService],
})
export class FileHashModule {}
