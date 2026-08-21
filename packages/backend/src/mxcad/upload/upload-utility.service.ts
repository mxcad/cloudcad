///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { NodeNameService } from '../../file-operations/node-name.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadUtilityService {
  private readonly logger = new Logger(UploadUtilityService.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileSystemService: MxFileSystemService,
    private readonly fileTreeService: FileTreeService,
    private readonly nodeNameService: NodeNameService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager,
    @Inject(IStorageService) private readonly storageService: IStorageService
  ) {
    this.mxcadUploadPath =
      this.configService.get('mxcadUploadPath') || '../../uploads';
  }

  async getFileSize(
    fileHash: string,
    filename: string,
    targetFile: string
  ): Promise<number> {
    try {
      const localPath = this.fileSystemService.getMd5Path(targetFile);
      const size = await this.fileSystemService.getFileSize(localPath);
      if (size > 0) {
        return size;
      }

      const uploadPath =
        this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
      const allFiles = await this.fileSystemService.readDirectory(uploadPath);
      const relatedFiles = allFiles.filter((file) => file.startsWith(fileHash));
      if (relatedFiles.length > 0) {
        const firstFile = path.join(uploadPath, relatedFiles[0]);
        return await this.fileSystemService.getFileSize(firstFile);
      }

      return 0;
    } catch (error) {
      this.logger.warn(`获取文件大小失败: ${error.message}`);
      return 0;
    }
  }

  async checkFileExistsInStorage(
    fileHash: string,
    originalFilename: string
  ): Promise<boolean> {
    const targetFile = this.getConvertedFileName(fileHash, originalFilename);
    const uploadPath =
      this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
    const localPath = path.join(uploadPath, targetFile);
    const existsInLocal = fs.existsSync(localPath);

    if (!existsInLocal) {
      return false;
    }

    try {
      const fd = fs.openSync(localPath, 'r');
      const stats = fs.fstatSync(fd);
      fs.closeSync(fd);

      if (stats.size === 0) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  getConvertedFileName(fileHash: string, originalFilename: string): string {
    const suffix = originalFilename.substring(
      originalFilename.lastIndexOf('.') + 1
    );
    return `${fileHash}.${suffix}.mxweb`;
  }

  async checkChunkExistsInStorage(
    fileHash: string,
    chunkIndex: number
  ): Promise<boolean> {
    const uploadPath =
      this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
    const chunkDir = path.join(uploadPath, `chunk_${fileHash}`);

    if (!fs.existsSync(chunkDir)) {
      return false;
    }

    const chunkFileName = `${chunkIndex}_${fileHash}`;
    const chunkPath = path.join(chunkDir, chunkFileName);

    if (!fs.existsSync(chunkPath)) {
      return false;
    }

    try {
      const fd = fs.openSync(chunkPath, 'r');
      const stats = fs.fstatSync(fd);
      fs.closeSync(fd);

      if (stats.size === 0) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async generateUniqueFileName(
    parentId: string,
    baseName: string
  ): Promise<string> {
    try {
      // 检查是否是文件夹（根据文件名是否有扩展名判断）
      const isFolder = path.extname(baseName) === '';
      // 调用文件系统服务的统一方法生成唯一名称
      return await this.nodeNameService.generateUniqueName(
        parentId,
        baseName,
        isFolder
      );
    } catch (error) {
      this.logger.error(
        `[generateUniqueFileName] 生成唯一文件名失败: ${error.message}`,
        error.stack
      );
      return baseName;
    }
  }
}
