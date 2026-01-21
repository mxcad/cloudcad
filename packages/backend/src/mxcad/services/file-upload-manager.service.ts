import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { FileStorageService } from './file-storage.service';
import { FileConversionService } from './file-conversion.service';
import { FileSystemService } from './file-system.service';
import {
  FileSystemNodeService,
  FileSystemNodeContext,
} from './filesystem-node.service';
import { CacheManagerService } from './cache-manager.service';
import { MinioSyncService } from '../minio-sync.service';
import { MxCadService } from '../mxcad.service';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface UploadChunkOptions {
  hash: string;
  name: string;
  size: number;
  chunk: number;
  chunks: number;
  context: FileSystemNodeContext;
}

export interface MergeOptions {
  hash: string;
  name: string;
  size: number;
  chunks: number;
  context: FileSystemNodeContext;
  /** 源图纸哈希（用于外部参照上传，转换后将文件移动到源图纸的 hash 目录） */
  srcDwgFileHash?: string;
}

export interface UploadFileOptions {
  filePath: string;
  hash: string;
  name: string;
  size: number;
  context: FileSystemNodeContext;
}

@Injectable()
export class FileUploadManagerService {
  private readonly logger = new Logger(FileUploadManagerService.name);

  // 当前正在合并转换的文件，防止同一个文件同时多次进行转换合并调用
  private readonly mapCurrentFilesBeingMerged: Record<string, boolean> = {};

