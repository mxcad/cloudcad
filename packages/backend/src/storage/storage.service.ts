import { Injectable, Logger } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private localStorageProvider: LocalStorageProvider,
    private configService: ConfigService
  ) {}

  /**
   * 检查文件是否存在
   * @param key 存储键名
   * @returns 是否存在
   */
  async fileExists(key: string): Promise<boolean> {
    return this.localStorageProvider.fileExists(key);
  }

  /**
   * 获取文件流
   * @param key 存储键名
   * @returns 文件流
   */
  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    return this.localStorageProvider.getFileStream(key);
  }

  /**
   * 获取文件信息
   * @param key 存储键名
   * @returns 文件信息
   */
  async getFileInfo(
    key: string
  ): Promise<{ contentType: string; contentLength: number } | null> {
    try {
      const absolutePath = path.resolve(
        this.configService.get('FILES_DATA_PATH', '../filesData'),
        key
      );
      const stats = await fs.promises.stat(absolutePath);

      // 根据文件扩展名猜测 Content-Type
      const ext = path.extname(key).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.dwg': 'application/acad',
        '.dxf': 'application/dxf',
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.mxweb': 'application/octet-stream',
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';

      return {
        contentType,
        contentLength: stats.size,
      };
    } catch (error) {
      this.logger.error(`获取文件信息失败: ${key}`, error);
      return null;
    }
  }

  async healthCheck() {
    try {
      const filesDataPath = this.configService.get(
        'FILES_DATA_PATH',
        '../filesData'
      );
      const resolvedPath = path.resolve(filesDataPath);

      // 检查目录是否存在
      const exists = fs.existsSync(resolvedPath);

      if (!exists) {
        return {
          status: 'unhealthy',
          message: `存储目录不存在: ${resolvedPath}`,
        };
      }

      // 检查目录是否可写
      try {
        fs.accessSync(resolvedPath, fs.constants.W_OK);
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `存储目录不可写: ${resolvedPath}`,
        };
      }

      return {
        status: 'healthy',
        message: '本地存储服务正常',
      };
    } catch (error) {
      this.logger.error('存储服务健康检查失败:', error);
      return {
        status: 'unhealthy',
        message: `存储服务不可用: ${error.message}`,
      };
    }
  }

  /**
   * 列出指定路径下的文件
   * @param prefix 路径前缀
   * @param startsWith 可选的文件名起始字符串
   * @returns 文件列表
   */
  async listFiles(prefix: string, startsWith?: string): Promise<string[]> {
    return this.localStorageProvider.listFiles(prefix, startsWith);
  }

  /**
   * 删除文件
   * @param key 存储键名
   */
  async deleteFile(key: string): Promise<void> {
    return this.localStorageProvider.deleteFile(key);
  }
}
