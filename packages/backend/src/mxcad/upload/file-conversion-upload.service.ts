///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import {
  FileSystemNodeService,
  FileSystemNodeContext,
} from '../node/filesystem-node.service';
import { CacheManagerService } from '../infra/cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../version-control/interfaces/version-control.interface';
import { ExternalReferenceUpdateService } from '../external-ref/external-reference-update.service';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { UploadFileOptions } from './file-upload-manager.types';
import { ExternalRefService } from '../external-ref/external-ref.service';
import { UploadUtilityService } from './upload-utility.service';
import { FileMergeService } from './file-merge.service';
import { ThumbnailGenerationService } from '../infra/thumbnail-generation.service';
import { StorageService } from '../../storage/storage.service';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { FileTypeDetector } from '../utils/file-type-detector';
import { FileStatus } from '../../common/enums/file-status.enum';
import { FileStatusStateMachine } from '../../file-system/file-status/file-status-state-machine';

async function copyFileOrDir(
  sourcePath: string,
  targetPath: string,
  options?: { fileHash?: string; newNodeId?: string }
): Promise<void> {
  const stat = await fsPromises.stat(sourcePath);
  if (stat.isDirectory()) {
    await fsPromises.cp(sourcePath, targetPath, { recursive: true });
  } else {
    let finalTargetPath = targetPath;
    if (options?.fileHash && options?.newNodeId) {
      const fileName = path.basename(sourcePath);
      const replacedFileName = fileName.replace(
        options.fileHash,
        options.newNodeId
      );
      finalTargetPath = path.join(path.dirname(targetPath), replacedFileName);
    }
    await fsPromises.copyFile(sourcePath, finalTargetPath);
  }
}

@Injectable()
export class FileConversionUploadService {
  private readonly logger = new Logger(FileConversionUploadService.name);

