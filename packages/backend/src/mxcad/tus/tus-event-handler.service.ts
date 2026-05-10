///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileMergeService } from '../upload/file-merge.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { ExternalRefService } from '../external-ref/external-ref.service';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../version-control/interfaces/version-control.interface';
import { ThumbnailGenerationService } from '../infra/thumbnail-generation.service';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { Inject } from '@nestjs/common';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileTypeDetector } from '../utils/file-type-detector';
import { StorageService } from '../../storage/storage.service';
import { AppConfig } from '../../config/app.config';

/** Tus metadata 中的 uploadType 值 */
type UploadType = 'upload' | 'save' | 'extRef';

/** 从 metadata 解出的标准化参数 */
interface ParsedMetadata {
  filename: string;
  fileHash: string;
  fileSize: number;
  nodeId?: string;
  uploadType: UploadType;
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
  overwriteNodeId?: string;
  srcDwgNodeId?: string;
  isImage?: boolean;
  commitMessage?: string;
  isLibrary?: boolean;
  userRole?: string;
}

/**
 * Tus 事件处理器
 *
 * 处理 @tus/server 的上传完成事件（finish）。
 * 在文件上传完成后调用 FileMergeService 进行文件转换和节点创建。
 *
 * 职责：
 * 1. 监听 tus onUploadFinish 事件
 * 2. 获取上传文件信息（文件路径、元数据等）
 * 3. 调用文件转换服务进行格式转换
 * 4. 创建文件系统节点
 * 5. 清理临时文件
 */
@Injectable()
export class TusEventHandler {
  private readonly logger = new Logger(TusEventHandler.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileMergeService: FileMergeService,
    private readonly fileConversionService: FileConversionService,
    private readonly filePermissionService: FileSystemPermissionService,
    private readonly externalRefService: ExternalRefService,
    private readonly fileSystemServiceMain: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly fileSystemService: MxFileSystemService,
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
    private readonly storageManager: StorageManager,
    private readonly thumbnailGenerationService: ThumbnailGenerationService,
    private readonly storageService: StorageService,
  ) {
    this.logger.log('TusEventHandler 已初始化');
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath', { infer: true }) || path.join(process.cwd(), 'uploads');
  }

  /**
   * Parse and normalize Tus metadata into a typed object.
   */
  private parseMetadata(
    metadata: Record<string, string>,
  ): ParsedMetadata {
    return {
      filename: metadata.filename || 'unknown',
      fileHash: metadata.fileHash || '',
      fileSize: metadata.fileSize ? parseInt(metadata.fileSize, 10) : 0,
      nodeId: metadata.nodeId || undefined,
      uploadType: (metadata.uploadType as UploadType) || 'upload',
      conflictStrategy:
        (metadata.conflictStrategy as 'skip' | 'overwrite' | 'rename') || 'rename',
      overwriteNodeId: metadata.overwriteNodeId || undefined,
      srcDwgNodeId: metadata.srcDwgNodeId || undefined,
      isImage: metadata.isImage === 'true',
      commitMessage: metadata.commitMessage || undefined,
      isLibrary: metadata.isLibrary === 'true',
      userRole: metadata.userRole || undefined,
    };
  }

  /**
   * 处理上传完成事件（uploadType 分派入口）
   */
  async handleUploadFinish(
    uploadId: string,
    _filePath: string,
    metadata: Record<string, string>,
    userId?: string,
    userRole?: string,
  ): Promise<{ nodeId?: string; headers?: Record<string, string> }> {
    const parsed = this.parseMetadata(metadata);
    parsed.userRole = userRole;

    this.logger.log(
      `处理上传完成: uploadId=${uploadId}, uploadType=${parsed.uploadType}, filename=${parsed.filename}, fileHash=${parsed.fileHash}`
    );

    try {
      // Resolve actual file path (Tus FileStore writes to {mxcadUploadPath}/{uploadId})
      let actualFilePath = path.join(this.mxcadUploadPath, uploadId);
      if (!fs.existsSync(actualFilePath)) {
        this.logger.error(`上传文件不存在: ${actualFilePath}`);
        return {};
      }

      // Rename to {hash}.{ext} if hash is available
      if (parsed.fileHash) {
        const ext = path.extname(parsed.filename);
        const targetFilePath = path.join(this.mxcadUploadPath, `${parsed.fileHash}${ext}`);
        await fs.promises.rename(actualFilePath, targetFilePath);
        actualFilePath = targetFilePath;
        this.logger.log(`文件已重命名为: ${targetFilePath}`);
      }

      // Anonymous upload (no userId): convert only, no node creation
      if (!userId) {
        return this.handleAnonymousUpload(actualFilePath, parsed);
      }

      // Dispatch by uploadType
      switch (parsed.uploadType) {
        case 'save':
          return this.handleSaveUpload(actualFilePath, parsed, userId);
        case 'extRef':
          return this.handleExtRefUpload(actualFilePath, parsed, userId);
        case 'upload':
        default:
          return this.handleStandardUpload(actualFilePath, parsed, userId);
      }
    } catch (error) {
      this.logger.error(
        `处理上传完成事件失败: uploadId=${uploadId}, error=${(error as Error).message}`,
        (error as Error).stack,
      );
      return {};
    }
  }

