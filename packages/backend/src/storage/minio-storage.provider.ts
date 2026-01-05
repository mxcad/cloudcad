import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { StorageProvider, UploadResult } from './storage.interface';

@Injectable()
export class MinioStorageProvider implements StorageProvider {
  private readonly logger = new Logger(MinioStorageProvider.name);
  private client: Minio.Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'localhost'),
      port: this.configService.get('MINIO_PORT', 9000),
      useSSL: this.configService.get('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.bucket = this.configService.get('MINIO_BUCKET', 'cloucad');
  }

  async onModuleInit() {
    // 确保bucket存在
    try {
      const bucketExists = await this.client.bucketExists(this.bucket);
      if (!bucketExists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`创建存储桶: ${this.bucket}`);
      }
    } catch (error) {
      this.logger.error(`初始化存储桶失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  // 基础操作
  async uploadFile(key: string, data: Buffer): Promise<UploadResult> {
    try {
      const result = await this.client.putObject(this.bucket, key, data);
      this.logger.log(`文件上传成功: ${key}`);
      return {
        key,
        etag: result.etag,
        size: data.length,
      };
    } catch (error) {
      this.logger.error(`文件上传失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(this.bucket, key);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.error(`文件下载失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
      this.logger.log(`文件删除成功: ${key}`);
    } catch (error) {
      this.logger.error(`文件删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * 列出指定路径下的文件
   * @param prefix 文件路径前缀
   * @param startsWith 可选，文件名起始字符串
   * @returns 文件路径列表
   */
  async listFiles(prefix: string, startsWith?: string): Promise<string[]> {
    try {
      const stream = this.client.listObjects(this.bucket, prefix, true);
      const files: string[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          if (obj.name) {
            // 如果指定了 startsWith，只返回匹配的文件
            if (!startsWith || obj.name.startsWith(prefix + startsWith)) {
              files.push(obj.name);
            }
          }
        });
        stream.on('end', () => resolve(files));
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.error(`列出文件失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getPresignedPutUrl(key: string, expiry = 3600): Promise<string> {
    try {
      return await this.client.presignedPutObject(this.bucket, key, expiry);
    } catch (error) {
      this.logger.error(`生成预签名上传URL失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取文件流（用于图片代理）
   * @param key 文件键名
   * @returns 文件流
   */
  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    try {
      const stream = await this.client.getObject(this.bucket, key);
      return stream;
    } catch (error) {
      this.logger.error(`获取文件流失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
