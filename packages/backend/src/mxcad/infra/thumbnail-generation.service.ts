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
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

import {
  findThumbnail,
  findThumbnailSync,
  hasThumbnail,
  hasThumbnailSync,
  getThumbnailFileName,
  THUMBNAIL_BASE_NAME,
  THUMBNAIL_FORMATS,
  type ThumbnailFormat,
} from './thumbnail-utils';

import {
  I_CONVERSION_SERVICE,
  IConversionService,
} from '@cloudcad/conversion-engine';

/**
 * 缩略图生成结果
 */
export interface ThumbnailGenerationResult {
  /** 是否成功 */
  success: boolean;
  /** 缩略图文件路径 */
  thumbnailPath?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 缩略图生成服务
 * 使用 conversion-engine 将 CAD 文件转换为 JPG 缩略图
 */
@Injectable()
export class ThumbnailGenerationService {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  /** 是否启用自动生成 */
  private readonly enabled: boolean;
  /** 缩略图宽度 */
  private readonly width: number;
  /** 缩略图高度 */
  private readonly height: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(I_CONVERSION_SERVICE)
    private readonly conversionService: IConversionService
  ) {
    const thumbnailConfig = this.configService.get('thumbnail', {
      infer: true,
    });

    this.enabled = thumbnailConfig?.autoGenerateEnabled ?? true;
    this.width = thumbnailConfig?.width || 200;
    this.height = thumbnailConfig?.height || 200;
  }

  /**
   * 检查缩略图生成功能是否可用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 从 CAD 文件生成缩略图
   * @param cadFilePath CAD 文件（dwg/dxf）的绝对路径
   * @param outputDir 输出目录
   * @param nodeId 节点 ID（用于日志）
   * @param outputFileName 输出文件名（默认 thumbnail.webp，按优先级查找）
   * @returns 生成结果
   */
  async generateThumbnail(
    cadFilePath: string,
    outputDir: string,
    nodeId?: string,
    outputFileName?: string
  ): Promise<ThumbnailGenerationResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: '缩略图生成功能已禁用',
      };
    }

    const logPrefix = nodeId ? `[${nodeId}]` : '';

    try {
      // 检查 CAD 文件是否存在
      try {
        await fsPromises.access(cadFilePath);
      } catch {
        this.logger.error(`${logPrefix} CAD 文件不存在: ${cadFilePath}`);
        return {
          success: false,
          error: 'CAD 文件不存在',
        };
      }

      // 确保输出目录存在
      await fsPromises.mkdir(outputDir, { recursive: true });

      // 缩略图期望输出路径
      const fileName =
        outputFileName || getThumbnailFileName(THUMBNAIL_FORMATS[0]);
      const thumbnailPath = path.join(outputDir, fileName);

      this.logger.debug(`${logPrefix} 期望缩略图路径: ${thumbnailPath}`);

      // 通过 conversion-engine 生成缩略图
      const result = await this.conversionService.generateThumbnail(
        cadFilePath,
        {
          outputDir,
          outputName: fileName.replace(/\.(webp|jpg|png)$/, ''),
          width: this.width,
          height: this.height,
        }
      );

      if (result.success && result.outputPaths.length > 0) {
        this.logger.log(
          `${logPrefix} 缩略图生成成功: ${result.outputPaths[0]}`
        );
        return {
          success: true,
          thumbnailPath: result.outputPaths[0],
        };
      } else {
        this.logger.error(
          `${logPrefix} 缩略图生成失败: ${result.error}`
        );
        return {
          success: false,
          error: result.error || '缩略图生成失败',
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`${logPrefix} 缩略图生成异常: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 检查指定目录是否已存在缩略图（按优先级查找 webp > jpg > png）
   * @param nodeDir 节点目录
   * @returns 是否存在
   */
  async hasThumbnail(nodeDir: string): Promise<boolean> {
    return hasThumbnail(nodeDir);
  }

  /**
   * 获取缩略图路径（按优先级查找存在的缩略图）
   * @param nodeDir 节点目录
   * @returns 缩略图完整路径，如果不存在则返回默认 webp 路径
   */
  getThumbnailPath(nodeDir: string): string {
    const found = findThumbnailSync(nodeDir);
    return found?.path ?? path.join(nodeDir, getThumbnailFileName('webp'));
  }

  /**
   * 查找节点目录中存在的缩略图（按优先级）
   * @param nodeDir 节点目录
   * @returns 找到的缩略图信息，未找到返回 null
   */
  async findThumbnail(nodeDir: string): Promise<{
    path: string;
    fileName: string;
    format: ThumbnailFormat;
    mimeType: string;
  } | null> {
    return findThumbnail(nodeDir);
  }

  /**
   * 获取配置的缩略图尺寸
   */
  getThumbnailSize(): { width: number; height: number } {
    return {
      width: this.width,
      height: this.height,
    };
  }
}
