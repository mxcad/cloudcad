import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class FileHashService {
  private readonly logger = new Logger(FileHashService.name);

  /**
   * 计算文件的 SHA-256 哈希值
   */
  async calculateHash(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const hash = crypto.createHash('sha256');
        hash.update(buffer);
        const hashValue = hash.digest('hex');
        this.logger.debug(
          `计算文件哈希值成功: ${hashValue.substring(0, 16)}...`
        );
        resolve(hashValue);
      } catch (error) {
        this.logger.error(`计算文件哈希值失败: ${error.message}`, error.stack);
        reject(error);
      }
    });
  }

  /**
   * 计算流的哈希值（用于大文件）
   */
  async calculateHashFromStream(
    stream: NodeJS.ReadableStream
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const hash = crypto.createHash('sha256');
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => {
          const hashValue = hash.digest('hex');
          this.logger.debug(
            `计算流哈希值成功: ${hashValue.substring(0, 16)}...`
          );
          resolve(hashValue);
        });
        stream.on('error', reject);
      } catch (error) {
        this.logger.error(`计算流哈希值失败: ${error.message}`, error.stack);
        reject(error);
      }
    });
  }
}
