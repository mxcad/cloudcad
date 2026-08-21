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

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { FontUploadTarget } from './dto/font.dto';
import {
  decodeMojibakeFileName,
  encodeMojibakeFileName,
} from './mojibake.utils';

import { I18nContext } from 'nestjs-i18n';
/**
 * 字体信息接口
 */
export interface FontInfo {
  name: string;
  size: number;
  extension: string;
  createdAt: Date;
  existsInBackend?: boolean;
  existsInFrontend?: boolean;
  creator?: string;
  updatedAt?: Date;
}

/**
 * 字体上传结果接口
 */
export type FontUploadResult = FontInfo;

/**
 * 字体管理服务
 * 负责管理后端转换程序和前端的字体文件
 */
@Injectable()
export class FontsService implements OnModuleInit {
  private readonly logger = new Logger(FontsService.name);

  /** 后端转换程序字体目录 */
  private readonly backendFontsDir: string;

  /** 前端资源字体目录 */
  private readonly frontendFontsDir: string;

  /** 支持的字体文件扩展名 */
  private readonly allowedExtensions = [
    '.ttf',
    '.otf',
    '.woff',
    '.woff2',
    '.eot',
    '.ttc',
    '.shx',
  ];

  constructor(
    private configService: ConfigService,
    private runtimeConfigService: RuntimeConfigService
  ) {
    // 从配置服务获取字体目录路径（配置已在 configuration.ts 中正确解析为绝对路径）
    const backendPath = this.configService.get<string>('fonts.backendPath');
    const frontendPath = this.configService.get<string>('fonts.frontendPath');

    // 使用配置值，如果未配置则回退到默认路径
    this.backendFontsDir = backendPath || path.join(process.cwd(), '..', '..', 'runtime', 'windows', 'mxcad', 'fonts');
    this.frontendFontsDir = frontendPath || path.join(process.cwd(), '..', '..', 'runtime', 'windows', 'mxcad', 'fonts');

    this.logger.log(`后端字体目录: ${this.backendFontsDir}`);
    this.logger.log(`前端字体目录: ${this.frontendFontsDir}`);
  }

  async onModuleInit(): Promise<void> {
    const fontMaxFileSizeMB = await this.runtimeConfigService.getValue<number>(
      'fontMaxFileSize',
      50
    );
    this.logger.log(`字体上传大小限制: ${fontMaxFileSizeMB}MB`);
  }

  /**
   * 获取字体列表
   * @param location 指定返回的字体位置：'backend'、'frontend' 或不指定返回全部
   */
  async getFonts(location?: 'backend' | 'frontend'): Promise<FontInfo[]> {
    try {
      // 确保目录存在
      await this.ensureDirectoriesExist();

      // 根据参数获取对应目录的字体文件
      if (location === 'backend') {
        const backendFonts = await this.getFontsFromDirectory(
          this.backendFontsDir,
          'backend'
        );
        return backendFonts.map((font) => ({
          ...font,
          existsInBackend: true,
          existsInFrontend: false,
          creator: '系统管理员',
          updatedAt: font.createdAt,
        }));
      }

      if (location === 'frontend') {
        const frontendFonts = await this.getFontsFromDirectory(
          this.frontendFontsDir,
          'frontend'
        );
        return frontendFonts.map((font) => ({
          ...font,
          existsInBackend: false,
          existsInFrontend: true,
          creator: '系统管理员',
          updatedAt: font.createdAt,
        }));
      }

      // 如果不指定 location，返回合并后的完整列表
      const backendFonts = await this.getFontsFromDirectory(
        this.backendFontsDir,
        'backend'
      );
      const frontendFonts = await this.getFontsFromDirectory(
        this.frontendFontsDir,
        'frontend'
      );

      // 合并字体信息
      const fontMap = new Map<string, any>();

      backendFonts.forEach((font) => {
        fontMap.set(font.name, {
          ...font,
          existsInBackend: true,
          existsInFrontend: false,
          creator: '系统管理员',
          updatedAt: font.createdAt,
        });
      });

      frontendFonts.forEach((font) => {
        const existing = fontMap.get(font.name);
        if (existing) {
          existing.existsInFrontend = true;
          existing.size = Math.max(existing.size, font.size);
          // 使用最新的创建时间
          if (font.createdAt > existing.createdAt) {
            existing.createdAt = font.createdAt;
          }
        } else {
          fontMap.set(font.name, {
            ...font,
            existsInBackend: false,
            existsInFrontend: true,
            creator: '系统管理员',
            updatedAt: font.createdAt,
          });
        }
      });

      return Array.from(fontMap.values());
    } catch (error) {
      this.logger.error(`获取字体列表失败: ${error.message}`, error.stack);
      throw new BadRequestException(I18nContext.current()?.t('error.font.fetch_failed') ?? '获取字体列表失败');
    }
  }