  /** 匿名上传：仅转换文件，不创建节点 */
  private async handleAnonymousUpload(
    actualFilePath: string,
    parsed: ParsedMetadata,
  ): Promise<{ nodeId?: string; headers?: Record<string, string> }> {
    this.logger.log('匿名上传：仅进行文件存储和转换');

    if (actualFilePath && this.fileConversionService.needsConversion(parsed.filename)) {
      try {
        const { isOk } = await this.fileConversionService.convertFile({
          srcPath: actualFilePath,
          fileHash: parsed.fileHash || path.basename(actualFilePath),
          createPreloadingData: true,
        });
        if (isOk) {
          this.logger.log(`匿名上传转换成功: ${parsed.filename}`);
        } else {
          this.logger.warn(`匿名上传转换失败: ${parsed.filename}`);
        }
      } catch (convertError) {
        this.logger.warn(`匿名上传转换异常: ${(convertError as Error).message}`);
      }
    }

    const hash = parsed.fileHash;
    const headers: Record<string, string> = {};
    if (hash) headers['X-File-Hash'] = hash;
    return { nodeId: hash, headers };
  }

  /** 标准上传：转换 + 创建节点（现有流程） */
  private async handleStandardUpload(
    actualFilePath: string,
    parsed: ParsedMetadata,
    userId: string,
  ): Promise<{ nodeId?: string; headers?: Record<string, string> }> {
    if (!parsed.nodeId) {
      this.logger.warn('缺少 nodeId，无法创建文件节点');
      return {};
    }

    // 权限检查
    const hasPermission = await this.filePermissionService.checkNodePermission(
      userId,
      parsed.nodeId,
      ProjectPermission.FILE_CREATE,
    );
    if (!hasPermission) {
      this.logger.warn(`权限不足: ${userId} 在 ${parsed.nodeId}`);
      return {};
    }

    const result = await this.fileMergeService.processUploadedFile({
      fileHash: parsed.fileHash || parsed.filename,
      fileName: parsed.filename,
      fileSize: parsed.fileSize,
      context: {
        userId,
        nodeId: parsed.nodeId,
        userRole: parsed.userRole || '',
        fileSize: parsed.fileSize,
        conflictStrategy: parsed.conflictStrategy || 'rename',
        isLibrary: parsed.isLibrary,
      },
      srcDwgNodeId: parsed.srcDwgNodeId,
    });

    this.logger.log(
      `标准上传完成: filename=${parsed.filename}, nodeId=${result.nodeId}, ret=${result.ret}`
    );

    const headers: Record<string, string> = {};
    if (result.nodeId) headers['X-Node-Id'] = result.nodeId;
    return { nodeId: result.nodeId, headers };
  }

