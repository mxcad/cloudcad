///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { VersionControlService } from '../../version-control/version-control.service';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { MergeOptions, MergeResult } from './file-upload-manager.types';
import { ExternalRefService } from '../external-ref/external-ref.service';
import { UploadUtilityService } from './upload-utility.service';
import { ThumbnailGenerationService } from '../infra/thumbnail-generation.service';
import {
  getThumbnailFileName,
  THUMBNAIL_FORMATS,
  type ThumbnailFormat,
} from '../infra/thumbnail-utils';
import { FileTypeDetector } from '../utils/file-type-detector';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

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
export class FileMergeService {
  private readonly logger = new Logger(FileMergeService.name);

  private readonly mapCurrentFilesBeingMerged: Record<string, boolean> = {};
  private readonly mxcadUploadPath: string;
  private readonly filesDataPath: string;
  private readonly mxcadFileExt: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileSystemService: MxFileSystemService,
    @Inject('FileSystemServiceMain')
    private readonly fileSystemServiceMain: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly cacheManager: CacheManagerService,
    private readonly storageManager: StorageManager,
    private readonly versionControlService: VersionControlService,
    private readonly fileConversionService: FileConversionService,
    private readonly externalRefService: ExternalRefService,
    private readonly uploadUtilityService: UploadUtilityService,
    private readonly thumbnailGenerationService: ThumbnailGenerationService
  ) {
    this.mxcadUploadPath =
      this.configService.get('mxcadUploadPath') || '../../uploads';
    this.filesDataPath =
      this.configService.get('filesDataPath') || '../../filesData';
    this.mxcadFileExt = this.configService.get('mxcad.fileExt') || '.mxweb';
  }

  async mergeConvertFile(options: MergeOptions): Promise<MergeResult> {
    const {
      hash: hashFile,
      chunks,
      name: fileName,
      size: fileSize,
      context,
      srcDwgNodeId,
    } = options;
    const fileMd5 = hashFile;
    const tmpDir = this.fileSystemService.getChunkTempDirPath(fileMd5);
    const uploadPath =
      this.mxcadUploadPath || path.join(process.cwd(), 'uploads');

    this.logger.log(
      `[mergeConvertFile] 开始合并转换: userId=${context.userId}, nodeId=${context.nodeId}, fileHash=${fileMd5}, fileName=${fileName}, chunks=${chunks}, srcDwgNodeId=${srcDwgNodeId}`
    );

    try {
      const dirExists = await this.fileSystemService.exists(tmpDir);
      if (!dirExists) {
        this.logger.warn(`[mergeConvertFile] 临时目录不存在: ${tmpDir}`);
        return { ret: MxUploadReturn.kChunkNoExist };
      }

      const stack = await this.fileSystemService.readDirectory(tmpDir);

      if (chunks === stack.length) {
        const mergeKey = `merging:${fileMd5}`;
        const isMerging = await this.cacheManager.get<boolean>(
          'file-upload',
          mergeKey
        );

        if (isMerging) {
          this.logger.log(
            `[mergeConvertFile] 文件正在合并中，跳过: ${fileMd5}`
          );
          return { ret: MxUploadReturn.kOk };
        }

        await this.cacheManager.set('file-upload', mergeKey, true);

        const name = fileName;
        const fileExtName = name.substring(name.lastIndexOf('.') + 1);
        const filename = `${fileMd5}.${fileExtName}`;
        const filepath = this.fileSystemService.getMd5Path(filename);

        let newNodeId: string | undefined;

        try {
          const mergeResult = await this.fileSystemService.mergeChunks({
            sourceFiles: [],
            targetPath: filepath,
            chunkDir: tmpDir,
          });

          if (!mergeResult.success) {
            await this.cacheManager.delete('file-upload', mergeKey);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          await this.fileSystemService.writeStatusFile(
            fileName,
            fileSize,
            hashFile,
            filepath
          );

          const { isOk, ret } = await this.fileConversionService.convertFile({
            srcPath: filepath,
            fileHash: fileMd5,
            createPreloadingData: true,
          });

          // 文件转换结果处理
          if (!isOk) {
            await this.fileSystemService.deleteDirectory(tmpDir);
            await this.cacheManager.delete('file-upload', mergeKey);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          if (context && context.userId && context.nodeId) {
            const extension = path.extname(fileName).toLowerCase();
            const mimeType = this.fileSystemNodeService.getMimeType(extension);

            const parentNode = await this.fileSystemServiceMain.getNode(
              context.nodeId
            );
            if (!parentNode) {
              await this.cacheManager.delete('file-upload', mergeKey);
              return { ret: MxUploadReturn.kConvertFileError };
            }

            const parentId = parentNode.isFolder
              ? parentNode.id
              : parentNode.parentId;
            if (!parentId) {
              await this.cacheManager.delete('file-upload', mergeKey);
              return { ret: MxUploadReturn.kConvertFileError };
            }

            // 处理冲突策略
            let finalFileName = fileName;
            const strategy = context?.conflictStrategy || 'rename';

            // 检查同名文件
            const childrenResult =
              await this.fileSystemServiceMain.getChildren(parentId);
            const existingNodes = childrenResult.nodes || [];
            const existingFile = existingNodes.find(
              (node) =>
                !node.isFolder &&
                node.name.toLowerCase() === fileName.toLowerCase()
            );

            if (existingFile) {
              if (strategy === 'skip') {
                this.logger.log(
                  `[mergeConvertFile] 同名文件已存在，跳过: ${fileName}`
                );
                await this.fileSystemService.deleteDirectory(tmpDir);
                await this.cacheManager.delete('file-upload', mergeKey);
                return {
                  ret: MxUploadReturn.kFileAlreadyExist,
                  nodeId: existingFile.id,
                };
              } else if (strategy === 'overwrite') {
                this.logger.log(`[mergeConvertFile] 覆盖同名文件: ${fileName}`);
                await this.fileSystemServiceMain.deleteNode(
                  existingFile.id,
                  true
                );
              } else if (strategy === 'rename') {
                finalFileName =
                  await this.uploadUtilityService.generateUniqueFileName(
                    parentId,
                    fileName
                  );
                this.logger.log(
                  `[mergeConvertFile] 重命名文件: ${fileName} -> ${finalFileName}`
                );
              }
            }

            const newNode = await this.fileSystemServiceMain.createFileNode({
              name: finalFileName,
              fileHash: fileMd5,
              size: fileSize,
              mimeType,
              extension,
              parentId: parentId,
              ownerId: context.userId,
              skipFileCopy: true,
            });

            newNodeId = newNode.id;
            this.logger.log(`[mergeConvertFile] 节点创建成功: ${newNodeId}`);

            const storageInfo =
              await this.storageManager.allocateNodeStorage(newNodeId);
            this.logger.log(
              `[mergeConvertFile] 物理目录创建成功: ${storageInfo.nodeDirectoryRelativePath}`
            );

            const files = await fsPromises.readdir(uploadPath);
            const matchingFiles = files.filter((file) =>
              file.startsWith(fileMd5)
            );

            if (matchingFiles.length > 0) {
              const nodeDirectory = storageInfo.nodeDirectoryPath;
              let mxwebFileName = '';

              for (const file of matchingFiles) {
                const sourcePath = path.join(uploadPath, file);
                const targetFileName = file.replace(fileMd5, newNodeId);
                const targetPath = path.join(nodeDirectory, targetFileName);
                await copyFileOrDir(sourcePath, targetPath, {
                  fileHash: fileMd5,
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

              // 处理缩略图（仅 CAD 文件）
              const isCadFile =
                extension.toLowerCase() === '.dwg' ||
                extension.toLowerCase() === '.dxf';
              if (isCadFile) {
                try {
                  const nodeDirectory = storageInfo.nodeDirectoryPath;

                  // 缩略图缓存路径：uploads/{fileMd5}.{ext}.jpg
                  const thumbnailCachePath = path.join(
                    uploadPath,
                    `${fileMd5}.${fileExtName}.jpg`
                  );
                  const thumbnailTargetPath = path.join(
                    nodeDirectory,
                    getThumbnailFileName(THUMBNAIL_FORMATS[0])
                  );

                  // 检查缓存是否存在
                  const cacheExists = await fsPromises
                    .access(thumbnailCachePath)
                    .then(() => true)
                    .catch(() => false);

                  if (cacheExists) {
                    // 从缓存拷贝
                    this.logger.log(
                      `[mergeConvertFile] 从缓存拷贝缩略图: ${newNodeId}`
                    );
                    await fsPromises.copyFile(
                      thumbnailCachePath,
                      thumbnailTargetPath
                    );
                    this.logger.log(
                      `[mergeConvertFile] 缩略图拷贝成功: ${thumbnailTargetPath}`
                    );
                  } else if (this.thumbnailGenerationService.isEnabled()) {
                    // 生成缩略图（直接生成到缓存路径）
                    this.logger.log(
                      `[mergeConvertFile] 生成缩略图并缓存: ${newNodeId}`
                    );
                    const cadFilePath = path.join(
                      uploadPath,
                      `${fileMd5}.${fileExtName}`
                    );
                    const cacheFileName = `${fileMd5}.${fileExtName}.jpg`;
                    const result =
                      await this.thumbnailGenerationService.generateThumbnail(
                        cadFilePath,
                        uploadPath,
                        newNodeId,
                        cacheFileName // 直接生成到正确的缓存文件名
                      );
                    if (result.success) {
                      // 拷贝到节点目录
                      await fsPromises.copyFile(
                        thumbnailCachePath,
                        thumbnailTargetPath
                      );
                      this.logger.log(
                        `[mergeConvertFile] 缩略图生成成功: ${thumbnailTargetPath}`
                      );
                    } else {
                      this.logger.warn(
                        `[mergeConvertFile] 缩略图生成失败: ${result.error}`
                      );
                    }
                  }
                } catch (thumbnailError) {
                  this.logger.warn(
                    `[mergeConvertFile] 缩略图处理异常: ${thumbnailError.message}`
                  );
                }
              }
            }

            // 注意：公开资源库上传不需要提交 SVN
            if (!context.isLibrary) {
              try {
                const nodeDirectory = storageInfo.nodeDirectoryPath;

                await this.versionControlService.commitNodeDirectory(
                  nodeDirectory,
                  `Upload file: ${fileName}`,
                  context.userId,
                  `User${context.userId}`
                );
              } catch (svnError) {
                this.logger.error(
                  `[mergeConvertFile] SVN 提交异常`,
                  svnError.stack
                );
              }
            }

            await this.fileSystemService.deleteDirectory(tmpDir);

            if (context.srcDwgNodeId) {
              try {
                await this.externalRefService.handleExternalReferenceFile(
                  fileMd5,
                  context.srcDwgNodeId,
                  fileName,
                  filepath
                );
              } catch (error) {
                this.logger.error(
                  `[mergeConvertFile] 外部参照文件处理失败: ${error.message}`,
                  error.stack
                );
                throw error;
              }
            }

            await this.cacheManager.delete('file-upload', mergeKey);
            return { ret: MxUploadReturn.kOk, tz: ret?.tz, nodeId: newNodeId };
          } else {
            await this.cacheManager.delete('file-upload', mergeKey);
            return { ret: MxUploadReturn.kOk };
          }
        } catch (error) {
          await this.cacheManager.delete('file-upload', mergeKey);
          this.logger.error('mergeConvertFile error', error);
          if (newNodeId) {
            try {
              await this.fileSystemServiceMain.deleteNode(newNodeId, true);
            } catch (deleteError) {
              this.logger.error(
                `[mergeConvertFile] 删除节点失败: ${deleteError.message}`
              );
            }
          }
          return { ret: MxUploadReturn.kConvertFileError };
        }
      } else {
        return { ret: MxUploadReturn.kOk };
      }
    } catch (error) {
      this.logger.error(`合并转换文件失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }

  async mergeChunksWithPermission(options: MergeOptions): Promise<MergeResult> {
    const { hash, name, size, chunks, context, srcDwgNodeId } = options;

    this.logger.log(
      `[mergeChunksWithPermission] 开始合并: hash=${hash}, name=${name}`
    );

    const mergeKey = `merging:${hash}`;
    const isMerging = await this.cacheManager.get<boolean>(
      'file-upload',
      mergeKey
    );

    if (isMerging) {
      return { ret: MxUploadReturn.kOk };
    }

    await this.cacheManager.set('file-upload', mergeKey, true);

    if (
      !FileTypeDetector.isMxwebFile(name) &&
      this.fileConversionService.needsConversion(name)
    ) {
      const mergeResult = await this.mergeConvertFile({
        hash,
        name,
        size,
        chunks,
        context,
        srcDwgNodeId,
      });
      await this.cacheManager.delete('file-upload', mergeKey);
      return mergeResult;
    } else if (FileTypeDetector.isMxwebFile(name)) {
      this.logger.log(
        `[mergeChunksWithPermission] 检测到 MXWeb 文件，直接复制到节点目录: ${name}`
      );
    } else {
      try {
        const tmpDir = this.fileSystemService.getChunkTempDirPath(hash);
        const mergedFilePath = path.join(tmpDir, `${hash}_merged_${name}`);

        const mergeResult = await this.fileSystemService.mergeChunks({
          sourceFiles: [],
          targetPath: mergedFilePath,
          chunkDir: tmpDir,
        });

        if (!mergeResult.success) {
          return { ret: MxUploadReturn.kConvertFileError };
        }

        const fileSize =
          await this.fileSystemService.getFileSize(mergedFilePath);

        if (context && context.userId && context.nodeId) {
          const extension = path.extname(name).toLowerCase();
          const mimeType = this.fileSystemNodeService.getMimeType(extension);

          const parentNode = await this.fileSystemServiceMain.getNode(
            context.nodeId
          );
          if (!parentNode) {
            await this.fileSystemService.deleteDirectory(tmpDir);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const parentId = parentNode.isFolder
            ? parentNode.id
            : parentNode.parentId;
          if (!parentId) {
            await this.fileSystemService.deleteDirectory(tmpDir);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const newNode = await this.fileSystemServiceMain.createFileNode({
            name,
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

          await fsPromises.copyFile(mergedFilePath, storageInfo.filePath);
          await this.fileSystemServiceMain.updateNodePath(
            newNodeId,
            storageInfo.fileRelativePath
          );

          // 注意：公开资源库上传不需要提交 SVN
          if (!context.isLibrary) {
            try {
              const nodeDirectory = storageInfo.nodeDirectoryPath;

              await this.versionControlService.commitNodeDirectory(
                nodeDirectory,
                `Upload file: ${name}`,
                context.userId,
                `User${context.userId}`
              );
            } catch (svnError) {
              this.logger.error(
                `[mergeChunksWithPermission] SVN 提交异常`,
                svnError.stack
              );
            }
          }

          await this.fileSystemService.deleteDirectory(tmpDir);
          return { ret: MxUploadReturn.kOk, nodeId: newNodeId };
        } else {
          await this.fileSystemService.deleteDirectory(tmpDir);
          return { ret: MxUploadReturn.kConvertFileError };
        }
      } catch (error) {
        this.logger.error(
          `非CAD文件合并上传失败: ${error.message}`,
          error.stack
        );
        await this.cacheManager.delete('file-upload', mergeKey);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
  }

  async performFileExistenceCheck(
    filename: string,
    fileHash: string,
    suffix: string,
    convertedExt: string,
    context?: FileSystemNodeContext
  ): Promise<{ ret: string; nodeId?: string }> {
    const targetFile = `${fileHash}.${suffix}${convertedExt}`;
    let fileExists = false;

    const localPath = this.fileSystemService.getMd5Path(targetFile);
    const localExists = await this.fileSystemService.exists(localPath);
    if (localExists) {
      fileExists = true;
    }

    if (fileExists) {
      if (context && context.userId && context.nodeId) {
        try {
          const extension = `.${suffix}`.toLowerCase();
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

          // 检查同名文件
          const childrenResult =
            await this.fileSystemServiceMain.getChildren(parentId);
          const existingNodes = childrenResult.nodes || [];
          const existingFile = existingNodes.find(
            (node: any) =>
              !node.isFolder &&
              node.name.toLowerCase() === filename.toLowerCase()
          );

          const strategy = context.conflictStrategy || 'rename';
          this.logger.log(
            `[performFileExistenceCheck] conflictStrategy=${context.conflictStrategy}, strategy=${strategy}, filename=${filename}`
          );

          if (existingFile) {
            if (strategy === 'skip') {
              this.logger.log(
                `[performFileExistenceCheck] 同名文件已存在，跳过: ${filename}`
              );
              return {
                ret: MxUploadReturn.kFileAlreadyExist,
                nodeId: existingFile.id,
              };
            } else if (strategy === 'overwrite') {
              this.logger.log(
                `[performFileExistenceCheck] 覆盖同名文件: ${filename}`
              );
              await this.fileSystemServiceMain.deleteNode(
                existingFile.id,
                true
              );
            }
            // rename 策略继续使用唯一文件名
          }

          // 根据策略决定文件名
          let finalFileName: string;
          if (strategy === 'rename') {
            finalFileName =
              await this.uploadUtilityService.generateUniqueFileName(
                parentId,
                filename
              );
          } else {
            // skip 或 overwrite 使用原始文件名
            finalFileName = filename;
          }

          const fileSize = context.fileSize || 0;
          const newNode = await this.fileSystemServiceMain.createFileNode({
            name: finalFileName,
            fileHash: fileHash,
            size: fileSize,
            mimeType,
            extension,
            parentId: parentId,
            ownerId: context.userId,
            skipFileCopy: true,
          });

          const newNodeId = newNode.id;
          const storageInfo =
            await this.storageManager.allocateNodeStorage(newNodeId);

          const uploadPath =
            this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
          const files = await fsPromises.readdir(uploadPath);
          const matchingFiles = files.filter((file) =>
            file.startsWith(fileHash)
          );

          if (matchingFiles.length > 0) {
            const nodeDirectory = storageInfo.nodeDirectoryPath;
            let mxwebFileName = '';

            for (const file of matchingFiles) {
              const sourcePath = path.join(uploadPath, file);
              const targetFileName = file.replace(fileHash, newNodeId);
              const targetPath = path.join(nodeDirectory, targetFileName);
              await copyFileOrDir(sourcePath, targetPath, {
                fileHash,
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

            // 处理缩略图（仅 CAD 文件）
            const isCadFile =
              suffix.toLowerCase() === 'dwg' || suffix.toLowerCase() === 'dxf';
            if (isCadFile) {
              try {
                const nodeDir = storageInfo.nodeDirectoryPath;
                const thumbnailTargetPath = path.join(
                  nodeDir,
                  getThumbnailFileName(THUMBNAIL_FORMATS[0])
                );

                // 缩略图命名格式：{fileHash}.dwg.jpg 或 {fileHash}.dxf.jpg
                const thumbnailCachePath = path.join(
                  uploadPath,
                  `${fileHash}.${suffix}.jpg`
                );

                // 检查缩略图是否存在
                const thumbnailExists = await fsPromises
                  .access(thumbnailCachePath)
                  .then(() => true)
                  .catch(() => false);

                if (thumbnailExists) {
                  // 从缓存拷贝
                  this.logger.log(
                    `[performFileExistenceCheck] 拷贝缩略图: ${newNodeId}`
                  );
                  await fsPromises.copyFile(
                    thumbnailCachePath,
                    thumbnailTargetPath
                  );
                  this.logger.log(
                    `[performFileExistenceCheck] 缩略图拷贝成功: ${thumbnailTargetPath}`
                  );
                } else if (this.thumbnailGenerationService.isEnabled()) {
                  // 手动生成缩略图（直接生成到缓存路径）
                  this.logger.log(
                    `[performFileExistenceCheck] 生成缩略图: ${newNodeId}`
                  );
                  const cadFilePath = path.join(
                    uploadPath,
                    `${fileHash}.${suffix}`
                  );
                  const cacheFileName = `${fileHash}.${suffix}.jpg`;
                  const result =
                    await this.thumbnailGenerationService.generateThumbnail(
                      cadFilePath,
                      uploadPath,
                      newNodeId,
                      cacheFileName // 直接生成到正确的缓存文件名
                    );
                  if (result.success) {
                    // 拷贝到节点目录
                    await fsPromises.copyFile(
                      thumbnailCachePath,
                      thumbnailTargetPath
                    );
                    this.logger.log(
                      `[performFileExistenceCheck] 缩略图生成成功: ${thumbnailTargetPath}`
                    );
                  } else {
                    this.logger.warn(
                      `[performFileExistenceCheck] 缩略图生成失败: ${result.error}`
                    );
                  }
                }
              } catch (thumbnailError) {
                this.logger.warn(
                  `[performFileExistenceCheck] 缩略图处理异常: ${thumbnailError.message}`
                );
              }
            }
          }

          // 注意：公开资源库上传不需要提交 SVN
          this.logger.log(
            `[performFileExistenceCheck] context.isLibrary = ${context.isLibrary}, finalFileName = ${finalFileName}`
          );
          if (!context.isLibrary) {
            try {
              const nodeDirectory = storageInfo.nodeDirectoryPath;

              await this.versionControlService.commitNodeDirectory(
                nodeDirectory,
                `Fast upload file: ${finalFileName}`,
                context.userId,
                `User${context.userId}`
              );
            } catch (svnError) {
              this.logger.error(
                `[performFileExistenceCheck] SVN 提交异常`,
                svnError.stack
              );
            }
          } else {
            this.logger.log(
              `[performFileExistenceCheck] 跳过 SVN 提交: ${finalFileName} (公开资源库)`
            );
          }

          if (context.srcDwgNodeId) {
            try {
              const targetFile = path.join(
                uploadPath,
                this.uploadUtilityService.getConvertedFileName(
                  fileHash,
                  filename
                )
              );
              if (!context.isImage) {
                await this.externalRefService.handleExternalReferenceFile(
                  fileHash,
                  context.srcDwgNodeId,
                  filename,
                  targetFile
                );
              } else {
                await this.externalRefService.handleExternalReferenceImage(
                  fileHash,
                  context.srcDwgNodeId,
                  filename,
                  targetFile,
                  context
                );
              }
            } catch (extRefError) {
              this.logger.error(`外部参照文件拷贝失败: ${extRefError.message}`);
            }
          }

          return { ret: MxUploadReturn.kFileAlreadyExist, nodeId: newNodeId };
        } catch (error) {
          this.logger.error(`秒传节点创建失败: ${error.message}`, error.stack);
          return { ret: MxUploadReturn.kConvertFileError };
        }
      } else {
        return { ret: MxUploadReturn.kConvertFileError };
      }
    } else {
      return { ret: MxUploadReturn.kFileNoExist };
    }
  }
}
