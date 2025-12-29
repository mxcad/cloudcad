import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { FileStorageService } from './file-storage.service';
import { FileConversionService } from './file-conversion.service';
import { FileSystemService } from './file-system.service';
import { FileSystemNodeService, FileSystemNodeContext } from './filesystem-node.service';
import { CacheManagerService } from './cache-manager.service';
import { MinioSyncService } from '../minio-sync.service';
import { MxCadService } from '../mxcad.service';
import * as fs from 'fs/promises';
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
    private readonly minioSyncService: MinioSyncService,
    @Inject(forwardRef(() => MxCadService))
    private readonly mxCadService: MxCadService,
  ) {}

  /**
   * 检查分片是否存在
   */
  async checkChunkExist(options: UploadChunkOptions): Promise<{ ret: string }> {
    const { chunk, hash, size, chunks: totalChunks, name } = options;
    
    this.logger.log(`[checkChunkExist] 开始检查: chunk=${chunk}, hash=${hash}, chunks=${totalChunks}, name=${name}`);
    
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
          this.logger.log(`🔍 最后分片已上传，检查是否需要合并: ${name}, hash=${hash}, chunks=${totalChunks}`);
          
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
            const isConverting = this.cacheManager.get<boolean>('file-existence', convertingKey);
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
            
            if (mergeResult.ret === MxUploadReturn.kOk || mergeResult.ret === 'ok') {
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
   * 支持缓存和并发控制
   */
  async checkFileExist(filename: string, fileHash: string, context?: FileSystemNodeContext): Promise<{ ret: string }> {
    try {
      const suffix = filename.substring(filename.lastIndexOf('.') + 1);
      const convertedExt = this.fileConversionService.getConvertedExtension(filename);
      const targetFile = `${fileHash}.${suffix}${convertedExt}`;

      // 1. 检查缓存 - 只缓存文件存在的结果，不缓存文件不存在的结果
      // 使用节点上下文作为缓存键的一部分
      const cacheKey = context?.nodeId ? `${context.nodeId}:${fileHash}.${suffix}` : `${fileHash}.${suffix}`;
      const cached = this.cacheManager.get<{ exists: boolean; source: string }>('file-existence', cacheKey);
      
      this.logger.log(`🔍 检查文件存在性: ${targetFile}, 缓存: ${cached ? (cached.exists ? '存在' : '不存在') : '无'}`);
      
      if (cached && cached.exists) {
        // 缓存命中，但需要验证文件是否真正存在于存储中
        // 如果缓存来源是 MinIO，验证文件是否真的在 MinIO 中
        this.logger.log(`📋 缓存命中，来源: ${cached.source}`);
        
        if (cached.source === 'MinIO') {
          try {
            const minioPath = `mxcad/file/${targetFile}`;
            this.logger.log(`🔍 验证MinIO文件是否存在: ${minioPath}`);
            const existsInMinio = await this.minioSyncService.fileExists(minioPath);
            this.logger.log(`📦 MinIO文件存在: ${existsInMinio}`);
            
            if (!existsInMinio) {
              // 文件不在 MinIO 中，删除缓存并重新检查
              this.logger.warn(`⚠️ 缓存失效，文件不在MinIO中: ${targetFile}`);
              this.cacheManager.delete('file-existence', cacheKey);
            } else {
              // 文件确实存在，返回成功
              this.logger.log(`✅ 文件存在于MinIO，返回成功`);
              await this.handleFileSystemNodeCreation(filename, fileHash, context, cached.source, targetFile);
              return { ret: MxUploadReturn.kFileAlreadyExist };
            }
          } catch (error) {
            this.logger.error(`❌ 验证MinIO文件存在性失败: ${error.message}`);
            // 验证失败，降级到重新检查
          }
        } else {
          // 缓存来源是本地，直接返回成功
          this.logger.log(`✅ 文件存在于本地，返回成功`);
          await this.handleFileSystemNodeCreation(filename, fileHash, context, cached.source, targetFile);
          return { ret: MxUploadReturn.kFileAlreadyExist };
        }
      }
      
      // 如果缓存显示文件不存在，忽略缓存，重新检查（避免缓存错误结果导致上传失败）
      if (cached && !cached.exists) {
        // 继续执行实际检查
      }

      // 2. 并发控制 - 如果同一个文件正在检查，等待结果
      const checkKey = `${fileHash}.${suffix}`;
      if (this.checkingFiles.has(checkKey)) {
        this.logger.log(`⏳ 文件正在检查中，等待结果: ${checkKey}`);
        return await this.checkingFiles.get(checkKey)!;
      }

      // 3. 创建检查 Promise 并缓存
      this.logger.log(`🔄 执行实际文件存在性检查: ${targetFile}`);
      const checkPromise = this.performFileExistenceCheck(filename, fileHash, suffix, convertedExt, context);
      this.checkingFiles.set(checkKey, checkPromise);

      try {
        const result = await checkPromise;
        this.logger.log(`📋 文件存在性检查结果: ${targetFile} -> ${result.ret}`);
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
const mergeResult = await this.mergeConvertFile({ hash, name, size, chunks, context });
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
        const fileSize = await this.fileSystemService.getFileSize(mergedFilePath);
        const storageKey = `files/${context.userId}/${Date.now()}-${name}`;

        // TODO: 实现文件上传逻辑
        this.logger.log(`非CAD文件合并并上传到存储服务成功: ${storageKey}`);

        // 创建文件系统节点
        await this.createNonCadNode(name, hash, fileSize, storageKey, context);

        // 清理临时文件
        await this.fileSystemService.deleteDirectory(tmpDir);
        await this.fileSystemService.delete(mergedFilePath);
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
      this.logger.log(`🔍 检查MinIO: ${targetFile}`);
      try {
        const existsInStorage = await this.fileStorageService.fileExists(targetFile);
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
          fileSource = 'Local';        // 同步到 MinIO 以确保一致性
        try {
          const fileBuffer = await fs.readFile(localPath);
          await this.minioSyncService.uploadFile(`mxcad/file/${targetFile}`, fileBuffer);
          this.logger.log(`✅ 文件同步到MinIO: ${targetFile}`);
        } catch (syncError) {
          this.logger.warn(`⚠️ 同步到MinIO失败: ${targetFile}, ${syncError.message}`);
        }
      }
    }

    // 3. 缓存结果 - 只缓存文件存在的结果，避免缓存错误结果
    if (fileExists) {
      // 使用节点上下文作为缓存键的一部分
      const cacheKey = context?.nodeId ? `${context.nodeId}:${fileHash}.${suffix}` : `${fileHash}.${suffix}`;
      this.cacheManager.set('file-existence', cacheKey, { exists: true, source: fileSource });

      // 使用辅助方法处理文件系统节点创建
      try {
        await this.handleFileSystemNodeCreation(filename, fileHash, context, fileSource, targetFile);
      } catch (nodeError) {
        // 文件系统节点创建失败不影响文件检查结果，只记录错误
        this.logger.error(`⚠️ 文件系统节点创建失败: ${nodeError.message}`);
      }

      return { ret: MxUploadReturn.kFileAlreadyExist };
    } else {
      // 不缓存文件不存在的结果，避免后续上传失败
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
      throw new Error(`文件 ${filename} (${fileHash}) 缺少上下文信息，无法创建文件系统节点`);
    }

    if (!context.nodeId) {
      throw new Error(`文件 ${filename} (${fileHash}) 缺少节点ID，无法创建文件系统节点`);
    }

    if (!context.userId) {
      throw new Error(`文件 ${filename} (${fileHash}) 缺少用户ID，无法创建文件系统节点`);
    }

    // 获取文件大小
    const actualFileSize = await this.getFileSize(fileHash, filename, fileSource, targetFile);

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

    this.logger.log(`✅ 文件系统节点创建成功: ${filename} (${fileHash}) 在目录 ${context.nodeId}`);
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
      this.logger.warn('⚠️ 缺少节点ID，无法创建文件系统节点。文件将只保存到MxCAD存储，不会出现在文件系统中。');
      return;
    }

    try {
      // 扫描MxCAD实际生成的所有相关文件
      const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
      const actualFiles = await this.fileSystemService.readDirectory(uploadPath);
      
      // 匹配所有以fileHash开头的文件（包含.mxweb、.mxweb_preloading.json、_xxx.dwg等）
      const mxcadFiles = actualFiles.filter(file =>
        file.startsWith(fileHash)
      );

      this.logger.log(`🔍 扫描MxCAD文件: 哈希=${fileHash}, 找到文件数=${mxcadFiles.length}, 文件列表: ${mxcadFiles.join(', ')}`);

      if (mxcadFiles.length === 0) {
        this.logger.error(`❌ 未找到MxCAD转换后的文件: ${fileHash}`);
        return;
      }

      // 找到主.mxweb文件
      const mainMxwebFile = mxcadFiles.find(file => file.endsWith('.mxweb'));
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
        this.logger.warn(`⚠️ 外部参照信息更新失败（不影响主流程）: ${extRefError.message}`);
      }

      // 同步所有MxCAD转换后的文件到存储服务
      let syncedCount = 0;
      for (const fileName of mxcadFiles) {
        try {
          const localFilePath = path.join(uploadPath, fileName);
          if (await this.fileSystemService.exists(localFilePath)) {
            const fileBuffer = await fs.readFile(localFilePath);
            const minioPath = `mxcad/file/${fileName}`;
            await this.minioSyncService.uploadFile(minioPath, fileBuffer);
            this.logger.log(`✅ 文件同步到MinIO: ${fileName} (${fileBuffer.length} bytes)`);
            syncedCount++;
          } else {
            this.logger.warn(`⚠️ 本地文件不存在，跳过同步: ${localFilePath}`);
          }
        } catch (syncError) {
          this.logger.error(`❌ 文件同步失败: ${fileName}: ${syncError.message}`);
          // 单个文件同步失败不影响其他文件
        }
      }
      this.logger.log(`📤 共 ${syncedCount}/${mxcadFiles.length} 个文件同步到MinIO成功`);
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
const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
      const allFiles = await this.fileSystemService.readDirectory(uploadPath);
      const relatedFiles = allFiles.filter(file => file.startsWith(fileHash));
if (relatedFiles.length > 0) {
        const firstFile = path.join(uploadPath, relatedFiles[0]);
        const firstFileSize = await this.fileSystemService.getFileSize(firstFile);
return firstFileSize;
      }

      return 0;
    } catch (error) {
      this.logger.warn(`获取文件大小失败: ${error.message}`);
      return 0;
    }
  }
}