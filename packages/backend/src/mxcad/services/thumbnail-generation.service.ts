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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
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

const execAsync = promisify(exec);

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
 * 使用 MxWebDwg2Jpg.exe 将 mxweb 文件转换为 jpg 缩略图
 */
@Injectable()
export class ThumbnailGenerationService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  /** MxWebDwg2Jpg.exe 路径 */
  private readonly dwg2JpgPath: string;
  /** 是否启用自动生成 */
  private readonly enabled: boolean;
  /** 缩略图宽度 */
  private readonly width: number;
  /** 缩略图高度 */
  private readonly height: number;
  /** 临时文件路径 */
  private readonly tempPath: string;
  /** 背景颜色 */
  private readonly backgroundColor: string;
  /** exe 是否可用 */
  private exeAvailable = false;

  constructor(private readonly configService: ConfigService) {
    const thumbnailConfig = this.configService.get('thumbnail', {
      infer: true,
    });

    this.dwg2JpgPath =
      thumbnailConfig?.dwg2JpgPath || this.getDefaultDwg2JpgPath();
    this.enabled = thumbnailConfig?.autoGenerateEnabled ?? true;
    this.width = thumbnailConfig?.width || 200;
    this.height = thumbnailConfig?.height || 200;
    this.backgroundColor = thumbnailConfig?.backgroundColor || '0x000000';
    this.tempPath =
      (this.configService.get('mxcadTempPath') as string) || 'data/temp';
  }

  /**
   * 模块初始化时检查 exe 是否可用
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('缩略图自动生成功能已禁用');
      return;
    }

    // 检查 exe 文件是否存在
    try {
      await fsPromises.access(this.dwg2JpgPath, fs.constants.X_OK);
      this.exeAvailable = true;
      this.logger.log(`MxWebDwg2Jpg.exe 可用: ${this.dwg2JpgPath}`);
      this.logger.log(`缩略图尺寸: ${this.width}x${this.height}`);
    } catch (error) {
      this.exeAvailable = false;
      this.logger.warn(`MxWebDwg2Jpg.exe 不可用: ${this.dwg2JpgPath}`);
      this.logger.warn(
        `缩略图自动生成功能将不可用: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取默认的 MxWebDwg2Jpg.exe 路径
   */
  private getDefaultDwg2JpgPath(): string {
    const isLinux = os.platform() === 'linux';
    const projectRoot = path.join(process.cwd(), '..', '..');

    if (isLinux) {
      // Linux 下暂不支持，返回空路径
      return '';
    }

    return path.join(
      projectRoot,
      'runtime',
      'windows',
      'mxcad',
      'tool',
      'MxWebDwg2Jpg.exe'
    );
  }

  /**
   * 检查缩略图生成功能是否可用
   * 需要：启用 + exe 可用 + Windows 平台
   */
  isEnabled(): boolean {
    // Linux 平台不支持
    if (os.platform() === 'linux') {
      return false;
    }
    return this.enabled && this.exeAvailable;
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
        error: '缩略图生成功能不可用（仅支持 Windows 且 exe 可用）',
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

      // 缩略图期望输出路径：支持自定义文件名（默认使用优先级最高的格式）
      const fileName = outputFileName || getThumbnailFileName(THUMBNAIL_FORMATS[0]);
      const thumbnailPath = path.join(outputDir, fileName);

      // 构建参数
      // MxWebDwg2Jpg.exe 会自动在源文件目录生成 {源文件名}.jpg
      // 参数说明：
      // file: 源DWG文件路径// 参数格式：file=源路径 这里的文件路径必须是绝对路径，并且要用正斜杠（/）分隔，避免 Windows 路径分隔符导致的问题
      // width: 输出图片宽度 (像素)，设为0则自动根据高度计算
      // height: 输出图片高度 (像素)，设为0则自动根据宽度计算
      // background_color: 背景颜色 (十六进制RGB)，0xFFFFFF为白色
      // out: 输出JPG文件的完整路径
      
      const cadFilePathForward = cadFilePath.replace(/\\/g, '/');
      const paramStr = `file=${cadFilePathForward} width=${this.width} height=${this.height} background_color=${this.backgroundColor} out=${thumbnailPath}`;

      this.logger.debug(`${logPrefix} 缩略图参数: ${paramStr}`);

      // 计算 exe 自动生成的输出路径：源文件同目录，文件名为 {源文件名}.jpg
      const sourceDir = path.dirname(cadFilePath);
      const sourceBaseName = path.basename(cadFilePath);
      const autoGeneratedPath = path.join(sourceDir, `${sourceBaseName}.jpg`);

      this.logger.debug(`${logPrefix} 期望缩略图路径: ${thumbnailPath}`);
      this.logger.debug(`${logPrefix} exe自动生成路径: ${autoGeneratedPath}`);

      // 创建临时参数文件
      const toolDir = path.dirname(this.dwg2JpgPath);
      const paramFileName = `thumbnail_param_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
      const paramFilePath = path.join(this.tempPath, paramFileName);

      try {
        // 写入参数文件
        await fsPromises.writeFile(paramFilePath, paramStr, 'utf8');

        // 构建命令：MxWebDwg2Jpg.exe cadtojpg "fileparam=..."
        const cmd = `"${this.dwg2JpgPath}" cadtojpg "fileparam=${paramFilePath}"`;

        this.logger.debug(`${logPrefix} 执行缩略图生成命令: ${cmd}`);

        // 执行命令
        const { stdout, stderr } = await execAsync(cmd, {
          encoding: 'utf8',
          timeout: 60000, // 60 秒超时
          maxBuffer: 10 * 1024 * 1024, // 10MB
          cwd: toolDir, // 在 tool 目录下执行，依赖 DLL
        });

        // 输出命令执行结果
        if (stdout) {
          this.logger.debug(`${logPrefix} 命令 stdout: ${stdout}`);
        }
        if (stderr) {
          this.logger.debug(`${logPrefix} 命令 stderr: ${stderr}`);
        }

        // 检查 exe 自动生成的缩略图文件
        try {
          await fsPromises.access(autoGeneratedPath);
          const stats = await fsPromises.stat(autoGeneratedPath);
          this.logger.log(
            `${logPrefix} 缩略图生成成功: ${autoGeneratedPath} (${stats.size} bytes)`
          );

          // 如果自动生成路径与期望路径不同，移动文件
          if (autoGeneratedPath !== thumbnailPath) {
            await fsPromises.rename(autoGeneratedPath, thumbnailPath);
            this.logger.log(
              `${logPrefix} 缩略图已移动到: ${thumbnailPath}`
            );
          }

          return {
            success: true,
            thumbnailPath,
          };
        } catch {
          this.logger.error(`${logPrefix} 缩略图文件未生成: ${autoGeneratedPath}`);
          return {
            success: false,
            error: '缩略图文件未生成',
          };
        }
      } finally {
        // 清理临时文件
        try {
          await fsPromises.unlink(paramFilePath).catch(() => {});
        } catch {
          // 忽略清理错误
        }
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
