import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 存储检查服务
 * 用于检查文件是否存在于不同存储位置
 */
@Injectable()
export class StorageCheckService {
  private readonly logger = new Logger(StorageCheckService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * 检查文件是否存在于本地存储
   * @param key 存储键名
   * @returns 是否存在
   */
  async checkInStorage(key: string): Promise<boolean> {
    try {
      return await this.storageService.fileExists(key);
    } catch (error) {
      this.logger.error(`检查存储文件失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 检查文件是否存在于本地文件系统
   * @param filePath 文件路径
   * @returns 是否存在
   */
  async checkInLocal(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查文件是否存在于任何位置（存储或本地）
   * @param key 存储键名或文件路径
   * @returns 是否存在
   */
  async checkInAny(key: string): Promise<boolean> {
    // 先检查本地
    if (await this.checkInLocal(key)) {
      return true;
    }

    // 再检查存储
    return await this.checkInStorage(key);
  }

  /**
   * 检查文件是否存在于指定本地目录
   * @param fileName 文件名
   * @param directory 目录路径
   * @returns 是否存在
   */
  async checkInLocalDirectory(
    fileName: string,
    directory: string,
  ): Promise<boolean> {
    const filePath = path.join(directory, fileName);
    return await this.checkInLocal(filePath);
  }

  /**
   * 检查文件是否存在于上传临时目录
   * @param fileName 文件名
   * @returns 是否存在
   */
  async checkInUploadTemp(fileName: string): Promise<boolean> {
    const uploadTempPath = this.configService.get<string>(
      'MXCAD_UPLOAD_PATH',
      'D:\\web\\MxCADOnline\\cloudcad\\uploads',
    );
    return await this.checkInLocalDirectory(fileName, uploadTempPath);
  }

  /**
   * 检查文件是否存在于转换目录
   * @param fileName 文件名
   * @returns 是否存在
   */
  async checkInConvertDirectory(fileName: string): Promise<boolean> {
    const tempPath = this.configService.get<string>(
      'MXCAD_TEMP_PATH',
      'D:\\web\\MxCADOnline\\cloudcad\\temp',
    );
    return await this.checkInLocalDirectory(fileName, tempPath);
  }
}
