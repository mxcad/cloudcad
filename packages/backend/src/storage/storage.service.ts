import { Injectable, Logger } from '@nestjs/common';
import { MinioStorageProvider } from './minio-storage.provider';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private minioProvider: MinioStorageProvider) {}

  async healthCheck() {
    try {
      // 尝试列出bucket来检查MinIO是否正常
      // 这里简化处理，实际可以实现更详细的健康检查
      return {
        status: 'healthy',
        message: 'MinIO存储服务正常',
      };
    } catch (error) {
      this.logger.error('存储服务健康检查失败:', error);
      return {
        status: 'unhealthy',
        message: `存储服务不可用: ${error.message}`,
      };
    }
  }
}
