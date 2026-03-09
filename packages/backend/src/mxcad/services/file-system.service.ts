import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IFileSystemService,
  MergeOptions,
} from '../interfaces/file-system.interface';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream, statSync } from 'fs';
import { AppConfig } from '../../config/app.config';

@Injectable()
export class FileSystemService implements IFileSystemService {
  private readonly logger = new Logger(FileSystemService.name);
  private readonly uploadPath: string;
  private readonly tempPath: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    this.uploadPath = this.configService.get('mxcadUploadPath', { infer: true });
    this.tempPath = this.configService.get('mxcadTempPath', { infer: true });
  }

  async exists(path: string): Promise<boolean> {
    return fs.existsSync(path);
  }

  async createDirectory(dirPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return true;
    } catch (error) {
      this.logger.error(`创建目录失败: ${dirPath}`, error);
      return false;
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return stats.size;
      }
      return 0;
    } catch (error) {
      this.logger.error(`获取文件大小失败: ${filePath}`, error);
      return 0;
    }
  }

  async readDirectory(dirPath: string): Promise<string[]> {
    try {
      if (fs.existsSync(dirPath)) {
        return fs.readdirSync(dirPath);
      }
      return [];
    } catch (error) {
      this.logger.error(`读取目录失败: ${dirPath}`, error);
      return [];
    }
  }

  /**
   * 查找目录中以指定前缀开头的文件
   * @param dirPath 目录路径
   * @param prefix 文件名前缀
   * @returns 匹配的文件名列表
   */
  async findFilesByPrefix(dirPath: string, prefix: string): Promise<string[]> {
    try {
      if (!fs.existsSync(dirPath)) {
        return [];
      }

      const files = fs.readdirSync(dirPath);
      return files.filter((file) => file.startsWith(prefix));
    } catch (error) {
      this.logger.error(`查找文件失败: ${dirPath}, prefix=${prefix}`, error);
      return [];
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      if (fs.existsSync(path)) {
        if (fs.statSync(path).isDirectory()) {
          return await this.deleteDirectory(path);
        } else {
          fs.unlinkSync(path);
        }
      }
      return true;
    } catch (error) {
      this.logger.error(`删除失败: ${path}`, error);
      return false;
    }
  }

  async mergeChunks(
    options: MergeOptions
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const { sourceFiles, targetPath, chunkDir } = options;

      try {
        if (!fs.existsSync(chunkDir)) {
          resolve({ success: false, error: `分片目录不存在: ${chunkDir}` });
          return;
        }

        // 确保目标目录存在
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
          this.logger.log(`创建目标目录: ${targetDir}`);
        }

        const list = fs.readdirSync(chunkDir);
        const aryList: any[] = [];

        list.forEach((val: string) => {
          const strNum = val.substring(0, val.indexOf('_'));
          aryList.push({ num: parseInt(strNum, 10), file: val });
        });

        aryList.sort((a, b) => a.num - b.num);

        const fileList = aryList.map((val) => ({
          name: val.file,
          filePath: path.resolve(chunkDir, val.file),
        }));

        const fileWriteStream = createWriteStream(targetPath);
        this.streamMergeRecursive(fileList, fileWriteStream, (ret) => {
          if (ret === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: '文件合并失败' });
          }
        });
      } catch (error) {
        this.logger.error(`合并分片失败: ${error.message}`, error);
        resolve({ success: false, error: error.message });
      }
    });
  }

  async writeStatusFile(
    name: string,
    size: number,
    hash: string,
    targetPath: string
  ): Promise<boolean> {
    try {
      const status = {
        name,
        size,
        hash,
      };
      const jsonPath = path.join(path.dirname(targetPath), `${hash}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(status));
      return true;
    } catch (error) {
      this.logger.error(`写入状态文件失败: ${error.message}`, error);
      return false;
    }
  }

  getChunkTempDirPath(fileHash: string): string {
    return path.join(this.tempPath, `chunk_${fileHash}`);
  }

  getMd5Path(fileHash: string): string {
    return path.join(this.uploadPath, fileHash);
  }

  async deleteDirectory(dirPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file) => {
          const curPath = path.join(dirPath, file);
          if (statSync(curPath).isDirectory()) {
            this.deleteDirectory(curPath);
          } else {
            fs.unlinkSync(curPath);
          }
        });
        fs.rmdirSync(dirPath);
      }
      return true;
    } catch (error) {
      this.logger.error(`删除目录失败: ${dirPath}`, error);
      return false;
    }
  }

  private streamMergeRecursive(
    fileList: any[],
    fileWriteStream: any,
    resultCall: (code: number) => void
  ): void {
    if (!fileList.length) {
      fileWriteStream.end('done');
      resultCall(0);
      return;
    }

    const data = fileList.shift();
    const { filePath: chunkFilePath } = data;

    // 检查路径是否是目录
    try {
      const stats = statSync(chunkFilePath);
      if (stats.isDirectory()) {
        this.logger.error(`路径是目录而非文件: ${chunkFilePath}`);
        fileWriteStream.close();
        resultCall(1);
        return;
      }
    } catch (error) {
      this.logger.error(`无法读取文件信息: ${chunkFilePath}`, error);
      fileWriteStream.close();
      resultCall(1);
      return;
    }

    const currentReadStream = createReadStream(chunkFilePath);

    currentReadStream.pipe(fileWriteStream, { end: false });

    currentReadStream.on('end', () => {
      this.streamMergeRecursive(fileList, fileWriteStream, resultCall);
    });

    currentReadStream.on('error', (error) => {
      this.logger.error('WriteStream 合并失败', error);
      fileWriteStream.close();
      resultCall(1);
    });
  }
}