  private readonly checkingFiles: Map<string, Promise<{ ret: MxUploadReturn }>> =
    new Map();
  private readonly mxcadUploadPath: string;
  private readonly filesDataPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileSystemService: MxFileSystemService,
    @Inject('FileSystemServiceMain')
    private readonly fileSystemServiceMain: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly cacheManager: CacheManagerService,
    private readonly storageManager: StorageManager,
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
    private readonly fileConversionService: FileConversionService,
    private readonly externalReferenceUpdateService: ExternalReferenceUpdateService,
    private readonly externalRefService: ExternalRefService,
    private readonly uploadUtilityService: UploadUtilityService,
    private readonly fileMergeService: FileMergeService,
    private readonly thumbnailGenerationService: ThumbnailGenerationService,
    private readonly storageService: StorageService
  ) {
    this.mxcadUploadPath =
      this.configService.get('mxcadUploadPath') || '../../uploads';
    this.filesDataPath =
      this.configService.get('filesDataPath') || '../../filesData';
  }

  async uploadAndConvertFile(
    options: UploadFileOptions
  ): Promise<{ ret: string; tz?: boolean; nodeId?: string }> {
    const { filePath, hash, name, size, context } = options;

    try {
      await this.fileSystemService.writeStatusFile(name, size, hash, filePath);

      // Step 1: 提前创建 FileNode（状态 = UPLOADING）
      let newNodeId: string | undefined;
      if (context?.nodeId && context?.userId) {
        try {
          const parentNode = await this.fileSystemServiceMain.getNode(
            context.nodeId
          );
          if (!parentNode) {
            this.logger.warn(`[uploadAndConvertFile] 父节点不存在: ${context.nodeId}`);
          } else {
            const parentId = parentNode.isFolder
              ? parentNode.id
              : parentNode.parentId;
            if (parentId) {
              const extension = path.extname(name).toLowerCase();
              const mimeType = this.fileSystemNodeService.getMimeType(extension);

              const newNode = await this.fileSystemServiceMain.createFileNode({
                name,
                fileHash: hash,
                size,
                mimeType,
                extension,
                parentId,
                ownerId: context.userId,
                skipFileCopy: true,
                fileStatus: FileStatus.UPLOADING,
              });

              newNodeId = newNode.id;
              this.logger.log(`[uploadAndConvertFile] 节点创建成功 (UPLOADING): ${newNodeId}`);

              // 转换 UPLOADING → PROCESSING
              FileStatusStateMachine.validateTransition(FileStatus.UPLOADING, FileStatus.PROCESSING);
              await this.fileSystemServiceMain.updateFileStatus(newNodeId, FileStatus.PROCESSING as any);
              this.logger.log(`[uploadAndConvertFile] 状态转换: UPLOADING → PROCESSING (${newNodeId})`);
            }
          }
        } catch (nodeErr) {
          this.logger.warn(`[uploadAndConvertFile] 节点创建失败，继续转换: ${nodeErr.message}`);
        }
      }

      // Step 2: 格式转换
      const { isOk, ret } = await this.fileConversionService.convertFile({
        srcPath: filePath,
        fileHash: hash,
        createPreloadingData: true,
      });

      // Step 3: 根据转换结果更新状态
      if (isOk) {
        // 转换成功 → COMPLETED
        if (newNodeId) {
          FileStatusStateMachine.validateTransition(FileStatus.PROCESSING, FileStatus.COMPLETED);
          await this.fileSystemServiceMain.updateFileStatus(newNodeId, FileStatus.COMPLETED as any);
          this.logger.log(`[uploadAndConvertFile] 状态转换: PROCESSING → COMPLETED (${newNodeId})`);
        }
        await this.handleFileNodeCreation(name, hash, size, filePath, context, newNodeId);
        return { ret: MxUploadReturn.kOk, tz: ret?.tz, nodeId: newNodeId };
      } else {
        // 转换失败 → FAILED → 删除节点
        if (newNodeId) {
          FileStatusStateMachine.validateTransition(FileStatus.PROCESSING, FileStatus.FAILED);
          await this.fileSystemServiceMain.updateFileStatus(newNodeId, FileStatus.FAILED as any);
          this.logger.log(`[uploadAndConvertFile] 状态转换: PROCESSING → FAILED (${newNodeId})`);
          await this.fileSystemServiceMain.deleteNode(newNodeId, true);
          this.logger.log(`[uploadAndConvertFile] 已删除失败节点: ${newNodeId}`);
        }
        return { ret: MxUploadReturn.kConvertFileError };
      }
    } catch (error) {
      this.logger.error(`上传并转换文件失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }

  async uploadAndConvertFileWithPermission(
    options: UploadFileOptions
  ): Promise<{ ret: string; tz?: boolean; nodeId?: string }> {
    const { filePath, hash, name, size, context } = options;

    const fileExists = await this.uploadUtilityService.checkFileExistsInStorage(
      hash,
      name
    );
    if (fileExists) {
      this.logger.log(
        `[uploadAndConvertFileWithPermission] 文件已存在，执行秒传: ${name}`
      );

      // 外部参照上传：跳过创建数据库节点和存储分配，直接处理外部参照文件
      if (context.srcDwgNodeId) {
        this.logger.log(
          `[uploadAndConvertFileWithPermission] 外部参照文件已存在，跳过创建节点和存储分配: ${name}`
        );
        try {
          const uploadPath =
            this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
          const targetFile = path.join(
            uploadPath,
            this.uploadUtilityService.getConvertedFileName(hash, name)
          );
          if (!context.isImage) {
            await this.externalRefService.handleExternalReferenceFile(
              hash,
              context.srcDwgNodeId,
              name,
              targetFile
            );
          } else {
            await this.externalRefService.handleExternalReferenceImage(
              hash,
              context.srcDwgNodeId,
              name,
              targetFile,
              context
            );
          }
        } catch (extRefError) {
          this.logger.error(`外部参照文件拷贝失败: ${extRefError.message}`);
        }
        return { ret: MxUploadReturn.kFileAlreadyExist };
      }

      // 普通图纸上传：创建数据库节点和存储分配
      if (context && context.userId && context.nodeId) {
        const extension = path.extname(name).toLowerCase();
        const mimeType = this.fileSystemNodeService.getMimeType(extension);

        const parentNode = await this.fileSystemServiceMain.getNode(
          context.nodeId
        );
        if (!parentNode) {
          return { ret: MxUploadReturn.kConvertFileError };
        }

        const parentId = parentNode.isFolder
          ? parentNode.id
          : parentNode.parentId;
        if (!parentId) {
          return { ret: MxUploadReturn.kConvertFileError };
        }

        const uploadPath =
          this.mxcadUploadPath || path.join(process.cwd(), 'uploads');

        const newNode = await this.fileSystemServiceMain.createFileNode({
          name: name,
          fileHash: hash,
          size: size,
          mimeType,
          extension,
          parentId: parentId,
          ownerId: context.userId,
          skipFileCopy: true,
        });

        const newNodeId = newNode.id;
        const storageInfo = await this.storageManager.allocateNodeStorage(
          newNodeId,
          name
        );

        const files = await fsPromises.readdir(uploadPath);
        const matchingFiles = files.filter((file) => file.startsWith(hash));

        if (matchingFiles.length > 0) {
          const nodeDirectory = storageInfo.nodeDirectoryPath;
          let mxwebFileName = '';

          for (const file of matchingFiles) {
            const sourcePath = path.join(uploadPath, file);
            const targetFileName = file.replace(hash, newNodeId);
            const targetPath = path.join(nodeDirectory, targetFileName);
            await copyFileOrDir(sourcePath, targetPath, {
              fileHash: hash,
              newNodeId,
            });

            if (targetFileName.endsWith('.mxweb')) {
              mxwebFileName = targetFileName;
            }
          }

          if (mxwebFileName) {
            const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`;
            await this.fileSystemServiceMain.updateNodePath(
              newNodeId,
              nodePathWithFile
            );
          } else {
            const expectedMxwebFileName = `${newNodeId}${extension}.mxweb`;
            const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${expectedMxwebFileName}`;
            await this.fileSystemServiceMain.updateNodePath(
              newNodeId,
              nodePathWithFile
            );
          }
        }

        // 注意：公开资源库上传不需要提交 MX
        if (!context.isLibrary) {
          try {
            const nodeDirectory = storageInfo.nodeDirectoryPath;

            await this.versionControlService.commitNodeDirectory(
              nodeDirectory,
              `Fast upload file: ${name}`,
              context.userId,
              `User${context.userId}`
            );
          } catch (mxError) {
            this.logger.error(
              `[uploadAndConvertFileWithPermission] MX 提交异常`,
              mxError.stack
            );
          }
        }

        return { ret: MxUploadReturn.kFileAlreadyExist, nodeId: newNodeId };
      } else {
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }

    const uploadPath =
      this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
    const targetFile = path.join(
      uploadPath,
      this.uploadUtilityService.getConvertedFileName(hash, name)
    );

    if (FileTypeDetector.isMxwebFile(name)) {
      this.logger.log(`检测到 MXWeb 文件，直接复制到节点目录: ${name}`);
      try {
        const fileSize = await this.fileSystemService.getFileSize(filePath);

        if (context && context.userId && context.nodeId) {
          const extension = path.extname(name).toLowerCase();
          const mimeType = this.fileSystemNodeService.getMimeType(extension);

          const parentNode = await this.fileSystemServiceMain.getNode(
            context.nodeId
          );
          if (!parentNode) {
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const parentId = parentNode.isFolder
            ? parentNode.id
            : parentNode.parentId;
          if (!parentId) {
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const newNode = await this.fileSystemServiceMain.createFileNode({
            name: name,
            fileHash: hash,
            size: fileSize,
            mimeType,
            extension,
            parentId: parentId,
            ownerId: context.userId,
            skipFileCopy: true,
          });

          const newNodeId = newNode.id;
          // 工作文件命名：{nodeId}.mxweb.mxweb（与 save-as 格式统一，DB path 指向它）
          const mxwebFileName = `${newNodeId}.mxweb.mxweb`;
          const storageInfo = await this.storageManager.allocateNodeStorage(
            newNodeId,
            mxwebFileName
          );

          await this.storageService.copyFromFs(filePath, storageInfo.fileRelativePath);
          await this.fileSystemServiceMain.updateNodePath(
            newNodeId,
            storageInfo.fileRelativePath
          );

          // 同时保存 nodeId.mxweb 作为初始备份（MX 只提交此文件，用于灾难恢复）
          const backupFileName = `${newNodeId}.mxweb`;
          const backupRelativePath = `${storageInfo.nodeDirectoryRelativePath}/${backupFileName}`;
          await this.storageService.copyFromFs(filePath, backupRelativePath);
          this.logger.log(`[uploadAndConvertFileWithPermission] 初始备份保存成功: ${backupRelativePath}`);

          if (!context.isLibrary) {
            try {
              // MX 只提交 nodeId.mxweb 初始备份文件，不提交工作文件
              const backupAbsolutePath = `${storageInfo.nodeDirectoryPath}/${backupFileName}`;
              await this.versionControlService.commitFiles(
                [backupAbsolutePath],
                `Upload MXWeb file: ${backupFileName}`,
              );
            } catch (mxError) {
              this.logger.error(
                `[uploadAndConvertFileWithPermission] MXWeb MX 提交异常`,
                mxError.stack
              );
            }
          }

          return { ret: MxUploadReturn.kOk, nodeId: newNodeId };
        } else {
          return { ret: MxUploadReturn.kConvertFileError };
        }
      } catch (error) {
        this.logger.error(`MXWeb 文件上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }

    if (this.fileConversionService.needsConversion(name)) {
      this.logger.log(`检测到CAD文件，执行转换流程: ${name}`);

      // Step 1: 提前创建 FileNode（非外部参照路径，状态 = UPLOADING）
      let cadNodeId: string | undefined;
      if ((!context.srcDwgNodeId || context.isImage) && context?.nodeId && context?.userId) {
        try {
          const parentNode = await this.fileSystemServiceMain.getNode(
            context.nodeId
          );
          if (parentNode) {
            const parentId = parentNode.isFolder
              ? parentNode.id
              : parentNode.parentId;
            if (parentId) {
              const extension = path.extname(name).toLowerCase();
              const mimeType = this.fileSystemNodeService.getMimeType(extension);

              const newNode = await this.fileSystemServiceMain.createFileNode({
                name,
                fileHash: hash,
                size,
                mimeType,
                extension,
                parentId,
                ownerId: context.userId,
                skipFileCopy: true,
                fileStatus: FileStatus.UPLOADING,
              });

              cadNodeId = newNode.id;
              this.logger.log(`[uploadAndConvertFileWithPermission] 节点创建成功 (UPLOADING): ${cadNodeId}`);

              // 转换 UPLOADING → PROCESSING
              FileStatusStateMachine.validateTransition(FileStatus.UPLOADING, FileStatus.PROCESSING);
              await this.fileSystemServiceMain.updateFileStatus(cadNodeId, FileStatus.PROCESSING as any);
              this.logger.log(`[uploadAndConvertFileWithPermission] 状态转换: UPLOADING → PROCESSING (${cadNodeId})`);
            }
          }
        } catch (nodeErr) {
          this.logger.warn(`[uploadAndConvertFileWithPermission] 节点创建失败，继续转换: ${nodeErr.message}`);
        }
      }

      // Step 2: 格式转换
      await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
      const { isOk, ret } = await this.fileConversionService.convertFile({
        srcPath: filePath,
        fileHash: hash,
        createPreloadingData: true,
      });

      // Step 3: 根据转换结果更新状态
      if (isOk) {
        // 转换成功 → COMPLETED
        if (cadNodeId) {
          FileStatusStateMachine.validateTransition(FileStatus.PROCESSING, FileStatus.COMPLETED);
          await this.fileSystemServiceMain.updateFileStatus(cadNodeId, FileStatus.COMPLETED as any);
          this.logger.log(`[uploadAndConvertFileWithPermission] 状态转换: PROCESSING → COMPLETED (${cadNodeId})`);
        }

        // 外部参照上传：跳过创建数据库节点和存储分配，直接处理外部参照文件
        if (context.srcDwgNodeId && !context.isImage) {
          this.logger.log(
            `[uploadAndConvertFileWithPermission] 外部参照 DWG 文件上传，跳过创建节点和存储分配: ${name}`
          );
          try {
            const convertedFilePath = path.join(
              uploadPath,
              this.uploadUtilityService.getConvertedFileName(hash, name)
            );
            await this.externalRefService.handleExternalReferenceFile(
              hash,
              context.srcDwgNodeId,
              name,
              convertedFilePath
            );
          } catch (error) {
            this.logger.error(
              `外部参照文件拷贝失败: ${error.message}`,
              error.stack
            );
          }
        } else {
          // 普通图纸上传：创建数据库节点和存储分配
          await this.handleFileNodeCreation(name, hash, size, filePath, context, cadNodeId);
        }

        return { ret: MxUploadReturn.kOk, tz: ret?.tz, nodeId: cadNodeId };
      } else {
        // 转换失败 → FAILED → 删除节点
        if (cadNodeId) {
          FileStatusStateMachine.validateTransition(FileStatus.PROCESSING, FileStatus.FAILED);
          await this.fileSystemServiceMain.updateFileStatus(cadNodeId, FileStatus.FAILED as any);
          this.logger.log(`[uploadAndConvertFileWithPermission] 状态转换: PROCESSING → FAILED (${cadNodeId})`);
          await this.fileSystemServiceMain.deleteNode(cadNodeId, true);
          this.logger.log(`[uploadAndConvertFileWithPermission] 已删除失败节点: ${cadNodeId}`);
        }
        return { ret: MxUploadReturn.kConvertFileError };
      }
    } else {
      this.logger.log(`检测到非CAD文件，直接拷贝到本地存储: ${name}`);
      try {
        const fileSize = await this.fileSystemService.getFileSize(filePath);

        if (context && context.userId && context.nodeId) {
          const extension = path.extname(name).toLowerCase();
          const mimeType = this.fileSystemNodeService.getMimeType(extension);

          const parentNode = await this.fileSystemServiceMain.getNode(
            context.nodeId
          );
          if (!parentNode) {
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const parentId = parentNode.isFolder
            ? parentNode.id
            : parentNode.parentId;
          if (!parentId) {
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const newNode = await this.fileSystemServiceMain.createFileNode({
            name: name,
            fileHash: hash,
            size: fileSize,
            mimeType,
            extension,
            parentId: parentId,
            ownerId: context.userId,
            skipFileCopy: true,
          });

          const newNodeId = newNode.id;
          const storageInfo = await this.storageManager.allocateNodeStorage(
            newNodeId,
            name
          );

          await this.storageService.copyFromFs(filePath, storageInfo.fileRelativePath);
          await this.fileSystemServiceMain.updateNodePath(
            newNodeId,
            storageInfo.fileRelativePath
          );

          if (context.srcDwgNodeId && context.isImage) {
            try {
              await this.externalRefService.handleExternalReferenceImage(
                hash,
                context.srcDwgNodeId,
                name,
                filePath,
                context
              );
            } catch (error) {
              this.logger.error(
                `外部参照图片文件拷贝失败: ${error.message}`,
                error.stack
              );
            }
          }

          return { ret: MxUploadReturn.kOk };
        } else {
          return { ret: MxUploadReturn.kConvertFileError };
        }
      } catch (error) {
        this.logger.error(`非CAD文件上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
  }

  async checkFileExist(
    filename: string,
    fileHash: string,
    context?: {
      userId?: string;
      nodeId?: string;
      srcDwgNodeId?: string;
      isImage?: boolean;
      fileSize?: number;
      userRole?: string;
      conflictStrategy?: 'skip' | 'overwrite' | 'rename';
    }
  ): Promise<{ ret: MxUploadReturn; nodeId?: string }> {
    try {
      const suffix = filename.substring(filename.lastIndexOf('.') + 1);
      const convertedExt =
        this.fileConversionService.getConvertedExtension(filename);

      const checkKey = `${fileHash}.${suffix}`;
      if (this.checkingFiles.has(checkKey)) {
        return await this.checkingFiles.get(checkKey)!;
      }

      const checkPromise = this.fileMergeService.performFileExistenceCheck(
        filename,
        fileHash,
        suffix,
        convertedExt,
        context as FileSystemNodeContext
      );
      this.checkingFiles.set(checkKey, checkPromise);

      try {
        const result = await checkPromise;
        return result;
      } finally {
        this.checkingFiles.delete(checkKey);
      }
    } catch (error) {
      this.logger.error(`检查文件存在性失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kFileNoExist };
    }
  }

  private async handleFileNodeCreation(
    originalName: string,
    fileHash: string,
    fileSize: number,
    originalFilePath: string,
    context: {
      userId: string;
      nodeId?: string;
      srcDwgNodeId?: string;
      isLibrary?: boolean;
    },
    existingNodeId?: string,
  ): Promise<void> {
    if (!context.nodeId && !existingNodeId) {
      this.logger.warn('⚠️ 缺少节点ID，无法创建文件系统节点。');
      return;
    }

    try {
      let nodeId: string;

      if (existingNodeId) {
        // 节点已提前创建，直接使用
        nodeId = existingNodeId;
        this.logger.log(`[handleFileNodeCreation] 使用已有节点: ${nodeId}`);
      } else {
        // 创建新节点（原有逻辑）
        const parentNode = await this.fileSystemServiceMain.getNode(
          context.nodeId
        );
        if (!parentNode) {
          this.logger.error(
            `[handleFileNodeCreation] 父节点不存在: ${context.nodeId}`
          );
          return;
        }

        const parentId = parentNode.isFolder
          ? parentNode.id
          : parentNode.parentId;
        if (!parentId) {
          this.logger.error(
            `[handleFileNodeCreation] 无法确定父节点ID: ${context.nodeId}`
          );
          return;
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

        nodeId = newNode.id;
        this.logger.log(`[handleFileNodeCreation] 节点创建成功: ${nodeId}`);
      }

      const uploadPath =
        this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
      const extension = path.extname(originalName).toLowerCase();

      const storageInfo = await this.storageManager.allocateNodeStorage(
        nodeId,
        originalName
      );

      const files = await fsPromises.readdir(uploadPath);
      const matchingFiles = files.filter((file) => file.startsWith(fileHash));

      if (matchingFiles.length > 0) {
        const nodeDirectory = storageInfo.nodeDirectoryPath;
        let mxwebFileName = '';

        for (const file of matchingFiles) {
          const sourcePath = path.join(uploadPath, file);
          const targetFileName = file.replace(fileHash, nodeId);
          const targetPath = path.join(nodeDirectory, targetFileName);
          await fsPromises.copyFile(sourcePath, targetPath);

          if (targetFileName.endsWith('.mxweb')) {
            mxwebFileName = targetFileName;
          }
        }

        if (mxwebFileName) {
          const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`;
          await this.fileSystemServiceMain.updateNodePath(
            nodeId,
            nodePathWithFile
          );
        } else {
          const expectedMxwebFileName = `${nodeId}${extension}.mxweb`;
          const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${expectedMxwebFileName}`;
          await this.fileSystemServiceMain.updateNodePath(
            nodeId,
            nodePathWithFile
          );
        }

        // 自动生成缩略图（仅当存在 mxweb 文件时）
        if (mxwebFileName) {
          try {
            const filesDataPath =
              this.filesDataPath || path.join(process.cwd(), 'filesData');
            const nodeDir = storageInfo.nodeDirectoryPath;
            const mxwebPath = path.join(nodeDir, mxwebFileName);

            // 检查缩略图生成功能是否启用
            if (this.thumbnailGenerationService.isEnabled()) {
              this.logger.log(
                `[handleFileNodeCreation] 开始自动生成缩略图: ${nodeId}`
              );
              const result =
                await this.thumbnailGenerationService.generateThumbnail(
                  mxwebPath,
                  nodeDir,
                  nodeId
                );
              if (result.success) {
                this.logger.log(
                  `[handleFileNodeCreation] 缩略图生成成功: ${result.thumbnailPath}`
                );
              } else {
                this.logger.warn(
                  `[handleFileNodeCreation] 缩略图生成失败: ${result.error}`
                );
              }
            }
          } catch (thumbnailError) {
            // 缩略图生成失败不影响主流程
            this.logger.warn(
              `[handleFileNodeCreation] 缩略图生成异常: ${thumbnailError.message}`
            );
          }
        }
      }

      // 保存原始上传文件作为灾难恢复备份（如 {nodeId}.dwg），MX 只提交此文件
      // 转换后的 {nodeId}.{ext}.mxweb 是工作文件，每次覆盖保存都会更新，不提交 MX
      const originalExt = path.extname(originalName).toLowerCase();
      let originalBackupPath = '';
      if (originalFilePath && await fsPromises.access(originalFilePath).then(() => true).catch(() => false)) {
        originalBackupPath = path.join(
          storageInfo.nodeDirectoryPath,
          `${nodeId}${originalExt}`
        );
        await fsPromises.copyFile(originalFilePath, originalBackupPath);
        this.logger.log(
          `[handleFileNodeCreation] 原始备份保存成功: ${originalBackupPath}`
        );
      }

      // 注意：公开资源库上传不需要提交 MX
      // MX 只提交原始上传文件（如 .dwg/.dxf），不提交转换后的 .mxweb 工作文件
      if (!context.isLibrary && originalBackupPath) {
        try {
          await this.versionControlService.commitFiles(
            [originalBackupPath],
            `Upload file: ${originalName}`,
          );
        } catch (mxError) {
          this.logger.error(
            `[handleFileNodeCreation] MX 提交异常`,
            mxError.stack
          );
        }
      }

      try {
        await this.externalReferenceUpdateService.updateAfterUpload(
          context.nodeId
        );
      } catch (extRefError) {
        this.logger.warn(`⚠️ 外部参照信息更新失败: ${extRefError.message}`);
      }
    } catch (error) {
      this.logger.error(
        `创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`,
        error.stack
      );
    }
  }
}
