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
import * as path from 'path';
import * as fs from 'fs';
import {
  ConversionFormat,
  ConversionOptions,
  ConversionEngineConfig,
  CONVERSION_ENGINE_CONFIG,
} from './interfaces/conversion-service.interface';

/**
 * OutputPathResolverService
 *
 * 统一管理转换输出路径的计算逻辑。
 * 根据源文件路径、目标格式和选项，生成标准化的输出路径，
 * 并确保输出目录存在。
 */
@Injectable()
export class OutputPathResolverService {
  private readonly logger = new Logger(OutputPathResolverService.name);

  constructor(
    @Inject(CONVERSION_ENGINE_CONFIG)
    private readonly config: ConversionEngineConfig,
  ) {}

  /** 格式 → 文件扩展名映射 */
  private static readonly FORMAT_EXTENSIONS: Record<ConversionFormat, string> = {
    mxweb: '.mxweb',
    dwg: '.dwg',
    pdf: '.pdf',
    thumbnail: '.jpg',
    bins: '.bin',
  };

  /**
   * 解析输出文件路径
   *
   * 路径生成规则：
   *   {outputRoot}/{datePrefix}/{timestamp}_{random}.{ext}
   *
   * 如果 options.outputDir 不为空，则优先使用。
   *
   * @param sourcePath - 源文件路径
   * @param format     - 目标格式
   * @param options    - 转换选项
   * @returns 完整的输出文件路径
   */
  resolve(
    sourcePath: string,
    format: ConversionFormat,
    options?: ConversionOptions,
  ): string {
    const outputRoot = options?.outputDir ?? this.config.outputRoot;
    const ext = OutputPathResolverService.FORMAT_EXTENSIONS[format];
    const basename = options?.outputName ?? this.generateBaseName(sourcePath);
    const outputPath = path.join(outputRoot, `${basename}${ext}`);

    this.ensureDir(path.dirname(outputPath));
    return outputPath;
  }

  /**
   * 解析输出目录路径
   *
   * 对于 splitToBins 等会产生多个输出文件的场景，
   * 返回一个子目录而非单个文件路径。
   *
   * 目录规则：
   *   {outputRoot}/{datePrefix}/{timestamp}_{random}/
   *
   * @param sourcePath - 源文件路径
   * @param format     - 目标格式
   * @param options    - 转换选项
   * @returns 输出目录路径
   */
  resolveDir(
    sourcePath: string,
    format: ConversionFormat,
    options?: ConversionOptions,
  ): string {
    const outputRoot = options?.outputDir ?? this.config.outputRoot;
    const basename = options?.outputName ?? this.generateBaseName(sourcePath);
    const dir = path.join(outputRoot, `${basename}_${format}`);

    this.ensureDir(dir);
    return dir;
  }

  /**
   * 根据源文件生成唯一基础文件名（不含扩展名）
   *
   * 格式：{源文件名}_{timestamp}_{random4}
   */
  private generateBaseName(sourcePath: string): string {
    const ext = path.extname(sourcePath);
    const name = path.basename(sourcePath, ext);
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 6);
    return `${name}_${timestamp}_${random}`;
  }

  /**
   * 确保目录存在（mkdir -p）
   */
  private ensureDir(dirPath: string): void {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (err: unknown) {
      // EEXIST 在并发场景下可能出现，忽略
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'EEXIST') {
        this.logger.error(`创建目录失败: ${dirPath}`, nodeErr.message);
        throw err;
      }
    }
  }
}
