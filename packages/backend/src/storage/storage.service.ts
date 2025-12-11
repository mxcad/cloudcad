import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable, Stream } from 'stream';

export interface UploadResult {
  url: string;
  etag: string;
  bucket: string;
  key: string;
}

export interface FileOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private client: Minio.Client;
  private bucket: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Minio.Client({
      endPoint: this.configService.get('minio.endPoint') || 'localhost',
      port: this.configService.get('minio.port') || 9000,
      useSSL: this.configService.get('minio.useSSL') || false,
      accessKey: this.configService.get('minio.accessKey') || 'minioadmin',
      secretKey: this.configService.get('minio.secretKey') || 'minioadmin',
    });

    this.bucket = this.configService.get('minio.bucket') || 'cloucad';

    // 确保bucket存在
    const bucketExists = await this.client.bucketExists(this.bucket);
    if (!bucketExists) {
      await this.client.makeBucket(
        this.bucket,
        this.configService.get('minio.region') || 'us-east-1'
      );
      console.log(`MinIO bucket ${this.bucket} 创建成功`);
    }
  }

  async onModuleDestroy() {
    // MinIO客户端不需要显式关闭
  }

  async uploadFile(
    key: string,
    buffer: Buffer | Readable,
    options: FileOptions = {}
  ): Promise<UploadResult> {
    const metaData = {
      'Content-Type': options.contentType || 'application/octet-stream',
      ...options.metadata,
    };

    const result = await this.client.putObject(
      this.bucket,
      key,
      buffer,
      undefined,
      metaData
    );

    return {
      url: this.getFileUrl(key),
      etag: result.etag,
      bucket: this.bucket,
      key,
    };
  }

  async uploadFileFromBuffer(
    key: string,
    buffer: Buffer,
    options: FileOptions = {}
  ): Promise<UploadResult> {
    return this.uploadFile(key, buffer, options);
  }

  async uploadFileFromStream(
    key: string,
    stream: Readable,
    size: number,
    options: FileOptions = {}
  ): Promise<UploadResult> {
    const metaData = {
      'Content-Type': options.contentType || 'application/octet-stream',
      ...options.metadata,
    };

    const result = await this.client.putObject(
      this.bucket,
      key,
      stream,
      size,
      metaData
    );

    return {
      url: this.getFileUrl(key),
      etag: result.etag,
      bucket: this.bucket,
      key,
    };
  }

  async getFile(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    return this.streamToBuffer(stream);
  }

  async getFileStream(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async deleteFiles(keys: string[]): Promise<void> {
    await this.client.removeObjects(this.bucket, keys);
  }

  async copyFile(sourceKey: string, destKey: string): Promise<void> {
    await this.client.copyObject(
      this.bucket,
      destKey,
      `${this.bucket}/${sourceKey}`
    );
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileStats(key: string) {
    return this.client.statObject(this.bucket, key);
  }

  async listFiles(
    prefix?: string,
    recursive = true
  ): Promise<Minio.BucketItem[]> {
    const stream = this.client.listObjects(this.bucket, prefix, recursive);
    return new Promise((resolve, reject) => {
      const items: Minio.BucketItem[] = [];
      stream.on('data', (item) => {
        if (item.name) {
          items.push({
            name: item.name,
            size: item.size || 0,
            etag: item.etag || '',
            lastModified: item.lastModified || new Date(),
          } as Minio.BucketItem);
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(items));
    });
  }

  async getPresignedUrl(key: string, expiry = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expiry);
  }

  async getPresignedPutUrl(key: string, expiry = 3600): Promise<string> {
    return this.client.presignedPutObject(this.bucket, key, expiry);
  }

  private getFileUrl(key: string): string {
    const port = this.configService.get('minio.port') || 9000;
    const endPoint = this.configService.get('minio.endPoint') || 'localhost';
    const useSSL = this.configService.get('minio.useSSL') || false;
    const protocol = useSSL ? 'https' : 'http';

    // 如果使用标准端口，可以省略端口号
    const showPort = (useSSL && port !== 443) || (!useSSL && port !== 80);
    const portStr = showPort ? `:${port}` : '';

    return `${protocol}://${endPoint}${portStr}/${this.bucket}/${key}`;
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async healthCheck() {
    try {
      await this.client.listBuckets();
      return { status: 'healthy', message: 'MinIO连接正常' };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'MinIO连接失败',
        error: error.message,
      };
    }
  }
}