  /** 保存/另存为：覆盖目标节点文件 */
  private async handleSaveUpload(
    actualFilePath: string,
    parsed: ParsedMetadata,
    userId: string,
  ): Promise<{ nodeId?: string; headers?: Record<string, string> }> {
    const targetNodeId = parsed.overwriteNodeId || parsed.nodeId;
    if (!targetNodeId) {
      this.logger.warn('保存上传缺少 overwriteNodeId');
      return {};
    }

    try {
      const node = await this.fileSystemServiceMain.getNode(targetNodeId);
      if (!node) {
        this.logger.error(`目标节点不存在: ${targetNodeId}`);
        return {};
      }

      // 获取节点存储目录
      const storageInfo =
        await this.storageManager.allocateNodeStorage(targetNodeId);
      const nodeDir = storageInfo.nodeDirectoryPath;

      // 覆盖文件：直接用上传的文件替换节点目录中的 mxweb 文件
      const targetFileName = `${targetNodeId}.mxweb`;
      const targetFile = path.join(nodeDir, targetFileName);

      await fsPromises.copyFile(actualFilePath, targetFile);
      this.logger.log(`保存成功: ${targetFileName}`);

      // 更新缩略图（如果是 CAD 文件）
      if (
        this.thumbnailGenerationService.isEnabled() &&
        FileTypeDetector.isMxwebFile(parsed.filename)
      ) {
        try {
          const result = await this.thumbnailGenerationService.generateThumbnail(
            targetFile,
            nodeDir,
            targetNodeId,
          );
          if (!result.success) {
            this.logger.warn(`保存缩略图生成失败: ${result.error}`);
          }
        } catch (thumbErr) {
          this.logger.warn(`保存缩略图异常: ${(thumbErr as Error).message}`);
        }
      }

      // SVN 提交（公开资源库跳过）
      if (!parsed.isLibrary) {
        try {
          await this.versionControlService.commitNodeDirectory(
            nodeDir,
            parsed.commitMessage || `Save file: ${parsed.filename}`,
            userId,
            `User${userId}`,
          );
        } catch (svnErr) {
          this.logger.error(`保存 SVN 提交异常`, (svnErr as Error).stack);
        }
      }

      const headers: Record<string, string> = { 'X-Node-Id': targetNodeId };
      return { nodeId: targetNodeId, headers };
    } catch (error) {
      this.logger.error(
        `保存上传失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return {};
    }
  }

  /** 外部参照上传：转换 + 建立参照关系，不创建独立节点 */
  private async handleExtRefUpload(
    actualFilePath: string,
    parsed: ParsedMetadata,
    _userId: string,
  ): Promise<{ nodeId?: string; headers?: Record<string, string> }> {
    if (!parsed.srcDwgNodeId) {
      this.logger.warn('外部参照上传缺少 srcDwgNodeId');
      return {};
    }

    try {
      // 转换文件（如果是 CAD 文件）
      if (
        !FileTypeDetector.isMxwebFile(parsed.filename) &&
        this.fileConversionService.needsConversion(parsed.filename)
      ) {
        const { isOk } = await this.fileConversionService.convertFile({
          srcPath: actualFilePath,
          fileHash: parsed.fileHash,
          createPreloadingData: true,
        });
        if (!isOk) {
          this.logger.error(`外部参照转换失败: ${parsed.filename}`);
          return {};
        }
        // 转换成功后，更新 actualFilePath 为转换后的 .mxweb 文件路径
        // convertFile 在 uploadPath 下生成 {hash}.mxweb 文件
        const convertedExt = this.fileConversionService.getConvertedExtension(parsed.filename);
        const convertedPath = path.join(
          path.dirname(actualFilePath),
          `${parsed.fileHash}${convertedExt}`
        );
        if (fs.existsSync(convertedPath)) {
          actualFilePath = convertedPath;
          this.logger.log(`外部参照转换后路径更新: ${convertedPath}`);
        } else {
          this.logger.warn(`外部参照转换后文件未找到，使用原路径: ${convertedPath}`);
        }
      }

      // 建立参照关系
      if (parsed.isImage) {
        await this.externalRefService.handleExternalReferenceImage(
          parsed.fileHash,
          parsed.srcDwgNodeId,
          parsed.filename,
          actualFilePath,
          { userId: _userId, userRole: parsed.userRole || '', nodeId: parsed.srcDwgNodeId, srcDwgNodeId: parsed.srcDwgNodeId, isImage: parsed.isImage },
        );
      } else {
        await this.externalRefService.handleExternalReferenceFile(
          parsed.fileHash,
          parsed.srcDwgNodeId,
          parsed.filename,
          actualFilePath,
        );
      }

      this.logger.log(`外部参照上传完成: ${parsed.filename}`);
      return {};
    } catch (error) {
      this.logger.error(
        `外部参照上传失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return {};
    }
  }
}
