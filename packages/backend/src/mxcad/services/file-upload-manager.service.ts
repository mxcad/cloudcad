import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { FileSystemService } from '../../file-system/file-system.service';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { FileConversionService } from './file-conversion.service';
import { FileSystemService as MxFileSystemService } from './file-system.service';
import {
  FileSystemNodeService,
  FileSystemNodeContext,
} from './filesystem-node.service';
import { CacheManagerService } from './cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { MxCadService } from '../mxcad.service';
import { VersionControlService } from '../../version-control/version-control.service';
import { RateLimiter } from '../../common/concurrency/rate-limiter';
import { StoragePathConstants } from '../constants/storage.constants';
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
  /** 源图纸节点 ID（用于外部参照上传，转换后将文件移动到源图纸的节点目录） */
  srcDwgNodeId?: string;
}

/** 文件上传合并结果 */
export interface MergeResult {
  /** 返回码 */
  ret: string;
  /** 是否转换完成 */
  tz?: boolean;
  /** 新创建的文件节点 ID（如果成功） */
  nodeId?: string;
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

  // 限流器（限制并发上传数量）
  private readonly uploadRateLimiter: RateLimiter;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileConversionService: FileConversionService,
    private readonly fileSystemService: MxFileSystemService,
    @Inject('FileSystemServiceMain')
    private readonly fileSystemServiceMain: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly cacheManager: CacheManagerService,
    private readonly storageManager: StorageManager,
    private readonly versionControlService: VersionControlService,
    @Inject(forwardRef(() => MxCadService))
    private readonly mxCadService: MxCadService
  ) {
    // 初始化限流器，最大并发数为 5
    this.uploadRateLimiter = new RateLimiter(5);
  }

  /**
   * 检查分片是否存在
   */
  async checkChunkExist(options: UploadChunkOptions): Promise<{ ret: string }> {
    const { chunk, hash, size, chunks: totalChunks, name, context } = options;

    this.logger.log(
      `[checkChunkExist] 开始检查: userId=${context.userId}, nodeId=${context.nodeId}, chunk=${chunk}/${totalChunks}, hash=${hash}, name=${name}, size=${size}`
    );

    try {
      // 第一个分片上传时，验证总文件大小
      if (chunk === 0) {
        const maxSize = 104857600; // 100MB 最大文件大小
        if (size > maxSize) {
          this.logger.warn(
            `[checkChunkExist] userId=${context.userId}, nodeId=${context.nodeId}, 文件大小超过限制: ${size} bytes > ${maxSize} bytes`
          );
          return { ret: 'errorparam' };
        }
        this.logger.log(
          `[checkChunkExist] userId=${context.userId}, nodeId=${context.nodeId}, 文件大小验证通过: ${size} bytes <= ${maxSize} bytes`
        );
      }

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
            // 检查临时目录是否存在
            const dirExists = await this.fileSystemService.exists(tmpDir);
            if (!dirExists) {
              this.logger.warn(
                `[checkChunkExist] 临时目录不存在，返回 kChunkNoExist: ${tmpDir}`
              );
              return { ret: MxUploadReturn.kChunkNoExist };
            }

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
  ): Promise<{ ret: string; nodeId?: string }> {
    try {
      const targetFile = this.getConvertedFileName(fileHash, filename);
      const suffix = filename.substring(filename.lastIndexOf('.') + 1);
      const convertedExt =
        this.fileConversionService.getConvertedExtension(filename);

      this.logger.log(
        `[checkFileExist] 检查文件存在性: userId=${context?.userId}, nodeId=${context?.nodeId}, fileHash=${fileHash}, filename=${filename}, targetFile=${targetFile}`
      );

      // 并发控制 - 如果同一个文件正在检查，等待结果
      const checkKey = `${fileHash}.${suffix}`;
      if (this.checkingFiles.has(checkKey)) {
        this.logger.log(
          `[checkFileExist] userId=${context?.userId}, nodeId=${context?.nodeId}, 文件正在检查中，等待结果: ${checkKey}`
        );
        return await this.checkingFiles.get(checkKey)!;
      }

      // 创建检查 Promise 并缓存
      this.logger.log(
        `[checkFileExist] userId=${context?.userId}, nodeId=${context?.nodeId}, 执行实际文件存在性检查: ${targetFile}`
      );
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
          `[checkFileExist] userId=${context?.userId}, nodeId=${context?.nodeId}, 文件存在性检查结果: ${targetFile} -> ${result.ret}`
        );
        return result;
      } finally {
        // 清理并发控制
        this.checkingFiles.delete(checkKey);
      }
    } catch (error) {
      this.logger.error(
        `[checkFileExist] userId=${context?.userId}, nodeId=${context?.nodeId}, 检查文件存在性失败: ${error.message}`,
        error.stack
      );
      return { ret: MxUploadReturn.kFileNoExist };
    }
  }

  /**
   * 合并转换文件
   * 新流程：
   * 1. 分片合并后立即创建节点（path 初始为 null）
   * 2. 在 uploads/ 目录中进行转换（输出文件使用 hash 命名）
   * 3. 转换成功后，将文件从 uploads 拷贝到 filesData/YYYYMM[/N]/nodeId/ 目录
   * 4. 拷贝时重命名文件：hash.xxx → nodeId.xxx
   * 5. 更新节点的 path 字段，指向 filesData/YYYYMM[/N]/nodeId/nodeId.dwg.mxweb
   */
  async mergeConvertFile(
    options: MergeOptions
  ): Promise<MergeResult> {
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

    this.logger.log(
      `[mergeConvertFile] 开始合并转换: userId=${context.userId}, nodeId=${context.nodeId}, fileHash=${fileMd5}, fileName=${fileName}, chunks=${chunks}, size=${fileSize}, srcDwgNodeId=${srcDwgNodeId}`
    );

    try {
      // 检查临时目录是否存在
      const dirExists = await this.fileSystemService.exists(tmpDir);
      if (!dirExists) {
        this.logger.warn(
          `[mergeConvertFile] userId=${context.userId}, nodeId=${context.nodeId}, 临时目录不存在: ${tmpDir}`
        );
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

        let newNodeId: string | undefined;

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

          // 【新步骤1】立即创建节点（path 初始为 null）
          if (context && context.userId && context.nodeId) {
            const extension = path.extname(fileName).toLowerCase();
            const mimeType = this.fileSystemNodeService.getMimeType(extension);

            // 获取父节点信息
            const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);

            if (!parentNode) {
              this.logger.error(`[mergeConvertFile] 父节点不存在: ${context.nodeId}`);
              this.mapCurrentFilesBeingMerged[fileMd5] = false;
              return { ret: MxUploadReturn.kConvertFileError };
            }

            const parentId = parentNode.isFolder ? parentNode.id : parentNode.parentId;
            if (!parentId) {
              this.logger.error(`[mergeConvertFile] 无法确定父节点ID: ${context.nodeId}, isFolder=${parentNode.isFolder}`);
              this.mapCurrentFilesBeingMerged[fileMd5] = false;
              return { ret: MxUploadReturn.kConvertFileError };
            }

            // 创建新节点，path 初始为 null，使用 createFileNode 方法
            const newNode = await this.fileSystemServiceMain.createFileNode({
              name: fileName,
              fileHash: fileMd5,
              size: fileSize,
              mimeType,
              extension,
              parentId: parentId,
              ownerId: context.userId,
              skipFileCopy: true, // 跳过文件拷贝，稍后处理
            });

            newNodeId = newNode.id;
            this.logger.log(`[mergeConvertFile] 节点创建成功: ${newNodeId}, path=${newNode.path}`);
          }

          // 对合并的文件进行格式转换
          const { isOk, ret } = await this.fileConversionService.convertFile({
            srcPath: filepath,
            fileHash: fileMd5,
            createPreloadingData: true, // 外部参照也需要创建预加载数据
          });

          if (isOk) {
            // 删除临时目录
            await this.fileSystemService.deleteDirectory(tmpDir);

            // 检查是否为外部参照上传
            if (context.srcDwgNodeId) {
              // 外部参照：将转换后的文件移动到源图纸的节点目录
              this.logger.log(
                `[mergeConvertFile] 检测到外部参照上传: srcDwgNodeId=${context.srcDwgNodeId}, fileName=${fileName}`
              );
              try {
                await this.handleExternalReferenceFile(
                  fileMd5,
                  context.srcDwgNodeId,
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
            } else if (newNodeId) {
              // 【新步骤2】转换成功后，将文件从 uploads 拷贝到 filesData/YYYYMM[/N]/nodeId/ 目录并重命名
              await this.handleFileCopyAndPathUpdate(
                newNodeId,
                fileName,
                fileMd5,
                fileExtName,
                context.userId
              );
            }

            this.mapCurrentFilesBeingMerged[fileMd5] = false;

            if (ret.tz) {
              return { ret: MxUploadReturn.kOk, tz: true, nodeId: newNodeId };
            } else {
              return { ret: MxUploadReturn.kOk, nodeId: newNodeId };
            }
          } else {
            // 转换失败，删除已创建的节点
            if (newNodeId) {
              try {
                await this.fileSystemServiceMain.deleteNode(newNodeId, true); // 彻底删除
                this.logger.log(`[mergeConvertFile] 转换失败，已删除节点: ${newNodeId}`);
              } catch (deleteError) {
                this.logger.error(`[mergeConvertFile] 删除节点失败: ${deleteError.message}`);
              }
            }
            this.mapCurrentFilesBeingMerged[fileMd5] = false;
            return { ret: MxUploadReturn.kConvertFileError };
          }
        } catch (error) {
          this.mapCurrentFilesBeingMerged[fileMd5] = false;
          this.logger.error('mergeConvertFile error', error);
          // 发生错误，删除已创建的节点
          if (newNodeId) {
            try {
              await this.fileSystemServiceMain.deleteNode(newNodeId, true); // 彻底删除
              this.logger.log(`[mergeConvertFile] 发生错误，已删除节点: ${newNodeId}`);
            } catch (deleteError) {
              this.logger.error(`[mergeConvertFile] 删除节点失败: ${deleteError.message}`);
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

  /**
   * 获取外部参照目录名称
   * 从源图纸的 preloading.json 文件中读取 src_file_md5 字段作为目录名
   * @param srcDwgNodeId 源图纸节点 ID
   * @returns 外部参照目录名称（src_file_md5 值）
   */
  private async getExternalRefDirName(srcDwgNodeId: string): Promise<string> {
    try {
      // 通过 nodeId 查找源图纸节点
      const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);

      if (!sourceNode || !sourceNode.path) {
        throw new Error(`源图纸节点不存在: ${srcDwgNodeId}`);
      }

      // 获取源图纸文件完整路径
      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);

      // 获取源图纸文件所在的目录（YYYYMM[/N]/sourceNodeId）
      const sourceNodeDir = path.dirname(sourceNodePath);

      // 构建 preloading.json 文件路径
      const preloadingFileName = `${srcDwgNodeId}.dwg.mxweb_preloading.json`;
      const preloadingFilePath = path.join(sourceNodeDir, preloadingFileName);

      // 读取 preloading.json 文件
      if (!(await this.fileSystemService.exists(preloadingFilePath))) {
        this.logger.warn(`[getExternalRefDirName] preloading.json 文件不存在: ${preloadingFilePath}`);
        // 如果文件不存在，降级使用 nodeId 作为目录名
        return srcDwgNodeId;
      }

      const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
      const data = JSON.parse(content);

      // 提取 src_file_md5 字段
      const srcFileMd5 = data.src_file_md5;

      if (!srcFileMd5) {
        this.logger.warn(`[getExternalRefDirName] preloading.json 中没有 src_file_md5 字段: ${preloadingFilePath}`);
        // 如果字段不存在，降级使用 nodeId 作为目录名
        return srcDwgNodeId;
      }

      this.logger.log(`[getExternalRefDirName] 获取到 src_file_md5: ${srcFileMd5}`);
      return srcFileMd5;
    } catch (error) {
      this.logger.error(`[getExternalRefDirName] 读取失败: ${error.message}`, error.stack);
      // 发生错误时，降级使用 nodeId 作为目录名
      return srcDwgNodeId;
    }
  }

  /**
   * 处理外部参照文件
   * 将转换后的 mxweb 文件拷贝到以 src_file_md5 命名的目录
   * 文件名格式：A.dwg.mxweb（保留原始扩展名）
   * 注意：使用拷贝而非移动，保留原始文件供其他图纸复用
   */
  async handleExternalReferenceFile(
    extRefHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleExternalReferenceFile] 开始处理: extRefHash=${extRefHash}, srcDwgNodeId=${srcDwgNodeId}, extRefFileName=${extRefFileName}`
      );

      // 通过 nodeId 查找源图纸节点
      const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);

      if (!sourceNode || !sourceNode.path) {
        throw new Error(`源图纸节点不存在: ${srcDwgNodeId}`);
      }

      // 获取源图纸文件完整路径
      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);

      // 获取源图纸文件所在的目录（YYYYMM[/N]/sourceNodeId）
      const sourceNodeDir = path.dirname(sourceNodePath);

      // 获取外部参照目录名称（从 preloading.json 中提取 src_file_md5）
      const externalRefDirName = await this.getExternalRefDirName(srcDwgNodeId);

      // 构建外部参照目录（使用 src_file_md5 作为目录名）
      const externalRefDir = path.join(sourceNodeDir, externalRefDirName);

      this.logger.log(
        `[handleExternalReferenceFile] 源图纸文件路径: ${sourceNodePath}, 所在目录: ${sourceNodeDir}, 外部参照目录: ${externalRefDir}`
      );

      // 确保外部参照目录存在
      if (!(await this.fileSystemService.exists(externalRefDir))) {
        await fsPromises.mkdir(externalRefDir, { recursive: true } as any);
        this.logger.log(`[handleExternalReferenceFile] 创建外部参照目录: ${externalRefDir}`);
      }

      // 获取转换后的文件路径
      const sourceFile = srcFilePath;

      // 构建目标文件路径：使用外部参照文件名（带原始扩展名）+ .mxweb
      const convertedExt = this.configService.get('MXCAD_FILE_EXT') || '.mxweb';
      const targetFile = path.join(externalRefDir, `${extRefFileName}${convertedExt}`);

      // 检查源文件是否存在
      if (!(await this.fileSystemService.exists(sourceFile))) {
        throw new Error(`转换后的文件不存在: ${sourceFile}`);
      }

      // 拷贝 mxweb 文件
      await fsPromises.copyFile(sourceFile, targetFile);
      this.logger.log(
        `[handleExternalReferenceFile] mxweb 文件拷贝成功: ${targetFile}`
      );
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

    // 使用限流器控制并发
    return this.uploadRateLimiter.execute(async () => {
      return this.mergeConvertFile({ hash, chunks, name, size, context });
    });
  }

  /**
   * 上传完整文件并转换
   */
  async uploadAndConvertFile(
    options: UploadFileOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const { filePath, hash, name, size, context } = options;

    // 使用限流器控制并发
    return this.uploadRateLimiter.execute(async () => {
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
    });
  }

  /**
   * 合并分片文件方法（用于完成请求）
   */
  async mergeChunksWithPermission(
    options: MergeOptions
  ): Promise<MergeResult> {
    const { hash, name, size, chunks, context, srcDwgNodeId } = options;

    this.logger.log(
      `[mergeChunksWithPermission] 开始合并: hash=${hash}, name=${name}, srcDwgNodeId=${srcDwgNodeId}`
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
        srcDwgNodeId,
      });
      return mergeResult;
    } else {
      // 非CAD文件：合并分片并上传到 filesData 目录
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

        const fileSize =
          await this.fileSystemService.getFileSize(mergedFilePath);

        // 【新步骤1】立即创建节点（path 初始为 null）
        if (context && context.userId && context.nodeId) {
          const extension = path.extname(name).toLowerCase();
          const mimeType = this.fileSystemNodeService.getMimeType(extension);

          const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);

          if (!parentNode) {
            this.logger.error(`[mergeChunksWithPermission] 父节点不存在: ${context.nodeId}`);
            await this.fileSystemService.deleteDirectory(tmpDir);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const parentId = parentNode.isFolder ? parentNode.id : parentNode.parentId;
          if (!parentId) {
            this.logger.error(`[mergeChunksWithPermission] 无法确定父节点ID: ${context.nodeId}, isFolder=${parentNode.isFolder}`);
            await this.fileSystemService.deleteDirectory(tmpDir);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          // 创建新节点，使用 createFileNode 方法
          const newNode = await this.fileSystemServiceMain.createFileNode({
            name: name,
            fileHash: hash,
            size: fileSize,
            mimeType,
            extension,
            parentId: parentId,
            ownerId: context.userId,
            skipFileCopy: true, // 跳过文件拷贝，稍后处理
          });

          const newNodeId = newNode.id;
          this.logger.log(`[mergeChunksWithPermission] 非CAD节点创建成功: ${newNodeId}, path=${newNode.path}`);

          try {
            // 【新步骤2】将文件拷贝到 filesData/YYYYMM[/N]/nodeId/ 目录并重命名
            await this.handleNonCadFileCopy(newNodeId, name, mergedFilePath, context.userId);

            // 清理临时文件
            await this.fileSystemService.deleteDirectory(tmpDir);

            return { ret: MxUploadReturn.kOk, nodeId: newNodeId };
          } catch (copyError) {
            this.logger.error(`[mergeChunksWithPermission] 文件拷贝失败: ${copyError.message}`);
            // 拷贝失败，删除已创建的节点
            await this.fileSystemServiceMain.deleteNode(newNodeId, true); // 彻底删除
            await this.fileSystemService.deleteDirectory(tmpDir);
            return { ret: MxUploadReturn.kConvertFileError };
          }
        } else {
          await this.fileSystemService.deleteDirectory(tmpDir);
          return { ret: MxUploadReturn.kConvertFileError };
        }
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
   * 处理非 CAD 文件拷贝
   * 将文件从临时目录拷贝到 filesData/YYYYMM[/N]/nodeId/ 目录
   * 并更新节点的 path 字段
   */
  private async handleNonCadFileCopy(
    nodeId: string,
    fileName: string,
    sourceFilePath: string,
    userId: string
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleNonCadFileCopy] 开始处理: nodeId=${nodeId}, fileName=${fileName}`
      );

      // 分配存储空间
      // 注意：传递文件名，确保 storageInfo.relativePath 包含完整文件路径
      const storageInfo = await this.storageManager.allocateNodeStorage(nodeId, fileName);

      // 确保目标目录存在
      const targetDir = path.dirname(storageInfo.fullPath);
      if (!(await this.fileSystemService.exists(targetDir))) {
        await fsPromises.mkdir(targetDir, { recursive: true } as any);
        this.logger.log(`[handleNonCadFileCopy] 创建目录: ${targetDir}`);
      }

      // 拷贝文件
      await fsPromises.copyFile(sourceFilePath, storageInfo.fullPath);
      this.logger.log(`[handleNonCadFileCopy] 拷贝成功: ${fileName} → ${storageInfo.fullPath}`);

      // storageInfo.relativePath 已经是完整路径：YYYYMM[/N]/nodeId/fileName
      // 直接使用，不需要再次拼接
      await this.fileSystemServiceMain.updateNodePath(nodeId, storageInfo.relativePath);

      this.logger.log(`[handleNonCadFileCopy] 节点路径更新成功: ${nodeId} → ${storageInfo.relativePath}`);
    } catch (error) {
      this.logger.error(
        `[handleNonCadFileCopy] 处理失败: nodeId=${nodeId}, error=${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 上传完整文件方法，添加权限验证和文件节点创建
   */
  async uploadAndConvertFileWithPermission(
    options: UploadFileOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const { filePath, hash, name, size, context } = options;

    // 检查文件是否已存在（秒传）
    const fileExists = await this.checkFileExistsInStorage(hash, name);
    if (fileExists) {
      this.logger.log(
        `[uploadAndConvertFileWithPermission] 文件已存在，执行秒传: ${name}`
      );

      // 【新步骤】秒传时立即创建节点（path 初始为 null）
      if (context && context.userId && context.nodeId) {
        const extension = path.extname(name).toLowerCase();
        const mimeType = this.fileSystemNodeService.getMimeType(extension);

        const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);

        if (!parentNode) {
          this.logger.error(`[uploadAndConvertFileWithPermission] 父节点不存在: ${context.nodeId}`);
          return { ret: MxUploadReturn.kConvertFileError };
        }

        const parentId = parentNode.isFolder ? parentNode.id : parentNode.parentId;
        if (!parentId) {
          this.logger.error(`[uploadAndConvertFileWithPermission] 无法确定父节点ID: ${context.nodeId}, isFolder=${parentNode.isFolder}`);
          return { ret: MxUploadReturn.kConvertFileError };
        }

        // 创建新节点，使用 createFileNode 方法
        const newNode = await this.fileSystemServiceMain.createFileNode({
          name: name,
          fileHash: hash,
          size: size,
          mimeType,
          extension,
          parentId: parentId,
          ownerId: context.userId,
          skipFileCopy: true, // 跳过文件拷贝，稍后处理
        });

        const newNodeId = newNode.id;
        this.logger.log(`[uploadAndConvertFileWithPermission] 秒传节点创建成功: ${newNodeId}, path=null`);

        try {
          // 【新步骤】将文件从 uploads 拷贝到 filesData/YYYYMM[/N]/nodeId/ 目录并重命名
          await this.handleFileCopyAndPathUpdate(newNodeId, name, hash, extension.replace('.', ''), context.userId);

          // 如果是外部参照，额外拷贝文件
          if (context.srcDwgNodeId) {
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
                context.srcDwgNodeId,
                name,
                targetFile
              );
            } else {
              await this.handleExternalReferenceImage(
                hash,
                context.srcDwgNodeId,
                name,
                targetFile,
                context
              );
            }
          }

          return { ret: MxUploadReturn.kFileAlreadyExist };
        } catch (copyError) {
          this.logger.error(`[uploadAndConvertFileWithPermission] 秒传文件拷贝失败: ${copyError.message}`);
          // 拷贝失败，删除已创建的节点
          await this.fileSystemServiceMain.deleteNode(newNodeId, true); // 彻底删除
          return { ret: MxUploadReturn.kConvertFileError };
        }
      } else {
        return { ret: MxUploadReturn.kConvertFileError };
      }
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
        if (context.srcDwgNodeId && !context.isImage) {
          this.logger.log(
            `[uploadAndConvertFileWithPermission] 外部参照 DWG 上传: ${name}, srcDwgNodeId=${context.srcDwgNodeId}`
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
              context.srcDwgNodeId,
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
      // 非CAD文件：直接拷贝到本地存储
      this.logger.log(`检测到非CAD文件，直接拷贝到本地存储: ${name}`);
      try {
        const fileSize = await this.fileSystemService.getFileSize(filePath);

        // 立即创建节点（path 初始为 null）
        if (context && context.userId && context.nodeId) {
          const extension = path.extname(name).toLowerCase();
          const mimeType = this.fileSystemNodeService.getMimeType(extension);

          const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);

          if (!parentNode) {
            this.logger.error(`[uploadAndConvertFileWithPermission] 父节点不存在: ${context.nodeId}`);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          const parentId = parentNode.isFolder ? parentNode.id : parentNode.parentId;
          if (!parentId) {
            this.logger.error(`[uploadAndConvertFileWithPermission] 无法确定父节点ID: ${context.nodeId}, isFolder=${parentNode.isFolder}`);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          // 创建新节点，使用 createFileNode 方法
          const newNode = await this.fileSystemServiceMain.createFileNode({
            name: name,
            fileHash: hash,
            size: fileSize,
            mimeType,
            extension,
            parentId: parentId,
            ownerId: context.userId,
            skipFileCopy: true, // 跳过文件拷贝，稍后处理
          });

          const newNodeId = newNode.id;
          this.logger.log(`[uploadAndConvertFileWithPermission] 非CAD节点创建成功: ${newNodeId}, path=${newNode.path}`);

          try {
            // 将文件拷贝到 filesData/YYYYMM[/N]/nodeId/ 目录
            await this.handleNonCadFileCopy(newNodeId, name, filePath, context.userId);

            // 如果是外部参照图片上传，额外拷贝文件到源图纸目录
            if (context.srcDwgNodeId && context.isImage) {
              this.logger.log(
                `[uploadAndConvertFileWithPermission] 外部参照图片上传: ${name}, srcDwgNodeId=${context.srcDwgNodeId}`
              );
              try {
                await this.handleExternalReferenceImage(
                  hash,
                  context.srcDwgNodeId,
                  name,
                  filePath,
                  context
                );
              } catch (error) {
                this.logger.error(
                  `[uploadAndConvertFileWithPermission] 外部参照图片文件拷贝失败: ${error.message}`,
                  error.stack
                );
                // 拷贝失败不影响主流程，只记录错误
              }
            }

            return { ret: MxUploadReturn.kOk };
          } catch (copyError) {
            this.logger.error(`[uploadAndConvertFileWithPermission] 非CAD文件拷贝失败: ${copyError.message}`);
            // 拷贝失败，删除已创建的节点
            await this.fileSystemServiceMain.deleteNode(newNodeId, true); // 彻底删除
            return { ret: MxUploadReturn.kConvertFileError };
          }
        } else {
          return { ret: MxUploadReturn.kConvertFileError };
        }
      } catch (error) {
        this.logger.error(`非CAD文件上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
  }

  /**
   * 处理外部参照图片上传
   * 1. 拷贝图片到源图纸的节点目录
   * 2. 创建独立的文件节点
   */
  async handleExternalReferenceImage(
    fileHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
    context: FileSystemNodeContext
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleExternalReferenceImage] 开始处理: srcDwgNodeId=${srcDwgNodeId}, extRefFileName=${extRefFileName}`
      );

      // 通过 nodeId 查找源图纸节点
      const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);

      if (!sourceNode || !sourceNode.path) {
        throw new Error(`源图纸节点不存在: ${srcDwgNodeId}`);
      }

      // 获取源图纸文件完整路径
      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);

      // 获取源图纸文件所在的目录（YYYYMM[/N]/sourceNodeId）
      const sourceNodeDir = path.dirname(sourceNodePath);

      // 获取外部参照目录名称（从 preloading.json 中提取 src_file_md5）
      const externalRefDirName = await this.getExternalRefDirName(srcDwgNodeId);

      // 构建外部参照目录（使用 src_file_md5 作为目录名）
      const externalRefDir = path.join(sourceNodeDir, externalRefDirName);

      this.logger.log(
        `[handleExternalReferenceImage] 源图纸文件路径: ${sourceNodePath}, 所在目录: ${sourceNodeDir}, 外部参照目录: ${externalRefDir}`
      );

      // 确保外部参照目录存在
      if (!(await this.fileSystemService.exists(externalRefDir))) {
        await fsPromises.mkdir(externalRefDir, { recursive: true } as any);
        this.logger.log(`[handleExternalReferenceImage] 创建外部参照目录: ${externalRefDir}`);
      }

      // 拷贝图片到外部参照目录
      const targetImageFile = path.join(externalRefDir, extRefFileName);
      await fsPromises.copyFile(srcFilePath, targetImageFile);
      this.logger.log(
        `[handleExternalReferenceImage] 图片文件拷贝成功: ${targetImageFile}`
      );
    } catch (error) {
      this.logger.error(
        `[handleExternalReferenceImage] 处理失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.dwg': 'application/dwg',
      '.dxf': 'application/dxf',
    };
    return mimeTypes[ext] || 'application/octet-stream';
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
  ): Promise<{ ret: string; nodeId?: string }> {
    const targetFile = `${fileHash}.${suffix}${convertedExt}`;
    let fileExists = false;
    let fileSource = '';

    // 检查本地文件系统
    const localPath = this.fileSystemService.getMd5Path(targetFile);
    this.logger.log(`🔍 检查本地文件: ${localPath}`);
    const localExists = await this.fileSystemService.exists(localPath);
    this.logger.log(`📁 本地检查结果: ${localExists}`);
    if (localExists) {
      fileExists = true;
      fileSource = 'Local';
    }

    // 返回检查结果
    if (fileExists) {
      // 使用辅助方法处理文件系统节点创建
      let newNodeId: string | undefined;
      try {
        newNodeId = await this.handleFileSystemNodeCreation(
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

      return { ret: MxUploadReturn.kFileAlreadyExist, nodeId: newNodeId };
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
  ): Promise<string | undefined> {
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

    // 检查当前目录下是否已有相同文件
    const existingNode = await this.fileSystemNodeService.findByFileHash(fileHash);
    const existingNodeInCurrentDir = existingNode && existingNode.parentId === context.nodeId
      ? existingNode
      : null;

    if (existingNodeInCurrentDir) {
      // 当前目录下已有相同文件，不需要创建新节点
      this.logger.log(
        `[handleFileSystemNodeCreation] 当前目录下已有相同文件，跳过创建: ${filename} (${fileHash})，节点ID: ${existingNodeInCurrentDir.id}`
      );
      return existingNodeInCurrentDir.id;
    }

    // 检查是否为外部参照上传，外部参照不创建文件节点
    if (context.srcDwgNodeId) {
      this.logger.log(
        `[handleFileSystemNodeCreation] 检测到外部参照上传，跳过文件节点创建: ${filename} (${fileHash})，srcDwgNodeId=${context.srcDwgNodeId}`
      );
      return undefined;
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

    // 关键修复：使用已存在节点的相对路径（path字段），而不是访问路径
    // 秒传场景下，文件已经在存储中存在，应该复用相同的相对路径
    const existingNodeForPath = await this.fileSystemNodeService.findByFileHash(fileHash);
    const accessPath = existingNodeForPath?.path || `/mxcad/file/${targetFile}`;

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

    // 查询刚创建的节点（重新查询，因为 createOrReferenceNode 不返回节点信息）
    const newNode = await this.fileSystemNodeService.findByFileHash(fileHash);

    this.logger.log(
      `✅ 文件系统节点创建成功: ${filename} (${fileHash}) 在目录 ${context.nodeId}，节点ID: ${newNode?.id}`
    );

    return newNode?.id;
  }

  /**
   * 处理文件拷贝和路径更新
   * 将转换后的文件从 uploads 拷贝到 filesData/YYYYMM[/N]/nodeId/ 目录
   * 并重命名文件：hash.xxx → nodeId.xxx
   * 更新节点的 path 字段，指向 filesData/YYYYMM[/N]/nodeId/nodeId.dwg.mxweb
   */
  private async handleFileCopyAndPathUpdate(
    nodeId: string,
    fileName: string,
    fileHash: string,
    fileExtName: string,
    userId: string
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleFileCopyAndPathUpdate] 开始处理: nodeId=${nodeId}, fileName=${fileName}, fileHash=${fileHash}`
      );

      // 验证文件扩展名（防止扩展名注入）
      const normalizedExt = fileExtName.toLowerCase();
      const targetExtension = `.${normalizedExt}` as '.dwg' | '.dxf';
      if (!StoragePathConstants.ALLOWED_CAD_EXTENSIONS.includes(targetExtension)) {
        this.logger.error(
          `[handleFileCopyAndPathUpdate] 不支持的文件扩展名: .${fileExtName}`
        );
        throw new Error(`不支持的文件扩展名: .${fileExtName}`);
      }

      // 分配存储空间
      // 注意：传递目标文件名，确保 storageInfo.relativePath 包含完整文件路径
      const targetFileName = `${nodeId}.${normalizedExt}${StoragePathConstants.MXWEB_EXTENSION}`;
      const storageInfo = await this.storageManager.allocateNodeStorage(nodeId, targetFileName);

      // 确保目标目录存在
      const targetDir = path.dirname(storageInfo.fullPath);
      if (!(await this.fileSystemService.exists(targetDir))) {
        await fsPromises.mkdir(targetDir, { recursive: true } as any);
        this.logger.log(`[handleFileCopyAndPathUpdate] 创建目录: ${targetDir}`);
      }

      // 获取 uploads 目录
      const uploadPath =
        this.configService.get('MXCAD_UPLOAD_PATH') ||
        path.join(process.cwd(), 'uploads');

      // 优化：使用 findFilesByPrefix 直接查找匹配的文件，避免扫描整个目录
      const mxcadFiles = await this.fileSystemService.findFilesByPrefix(uploadPath, fileHash);

      this.logger.log(
        `[handleFileCopyAndPathUpdate] 找到文件数=${mxcadFiles.length}, 文件列表: ${mxcadFiles.join(', ')}`
      );

      if (mxcadFiles.length === 0) {
        this.logger.error(`[handleFileCopyAndPathUpdate] 未找到转换后的文件: ${fileHash}`);
        throw new Error(`未找到转换后的文件: ${fileHash}`);
      }

      // 拷贝并重命名文件
      for (const mxcadFile of mxcadFiles) {
        const sourceFile = path.join(uploadPath, mxcadFile);

        // 生成目标文件名：将 hash 替换为 nodeId
        // 例如：hash.dwg.mxweb → nodeId.dwg.mxweb
        const currentTargetFileName = mxcadFile.replace(fileHash, nodeId);
        const targetFile = path.join(targetDir, currentTargetFileName);

        // 拷贝文件
        await fsPromises.copyFile(sourceFile, targetFile);
        this.logger.log(`[handleFileCopyAndPathUpdate] 拷贝成功: ${mxcadFile} → ${currentTargetFileName}`);
      }

      // storageInfo.relativePath 已经是完整路径：YYYYMM[/N]/nodeId/nodeId.dwg.mxweb
      // 直接使用，不需要再次拼接
      await this.fileSystemServiceMain.updateNodePath(nodeId, storageInfo.relativePath);

      this.logger.log(`[handleFileCopyAndPathUpdate] 节点路径更新成功: ${nodeId} → ${storageInfo.relativePath}`);

      // 检查并更新外部参照信息
      try {
        await this.mxCadService.updateExternalReferenceAfterUpload(nodeId);
      } catch (extRefError) {
        this.logger.warn(
          `⚠️ 外部参照信息更新失败（不影响主流程）: ${extRefError.message}`
        );
      }

      // 提交节点目录到 SVN 版本控制
      try {
        // 获取 nodeId 目录路径（去掉文件名）
        const nodeDirectory = targetDir;
        const commitResult = await this.versionControlService.commitNodeDirectory(
          nodeDirectory,
          `上传文件: ${fileName} (用户: ${userId})`
        );

        if (commitResult.success) {
          this.logger.log(`节点目录已提交到 SVN: ${fileName} (${nodeDirectory})`);
        } else {
          this.logger.warn(`节点目录 SVN 提交失败: ${fileName}, 原因: ${commitResult.message}`);
        }
      } catch (svnError) {
        this.logger.error(`节点目录 SVN 提交异常: ${fileName}`, svnError.stack);
      }
    } catch (error) {
      this.logger.error(
        `[handleFileCopyAndPathUpdate] 处理失败: nodeId=${nodeId}, error=${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 处理文件节点创建（保留用于兼容性，主要用于秒传场景）
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

      const extension = path.extname(originalName).toLowerCase();
      const mimeType = this.fileSystemNodeService.getMimeType(extension);

      // 关键修复：使用已存在节点的相对路径（path字段），而不是访问路径
      // 查询已存在节点的 path 字段
      const existingNodeForPath = await this.fileSystemNodeService.findByFileHash(fileHash);
      const accessPath = existingNodeForPath?.path || `/mxcad/file/${mainMxwebFile}`;

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
        await this.mxCadService.updateExternalReferenceAfterUpload(context.nodeId);
      } catch (extRefError) {
        this.logger.warn(
          `⚠️ 外部参照信息更新失败（不影响主流程）: ${extRefError.message}`
        );
      }
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
   * 修复：使用统一的 createOrReferenceNode 方法，确保文件节点创建路径的一致性
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

      // 修复：使用统一的 createOrReferenceNode 方法，与 CAD 文件保持一致
      // 这样可以确保文件节点创建、目录分配、文件拷贝等逻辑完全统一
      await this.fileSystemNodeService.createOrReferenceNode({
        originalName: originalName,
        fileHash: fileHash,
        fileSize: fileSize,
        accessPath: storageKey,
        mimeType: mimeType,
        extension: extension,
        context: context,
      });

      this.logger.log(
        `✅ 非CAD文件系统节点创建成功: ${originalName} (${fileHash}) 在目录 ${context.nodeId}`
      );
    } catch (error) {
      this.logger.error(
        `创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`,
        error.stack
      );
      throw error; // 非CAD文件上传失败应该抛出错误
    }
  }

  /**
   * 获取文件大小
   */
  private async getFileSize(
    fileHash: string,
    filename: string,
    fileSource: string,
    targetFile: string
  ): Promise<number> {
    try {
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
   * 检查文件是否存在于本地文件系统中
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

    // 检查本地文件系统
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
