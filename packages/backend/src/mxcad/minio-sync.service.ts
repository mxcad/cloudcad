import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MinioSyncService {
  private readonly logger = new Logger(MinioSyncService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT') || 'localhost',
      port: parseInt(this.configService.get('MINIO_PORT') || '9000'),
      useSSL: this.configService.get('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.get('MINIO_ACCESS_KEY') || 'minioadmin',
      secretKey: this.configService.get('MINIO_SECRET_KEY') || 'minioadmin',
    });
    
    this.bucketName = this.configService.get('MINIO_BUCKET') || 'cloucad';
  }

  /**
   * 确保存储桶存在
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName);
        this.logger.log(`创建存储桶: ${this.bucketName}`);
      }
    } catch (error) {
      this.logger.error(`检查存储桶失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 同步单个文件到 MinIO
   */
  public async syncFileToMinio(localPath: string, minioPath: string): Promise<boolean> {
    try {
      await this.ensureBucketExists();
      
      if (!fs.existsSync(localPath)) {
        this.logger.warn(`本地文件不存在: ${localPath}`);
        return false;
      }

      const fileStream = fs.createReadStream(localPath);
      const stat = fs.statSync(localPath);
      
      await this.minioClient.putObject(
        this.bucketName,
        minioPath,
        fileStream,
        stat.size
      );
      
      this.logger.log(`文件同步成功: ${localPath} -> ${minioPath}`);
      return true;
    } catch (error) {
      this.logger.error(`文件同步失败: ${localPath} -> ${minioPath}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 上传文件到MinIO（支持Buffer）
   */
  async uploadFile(minioPath: string, buffer: Buffer): Promise<void> {
    try {
      await this.ensureBucketExists();
      
      await this.minioClient.putObject(
        this.bucketName,
        minioPath,
        buffer,
        buffer.length
      );
      
      this.logger.log(`文件上传成功: ${minioPath} (${buffer.length} bytes)`);
    } catch (error) {
      this.logger.error(`文件上传失败: ${minioPath}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 同步目录下的所有文件到 MinIO
   */
  private async syncDirectoryToMinio(localDir: string, minioDir: string): Promise<boolean> {
    try {
      if (!fs.existsSync(localDir)) {
        this.logger.warn(`本地目录不存在: ${localDir}`);
        return false;
      }

      const files = fs.readdirSync(localDir);
      let allSuccess = true;

      for (const file of files) {
        const localFilePath = path.join(localDir, file);
        const minioFilePath = path.join(minioDir, file).replace(/\\/g, '/');
        
        if (fs.statSync(localFilePath).isFile()) {
          const success = await this.syncFileToMinio(localFilePath, minioFilePath);
          if (!success) {
            allSuccess = false;
          }
        }
      }

      return allSuccess;
    } catch (error) {
      this.logger.error(`目录同步失败: ${localDir} -> ${minioDir}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 同步 mxcad 转换后的所有文件到 MinIO
   */
  public async syncMxCadFiles(fileHash: string, context?: any): Promise<boolean> {
    try {
      const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
      
      // 直接同步到 mxcad/file/ 路径，不使用 hash 目录
      // 前端请求路径：/mxcad/file/4b298dd48355af1202b532fc4d051658.dwg.mxweb
      // MinIO 存储路径：mxcad/file/4b298dd48355af1202b532fc4d051658.dwg.mxweb
      const baseMinioPath = `mxcad/file`;
      
      let allSuccess = true;
      
      // 同步根目录下的转换文件
      // MxCAD 转换后的文件名格式：{fileHash}.dwg.mxweb, {fileHash}.dwg.mxweb_preloading.json
      const files = fs.readdirSync(uploadPath).filter(file => {
        // 匹配所有相关文件：原始文件、转换文件、状态文件
        return file.startsWith(fileHash) && 
               (file.endsWith('.dwg') || 
                file.endsWith('.dxf') || 
                file.endsWith('.mxweb') || 
                file.endsWith('.json'));
      });
      
      for (const file of files) {
        const localFilePath = path.join(uploadPath, file);
        
        // 直接同步到 mxcad/file/ 路径下，文件名保持不变
        const success = await this.syncFileToMinio(localFilePath, `${baseMinioPath}/${file}`);
        if (!success) {
          allSuccess = false;
        }
      }
      
      if (allSuccess) {
        this.logger.log(`mxcad 文件同步完成: ${fileHash}`);
      } else {
        this.logger.warn(`mxcad 文件同步部分失败: ${fileHash}`);
      }
      
      return allSuccess;
    } catch (error) {
      this.logger.error(`同步 mxcad 文件失败: ${fileHash}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 从 MinIO 获取文件预签名 URL
   */
  public async getFileUrl(minioPath: string, expiry: number = 3600): Promise<string | null> {
    try {
      await this.ensureBucketExists();
      
      const exists = await this.minioClient.statObject(this.bucketName, minioPath);
      if (!exists) {
        this.logger.warn(`MinIO 文件不存在: ${minioPath}`);
        return null;
      }
      
      return await this.minioClient.presignedGetObject(
        this.bucketName,
        minioPath,
        expiry
      );
    } catch (error) {
      this.logger.error(`获取文件 URL 失败: ${minioPath}: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 检查 MinIO 文件是否存在
   */
  public async fileExists(minioPath: string): Promise<boolean> {
    try {
      await this.ensureBucketExists();
      await this.minioClient.statObject(this.bucketName, minioPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 MinIO 文件大小
   */
  public async getFileSize(minioPath: string): Promise<number> {
    try {
      await this.ensureBucketExists();
      const statResult = await this.minioClient.statObject(this.bucketName, minioPath);
      return statResult.size;
    } catch (error) {
      this.logger.error(`获取 MinIO 文件大小失败: ${minioPath}`, error);
      return 0;
    }
  }
}