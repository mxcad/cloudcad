import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, UploadResult } from './storage.interface';
import * as fsPromises from 'fs/promises';
import { createReadStream } from 'fs';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly basePath: string;

  constructor(private configService: ConfigService) {
    this.basePath = this.configService.get('FILES_DATA_PATH', '../filesData');
    this.ensureBasePath();
  }

  /**
   * 确保基础目录存在
   */
  private async ensureBasePath(): Promise<void> {
    try {
      const absolutePath = path.resolve(this.basePath);
      if (!fs.existsSync(absolutePath)) {
        await fsPromises.mkdir(absolutePath, { recursive: true });
        this.logger.log(`创建存储根目录: ${absolutePath}`);
      }
    } catch (error) {
      this.logger.error(`初始化存储根目录失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 验证路径安全性，防止路径遍历攻击
   * @param key 要验证的路径键
   * @throws BadRequestException 如果路径不安全
   */
  private validatePath(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('无效的路径');
    }

    // 检查路径遍历攻击
    if (key.includes('..') || key.includes('~')) {
      throw new BadRequestException('路径包含非法字符');
    }

    // 检查绝对路径（MxCAD-App 访问路径例外）
    if (path.isAbsolute(key) && !key.startsWith('/mxcad/file/')) {
      throw new BadRequestException('不允许使用绝对路径');
    }

    // 检查 Windows 路径分隔符
    if (key.includes('\\')) {
      throw new BadRequestException('路径包含非法字符');
    }

    // 检查非法字符（Windows 不允许的字符）
    const illegalChars = /[<>:"|?*]/;
    if (illegalChars.test(key)) {
      throw new BadRequestException('路径包含非法字符');
    }

    // 检查控制字符
    for (let i = 0; i < key.length; i++) {
      const charCode = key.charCodeAt(i);
      // 检查控制字符（除了制表符、换行符等常见空白字符）
      if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
        throw new BadRequestException('路径包含非法字符');
      }
      if (charCode === 127) {
        throw new BadRequestException('路径包含非法字符');
      }
    }

    // 限制路径长度
    const MAX_PATH_LENGTH = 1024;
    if (key.length > MAX_PATH_LENGTH) {
      throw new BadRequestException('路径过长');
    }

    // 检查路径是否在允许的目录内（仅对相对路径）
    if (!path.isAbsolute(key)) {
      const fullPath = path.resolve(this.basePath, key);
      const normalizedBasePath = path.resolve(this.basePath);

      if (!fullPath.startsWith(normalizedBasePath)) {
        throw new BadRequestException('路径超出允许的范围');
      }
    }
  }

  /**
   * 获取文件的绝对路径
   */
  private getAbsolutePath(key: string): string {
    this.validatePath(key);
    return path.resolve(this.basePath, key);
  }

  async uploadFile(key: string, data: Buffer): Promise<UploadResult> {
    try {
      const absolutePath = this.getAbsolutePath(key);
      const dirPath = path.dirname(absolutePath);

      // 确保目录存在
      await fsPromises.mkdir(dirPath, { recursive: true });

      // 写入文件
      await fsPromises.writeFile(absolutePath, data);

      // 计算 etag (使用 MD5)
      const crypto = await import('crypto');
      const hash = crypto.createHash('md5').update(data).digest('hex');

      this.logger.log(`文件上传成功: ${key} (${data.length} bytes)`);
      return {
        key,
        etag: hash,
        size: data.length,
      };
    } catch (error) {
      this.logger.error(`文件上传失败: ${key}`, error.stack);
      throw error;
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      const absolutePath = this.getAbsolutePath(key);
      if (!await this.fileExists(key)) {
        throw new Error(`文件不存在: ${key}`);
      }
      const data = await fsPromises.readFile(absolutePath);
      this.logger.log(`文件下载成功: ${key}`);
      return data;
    } catch (error) {
      this.logger.error(`文件下载失败: ${key}`, error.stack);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const absolutePath = this.getAbsolutePath(key);
      await fsPromises.unlink(absolutePath);
      this.logger.log(`文件删除成功: ${key}`);
    } catch (error) {
      this.logger.error(`文件删除失败: ${key}`, error.stack);
      throw error;
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const absolutePath = this.getAbsolutePath(key);
      await fsPromises.access(absolutePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    try {
      const absolutePath = this.getAbsolutePath(key);

      // 检查路径是否存在
      if (!await this.fileExists(key)) {
        throw new Error(`文件不存在: ${key}`);
      }

      // 检查路径是否是目录
      const stats = await fsPromises.stat(absolutePath);
      if (stats.isDirectory()) {
        throw new Error(`路径是目录而非文件: ${key}`);
      }

      return createReadStream(absolutePath);
    } catch (error) {
      this.logger.error(`获取文件流失败: ${key}`, error.stack);
      throw error;
    }
  }

  async getPresignedPutUrl(key: string, expiry = 3600): Promise<string> {
    // 本地存储不支持预签名 URL，返回空字符串或抛出错误
    this.logger.warn(`本地存储不支持预签名 URL: ${key}`);
    return '';
  }

  /**
   * 列出指定路径下的文件
   */
  async listFiles(prefix: string, startsWith?: string): Promise<string[]> {
    try {
      const absolutePath = this.getAbsolutePath(prefix);
      const files: string[] = [];

      if (!fs.existsSync(absolutePath)) {
        return files;
      }

      const entries = await fsPromises.readdir(absolutePath, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = path.join(prefix, entry.name);
        if (startsWith && !entry.name.startsWith(startsWith)) {
          continue;
        }
        files.push(relativePath);
      }

      return files;
    } catch (error) {
      this.logger.error(`列出文件失败: ${prefix}`, error.stack);
      throw error;
    }
  }

  /**
   * 拷贝文件
   */
  async copyFile(sourceKey: string, destKey: string): Promise<boolean> {
    try {
      const sourcePath = this.getAbsolutePath(sourceKey);
      const destPath = this.getAbsolutePath(destKey);
      const destDirPath = path.dirname(destPath);

      // 确保目标目录存在
      await fsPromises.mkdir(destDirPath, { recursive: true });

      // 拷贝文件
      await fsPromises.copyFile(sourcePath, destPath);
      this.logger.log(`文件拷贝成功: ${sourceKey} -> ${destKey}`);
      return true;
    } catch (error) {
      this.logger.error(`文件拷贝失败: ${sourceKey} -> ${destKey}`, error.stack);
      return false;
    }
  }

  /**
   * 删除目录（递归）
   */
  async deleteDirectory(dirKey: string): Promise<void> {
    try {
      const absolutePath = this.getAbsolutePath(dirKey);
      await fsPromises.rm(absolutePath, { recursive: true, force: true });
      this.logger.log(`目录删除成功: ${dirKey}`);
    } catch (error) {
      this.logger.error(`目录删除失败: ${dirKey}`, error.stack);
      throw error;
    }
  }

  /**
   * 检查目录是否存在
   */
  async directoryExists(dirKey: string): Promise<boolean> {
    try {
      const absolutePath = this.getAbsolutePath(dirKey);
      const stats = await fsPromises.stat(absolutePath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 创建目录
   */
  async createDirectory(dirKey: string): Promise<void> {
    try {
      const absolutePath = this.getAbsolutePath(dirKey);
      await fsPromises.mkdir(absolutePath, { recursive: true });
      this.logger.log(`目录创建成功: ${dirKey}`);
    } catch (error) {
      this.logger.error(`目录创建失败: ${dirKey}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取目录下的子目录数量（用于计算节点数量）
   */
  async getSubdirectoryCount(dirKey: string): Promise<number> {
    try {
      const absolutePath = this.getAbsolutePath(dirKey);
      if (!await this.directoryExists(dirKey)) {
        return 0;
      }

      const entries = await fsPromises.readdir(absolutePath, { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).length;
    } catch (error) {
      this.logger.error(`获取子目录数量失败: ${dirKey}`, error.stack);
      return 0;
    }
  }
}