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

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import * as path from 'path';
import { FileUtils } from '../../common/utils/file-utils';
import { AppConfig } from '../../config/app.config';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';

export interface FileTypeConfig {
  extension: string;
  mimeType: string;
  maxSize: number;
  enabled: boolean;
  magicNumbers?: number[]; // 文件魔数（Magic Number）
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);

  // 从配置获取文件上传限制
  private readonly allowedExtensions: string[];
  private readonly maxFilesPerUpload: number;
  private readonly blockedExtensions: string[];

  // 可配置的文件类型（保持原有逻辑，但可扩展为配置化）
  private readonly configurableFileTypes: FileTypeConfig[];

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly runtimeConfigService: RuntimeConfigService,
  ) {
    const uploadConfig = this.configService.get('upload', { infer: true });
    this.allowedExtensions = uploadConfig.allowedExtensions;
    this.maxFilesPerUpload = uploadConfig.maxFilesPerUpload;
    this.blockedExtensions = uploadConfig.blockedExtensions;

    // 文件类型配置（可根据需要扩展为从配置读取）
    // 注意：maxSize 将在运行时动态获取
    this.configurableFileTypes = [
      {
        extension: '.dwg',
        mimeType: 'application/acad',
        maxSize: 0, // 将在运行时动态获取
        enabled: true,
        magicNumbers: [0x41, 0x43, 0x31, 0x30], // DWG 文件魔数
      },
      {
        extension: '.dxf',
        mimeType: 'application/dxf',
        maxSize: 0, // 将在运行时动态获取
        enabled: true,
        magicNumbers: [0x30, 0x0d, 0x0a], // DXF 文件通常以数字开头
      },
      {
        extension: '.pdf',
        mimeType: 'application/pdf',
        maxSize: 50 * 1024 * 1024,
        enabled: false,
        magicNumbers: [0x25, 0x50, 0x44, 0x46], // PDF 文件魔数 (%PDF)
      },
    ];
  }

  /**
   * 获取最大文件大小（从运行时配置）
   * 返回值为字节
   */
  private async getMaxFileSize(): Promise<number> {
    // 运行时配置中的值是 MB，需要转换为字节
    const maxFileSizeMB = await this.runtimeConfigService.getValue<number>('maxFileSize', 100);
    return maxFileSizeMB * 1024 * 1024;
  }

  /**
   * 获取文件上传配置（供外部使用）
   */
  async getFileUploadConfig() {
    const maxFileSize = await this.getMaxFileSize();
    return {
      allowedExtensions: this.allowedExtensions,
      maxFileSize,
      maxFilesPerUpload: this.maxFilesPerUpload,
      blockedExtensions: this.blockedExtensions,
    };
  }

  /**
   * 验证文件类型
   * @param file 文件对象
   */
  validateFileType(file: Express.Multer.File): void {
    const extension = `.${file.originalname.split('.').pop()?.toLowerCase() || ''}`;

    if (this.blockedExtensions.includes(extension)) {
      this.logger.error(
        `文件类型被阻止: 文件=${file.originalname}, 扩展名=${extension}`
      );
      throw new BadRequestException(`禁止上传 ${extension} 类型文件`);
    }

    if (!this.allowedExtensions.includes(extension)) {
      this.logger.error(
        `文件类型不允许: 文件=${file.originalname}, 扩展名=${extension}`
      );
      throw new BadRequestException(
        `仅允许上传以下类型文件: ${this.allowedExtensions.join(', ')}`
      );
    }

    // 严格验证 MIME 类型
    const expectedMimeType = this.getExpectedMimeType(extension);
    if (expectedMimeType) {
      // application/octet-stream 是通用的二进制流类型，允许通过
      if (
        !file.mimetype.includes('octet-stream') &&
        file.mimetype !== expectedMimeType
      ) {
        this.logger.error(
          `MIME类型不匹配: 文件=${file.originalname}, 扩展名=${extension}, 期望=${expectedMimeType}, 实际=${file.mimetype}`
        );
        throw new BadRequestException(
          `文件类型验证失败: 文件 ${file.originalname} 的 MIME 类型 ${file.mimetype} 与扩展名 ${extension} 不匹配`
        );
      }
    }

    this.logger.log(`文件类型验证通过: ${file.originalname} (${extension})`);
  }

  /**
   * 验证文件大小
   * @param file 文件对象
   */
  async validateFileSize(file: Express.Multer.File): Promise<void> {
    const maxFileSize = await this.getMaxFileSize();
    if (file.size > maxFileSize) {
      throw new BadRequestException(
        `文件大小超过限制: ${(file.size / 1024 / 1024).toFixed(2)}MB > ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`
      );
    }
  }

  /**
   * 验证文件魔数（Magic Number）
   * 增强版本：检查更多字节，支持多种魔数模式
   * @param filePath 文件路径
   * @param extension 文件扩展名
   */
  validateFileMagicNumber(filePath: string, extension: string): void {
    try {
      const config = this.configurableFileTypes.find(
        (c) => c.extension === extension && c.enabled
      );

      if (!config || !config.magicNumbers) {
        // 没有配置魔数验证，跳过
        return;
      }

      // 读取文件前 64 字节进行深度验证
      const buffer = readFileSync(filePath, { encoding: null }) as Buffer;
      const fileHeader = Array.from(buffer.slice(0, 64));

      // 检查魔数是否匹配
      const magicNumbers = config.magicNumbers;
      const isMatch = this.validateMagicNumberDeep(fileHeader, magicNumbers);

      if (!isMatch) {
        const expected = magicNumbers
          .map((b) => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ');
        const actual = fileHeader
          .slice(0, magicNumbers.length)
          .map((b) => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ');
        this.logger.error(
          `文件魔数不匹配: 扩展名=${extension}, 期望=${expected}, 实际=${actual}`
        );
        throw new BadRequestException(
          `文件内容与扩展名 ${extension} 不匹配，可能为恶意文件`
        );
      }

      // 额外的深度验证：检查文件内容结构
      if (this.needsDeepValidation(extension)) {
        this.validateFileContentDeep(buffer, extension);
      }

      this.logger.log(`文件魔数验证通过: ${filePath} (${extension})`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`文件魔数验证失败: ${error.message}`, error.stack);
      throw new BadRequestException(`文件魔数验证失败: ${error.message}`);
    }
  }

  /**
   * 深度验证魔数
   * 支持多种匹配模式：精确匹配、前缀匹配、偏移匹配
   * @param fileHeader 文件头字节数组
   * @param magicNumbers 期望的魔数
   * @returns 是否匹配
   */
  private validateMagicNumberDeep(
    fileHeader: number[],
    magicNumbers: number[]
  ): boolean {
    // 精确匹配：文件头与魔数完全匹配
    if (magicNumbers.every((byte, index) => fileHeader[index] === byte)) {
      return true;
    }

    // DWG 文件特殊处理：检查多个可能的魔数位置
    // DWG 文件可能有不同的版本，魔数可能出现在不同位置
    if (magicNumbers.length >= 4) {
      // 检查前 16 字节中是否包含魔数
      for (let offset = 0; offset < 16; offset++) {
        let match = true;
        for (
          let i = 0;
          i < magicNumbers.length && offset + i < fileHeader.length;
          i++
        ) {
          if (fileHeader[offset + i] !== magicNumbers[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 判断是否需要深度验证
   * @param extension 文件扩展名
   * @returns 是否需要深度验证
   */
  private needsDeepValidation(extension: string): boolean {
    // DWG 和 DXF 文件需要深度验证
    return ['.dwg', '.dxf'].includes(extension.toLowerCase());
  }

  /**
   * 深度验证文件内容结构
   * @param buffer 文件内容缓冲区
   * @param extension 文件扩展名
   */
  private validateFileContentDeep(buffer: Buffer, extension: string): void {
    const ext = extension.toLowerCase();

    if (ext === '.dwg') {
      // DWG 文件深度验证
      this.validateDwgFileStructure(buffer);
    } else if (ext === '.dxf') {
      // DXF 文件深度验证
      this.validateDxfFileStructure(buffer);
    }
  }

  /**
   * 验证 DWG 文件结构
   * @param buffer 文件内容缓冲区
   */
  private validateDwgFileStructure(buffer: Buffer): void {
    // DWG 文件应该有合理的结构
    // 检查文件大小（至少 100 字节）
    if (buffer.length < 100) {
      throw new BadRequestException('DWG 文件太小，可能已损坏');
    }

    // 检查 DWG 版本标识（应该在文件头附近）
    // DWG 版本通常在文件的前几个字节中
    const dwgVersions = [
      'AC1.50',
      'AC2.10',
      'AC1002',
      'AC1003',
      'AC1004',
      'AC1006',
      'AC1009',
      'AC1012',
      'AC1014',
      'AC1015',
      'AC1018',
      'AC1021',
      'AC1024',
      'AC1027',
      'AC1032',
    ];
    const headerText = buffer.toString(
      'ascii',
      0,
      Math.min(100, buffer.length)
    );

    // 检查是否包含可能的 DWG 版本标识
    const hasVersionMarker = dwgVersions.some((version) =>
      headerText.includes(version)
    );

    if (!hasVersionMarker) {
      this.logger.warn('DWG 文件缺少版本标识，可能不是有效的 DWG 文件');
    }
  }

  /**
   * 验证 DXF 文件结构
   * @param buffer 文件内容缓冲区
   */
  private validateDxfFileStructure(buffer: Buffer): void {
    // DXF 文件是文本格式，应该以特定的 DXF 标记开始
    const headerText = buffer.toString(
      'ascii',
      0,
      Math.min(100, buffer.length)
    );

    // 检查是否包含 DXF 特定的标记
    const dxfMarkers = ['0', 'SECTION', '2', 'HEADER', 'ENDSEC'];
    const hasDxfMarkers = dxfMarkers.some((marker) =>
      headerText.includes(marker)
    );

    if (!hasDxfMarkers) {
      throw new BadRequestException('DXF 文件缺少必需的 DXF 标记，可能已损坏');
    }
  }

  /**
   * 验证文件名安全性
   * @param filename 文件名
   */
  validateFilename(filename: string): void {
    try {
      FileUtils.validateFilename(filename);
      this.logger.log(`文件名验证通过: ${filename}`);
    } catch (error) {
      this.logger.error(`文件名验证失败: ${error.message}`);
      throw new BadRequestException(`文件名验证失败: ${error.message}`);
    }
  }

  /**
   * 清理文件名
   * 增强版本：增加更多安全检查
   * @param filename 原始文件名
   * @returns 清理后的安全文件名
   */
  sanitizeFilename(filename: string): string {
    try {
      // 1. 移除路径分隔符（防止路径遍历攻击）
      let sanitized = filename.replace(/[\\/]/g, '');

      // 2. 移除控制字符（0x00-0x1f, 0x7f-0x9f，故意匹配用于安全清理）
      // eslint-disable-next-line no-control-regex
      sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

      // 3. 限制文件名长度（255字节）
      if (Buffer.byteLength(sanitized, 'utf8') > 255) {
        const ext = path.extname(sanitized);
        const base = path.basename(sanitized, ext);
        const maxBaseLength = 255 - Buffer.byteLength(ext, 'utf8');
        // 截断到最大长度
        sanitized =
          Buffer.from(base).slice(0, maxBaseLength).toString('utf8') + ext;
      }

      // 4. 防止空文件名
      if (!sanitized) {
        throw new BadRequestException('文件名不能为空');
      }

      // 5. 防止文件名只有点号（隐藏文件）
      if (sanitized === '.' || sanitized === '..') {
        throw new BadRequestException('文件名不能仅为点号');
      }

      // 6. 调用 FileUtils 的清理方法进行最终清理
      sanitized = FileUtils.sanitizeFilename(sanitized);

      // 7. 验证清理后的文件名
      this.validateSanitizedFilename(sanitized);

      return sanitized;
    } catch (error) {
      this.logger.error(`文件名清理失败: ${error.message}`);
      throw new BadRequestException(`文件名清理失败: ${error.message}`);
    }
  }

  /**
   * 验证清理后的文件名
   * @param filename 清理后的文件名
   */
  private validateSanitizedFilename(filename: string): void {
    // 验证文件名不包含路径遍历字符
    if (
      filename.includes('..') ||
      filename.includes('\\') ||
      filename.includes('/')
    ) {
      throw new BadRequestException('清理后的文件名仍包含路径字符');
    }

    // 验证文件名不以点开头（防止隐藏文件）
    if (filename.startsWith('.')) {
      throw new BadRequestException('清理后的文件名不能以点开头');
    }

    // 验证文件名不以空格开头或结尾
    if (filename !== filename.trim()) {
      throw new BadRequestException('清理后的文件名包含前导或尾随空格');
    }
  }

  /**
   * 综合验证文件
   * @param file 文件对象
   */
  async validateFile(file: Express.Multer.File): Promise<void> {
    this.validateFilename(file.originalname);
    this.validateFileType(file);
    await this.validateFileSize(file);
  }

  /**
   * 综合验证文件（包含魔数验证）
   * @param filePath 文件路径
   * @param file 文件对象
   */
  async validateFileWithMagicNumber(
    filePath: string,
    file: Express.Multer.File
  ): Promise<void> {
    await this.validateFile(file);

    const extension = `.${file.originalname.split('.').pop()?.toLowerCase() || ''}`;
    this.validateFileMagicNumber(filePath, extension);
  }

  private getExpectedMimeType(extension: string): string | null {
    const config = this.configurableFileTypes.find(
      (c) => c.extension === extension && c.enabled
    );
    return config?.mimeType || null;
  }
}