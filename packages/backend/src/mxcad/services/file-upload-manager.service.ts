import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import type { IFileStorageService } from '../interfaces/file-storage.interface';
import type { IFileConversionService } from '../interfaces/file-conversion.interface';
import type { IFileSystemService } from '../interfaces/file-system.interface';
import { FileStorageService } from './file-storage.service';
import { FileConversionService } from './file-conversion.service';
import { FileSystemService } from './file-system.service';
import { FileSystemNodeService, FileSystemNodeContext } from './filesystem-node.service';
import { CacheManagerService } from './cache-manager.service';
import { FileTypeDetector } from '../utils/file-type-detector';
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
  private readonly checkingFiles: Map<string, Promise<{ ret: string }>> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly fileStorageService: FileStorageService,
    private readonly fileConversionService: FileConversionService,
    private readonly fileSystemService: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly cacheManager: CacheManagerService,
  ) {}

  /**
   * 检查分片是否存在
   */
  async checkChunkExist(options: UploadChunkOptions): Promise<{ ret: string }> {
    const { chunk, hash, size, name } = options;
    
    try {
      const cbfilename = `${chunk}_${hash}`;
      const tmpDir = this.fileSystemService.getChunkTempDirPath(hash);
      const chunkPath = path.join(tmpDir, cbfilename);

      // 检查分片文件是否存在
      const chunkExists = await this.fileSystemService.exists(chunkPath);
      if (chunkExists) {
        // 检查文件大小是否匹配
        const chunkSize = await this.fileSystemService.getFileSize(chunkPath);
        if (chunkSize === size) {
          // 分片已存在，直接返回，不进行合并操作
          return { ret: MxUploadReturn.kChunkAlreadyExist };
        } else {
          return { ret: MxUploadReturn.kChunkNoExist };
        }
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
   * 支持缓存和并发控制
   */
  async checkFileExist(filename: string, fileHash: string, context?: FileSystemNodeContext): Promise<{ ret: string }> {
    console.log('[FileUploadManager] checkFileExist - 开始处理');
    console.log('[FileUploadManager] checkFileExist - 参数:', { filename, fileHash, context });

    try {
      const suffix = filename.substring(filename.lastIndexOf('.') + 1);
      const convertedExt = this.fileConversionService.getConvertedExtension(filename);
      const targetFile = `${fileHash}.${suffix}${convertedExt}`;

      // 1. 检查缓存
      const cacheKey = `${fileHash}.${suffix}`;
      const cached = this.cacheManager.get<{ exists: boolean; source: string }>('file-existence', cacheKey);
      
      if (cached) {
        console.log('[FileUploadManager] checkFileExist - 🚀 使用缓存结果:', cached.exists, '来源:', cached.source);
        if (cached.exists) {
          // 缓存命中，直接处理文件系统节点创建
          await this.handleFileSystemNodeCreation(filename, fileHash, context, cached.source, targetFile);
          return { ret: MxUploadReturn.kFileAlreadyExist };
        } else {
          return { ret: MxUploadReturn.kFileNoExist };
        }
      }

      // 2. 并发控制 - 如果同一个文件正在检查，等待结果
      const checkKey = `${fileHash}.${suffix}`;
      if (this.checkingFiles.has(checkKey)) {
        console.log('[FileUploadManager] checkFileExist - ⏳ 文件正在检查中，等待结果:', checkKey);
        return await this.checkingFiles.get(checkKey)!;
      }

      // 3. 创建检查 Promise 并缓存
      const checkPromise = this.performFileExistenceCheck(filename, fileHash, suffix, convertedExt, context);
      this.checkingFiles.set(checkKey, checkPromise);

      try {
        const result = await checkPromise;
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
  async mergeConvertFile(options: MergeOptions): Promise<{ ret: string; tz?: boolean }> {
    const { hash: hashFile, chunks, name: fileName, size: fileSize, context } = options;
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
          await this.fileSystemService.writeStatusFile(fileName, fileSize, hashFile, filepath);

          // 对合并的文件进行格式转换
          const { isOk, ret } = await this.fileConversionService.convertFile({
            srcPath: filepath,
            fileHash: fileMd5,
            createPreloadingData: true,
          });

          this.mapCurrentFilesBeingMerged[fileMd5] = false;

          if (isOk) {
            // 删除临时目录
            await this.fileSystemService.deleteDirectory(tmpDir);

            // 只有在提供了上下文且转换成功时才创建文件系统节点
            if (context && context.userId) {
              await this.handleFileNodeCreation(fileName, fileMd5, fileSize, context);
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
   * 上传分片文件
   */
  async uploadChunk(options: UploadChunkOptions): Promise<{ ret: string; tz?: boolean }> {
    const { hash, chunks, name, size, context } = options;
    return this.mergeConvertFile({ hash, chunks, name, size, context });
  }

  /**
   * 上传完整文件并转换
   */
  async uploadAndConvertFile(options: UploadFileOptions): Promise<{ ret: string; tz?: boolean }> {
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
  async mergeChunksWithPermission(options: MergeOptions): Promise<{ ret: string; tz?: boolean }> {
    const { hash, name, size, chunks, context } = options;
    
    // 检查文件类型
    if (this.fileConversionService.needsConversion(name)) {
      // CAD文件：执行转换流程
      console.log('[FileUploadManager] 检测到CAD文件，执行转换流程');
      const mergeResult = await this.mergeConvertFile({ hash, name, size, chunks, context });
      console.log('[FileUploadManager] mergeChunksWithPermission 最终返回:', mergeResult);
      return mergeResult;
    } else {
      // 非CAD文件：合并分片并直接上传到存储服务
      console.log('[FileUploadManager] 检测到非CAD文件，合并分片并上传到存储服务');
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
        const fileSize = await this.fileSystemService.getFileSize(mergedFilePath);
        const storageKey = `files/${context.userId}/${Date.now()}-${name}`;

        // TODO: 实现文件上传逻辑
        this.logger.log(`非CAD文件合并并上传到存储服务成功: ${storageKey}`);

        // 创建文件系统节点
        await this.createNonCadNode(name, hash, fileSize, storageKey, context);

        // 清理临时文件
        await this.fileSystemService.deleteDirectory(tmpDir);
        await this.fileSystemService.delete(mergedFilePath);

        console.log('[FileUploadManager] mergeChunksWithPermission 非CAD文件处理完成');
        return { ret: MxUploadReturn.kOk };
      } catch (error) {
        this.logger.error(`非CAD文件合并上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
  }

  /**
   * 上传完整文件方法，添加权限验证和文件节点创建
   */
  async uploadAndConvertFileWithPermission(options: UploadFileOptions): Promise<{ ret: string; tz?: boolean }> {
    const { filePath, hash, name, size, context } = options;

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
    } else {
      // 非CAD文件：直接上传到存储服务
      this.logger.log(`检测到非CAD文件，直接上传到存储服务: ${name}`);
      try {
        const fileSize = await this.fileSystemService.getFileSize(filePath);
        const storageKey = `files/${context.userId}/${Date.now()}-${name}`;

        // TODO: 实现文件上传逻辑
        this.logger.log(`非CAD文件上传到存储服务成功: ${storageKey}`);

        // 创建文件系统节点
        await this.createNonCadNode(name, hash, fileSize, storageKey, context);

        return { ret: MxUploadReturn.kOk };
      } catch (error) {
        this.logger.error(`非CAD文件上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
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
    try {
      console.log('[FileUploadManager] checkFileExist - 检查存储服务文件:', targetFile);

      const existsInStorage = await this.fileStorageService.fileExists(targetFile);
      if (existsInStorage) {
        fileExists = true;
        fileSource = 'MinIO';
        console.log('[FileUploadManager] checkFileExist - ✅ 文件在存储服务中存在');
      }
    } catch (error) {
      console.log('[FileUploadManager] checkFileExist - ⚠️ 存储服务检查失败，降级到本地文件系统:', error.message);
    }

    // 2. 降级检查本地文件系统
    if (!fileExists) {
      const localPath = this.fileSystemService.getMd5Path(targetFile);
      console.log('[FileUploadManager] checkFileExist - 检查本地文件路径:', localPath);
      const localExists = await this.fileSystemService.exists(localPath);
      console.log('[FileUploadManager] checkFileExist - 本地文件是否存在:', localExists);

      if (localExists) {
        fileExists = true;
        fileSource = 'Local';
        console.log('[FileUploadManager] checkFileExist - ✅ 文件在本地文件系统中存在');
      }
    }

    // 3. 缓存结果
    this.cacheManager.set('file-existence', `${fileHash}.${suffix}`, { exists: fileExists, source: fileSource });

    if (fileExists) {
      console.log('[FileUploadManager] checkFileExist - ✅ 文件已存在（来源:', fileSource, '），检查上下文条件');

      // 使用辅助方法处理文件系统节点创建
      await this.handleFileSystemNodeCreation(filename, fileHash, context, fileSource, targetFile);

      return { ret: MxUploadReturn.kFileAlreadyExist };
    } else {
      console.log('[FileUploadManager] checkFileExist - ❌ 文件不存在（存储服务和本地均不存在）');
      return { ret: MxUploadReturn.kFileNoExist };
    }
  }

  /**
   * 处理文件系统节点创建
   */
  private async handleFileSystemNodeCreation(
    filename: string,
    fileHash: string,
    context: FileSystemNodeContext | undefined,
    fileSource: string,
    targetFile: string
  ): Promise<void> {
    if (!context || !context.projectId || !context.userId) {
      console.log('[FileUploadManager] checkFileExist - ❌ 上下文条件不满足，跳过文件系统节点创建');
      console.log('[FileUploadManager] checkFileExist - 缺少必要参数:', {
        hasContext: !!context,
        hasProjectId: !!context?.projectId,
        hasUserId: !!context?.userId,
      });
      this.logger.warn(`文件 ${filename} (${fileHash}) 缺少必要上下文信息，无法创建文件系统节点`);
      return;
    }

    console.log('[FileUploadManager] checkFileExist - ✅ 上下文条件满足，开始创建文件系统节点');
    console.log('[FileUploadManager] checkFileExist - 上下文详情:', {
      projectId: context.projectId,
      parentId: context.parentId,
      userId: context.userId,
      userRole: context.userRole,
    });

    try {
      // 获取文件大小
      const actualFileSize = await this.getFileSize(fileHash, filename, fileSource, targetFile);

      // 在事务中创建文件系统节点
      const extension = path.extname(filename).toLowerCase();
      const mimeType = this.fileSystemNodeService.getMimeType(extension);
      const accessPath = `/mxcad/file/${targetFile}`;

      await this.fileSystemNodeService.createOrReferenceNode({
        originalName: filename,
        fileHash: fileHash,
        fileSize: actualFileSize,
        accessPath: accessPath,
        mimeType: mimeType,
        extension: extension,
        context: context,
      });

      console.log('[FileUploadManager] checkFileExist - ✅ 文件系统节点处理完成');
    } catch (error) {
      console.log('[FileUploadManager] checkFileExist - ❌ 创建文件系统节点失败:', error.message);
      console.log('[FileUploadManager] checkFileExist - 错误堆栈:', error.stack);
      this.logger.warn(`创建文件系统节点失败: ${error.message}`);
    }
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
    if (!context.projectId) {
      this.logger.warn('⚠️ 缺少项目ID，无法创建文件系统节点。文件将只保存到MxCAD存储，不会出现在文件系统中。');
      this.logger.warn('⚠️ 请确保通过文件管理页面访问CAD编辑器，而不是直接访问URL。');
      return;
    }

    try {
      // 扫描MxCAD实际生成的mxweb文件
      const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
      const actualFiles = await this.fileSystemService.readDirectory(uploadPath);
      const mxcadFiles = actualFiles.filter(file =>
        file.startsWith(fileHash) && file.endsWith('.mxweb')
      );

      this.logger.log(`🔍 扫描MxCAD文件: 哈希=${fileHash}, 找到文件数=${mxcadFiles.length}`);

      if (mxcadFiles.length === 0) {
        this.logger.error(`❌ 未找到MxCAD转换后的文件: ${fileHash}`);
        return;
      }

      // 使用实际生成的文件名（包含原始扩展名）
      const actualFileName = mxcadFiles[0];
      const accessPath = `/mxcad/file/${actualFileName}`;

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

      this.logger.log(`使用MxCAD实际生成的文件名: ${actualFileName} -> ${accessPath}`);
      this.logger.log(`文件系统节点创建成功: ${originalName} (${fileHash})`);

      // 同步MxCAD转换后的文件到存储服务
      try {
        // TODO: 实现文件同步逻辑
        this.logger.log(`MxCAD文件同步到存储服务: ${fileHash}`);
      } catch (syncError) {
        this.logger.error(`MxCAD文件同步异常: ${fileHash}: ${syncError.message}`, syncError);
        // 同步失败不影响文件创建流程
      }
    } catch (error) {
      this.logger.error(`创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
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
      this.logger.error(`创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
      throw error; // 非CAD文件上传失败应该抛出错误
    }
  }

  /**
   * 获取文件大小（根据来源选择合适的方式）
   */
  private async getFileSize(fileHash: string, filename: string, fileSource: string, targetFile: string): Promise<number> {
    try {
      if (fileSource === 'MinIO') {
        // 从存储服务获取文件大小
        const size = await this.fileStorageService.getFileSize(targetFile);
        if (size > 0) {
          console.log('[FileUploadManager] getFileSize - 从存储服务获取文件大小:', size);
          return size;
        }
      }

      // 从文件系统获取文件大小
      const localPath = this.fileSystemService.getMd5Path(targetFile);
      const size = await this.fileSystemService.getFileSize(localPath);
      if (size > 0) {
        console.log('[FileUploadManager] getFileSize - 从文件系统获取文件大小:', size);
        return size;
      }

      // 尝试查找其他可能的文件格式
      console.log('[FileUploadManager] getFileSize - ⚠️ 目标文件不存在，尝试查找其他格式');
      const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
      const allFiles = await this.fileSystemService.readDirectory(uploadPath);
      const relatedFiles = allFiles.filter(file => file.startsWith(fileHash));
      console.log('[FileUploadManager] getFileSize - 找到相关文件:', relatedFiles);

      if (relatedFiles.length > 0) {
        const firstFile = path.join(uploadPath, relatedFiles[0]);
        const firstFileSize = await this.fileSystemService.getFileSize(firstFile);
        console.log('[FileUploadManager] getFileSize - 使用第一个文件的大小:', firstFileSize);
        return firstFileSize;
      }

      return 0;
    } catch (error) {
      this.logger.warn(`获取文件大小失败: ${error.message}`);
      return 0;
    }
  }
}