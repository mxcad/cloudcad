import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { FontUploadTarget } from './dto/font.dto';

/**
 * 字体管理服务
 * 负责管理后端转换程序和前端的字体文件
 */
@Injectable()
export class FontsService {
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

  /** 最大文件大小（10MB） */
  private readonly maxFileSize = 10 * 1024 * 1024;

  constructor(private configService: ConfigService) {
    // 从环境变量获取目录路径
    this.backendFontsDir = this.configService.get<string>(
      'MXCAD_FONTS_PATH',
      path.join(
        process.cwd(),
        '..',
        'mxcadassembly',
        'windows',
        'release',
        'fonts'
      )
    );

    this.frontendFontsDir = this.configService.get<string>(
      'FRONTEND_FONTS_PATH',
      path.join(
        process.cwd(),
        '..',
        'frontend',
        'dist',
        'mxcadAppAssets',
        'fonts'
      )
    );

    this.logger.log(`后端字体目录: ${this.backendFontsDir}`);
    this.logger.log(`前端字体目录: ${this.frontendFontsDir}`);
  }

  /**
   * 获取字体列表
   * @param location 指定返回的字体位置：'backend'、'frontend' 或不指定返回全部
   */
  async getFonts(location?: 'backend' | 'frontend'): Promise<any[]> {
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
      throw new BadRequestException('获取字体列表失败');
    }
  }

  /**
   * 上传字体文件
   */
  async uploadFont(
    file: Express.Multer.File,
    target: FontUploadTarget = FontUploadTarget.BOTH
  ): Promise<{ message: string; font: any }> {
    try {
      // 验证文件
      this.validateFontFile(file);

      const fileName = file.originalname;
      const fileExt = path.extname(fileName).toLowerCase();

      // 确保目录存在
      await this.ensureDirectoriesExist();

      const results: Array<{ location: string; path: string }> = [];

      // 根据目标上传到相应目录
      if (
        target === FontUploadTarget.BACKEND ||
        target === FontUploadTarget.BOTH
      ) {
        const backendPath = path.join(this.backendFontsDir, fileName);
        await fs.writeFile(backendPath, file.buffer);
        results.push({ location: 'backend', path: backendPath });
        this.logger.log(`字体已上传到后端目录: ${backendPath}`);
      }

      if (
        target === FontUploadTarget.FRONTEND ||
        target === FontUploadTarget.BOTH
      ) {
        const frontendPath = path.join(this.frontendFontsDir, fileName);
        await fs.writeFile(frontendPath, file.buffer);
        results.push({ location: 'frontend', path: frontendPath });
        this.logger.log(`字体已上传到前端目录: ${frontendPath}`);
      }

      // 返回字体信息
      const fontInfo = {
        name: fileName,
        size: file.size,
        extension: fileExt,
        existsInBackend: target !== FontUploadTarget.FRONTEND,
        existsInFrontend: target !== FontUploadTarget.BACKEND,
        createdAt: new Date(),
      };

      return {
        message: `字体文件 ${fileName} 上传成功`,
        font: fontInfo,
      };
    } catch (error) {
      this.logger.error(`上传字体失败: ${error.message}`, error.stack);
      throw new BadRequestException(`上传字体失败: ${error.message}`);
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
        throw new BadRequestException('无效的文件名');
      }

      // 确保目录存在
      await this.ensureDirectoriesExist();

      const results: Array<{ location: string; path: string }> = [];

      // 根据目标从相应目录删除
      if (
        target === FontUploadTarget.BACKEND ||
        target === FontUploadTarget.BOTH
      ) {
        const backendPath = path.join(this.backendFontsDir, fileName);
        try {
          await fs.unlink(backendPath);
          results.push({ location: 'backend', path: backendPath });
          this.logger.log(`字体已从后端目录删除: ${backendPath}`);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
          this.logger.warn(`后端目录中不存在字体: ${fileName}`);
        }
      }

      if (
        target === FontUploadTarget.FRONTEND ||
        target === FontUploadTarget.BOTH
      ) {
        const frontendPath = path.join(this.frontendFontsDir, fileName);
        try {
          await fs.unlink(frontendPath);
          results.push({ location: 'frontend', path: frontendPath });
          this.logger.log(`字体已从前端目录删除: ${frontendPath}`);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
          this.logger.warn(`前端目录中不存在字体: ${fileName}`);
        }
      }

      if (results.length === 0) {
        throw new NotFoundException(`字体文件 ${fileName} 不存在`);
      }

      return {
        message: `字体文件 ${fileName} 删除成功`,
      };
    } catch (error) {
      this.logger.error(`删除字体失败: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`删除字体失败: ${error.message}`);
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
      if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        throw new BadRequestException('无效的文件名');
      }

      const fontDir =
        location === 'backend' ? this.backendFontsDir : this.frontendFontsDir;

      const filePath = path.join(fontDir, fileName);

      // 检查文件是否存在
      try {
        await fs.access(filePath);

        // 检查路径是否是目录
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          throw new NotFoundException(`路径是目录而非文件: ${fileName}`);
        }
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        throw new NotFoundException(`字体文件 ${fileName} 不存在`);
      }

      // 创建文件流
      const stream = fsSync.createReadStream(filePath);

      return { stream, fileName };
    } catch (error) {
      this.logger.error(`下载字体失败: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`下载字体失败: ${error.message}`);
    }
  }

  /**
   * 从指定目录获取字体文件列表
   */
  private async getFontsFromDirectory(
    dir: string,
    location: string
  ): Promise<any[]> {
    try {
      const files = await fs.readdir(dir);
      const fonts: Array<{
        name: string;
        size: number;
        extension: string;
        createdAt: Date;
      }> = [];

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          if (this.allowedExtensions.includes(ext)) {
            fonts.push({
              name: file,
              size: stat.size,
              extension: ext,
              createdAt: stat.birthtime,
            });
          }
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
  private validateFontFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('未提供文件');
    }

    const fileName = file.originalname;
    const ext = path.extname(fileName).toLowerCase();

    // 验证文件扩展名
    if (!this.allowedExtensions.includes(ext)) {
      throw new BadRequestException(
        `不支持的文件类型。支持的类型: ${this.allowedExtensions.join(', ')}`
      );
    }

    // 验证文件大小
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `文件大小超过限制。最大允许: ${this.maxFileSize / 1024 / 1024}MB`
      );
    }

    // 验证文件名
    if (!fileName || fileName.length > 255) {
      throw new BadRequestException('文件名无效');
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
      throw new BadRequestException('无法创建字体目录');
    }
  }
}
