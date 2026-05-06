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

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IConversionService,
  ConversionResult,
  ConversionOptions,
  ConversionEngineConfig,
  CONVERSION_ENGINE_CONFIG,
} from './interfaces/conversion-service.interface';
import { ProcessRunnerService } from './process-runner.service';
import { OutputPathResolverService } from './output-path-resolver.service';

/**
 * FormatConverterService
 *
 * 实现 IConversionService，内部委托给 ProcessRunnerService 执行实际转换。
 * 所有转换操作遵循统一的流程：
 *   1. 通过 OutputPathResolverService 计算输出路径
 *   2. 构建 MxCAD 转换程序命令行参数
 *   3. 调用 ProcessRunnerService.run() 执行
 *   4. 解析进程输出，返回 ConversionResult
 */
@Injectable()
export class FormatConverterService implements IConversionService {
  private readonly logger = new Logger(FormatConverterService.name);

  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly pathResolver: OutputPathResolverService,
    @Inject(CONVERSION_ENGINE_CONFIG)
    private readonly config: ConversionEngineConfig,
  ) {}

  // -----------------------------------------------------------------------
  // toMxweb
  // -----------------------------------------------------------------------
  async toMxweb(
    sourcePath: string,
    options?: ConversionOptions,
  ): Promise<ConversionResult> {
    const outputPath = this.pathResolver.resolve(sourcePath, 'mxweb', options);
    const result = await this.processRunner.run(this.config.binPath, {
      args: ['-i', sourcePath, '-o', outputPath, '-f', 'mxweb'],
      timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        outputPaths: [],
        error: `MxWeb 转换失败: ${result.stderr || result.stdout}`,
        durationMs: result.durationMs,
      };
    }

    // 尝试从 stdout JSON 中提取实际路径
    const actualPath = this.tryExtractPath(result.stdout, outputPath);
    return {
      success: true,
      outputPaths: [actualPath],
      durationMs: result.durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // toDwg
  // -----------------------------------------------------------------------
  async toDwg(
    sourcePath: string,
    options?: ConversionOptions,
  ): Promise<ConversionResult> {
    const outputPath = this.pathResolver.resolve(sourcePath, 'dwg', options);
    const result = await this.processRunner.run(this.config.binPath, {
      args: ['-i', sourcePath, '-o', outputPath, '-f', 'dwg'],
      timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        outputPaths: [],
        error: `DWG 转换失败: ${result.stderr || result.stdout}`,
        durationMs: result.durationMs,
      };
    }

    const actualPath = this.tryExtractPath(result.stdout, outputPath);
    return {
      success: true,
      outputPaths: [actualPath],
      durationMs: result.durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // toPdf
  // -----------------------------------------------------------------------
  async toPdf(
    sourcePath: string,
    options?: ConversionOptions,
  ): Promise<ConversionResult> {
    const outputPath = this.pathResolver.resolve(sourcePath, 'pdf', options);
    const args: string[] = ['-i', sourcePath, '-o', outputPath, '-f', 'pdf'];

    if (options?.width) {
      args.push('-w', String(options.width));
    }
    if (options?.height) {
      args.push('-h', String(options.height));
    }
    if (options?.colorPolicy) {
      args.push('--color', options.colorPolicy);
    }

    const result = await this.processRunner.run(this.config.binPath, {
      args,
      timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        outputPaths: [],
        error: `PDF 转换失败: ${result.stderr || result.stdout}`,
        durationMs: result.durationMs,
      };
    }

    const actualPath = this.tryExtractPath(result.stdout, outputPath);
    return {
      success: true,
      outputPaths: [actualPath],
      durationMs: result.durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // generateThumbnail
  // -----------------------------------------------------------------------
  async generateThumbnail(
    sourcePath: string,
    options?: ConversionOptions,
  ): Promise<ConversionResult> {
    const outputPath = this.pathResolver.resolve(
      sourcePath,
      'thumbnail',
      options,
    );
    const args: string[] = [
      '-i',
      sourcePath,
      '-o',
      outputPath,
      '-f',
      'thumbnail',
    ];

    if (options?.width) {
      args.push('-w', String(options.width));
    }
    if (options?.height) {
      args.push('-h', String(options.height));
    }
    if (options?.quality) {
      args.push('-q', String(options.quality));
    }

    const result = await this.processRunner.run(this.config.binPath, {
      args,
      timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        outputPaths: [],
        error: `缩略图生成失败: ${result.stderr || result.stdout}`,
        durationMs: result.durationMs,
      };
    }

    // 缩略图可能输出多张图片（多页图纸），尝试解析 JSON 输出获知实际文件列表
    const outputPaths = this.tryExtractPaths(result.stdout, outputPath);
    return {
      success: true,
      outputPaths,
      durationMs: result.durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // splitToBins
  // -----------------------------------------------------------------------
  async splitToBins(
    sourcePath: string,
    options?: ConversionOptions,
  ): Promise<ConversionResult> {
    // 分片输出到目录而非单文件
    const outputDir = this.pathResolver.resolveDir(
      sourcePath,
      'bins',
      options,
    );
    const result = await this.processRunner.run(this.config.binPath, {
      args: ['-i', sourcePath, '-o', outputDir, '-f', 'bins'],
      timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        outputPaths: [],
        error: `BIN 分片失败: ${result.stderr || result.stdout}`,
        durationMs: result.durationMs,
      };
    }

    // 从 stdout JSON 提取分片文件列表，或执行 glob 扫描
    const outputPaths = this.tryExtractPaths(result.stdout, outputDir);
    return {
      success: true,
      outputPaths: outputPaths.length > 0 ? outputPaths : [outputDir],
      durationMs: result.durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // 辅助方法
  // -----------------------------------------------------------------------

  /**
   * 尝试从进程 stdout 的 JSON 输出中提取 newpath 字段，
   * 失败时返回 fallback 路径
   */
  private tryExtractPath(stdout: string, fallback: string): string {
    try {
      const parsed = this.processRunner.parseJsonOutput<{
        newpath?: string;
      }>(stdout);
      if (parsed?.newpath) {
        return parsed.newpath;
      }
    } catch {
      // JSON 解析失败是正常的（有些工具不输出 JSON），直接使用 fallback
    }
    return fallback;
  }

  /**
   * 尝试从 stdout JSON 中提取文件路径列表
   */
  private tryExtractPaths(stdout: string, fallback: string): string[] {
    try {
      const parsed = this.processRunner.parseJsonOutput<{
        files?: string[];
        newpath?: string;
      }>(stdout);
      if (parsed?.files && parsed.files.length > 0) {
        return parsed.files;
      }
      if (parsed?.newpath) {
        return [parsed.newpath];
      }
    } catch {
      // 忽略
    }
    return [fallback];
  }
}