  /**
   * 上传字体文件（单文件，内部使用）
   */
  private async uploadSingleFont(
    file: Express.Multer.File,
    target: FontUploadTarget = FontUploadTarget.BOTH
  ): Promise<FontUploadResult> {
    await this.validateFontFile(file);

    // 防御性修复：个别客户端/代理不遵循 defParamCharset 时 originalname 仍可能是乱码
    const rawName = decodeMojibakeFileName(file.originalname);
    const fileName = path.basename(rawName);
    const fileExt = path.extname(fileName).toLowerCase();

    // 根据目标上传到相应目录
    if (
      target === FontUploadTarget.BACKEND ||
      target === FontUploadTarget.BOTH
    ) {
      const backendPath = path.join(this.backendFontsDir, fileName);
      await fs.writeFile(backendPath, file.buffer);
      this.logger.log(`字体已上传到后端目录: ${backendPath}`);
    }

    if (
      target === FontUploadTarget.FRONTEND ||
      target === FontUploadTarget.BOTH
    ) {
      const frontendPath = path.join(this.frontendFontsDir, fileName);
      await fs.writeFile(frontendPath, file.buffer);
      this.logger.log(`字体已上传到前端目录: ${frontendPath}`);
    }

    return {
      name: fileName,
      size: file.size,
      extension: fileExt,
      existsInBackend: target !== FontUploadTarget.FRONTEND,
      existsInFrontend: target !== FontUploadTarget.BACKEND,
      creator: '系统管理员',
      updatedAt: new Date(),
      createdAt: new Date(),
    };
  }