  // 并发控制
  private readonly checkingFiles: Map<string, Promise<{ ret: string }>> =
    new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly fileStorageService: FileStorageService,
    private readonly fileConversionService: FileConversionService,
    private readonly fileSystemService: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly cacheManager: CacheManagerService,
    private readonly minioSyncService: MinioSyncService,
    @Inject(forwardRef(() => MxCadService))
    private readonly mxCadService: MxCadService
  ) {}

  /**
   * 检查分片是否存在
   */
  async checkChunkExist(options: UploadChunkOptions): Promise<{ ret: string }> {
    const { chunk, hash, size, chunks: totalChunks, name } = options;

    this.logger.log(
      `[checkChunkExist] 开始检查: chunk=${chunk}, hash=${hash}, chunks=${totalChunks}, name=${name}`
    );

    try {
      const cbfilename = `${chunk}_${hash}`;
      const tmpDir = this.fileSystemService.getChunkTempDirPath(hash);
      const chunkPath = path.join(tmpDir, cbfilename);

      // 检查分片文件是否存在
      const chunkExists = await this.fileSystemService.exists(chunkPath);
      if (chunkExists) {
        // 检查文件大小是否匹配
        const chunkSize = await this.fileSystemService.getFileSize(chunkPath);
        if (chunkSize !== size) {
          return { ret: MxUploadReturn.kChunkNoExist };
        }

        // 分片大小匹配，检查是否需要合并
        // 如果是最后一个分片，检查是否所有分片都已上传
        if (chunk === totalChunks - 1) {
          this.logger.log(
            `🔍 最后分片已上传，检查是否需要合并: ${name}, hash=${hash}, chunks=${totalChunks}`
          );

          // 检查所有分片是否都存在
          let allChunksExist = true;
          for (let i = 0; i < totalChunks; i++) {
            const eachChunkPath = path.join(tmpDir, `${i}_${hash}`);
            if (!(await this.fileSystemService.exists(eachChunkPath))) {
              allChunksExist = false;
              break;
            }
          }

          if (allChunksExist) {
            this.logger.log(`✅ 所有分片已存在，触发合并: ${name}`);

            // 防止重复转换：检查是否正在转换中
            const convertingKey = `converting:${hash}`;
            const isConverting = this.cacheManager.get<boolean>(
              'file-existence',
              convertingKey
            );
            if (isConverting) {
              this.logger.log(`⏭️ 文件正在转换中，跳过重复转换: ${name}`);
              return { ret: MxUploadReturn.kFileAlreadyExist };
            }

            // 标记为正在转换
            this.cacheManager.set('file-existence', convertingKey, true);

            // 所有分片存在，触发合并
            const mergeResult = await this.mergeChunksWithPermission({
              hash,
              name,
              size: 0,
              chunks: totalChunks,
              context: options.context,
            });

            // 清除转换标记
            this.cacheManager.delete('file-existence', convertingKey);

            if (
              mergeResult.ret === MxUploadReturn.kOk ||
              mergeResult.ret === 'ok'
            ) {
              return { ret: MxUploadReturn.kFileAlreadyExist };
            } else {
              return { ret: MxUploadReturn.kChunkAlreadyExist };
            }
          }
        }

        // 分片已存在，无需合并
        return { ret: MxUploadReturn.kChunkAlreadyExist };
      } else {
        return { ret: MxUploadReturn.kChunkNoExist };
      }
    } catch (error) {
      this.logger.error(`检查分片存在性失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kChunkNoExist };
    }
  }

  /**
   * 检查文件是否存在（优化版本）
   * 优先检查存储服务，本地文件系统作为降级方案
   * 支持并发控制
   */
  async checkFileExist(
    filename: string,
    fileHash: string,
    context?: FileSystemNodeContext
  ): Promise<{ ret: string }> {
    try {
      const targetFile = this.getConvertedFileName(fileHash, filename);
      const suffix = filename.substring(filename.lastIndexOf('.') + 1);
      const convertedExt =
        this.fileConversionService.getConvertedExtension(filename);

      this.logger.log(`🔍 检查文件存在性: ${targetFile}`);

      // 并发控制 - 如果同一个文件正在检查，等待结果
      const checkKey = `${fileHash}.${suffix}`;
      if (this.checkingFiles.has(checkKey)) {
        this.logger.log(`⏳ 文件正在检查中，等待结果: ${checkKey}`);
        return await this.checkingFiles.get(checkKey)!;
      }

      // 创建检查 Promise 并缓存
      this.logger.log(`🔄 执行实际文件存在性检查: ${targetFile}`);
      const checkPromise = this.performFileExistenceCheck(
        filename,
        fileHash,
        suffix,
        convertedExt,
        context
      );
      this.checkingFiles.set(checkKey, checkPromise);

      try {
        const result = await checkPromise;
        this.logger.log(
          `📋 文件存在性检查结果: ${targetFile} -> ${result.ret}`
        );
        return result;
      } finally {
        // 清理并发控制
        this.checkingFiles.delete(checkKey);
      }
    } catch (error) {
      this.logger.error(`检查文件存在性失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kFileNoExist };
    }
  }

  /**
   * 合并转换文件
   */
  async mergeConvertFile(
    options: MergeOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const {
      hash: hashFile,
      chunks,
      name: fileName,
      size: fileSize,
      context,
      srcDwgFileHash,
    } = options;
    const fileMd5 = hashFile;
    const tmpDir = this.fileSystemService.getChunkTempDirPath(fileMd5);

    try {
      // 检查临时目录是否存在
      const dirExists = await this.fileSystemService.exists(tmpDir);
      if (!dirExists) {
        this.logger.warn(`临时目录不存在: ${tmpDir}`);
        return { ret: MxUploadReturn.kChunkNoExist };
      }

      const stack = await this.fileSystemService.readDirectory(tmpDir);

      // 判断当前上传的切片等于切片总数
      if (chunks === stack.length) {
        if (this.mapCurrentFilesBeingMerged[fileMd5]) {
          // 文件已经在合并中了，就直接返回
          return { ret: MxUploadReturn.kOk };
        }

        const name = fileName;
        const fileExtName = name.substring(name.lastIndexOf('.') + 1);
        const filename = `${fileMd5}.${fileExtName}`;
        const filepath = this.fileSystemService.getMd5Path(filename);

        // 标记文件正在合并
        this.mapCurrentFilesBeingMerged[fileMd5] = true;

        try {
          // 合并分片文件
          const mergeResult = await this.fileSystemService.mergeChunks({
            sourceFiles: [],
            targetPath: filepath,
            chunkDir: tmpDir,
          });

          if (!mergeResult.success) {
            this.mapCurrentFilesBeingMerged[fileMd5] = false;
            return { ret: MxUploadReturn.kConvertFileError };
          }

          // 写入状态文件
          await this.fileSystemService.writeStatusFile(
            fileName,
            fileSize,
            hashFile,
            filepath
          );

          // 对合并的文件进行格式转换
          const { isOk, ret } = await this.fileConversionService.convertFile({
            srcPath: filepath,
            fileHash: fileMd5,
            createPreloadingData: true, // 外部参照也需要创建预加载数据
          });

          this.mapCurrentFilesBeingMerged[fileMd5] = false;

          if (isOk) {
            // 删除临时目录
            await this.fileSystemService.deleteDirectory(tmpDir);

            // 检查是否为外部参照上传
            if (srcDwgFileHash) {
              // 外部参照：将转换后的文件移动到源图纸的 hash 目录
              this.logger.log(
                `[mergeConvertFile] 检测到外部参照上传: srcDwgFileHash=${srcDwgFileHash}, fileName=${fileName}`
              );
              try {
                await this.handleExternalReferenceFile(
                  fileMd5,
                  srcDwgFileHash,
                  fileName,
                  filepath
                );
                this.logger.log(`[mergeConvertFile] 外部参照文件处理完成`);
              } catch (error) {
                this.logger.error(
                  `[mergeConvertFile] 外部参照文件处理失败: ${error.message}`,
                  error.stack
                );
                throw error;
              }
            } else if (context && context.userId) {
              // 普通图纸：创建文件系统节点
              await this.handleFileNodeCreation(
                fileName,
                fileMd5,
                fileSize,
                context
              );
            }

            if (ret.tz) {
              return { ret: MxUploadReturn.kOk, tz: true };
            } else {
              return { ret: MxUploadReturn.kOk };
            }
          } else {
            return { ret: MxUploadReturn.kConvertFileError };
          }
        } catch (error) {
          this.mapCurrentFilesBeingMerged[fileMd5] = false;
          this.logger.error('mergeConvertFile error', error);
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

  /**
   * 处理外部参照文件
   * 将转换后的 mxweb 文件拷贝到源图纸的 hash 目录
   * 文件名格式：A.dwg.mxweb（保留原始扩展名）
   * 注意：使用拷贝而非移动，保留原始文件供其他图纸复用
   */
  private async handleExternalReferenceFile(
    extRefHash: string,
    srcDwgFileHash: string,
    extRefFileName: string,
    srcFilePath: string
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleExternalReferenceFile] 开始处理: extRefHash=${extRefHash}, srcDwgFileHash=${srcDwgFileHash}, extRefFileName=${extRefFileName}, srcFilePath=${srcFilePath}`
      );

      const uploadPath =
        this.configService.get('MXCAD_UPLOAD_PATH') ||
        path.join(process.cwd(), 'uploads');
      const hashDir = path.join(uploadPath, srcDwgFileHash);

      this.logger.log(
        `[handleExternalReferenceFile] uploadPath=${uploadPath}, hashDir=${hashDir}`
      );

      // 确保目录存在
      if (!(await this.fileSystemService.exists(hashDir))) {
        await fsPromises.mkdir(hashDir, { recursive: true } as any);
        this.logger.log(`[handleExternalReferenceFile] 创建目录: ${hashDir}`);
      } else {
        this.logger.log(`[handleExternalReferenceFile] 目录已存在: ${hashDir}`);
      }

      // 获取转换后的文件路径
      // srcFilePath 已经是完整的转换后文件路径（包含 .mxweb 扩展名）
      const sourceFile = srcFilePath;

      // 构建目标文件路径：使用外部参照文件名（带原始扩展名）+ .mxweb
      // 例如：A.dwg -> A.dwg.mxweb
      const convertedExt = this.configService.get('MXCAD_FILE_EXT') || '.mxweb';
      const targetFile = path.join(hashDir, `${extRefFileName}${convertedExt}`);

      // 检查源文件是否存在
      if (!(await this.fileSystemService.exists(sourceFile))) {
        throw new Error(`转换后的文件不存在: ${sourceFile}`);
      }

      // 拷贝 mxweb 文件（保留原始文件供其他图纸复用）
      await fsPromises.copyFile(sourceFile, targetFile);
      this.logger.log(
        `[handleExternalReferenceFile] mxweb 文件拷贝成功: ${targetFile}`
      );

      // 同步 mxweb 文件到 MinIO
      try {
        const minioPath = `mxcad/file/${srcDwgFileHash}/${extRefFileName}${convertedExt}`;
        const syncSuccess = await this.minioSyncService.syncFileToMinio(
          targetFile,
          minioPath
        );
        if (syncSuccess) {
          this.logger.log(
            `[handleExternalReferenceFile] MinIO 同步成功: ${minioPath}`
          );
        } else {
          this.logger.warn(
            `[handleExternalReferenceFile] MinIO 同步失败: ${minioPath}`
          );
        }
      } catch (syncError) {
        this.logger.error(
          `[handleExternalReferenceFile] MinIO 同步异常: ${syncError.message}`,
          syncError.stack
        );
        // MinIO 同步失败不影响主流程
      }
    } catch (error) {
      this.logger.error(
        `[handleExternalReferenceFile] 处理失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 上传分片文件
   */
  async uploadChunk(
    options: UploadChunkOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const { hash, chunks, name, size, context } = options;
    return this.mergeConvertFile({ hash, chunks, name, size, context });
  }

  /**
   * 上传完整文件并转换
   */
  async uploadAndConvertFile(
    options: UploadFileOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const { filePath, hash, name, size, context } = options;

    try {
      await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
      const { isOk, ret } = await this.fileConversionService.convertFile({
        srcPath: filePath,
        fileHash: hash,
        createPreloadingData: true,
      });

      if (isOk) {
        // 创建文件系统节点
        await this.handleFileNodeCreation(name, hash, size, context);

        if (ret.tz) {
          return { ret: MxUploadReturn.kOk, tz: true };
        } else {
          return { ret: MxUploadReturn.kOk };
        }
      } else {
        return { ret: MxUploadReturn.kConvertFileError };
      }
    } catch (error) {
      this.logger.error(`上传并转换文件失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }

  /**
   * 合并分片文件方法（用于完成请求）
   */
  async mergeChunksWithPermission(
    options: MergeOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const { hash, name, size, chunks, context, srcDwgFileHash } = options;

    this.logger.log(
      `[mergeChunksWithPermission] 开始合并: hash=${hash}, name=${name}, srcDwgFileHash=${srcDwgFileHash}`
    );

    // 检查文件类型
    if (this.fileConversionService.needsConversion(name)) {
      // CAD文件：执行转换流程
      const mergeResult = await this.mergeConvertFile({
        hash,
        name,
        size,
        chunks,
        context,
        srcDwgFileHash,
      });
      return mergeResult;
    } else {
      // 非CAD文件：合并分片并直接上传到存储服务
      try {
        // 合并分片文件
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

        // 上传到存储服务
        const fileSize =
          await this.fileSystemService.getFileSize(mergedFilePath);
        const storageKey = `files/${context.userId}/${Date.now()}-${name}`;

        // 上传文件到 MinIO
        const uploadSuccess = await this.fileStorageService.uploadFileFromLocal(
          mergedFilePath,
          storageKey
        );
        if (!uploadSuccess) {
          this.logger.error(`非CAD文件上传到 MinIO 失败: ${storageKey}`);
          return { ret: MxUploadReturn.kConvertFileError };
        }

        this.logger.log(`非CAD文件合并并上传到存储服务成功: ${storageKey}`);

        // 创建文件系统节点
        await this.createNonCadNode(name, hash, fileSize, storageKey, context);

        // 清理临时文件
        await this.fileSystemService.deleteDirectory(tmpDir);
        await this.fileSystemService.delete(mergedFilePath);

        return { ret: MxUploadReturn.kOk };
      } catch (error) {
        this.logger.error(
          `非CAD文件合并上传失败: ${error.message}`,
          error.stack
        );
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
  }

  /**
   * 上传完整文件方法，添加权限验证和文件节点创建
   */
  async uploadAndConvertFileWithPermission(
    options: UploadFileOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const { filePath, hash, name, size, context } = options;

    // 检查文件是否已存在（秒传）：优先 MinIO，然后本地文件系统
    const fileExists = await this.checkFileExistsInStorage(hash, name);
    if (fileExists) {
      this.logger.log(
        `[uploadAndConvertFileWithPermission] 文件已存在，返回成功: ${name}`
      );
      // 创建文件系统节点
      await this.handleFileNodeCreation(name, hash, size, context);

      // 如果是外部参照，额外拷贝文件
      if (context.srcDwgFileHash) {
        const uploadPath =
          this.configService.get('MXCAD_UPLOAD_PATH') ||
          path.join(process.cwd(), 'uploads');
        const targetFile = path.join(
          uploadPath,
          this.getConvertedFileName(hash, name)
        );
        if (!context.isImage) {
          await this.handleExternalReferenceFile(
            hash,
            context.srcDwgFileHash,
            name,
            targetFile
          );
        } else {
          await this.handleExternalReferenceImage(
            hash,
            context.srcDwgFileHash,
            name,
            targetFile
          );
        }
      }

      return { ret: MxUploadReturn.kFileAlreadyExist };
    }

    // 获取目标文件路径
    const uploadPath =
      this.configService.get('MXCAD_UPLOAD_PATH') ||
      path.join(process.cwd(), 'uploads');
    const targetFile = path.join(
      uploadPath,
      this.getConvertedFileName(hash, name)
    );

    // 检查文件类型
    if (this.fileConversionService.needsConversion(name)) {
      // CAD文件：执行转换流程
      this.logger.log(`检测到CAD文件，执行转换流程: ${name}`);
      await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
      const { isOk, ret } = await this.fileConversionService.convertFile({
        srcPath: filePath,
        fileHash: hash,
        createPreloadingData: true,
      });

      if (isOk) {
        // 创建文件系统节点（外部参照也要创建节点）
        await this.handleFileNodeCreation(name, hash, size, context);

        // 如果是外部参照 DWG 上传，额外拷贝文件到源图纸目录
        if (context.srcDwgFileHash && !context.isImage) {
          this.logger.log(
            `[uploadAndConvertFileWithPermission] 外部参照 DWG 上传: ${name}, srcDwgFileHash=${context.srcDwgFileHash}`
          );
          try {
            // 传递转换后的文件路径（包含 .mxweb 扩展名）
            const uploadPath =
              this.configService.get('MXCAD_UPLOAD_PATH') ||
              path.join(process.cwd(), 'uploads');
            const convertedFilePath = path.join(
              uploadPath,
              this.getConvertedFileName(hash, name)
            );
            await this.handleExternalReferenceFile(
              hash,
              context.srcDwgFileHash,
              name,
              convertedFilePath
            );
          } catch (error) {
            this.logger.error(
              `[uploadAndConvertFileWithPermission] 外部参照文件拷贝失败: ${error.message}`,
              error.stack
            );
            // 拷贝失败不影响主流程，只记录错误
          }
        }

        if (ret.tz) {
          return { ret: MxUploadReturn.kOk, tz: true };
        } else {
          return { ret: MxUploadReturn.kOk };
        }
      } else {
        return { ret: MxUploadReturn.kConvertFileError };
      }
    } else {
      // 非CAD文件：直接上传到存储服务（统一使用 MxCAD-App 存储方式）
      this.logger.log(`检测到非CAD文件，直接上传到存储服务: ${name}`);
      try {
        const fileSize = await this.fileSystemService.getFileSize(filePath);
        // 统一使用 mxcad/file/{hash}/{name} 路径，与 MxCAD-App 保持一致
        const storageKey = `mxcad/file/${hash}/${name}`;

        // 上传文件到 MinIO
        const uploadSuccess = await this.fileStorageService.uploadFileFromLocal(
          filePath,
          storageKey
        );
        if (!uploadSuccess) {
          this.logger.error(`非CAD文件上传到 MinIO 失败: ${storageKey}`);
          return { ret: MxUploadReturn.kConvertFileError };
        }

        this.logger.log(`非CAD文件上传到存储服务成功: ${storageKey}`);

        // 创建文件系统节点
        await this.createNonCadNode(name, hash, fileSize, storageKey, context);

        // 如果是外部参照图片上传，额外拷贝文件到源图纸目录
        if (context.srcDwgFileHash && context.isImage) {
          this.logger.log(
            `[uploadAndConvertFileWithPermission] 外部参照图片上传: ${name}, srcDwgFileHash=${context.srcDwgFileHash}`
          );
          try {
            await this.handleExternalReferenceImage(
              hash,
              context.srcDwgFileHash,
              name,
              filePath
            );
          } catch (error) {
            this.logger.error(
              `[uploadAndConvertFileWithPermission] 外部参照文件拷贝失败: ${error.message}`,
              error.stack
            );
            // 拷贝失败不影响主流程，只记录错误
          }
        }

        return { ret: MxUploadReturn.kOk };
      } catch (error) {
        this.logger.error(`非CAD文件上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
  }

  /**
   * 处理外部参照图片上传
   * 直接拷贝图片文件到源图纸的 hash 目录
   */
  private async handleExternalReferenceImage(
    fileHash: string,
    srcDwgFileHash: string,
    extRefFileName: string,
    srcFilePath: string
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleExternalReferenceImage] 开始处理: fileHash=${fileHash}, srcDwgFileHash=${srcDwgFileHash}, extRefFileName=${extRefFileName}`
      );

      const uploadPath =
        this.configService.get('MXCAD_UPLOAD_PATH') ||
        path.join(process.cwd(), 'uploads');
      const hashDir = path.join(uploadPath, srcDwgFileHash);

      // 确保目录存在
      if (!(await this.fileSystemService.exists(hashDir))) {
        await fsPromises.mkdir(hashDir, { recursive: true } as any);
        this.logger.log(`[handleExternalReferenceImage] 创建目录: ${hashDir}`);
      }

      const targetFile = path.join(hashDir, extRefFileName);

      // 拷贝文件
      await fsPromises.copyFile(srcFilePath, targetFile);
      this.logger.log(
        `[handleExternalReferenceImage] 文件拷贝成功: ${targetFile}`
      );

      // 同步到 MinIO
      try {
        const minioPath = `mxcad/file/${srcDwgFileHash}/${extRefFileName}`;
        const syncSuccess = await this.minioSyncService.syncFileToMinio(
          targetFile,
          minioPath
        );
        if (syncSuccess) {
          this.logger.log(
            `[handleExternalReferenceImage] MinIO 同步成功: ${minioPath}`
          );
        } else {
          this.logger.warn(
            `[handleExternalReferenceImage] MinIO 同步失败: ${minioPath}`
          );
        }
      } catch (syncError) {
        this.logger.error(
          `[handleExternalReferenceImage] MinIO 同步异常: ${syncError.message}`,
          syncError.stack
        );
        // MinIO 同步失败不影响主流程
      }
    } catch (error) {
      this.logger.error(
        `[handleExternalReferenceImage] 处理失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 执行实际的文件存在性检查
   */
  private async performFileExistenceCheck(
    filename: string,
    fileHash: string,
    suffix: string,
    convertedExt: string,
    context?: FileSystemNodeContext
  ): Promise<{ ret: string }> {
    const targetFile = `${fileHash}.${suffix}${convertedExt}`;
    let fileExists = false;
    let fileSource = '';

    // 1. 优先检查存储服务
    this.logger.log(`🔍 检查MinIO: ${targetFile}`);
    try {
      const existsInStorage =
        await this.fileStorageService.fileExists(targetFile);
      this.logger.log(`📦 MinIO检查结果: ${existsInStorage}`);
      if (existsInStorage) {
        fileExists = true;
        fileSource = 'MinIO';
      }
    } catch (error) {
      this.logger.error(`❌ MinIO检查失败: ${error.message}`);
    }

    // 2. 降级检查本地文件系统
    if (!fileExists) {
      const localPath = this.fileSystemService.getMd5Path(targetFile);
      this.logger.log(`🔍 检查本地: ${localPath}`);
      const localExists = await this.fileSystemService.exists(localPath);
      this.logger.log(`📁 本地检查结果: ${localExists}`);
      if (localExists) {
        fileExists = true;
        fileSource = 'Local'; // 同步到 MinIO 以确保一致性
        try {
          const fileBuffer = await fsPromises.readFile(localPath);
          await this.minioSyncService.uploadFile(
            `mxcad/file/${targetFile}`,
            fileBuffer
          );
          this.logger.log(`✅ 文件同步到MinIO: ${targetFile}`);
        } catch (syncError) {
          this.logger.warn(
            `⚠️ 同步到MinIO失败: ${targetFile}, ${syncError.message}`
          );
        }
      }
    }

    // 3. 返回检查结果
    if (fileExists) {
      // 使用辅助方法处理文件系统节点创建
      try {
        await this.handleFileSystemNodeCreation(
          filename,
          fileHash,
          context,
          fileSource,
          targetFile
        );
      } catch (nodeError) {
        // 文件系统节点创建失败不影响文件检查结果，只记录错误
        this.logger.error(`⚠️ 文件系统节点创建失败: ${nodeError.message}`);
      }

      return { ret: MxUploadReturn.kFileAlreadyExist };
    } else {
      return { ret: MxUploadReturn.kFileNoExist };
    }
  }

  /**
   * 处理文件系统节点创建
   * 关键修复：每次秒传成功时，都在目标目录创建新的文件节点引用
   * 这样相同文件上传到不同目录时，每个目录都有独立的文件节点
   * 但底层存储路径是共享的，节省存储空间
   */
  private async handleFileSystemNodeCreation(
    filename: string,
    fileHash: string,
    context: FileSystemNodeContext | undefined,
    fileSource: string,
    targetFile: string
  ): Promise<void> {
    if (!context) {
      throw new Error(
        `文件 ${filename} (${fileHash}) 缺少上下文信息，无法创建文件系统节点`
      );
    }

    if (!context.nodeId) {
      throw new Error(
        `文件 ${filename} (${fileHash}) 缺少节点ID，无法创建文件系统节点`
      );
    }

    if (!context.userId) {
      throw new Error(
        `文件 ${filename} (${fileHash}) 缺少用户ID，无法创建文件系统节点`
      );
    }

    // 获取文件大小
    const actualFileSize = await this.getFileSize(
      fileHash,
      filename,
      fileSource,
      targetFile
    );

    // 在事务中创建文件系统节点
    const extension = path.extname(filename).toLowerCase();
    const mimeType = this.fileSystemNodeService.getMimeType(extension);
    const accessPath = `/mxcad/file/${targetFile}`;

    // 关键修复：直接调用 createOrReferenceNode，不再检查是否已存在
    // createOrReferenceNode 内部会检查是否需要在当前目录创建新节点
    await this.fileSystemNodeService.createOrReferenceNode({
      originalName: filename,
      fileHash: fileHash,
      fileSize: actualFileSize,
      accessPath: accessPath,
      mimeType: mimeType,
      extension: extension,
      context: context,
    });

    this.logger.log(
      `✅ 文件系统节点创建成功: ${filename} (${fileHash}) 在目录 ${context.nodeId}`
    );
  }

  /**
   * 处理文件节点创建
   */
  private async handleFileNodeCreation(
    originalName: string,
    fileHash: string,
    fileSize: number,
    context: FileSystemNodeContext
  ): Promise<void> {
    if (!context.nodeId) {
      this.logger.warn(
        '⚠️ 缺少节点ID，无法创建文件系统节点。文件将只保存到MxCAD存储，不会出现在文件系统中。'
      );
      return;
    }

    try {
      // 扫描MxCAD实际生成的所有相关文件
      const uploadPath =
        this.configService.get('MXCAD_UPLOAD_PATH') ||
        path.join(process.cwd(), 'uploads');
      const actualFiles =
        await this.fileSystemService.readDirectory(uploadPath);

      // 匹配所有以fileHash开头的文件（包含.mxweb、.mxweb_preloading.json、_xxx.dwg等）
      const mxcadFiles = actualFiles.filter((file) =>
        file.startsWith(fileHash)
      );

      this.logger.log(
        `🔍 扫描MxCAD文件: 哈希=${fileHash}, 找到文件数=${mxcadFiles.length}, 文件列表: ${mxcadFiles.join(', ')}`
      );

      if (mxcadFiles.length === 0) {
        this.logger.error(`❌ 未找到MxCAD转换后的文件: ${fileHash}`);
        return;
      }

      // 找到主.mxweb文件
      const mainMxwebFile = mxcadFiles.find((file) => file.endsWith('.mxweb'));
      if (!mainMxwebFile) {
        this.logger.error(`❌ 未找到MxCAD主文件: ${fileHash}`);
        return;
      }

      const accessPath = `/mxcad/file/${mainMxwebFile}`;
      const extension = path.extname(originalName).toLowerCase();
      const mimeType = this.fileSystemNodeService.getMimeType(extension);

      await this.fileSystemNodeService.createOrReferenceNode({
        originalName: originalName,
        fileHash: fileHash,
        fileSize: fileSize,
        accessPath: accessPath,
        mimeType: mimeType,
        extension: extension,
        context: context,
      });

      this.logger.log(`✅ 文件系统节点创建成功: ${originalName} (${fileHash})`);

      // 检查并更新外部参照信息
      try {
        await this.mxCadService.updateExternalReferenceAfterUpload(fileHash);
      } catch (extRefError) {
        this.logger.warn(
          `⚠️ 外部参照信息更新失败（不影响主流程）: ${extRefError.message}`
        );
      }

      // 同步所有MxCAD转换后的文件到存储服务
      let syncedCount = 0;
      for (const fileName of mxcadFiles) {
        try {
          const localFilePath = path.join(uploadPath, fileName);
          if (await this.fileSystemService.exists(localFilePath)) {
            const fileBuffer = await fsPromises.readFile(localFilePath);
            const minioPath = `mxcad/file/${fileName}`;
            await this.minioSyncService.uploadFile(minioPath, fileBuffer);
            this.logger.log(
              `✅ 文件同步到MinIO: ${fileName} (${fileBuffer.length} bytes)`
            );
            syncedCount++;
          } else {
            this.logger.warn(`⚠️ 本地文件不存在，跳过同步: ${localFilePath}`);
          }
        } catch (syncError) {
          this.logger.error(
            `❌ 文件同步失败: ${fileName}: ${syncError.message}`
          );
          // 单个文件同步失败不影响其他文件
        }
      }
      this.logger.log(
        `📤 共 ${syncedCount}/${mxcadFiles.length} 个文件同步到MinIO成功`
      );
    } catch (error) {
      this.logger.error(
        `创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`,
        error.stack
      );
      // 不抛出错误，避免影响 mxcad 上传流程
    }
  }

  /**
   * 创建非CAD文件节点
   */
  private async createNonCadNode(
    originalName: string,
    fileHash: string,
    fileSize: number,
    storageKey: string,
    context: FileSystemNodeContext
  ): Promise<void> {
    try {
      const extension = path.extname(originalName).toLowerCase();
      const mimeType = this.fileSystemNodeService.getMimeType(extension);

      await this.fileSystemNodeService.createNonCadNode({
        originalName: originalName,
        fileHash: fileHash,
        fileSize: fileSize,
        accessPath: storageKey,
        mimeType: mimeType,
        extension: extension,
        context: context,
      });
    } catch (error) {
      this.logger.error(
        `创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`,
        error.stack
      );
      throw error; // 非CAD文件上传失败应该抛出错误
    }
  }

  /**
   * 获取文件大小（根据来源选择合适的方式）
   */
  private async getFileSize(
    fileHash: string,
    filename: string,
    fileSource: string,
    targetFile: string
  ): Promise<number> {
    try {
      if (fileSource === 'MinIO') {
        // 从存储服务获取文件大小
        const size = await this.fileStorageService.getFileSize(targetFile);
        if (size > 0) {
          return size;
        }
      }

      // 从文件系统获取文件大小
      const localPath = this.fileSystemService.getMd5Path(targetFile);
      const size = await this.fileSystemService.getFileSize(localPath);
      if (size > 0) {
        return size;
      }

      // 尝试查找其他可能的文件格式
      const uploadPath =
        this.configService.get('MXCAD_UPLOAD_PATH') ||
        path.join(process.cwd(), 'uploads');
      const allFiles = await this.fileSystemService.readDirectory(uploadPath);
      const relatedFiles = allFiles.filter((file) => file.startsWith(fileHash));
      if (relatedFiles.length > 0) {
        const firstFile = path.join(uploadPath, relatedFiles[0]);
        const firstFileSize =
          await this.fileSystemService.getFileSize(firstFile);
        return firstFileSize;
      }

      return 0;
    } catch (error) {
      this.logger.warn(`获取文件大小失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 检查文件是否存在于存储中
   * 优先检查 MinIO，然后检查本地文件系统
   *
   * @param fileHash 文件哈希值
   * @param originalFilename 原始文件名（用于获取后缀）
   * @returns 文件是否存在
   */
  private async checkFileExistsInStorage(
    fileHash: string,
    originalFilename: string
  ): Promise<boolean> {
    const targetFile = this.getConvertedFileName(fileHash, originalFilename);

    // 1. 优先检查 MinIO
    try {
      const existsInMinio = await this.minioSyncService.fileExists(
        `mxcad/file/${targetFile}`
      );
      if (existsInMinio) {
        this.logger.debug(
          `[checkFileExistsInStorage] 文件存在于 MinIO: ${targetFile}`
        );
        return true;
      }
    } catch (error) {
      this.logger.debug(
        `[checkFileExistsInStorage] MinIO 检查失败: ${error.message}`
      );
    }

    // 2. 降级检查本地文件系统
    const uploadPath =
      this.configService.get('MXCAD_UPLOAD_PATH') ||
      path.join(process.cwd(), 'uploads');
    const localPath = path.join(uploadPath, targetFile);
    const existsInLocal = fs.existsSync(localPath);
    if (existsInLocal) {
      this.logger.debug(
        `[checkFileExistsInStorage] 文件存在于本地: ${targetFile}`
      );
      return true;
    }

    return false;
  }

  /**
   * 生成转换后的文件名
   * 格式: hash.原始后缀.mxweb
   *
   * @param fileHash 文件哈希值
   * @param originalFilename 原始文件名
   * @returns 转换后的文件名（不含路径）
   */
  private getConvertedFileName(
    fileHash: string,
    originalFilename: string
  ): string {
    const suffix = originalFilename.substring(
      originalFilename.lastIndexOf('.') + 1
    );
    const convertedExt =
      this.fileConversionService.getConvertedExtension(originalFilename);
    return `${fileHash}.${suffix}${convertedExt}`;
  }
}
