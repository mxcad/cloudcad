///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { FileValidationService } from './file-validation.service';

/**
 * 文件验证子模块
 *
 * 职责: 文件类型、大小、MIME、魔数（Magic Number）验证及文件名安全检查。
 * 依赖 ConfigModule（静态配置）和 RuntimeConfigModule（动态配置），不依赖其他业务模块。
 */
@Module({
  imports: [ConfigModule, RuntimeConfigModule],
  providers: [FileValidationService],
  exports: [FileValidationService],
})
export class FileValidationModule {}
