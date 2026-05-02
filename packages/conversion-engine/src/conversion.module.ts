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

import { Module, DynamicModule } from '@nestjs/common';
import {
  ConversionEngineConfig,
  CONVERSION_ENGINE_CONFIG,
  I_CONVERSION_SERVICE,
} from './interfaces/conversion-service.interface';
import { ProcessRunnerService } from './process-runner.service';
import { FormatConverterService } from './format-converter.service';
import { OutputPathResolverService } from './output-path-resolver.service';

@Module({})
export class ConversionModule {
  /**
   * 动态初始化转换引擎模块
   *
   * 使用方式：
   * ```typescript
   * ConversionModule.forRoot({
   *   binPath: '/usr/local/mxcad/mxcad_converter',
   *   outputRoot: '/data/conversions',
   *   maxConcurrency: 3,
   * })
   * ```
   *
   * @param config - 转换引擎配置
   */
  static forRoot(config: ConversionEngineConfig): DynamicModule {
    return {
      module: ConversionModule,
      providers: [
        // 配置提供者
        { provide: CONVERSION_ENGINE_CONFIG, useValue: config },
        // 转换服务 — 通过 I_CONVERSION_SERVICE token 可替换实现
        { provide: I_CONVERSION_SERVICE, useClass: FormatConverterService },
        // 具体服务类
        ProcessRunnerService,
        FormatConverterService,
        OutputPathResolverService,
      ],
      exports: [
        I_CONVERSION_SERVICE,
        ProcessRunnerService,
        OutputPathResolverService,
      ],
      global: false,
    };
  }
}