  /**
   * 批量上传字体文件
   */
  async uploadFonts(
    files: Express.Multer.File[],
    target: FontUploadTarget = FontUploadTarget.BOTH
  ): Promise<FontUploadResult[]> {
    try {
      await this.ensureDirectoriesExist();

      const results: FontUploadResult[] = [];
      const errors: Array<{ fileName: string; error: string }> = [];

      for (const file of files) {
        try {
          const result = await this.uploadSingleFont(file, target);
          results.push(result);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : '未知错误';
          const displayName = decodeMojibakeFileName(file.originalname);
          errors.push({ fileName: displayName, error: msg });
          this.logger.error(`上传字体 ${displayName} 失败: ${msg}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        throw new BadRequestException(
          `所有文件上传失败: ${errors.map((e) => `${e.fileName}: ${e.error}`).join('; ')}`
        );
      }

      if (errors.length > 0) {
        this.logger.warn(
          `部分文件上传失败: ${errors.map((e) => `${e.fileName}: ${e.error}`).join('; ')}`
        );
      }

      return results;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`上传字体失败: ${error.message}`, error.stack);
      throw new BadRequestException(I18nContext.current()?.t('error.font_extra.upload_failed_detail', { args: { error: error.message } }) ?? `上传字体失败: ${error.message}`);
    }
  }

  /**
   * 删除字体文件
   */
  async deleteFont(
    fileName: string,
    target: FontUploadTarget = FontUploadTarget.BOTH
  ): Promise<{ message: string }> {
    try {
      // 验证文件名
      if (!fileName || fileName.includes('..') || fileName.includes('/')) {
        throw new BadRequestException(I18nContext.current()?.t('error.file.name_invalid') ?? '无效的文件名');
      }

      // 确保目录存在
      await this.ensureDirectoriesExist();

      const results: Array<{ location: string; path: string }> = [];

      // 根据目标从相应目录删除
      if (
        target === FontUploadTarget.BACKEND ||
        target === FontUploadTarget.BOTH
      ) {
        if (await this.unlinkFontFile(this.backendFontsDir, fileName)) {
          results.push({
            location: 'backend',
            path: path.join(this.backendFontsDir, fileName),
          });
          this.logger.log(`字体已从后端目录删除: ${fileName}`);
        } else {
          this.logger.warn(`后端目录中不存在字体: ${fileName}`);
        }
      }

      if (
        target === FontUploadTarget.FRONTEND ||
        target === FontUploadTarget.BOTH
      ) {
        if (await this.unlinkFontFile(this.frontendFontsDir, fileName)) {
          results.push({
            location: 'frontend',
            path: path.join(this.frontendFontsDir, fileName),
          });
          this.logger.log(`字体已从前端目录删除: ${fileName}`);
        } else {
          this.logger.warn(`前端目录中不存在字体: ${fileName}`);
        }
      }

      if (results.length === 0) {
        throw new NotFoundException(I18nContext.current()?.t('error.font_extra.file_not_exist_by_name', { args: { name: fileName } }) ?? `字体文件 ${fileName} 不存在`);
      }

      return {
        message: I18nContext.current()?.t('success.font_deleted', { args: { name: fileName } }) ?? `字体文件 ${fileName} 删除成功`,
      };
    } catch (error) {
      this.logger.error(`删除字体失败: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(I18nContext.current()?.t('error.font_extra.delete_failed_detail', { args: { error: error.message } }) ?? `删除字体失败: ${error.message}`);
    }
  }

  /**
   * 下载字体文件
   */
  async downloadFont(
    fileName: string,
    location: 'backend' | 'frontend'
  ): Promise<{ stream: fsSync.ReadStream; fileName: string }> {
    try {
      // 验证文件名（防止路径遍历攻击）
      if (
        !fileName ||
        fileName.includes('..') ||
        fileName.includes('/') ||
        fileName.includes('\\')
      ) {
        throw new BadRequestException(I18nContext.current()?.t('error.file.name_invalid') ?? '无效的文件名');
      }

      const fontDir =
        location === 'backend' ? this.backendFontsDir : this.frontendFontsDir;

      // 检查文件是否存在（含历史遗留乱码文件名 fallback）
      const candidates = [path.join(fontDir, fileName)];
      const legacyName = encodeMojibakeFileName(fileName);
      if (legacyName !== fileName) {
        candidates.push(path.join(fontDir, legacyName));
      }

      let filePath = candidates[0];
      let found = false;
      for (const candidate of candidates) {
        try {
          await fs.access(candidate);

          // 检查路径是否是目录
          const stats = await fs.stat(candidate);
          if (stats.isDirectory()) {
            throw new NotFoundException(I18nContext.current()?.t('error.file_extra.path_is_directory_not_file', { args: { key: fileName } }) ?? `路径是目录而非文件: ${fileName}`);
          }
          filePath = candidate;
          found = true;
          break;
        } catch (error) {
          if (error instanceof NotFoundException) {
            throw error;
          }
          // ENOENT，继续尝试下一个候选路径
        }
      }

      if (!found) {
        throw new NotFoundException(I18nContext.current()?.t('error.font_extra.file_not_exist_by_name', { args: { name: fileName } }) ?? `字体文件 ${fileName} 不存在`);
      }

      // 创建文件流
      const stream = fsSync.createReadStream(filePath);

      return { stream, fileName };
    } catch (error) {
      this.logger.error(`下载字体失败: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(I18nContext.current()?.t('error.font_extra.download_failed_detail', { args: { error: error.message } }) ?? `下载字体失败: ${error.message}`);
    }
  }

  /**
   * 从指定目录获取字体文件列表
   */
  private async getFontsFromDirectory(
    dir: string,
    location: string
  ): Promise<FontInfo[]> {
    try {
      const files = await fs.readdir(dir);
      const fonts: Array<{
        name: string;
        size: number;
        extension: string;
        createdAt: Date;
      }> = [];

      for (const file of files) {
        try {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);

          if (stat.isFile()) {
            const ext = path.extname(file).toLowerCase();
            if (this.allowedExtensions.includes(ext)) {
              fonts.push({
                // 兼容历史遗留的 latin1 乱码磁盘文件名，显示时修复
                name: decodeMojibakeFileName(file),
                size: stat.size,
                extension: ext,
                createdAt: stat.birthtime,
              });
            }
          }
        } catch (fileError: unknown) {
          // 单个文件读取失败时记录日志但继续处理其他文件
          const err = fileError as NodeJS.ErrnoException;
          if (err?.code === 'EPERM' || err?.code === 'EACCES') {
            this.logger.warn(`无法访问字体文件(可能正被使用): ${file}`);
          } else {
            this.logger.warn(
              `读取字体文件信息失败: ${file}, ${err?.message ?? String(fileError)}`
            );
          }
          continue;
        }
      }

      return fonts;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn(`目录不存在: ${dir}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * 验证字体文件
   */
  private async validateFontFile(file: Express.Multer.File): Promise<void> {
    if (!file) {
      throw new BadRequestException(I18nContext.current()?.t('error.font.no_file') ?? '未提供文件');
    }

    const fileName = file.originalname;
    const ext = path.extname(fileName).toLowerCase();

    // 验证文件扩展名
    if (!this.allowedExtensions.includes(ext)) {
      throw new BadRequestException(
        `不支持的文件类型。支持的类型: ${this.allowedExtensions.join(', ')}`
      );
    }

    // 验证文件大小（每次动态读取运行时配置，运行期修改即时生效）
    const fontMaxFileSizeMB = await this.runtimeConfigService.getValue<number>(
      'fontMaxFileSize',
      50
    );
    const fontMaxSizeBytes = fontMaxFileSizeMB * 1024 * 1024;
    if (file.size > fontMaxSizeBytes) {
      throw new BadRequestException(
        `文件大小超过限制。最大允许: ${fontMaxFileSizeMB}MB`
      );
    }

    // 验证文件名（防止路径遍历攻击）
    if (
      !fileName ||
      fileName.length > 255 ||
      fileName.includes('..') ||
      fileName.includes('/') ||
      fileName.includes('\\')
    ) {
      throw new BadRequestException(I18nContext.current()?.t('error.file.name_invalid') ?? '无效的文件名');
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.backendFontsDir, { recursive: true });
      await fs.mkdir(this.frontendFontsDir, { recursive: true });
    } catch (error) {
      this.logger.error(`创建目录失败: ${error.message}`, error.stack);
      throw new BadRequestException(I18nContext.current()?.t('error.font.cannot_create_directory') ?? '无法创建字体目录');
    }
  }

  /**
   * 带重试的文件删除
   * Windows 下字体文件可能被 mxcad 转换进程短暂占用，重试等待释放
   * @param filePath - 要删除的文件绝对路径
   * @param maxRetries - 最大重试次数，默认 3
   * @param retryDelayMs - 重试间隔毫秒，默认 500
   */
  private async unlinkWithRetry(
    filePath: string,
    maxRetries = 3,
    retryDelayMs = 500
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await fs.unlink(filePath);
        return;
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        // 文件不存在，视为成功
        if (err.code === 'ENOENT') {
          return;
        }
        // EBUSY/EPERM — 文件被占用，重试
        if (
          (err.code === 'EBUSY' || err.code === 'EPERM') &&
          attempt < maxRetries - 1
        ) {
          this.logger.warn(
            `文件被占用，${retryDelayMs}ms 后重试 (${attempt + 1}/${maxRetries}): ${filePath}`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * 删除字体文件，兼容历史遗留的 latin1 乱码磁盘文件名：
   * 先按传入名（前端展示的修复名）删除，ENOENT 时按反编码乱码名再试。
   * @returns 是否成功删除（文件不存在返回 false）
   */
  private async unlinkFontFile(
    dir: string,
    fileName: string
  ): Promise<boolean> {
    const candidates = [fileName];
    const legacyName = encodeMojibakeFileName(fileName);
    if (legacyName !== fileName) {
      candidates.push(legacyName);
    }

    for (const candidate of candidates) {
      try {
        await this.unlinkWithRetry(path.join(dir, candidate));
        return true;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // ENOENT，继续尝试下一个候选文件名
      }
    }
    return false;
  }

  async batchDeleteFonts(
    fileNames: string[],
    target: FontUploadTarget = FontUploadTarget.BOTH
  ) {
    const successIds: string[] = [];
    const failedIds: string[] = [];
    const errors: string[] = [];

    for (const fileName of fileNames) {
      try {
        await this.deleteFont(fileName, target);
        successIds.push(fileName);
      } catch (error) {
        failedIds.push(fileName);
        errors.push(`字体 ${fileName}: ${error.message}`);
        this.logger.error(`批量删除字体失败: ${fileName}`, error.message);
      }
    }

    return {
      successCount: successIds.length,
      failedCount: failedIds.length,
      successIds,
      failedIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
