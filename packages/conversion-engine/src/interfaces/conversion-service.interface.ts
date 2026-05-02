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

/**
 * 转换任务状态
 */
export interface ConversionTask {
  /** 任务唯一标识 */
  id: string;
  /** 源文件路径 */
  sourcePath: string;
  /** 目标格式 */
  targetFormat: ConversionFormat;
  /** 转换选项 */
  options?: ConversionOptions;
  /** 任务状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 创建时间 */
  createdAt: Date;
  /** 完成时间 */
  completedAt?: Date;
  /** 错误信息 */
  error?: string;
}

/**
 * 转换结果
 */
export interface ConversionResult {
  /** 是否成功 */
  success: boolean;
  /** 输出文件路径列表 */
  outputPaths: string[];
  /** 错误信息 */
  error?: string;
  /** 耗时（毫秒） */
  durationMs?: number;
}

/**
 * 转换选项
 */
export interface ConversionOptions {
  /** 超时时间（毫秒），默认 300000 */
  timeoutMs?: number;
  /** 输出目录，不传则使用默认输出路径 */
  outputDir?: string;
  /** 输出文件名（不含扩展名） */
  outputName?: string;
  /** PDF 页面宽度（像素） */
  width?: number;
  /** PDF 页面高度（像素） */
  height?: number;
  /** 颜色策略：'mono' | 'color' */
  colorPolicy?: 'mono' | 'color';
  /** JPG 质量（1-100） */
  quality?: number;
}

/**
 * 转换格式枚举
 */
export type ConversionFormat = 'mxweb' | 'dwg' | 'pdf' | 'thumbnail' | 'bins';

/**
 * 转换引擎配置
 */
export interface ConversionEngineConfig {
  /** MxCAD 转换程序路径 */
  binPath: string;
  /** 默认输出根目录 */
  outputRoot: string;
  /** 最大并发数，默认 CPU 核心数 */
  maxConcurrency?: number;
  /** 默认超时时间（毫秒），默认 300000 */
  defaultTimeoutMs?: number;
}

/**
 * 转换服务统一接口
 */
export interface IConversionService {
  /**
   * 将 CAD 文件转换为 MxWeb 格式
   * @param sourcePath - 源文件路径
   * @param options - 转换选项
   * @returns 转换结果
   */
  toMxweb(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;

  /**
   * 将 MxWeb 文件转换回 DWG 格式
   * @param sourcePath - 源文件路径
   * @param options - 转换选项
   * @returns 转换结果
   */
  toDwg(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;

  /**
   * 将 CAD 文件转换为 PDF
   * @param sourcePath - 源文件路径
   * @param options - 转换选项
   * @returns 转换结果
   */
  toPdf(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;

  /**
   * 生成 CAD 文件缩略图
   * @param sourcePath - 源文件路径
   * @param options - 转换选项
   * @returns 转换结果（通常输出一张或多张 JPG）
   */
  generateThumbnail(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;

  /**
   * 将大文件分割为多个 BIN 分片
   * @param sourcePath - 源文件路径
   * @param options - 转换选项
   * @returns 转换结果（输出分片文件列表）
   */
  splitToBins(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;
}

/** DI token：转换引擎配置 */
export const CONVERSION_ENGINE_CONFIG = Symbol('CONVERSION_ENGINE_CONFIG');

/** DI token：IConversionService 实现 */
export const I_CONVERSION_SERVICE = Symbol('IConversionService');
