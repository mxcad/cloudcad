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

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig, FileExtensionsConfig } from '../../config/app.config';

/**
 * 文件扩展名服务
 * 提供统一的文件扩展名判断功能，配置来自 ConfigService
 */
@Injectable()
export class FileExtensionsService {
  private readonly config: FileExtensionsConfig;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    this.config = this.configService.get('fileExtensions', { infer: true })!;
  }

  /** 获取 CAD 文件扩展名列表 */
  get cadExtensions(): string[] {
    return this.config.cad;
  }

  /** 获取图片文件扩展名列表 */
  get imageExtensions(): string[] {
    return this.config.image;
  }

  /** 获取文档文件扩展名列表 */
  get documentExtensions(): string[] {
    return this.config.document;
  }

  /** 获取压缩文件扩展名列表 */
  get archiveExtensions(): string[] {
    return this.config.archive;
  }

  /** 获取字体文件扩展名列表 */
  get fontExtensions(): string[] {
    return this.config.font;
  }

  /** 获取禁止上传的扩展名列表 */
  get forbiddenExtensions(): string[] {
    return this.config.forbidden;
  }

  /** 获取所有支持的扩展名 */
  get allSupported(): string[] {
    return [
      ...this.config.cad,
      ...this.config.image,
      ...this.config.document,
      ...this.config.archive,
    ];
  }

  /**
   * 获取文件扩展名（小写）
   */
  private getExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) return '';
    return fileName.substring(lastDotIndex).toLowerCase();
  }

  /** 检查是否为 CAD 文件 */
  isCadFile(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return this.config.cad.includes(ext);
  }

  /** 检查是否为图片文件 */
  isImageFile(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return this.config.image.includes(ext);
  }

  /** 检查是否为文档文件 */
  isDocumentFile(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return this.config.document.includes(ext);
  }

  /** 检查是否为压缩文件 */
  isArchiveFile(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return this.config.archive.includes(ext);
  }

  /** 检查是否为字体文件 */
  isFontFile(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return this.config.font.includes(ext);
  }

  /** 检查是否为禁止的文件类型 */
  isForbidden(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return this.config.forbidden.includes(ext);
  }

  /** 检查文件是否支持 */
  isSupported(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return this.allSupported.includes(ext);
  }

  /** 获取文件类型分类 */
  getFileCategory(
    fileName: string
  ): 'cad' | 'image' | 'document' | 'archive' | 'font' | 'forbidden' | 'other' {
    if (this.isForbidden(fileName)) return 'forbidden';
    if (this.isCadFile(fileName)) return 'cad';
    if (this.isImageFile(fileName)) return 'image';
    if (this.isDocumentFile(fileName)) return 'document';
    if (this.isArchiveFile(fileName)) return 'archive';
    if (this.isFontFile(fileName)) return 'font';
    return 'other';
  }

  /** 检查是否需要 MxCAD 转换 */
  needsConversion(fileName: string): boolean {
    return this.isCadFile(fileName);
  }
}
