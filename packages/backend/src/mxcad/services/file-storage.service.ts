import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IFileStorageService } from '../interfaces/file-storage.interface';
import { MinioSyncService } from '../minio-sync.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileStorageService implements IFileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly uploadPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly minioSyncService: MinioSyncService,
  ) {
    this.uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      // 优先检查 MinIO
      const minioPath = filePath.startsWith('mxcad/file/') ? filePath : `mxcad/file/${filePath}`;
      const existsInMinio = await this.minioSyncService.fileExists(minioPath);
      if (existsInMinio) {
        return true;
      }

      // 降级检查本地文件系统
      const localPath = path.isAbsolute(filePath) ? filePath : path.join(this.uploadPath, filePath);
      return fs.existsSync(localPath);
    } catch (error) {
      this.logger.error(`检查文件存在性失败: ${filePath}`, error);
      return false;
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    try {
      // 优先从 MinIO 获取
      const minioPath = filePath.startsWith('mxcad/file/') ? filePath : `mxcad/file/${filePath}`;
      try {
        const size = await this.minioSyncService.getFileSize(minioPath);
        if (size > 0) {
          return size;
        }
      } catch (minioError) {
        // 降级到本地文件系统
      }

      // 从本地文件系统获取
      const localPath = path.isAbsolute(filePath) ? filePath : path.join(this.uploadPath, filePath);
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        return stats.size;
      }

      return 0;
    } catch (error) {
      this.logger.error(`获取文件大小失败: ${filePath}`, error);
      return 0;
    }
  }

  async uploadFile(filePath: string, buffer: Buffer): Promise<boolean> {
    try {
      await this.minioSyncService.uploadFile(filePath, buffer);
      return true;
    } catch (error) {
      this.logger.error(`上传文件失败: ${filePath}`, error);
      return false;
    }
  }

  async syncFile(localPath: string, storagePath: string): Promise<boolean> {
    try {
      const minioPath = storagePath.startsWith('mxcad/file/') ? storagePath : `mxcad/file/${storagePath}`;
      return await this.minioSyncService.syncFileToMinio(localPath, minioPath);
    } catch (error) {
      this.logger.error(`同步文件失败: ${localPath} -> ${storagePath}`, error);
      return false;
    }
  }

  async getFileUrl(filePath: string, expiry: number = 3600): Promise<string | null> {
    try {
      const minioPath = filePath.startsWith('mxcad/file/') ? filePath : `mxcad/file/${filePath}`;
      return await this.minioSyncService.getFileUrl(minioPath, expiry);
    } catch (error) {
      this.logger.error(`获取文件URL失败: ${filePath}`, error);
      return null;
    }
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      // TODO: 实现文件删除逻辑
      this.logger.warn(`文件删除功能尚未实现: ${filePath}`);
      return false;
    } catch (error) {
      this.logger.error(`删除文件失败: ${filePath}`, error);
      return false;
    }
  }
}