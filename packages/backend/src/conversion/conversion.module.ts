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
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ConversionEngineConfig,
  CONVERSION_ENGINE_CONFIG,
  I_CONVERSION_SERVICE,
} from './interfaces/conversion-service.interface';
import { ProcessRunnerService } from './process-runner.service';
import { FormatConverterService } from './format-converter.service';
import { OutputPathResolverService } from './output-path-resolver.service';
import * as path from 'path';
import * as os from 'os';

function resolveBinPath(): string {
  const isLinux = os.platform() === 'linux';
  const projectRoot = path.join(process.cwd(), '..', '..');
  return isLinux
    ? path.join(projectRoot, 'runtime', 'linux', 'mxcad', 'mxcadassembly')
    : path.join(projectRoot, 'runtime', 'windows', 'mxcad', 'mxcadassembly.exe');
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CONVERSION_ENGINE_CONFIG,
      useFactory: (configService: ConfigService): ConversionEngineConfig => ({
        binPath: configService.get('MXCAD_BIN_PATH') ?? resolveBinPath(),
        outputRoot:
          configService.get('MXCAD_OUTPUT_ROOT') ??
          path.join(process.cwd(), '..', '..', 'data', 'conversion'),
        maxConcurrency: Number(configService.get('MXCAD_MAX_CONCURRENCY')) || Math.min(os.cpus().length, 4),
        defaultTimeoutMs: Number(configService.get('MXCAD_DEFAULT_TIMEOUT_MS')) || 120000,
      }),
      inject: [ConfigService],
    },
    { provide: I_CONVERSION_SERVICE, useClass: FormatConverterService },
    ProcessRunnerService,
    FormatConverterService,
    OutputPathResolverService,
  ],
  exports: [
    I_CONVERSION_SERVICE,
    ProcessRunnerService,
    OutputPathResolverService,
  ],
  global: true,
})
export class ConversionModule {}
