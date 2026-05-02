///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadUtilityService {
  private readonly logger = new Logger(UploadUtilityService.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileSystemService: MxFileSystemService,
    @Inject('FileSystemServiceMain')
    private readonly fileSystemServiceMain: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager
  ) {
    this.mxcadUploadPath =
      this.configService.get('mxcadUploadPath') || '../../uploads';
  }

  async createNonCadNode(
    originalName: string,
    fileHash: string,
    fileSize: number,
    sourceFilePath: string,
    context: { userId: string; nodeId: string }
  ): Promise<void> {
    try {
      const parentNode = await this.fileSystemServiceMain.getNode(
        context.nodeId
      );
      if (!parentNode) {
        throw new NotFoundException(`父节点不存在: ${context.nodeId}`);
      }

      const parentId = parentNode.isFolder
        ? parentNode.id
        : parentNode.parentId;
      if (!parentId) {
        throw new BadRequestException(`无法确定父节点ID: ${context.nodeId}`);
      }

      const extension = path.extname(originalName).toLowerCase();
      const mimeType = this.fileSystemNodeService.getMimeType(extension);

      const newNode = await this.fileSystemServiceMain.createFileNode({
        name: originalName,
        fileHash: fileHash,
        size: fileSize,
        mimeType,
        extension,
        parentId: parentId,
        ownerId: context.userId,
        skipFileCopy: true,
      });

      const storageInfo = await this.storageManager.allocateNodeStorage(
        newNode.id,
        originalName
      );
      await fs.promises.copyFile(sourceFilePath, storageInfo.filePath);
      await this.fileSystemServiceMain.updateNodePath(
        newNode.id,
        storageInfo.fileRelativePath
      );

      this.logger.log(
        `✅ 非CAD文件系统节点创建成功: ${originalName} (${fileHash})`
      );
    } catch (error) {
      this.logger.error(
        `创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`,
        error.stack
      );
      throw error;
    }
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

  async generateUniqueFileName(
    parentId: string,
    baseName: string
  ): Promise<string> {
    try {
      // 检查是否是文件夹（根据文件名是否有扩展名判断）
      const isFolder = path.extname(baseName) === '';
      // 调用文件系统服务的统一方法生成唯一名称
      return await this.fileSystemServiceMain.generateUniqueName(
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
