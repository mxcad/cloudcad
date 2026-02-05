import { Injectable, Logger } from '@nestjs/common';
import { ChunkUploadService } from '../services/chunk-upload.service';
import { FileCheckService } from '../services/file-check.service';
import { NodeCreationService, CreateNodeOptions, NodeCreationContext } from '../services/node-creation.service';
import { FileConversionService } from '../services/file-conversion.service';
import { ConcurrencyManager } from '../../common/concurrency/concurrency-manager';

/**
 * 上传上下文
 */
export interface UploadContext {
  /** 节点 ID（项目根目录或文件夹） */
  nodeId: string;
  /** 用户 ID */
  userId: string;
  /** 用户角色 */
  userRole?: string;
  /** 外部参照上传时的源图纸节点 ID */
  srcDwgNodeId?: string;
  /** 是否为图片外部参照 */
  isImage?: boolean;
}

/**
 * 分片上传选项
 */
export interface HandleChunkUploadOptions {
  /** 文件哈希值 */
  hash: string;
  /** 分片索引 */
  chunk: number;
  /** 分片数据路径 */
  chunkData: string;
  /** 分片大小（字节） */
  size: number;
}

/**
 * 文件上传选项
 */
export interface HandleFileUploadOptions {
  /** 文件哈希值 */
  hash: string;
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 总分片数 */
  chunks: number;
  /** MIME 类型 */
  mimeType?: string;
  /** 上传上下文 */
  context: UploadContext;
}

/**
 * 合并请求选项
 */
export interface HandleMergeRequestOptions {
  /** 文件哈希值 */
  hash: string;
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 总分片数 */
  chunks: number;
  /** 上传上下文 */
  context: UploadContext;
}

/**
 * 分片存在检查选项
 */
export interface CheckChunkExistsOptions {
  /** 文件哈希值 */
  hash: string;
  /** 分片索引 */
  chunk: number;
}

/**
 * 上传结果
 */
export interface UploadResult {
  /** 是否成功 */
  success: boolean;
  /** 节点 ID（成功时） */
  nodeId?: string;
  /** 错误消息（失败时） */
  errorMessage?: string;
}

/**
 * 上传编排器
 *
 * 职责：
 * 1. 编排文件上传的完整流程
 * 2. 协调各个子服务的调用
 * 3. 处理上传流程中的异常
 * 4. 提供统一的上传接口
 */
@Injectable()
export class UploadOrchestrator {
  private readonly logger = new Logger(UploadOrchestrator.name);

  constructor(
    private readonly chunkUploadService: ChunkUploadService,
    private readonly fileCheckService: FileCheckService,
    private readonly nodeCreationService: NodeCreationService,
    private readonly fileConversionService: FileConversionService,
    private readonly concurrencyManager: ConcurrencyManager,
  ) {}

  /**
   * 处理分片上传
   *
   * @param options 分片上传选项
   * @returns 上传结果
   */
  async handleChunkUpload(options: HandleChunkUploadOptions): Promise<UploadResult> {
    try {
      const { hash, chunk, chunkData, size } = options;

      this.logger.debug(
        `处理分片上传: hash=${hash}, chunk=${chunk}, size=${size}`,
      );

      // 验证分片数据路径
      if (!chunkData || typeof chunkData !== 'string') {
        return {
          success: false,
          errorMessage: '分片数据路径无效',
        };
      }

      // 上传分片
      const uploadSuccess = await this.chunkUploadService.uploadChunk(chunkData);

      if (!uploadSuccess) {
        return {
          success: false,
          errorMessage: '分片上传失败',
        };
      }

      this.logger.log(`分片上传成功: hash=${hash}, chunk=${chunk}`);

      return { success: true };
    } catch (error) {
      this.logger.error(
        `处理分片上传失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        errorMessage: error.message || '分片上传失败',
      };
    }
  }

  /**
   * 处理文件上传（非分片）
   *
   * @param options 文件上传选项
   * @returns 上传结果
   */
  async handleFileUpload(options: HandleFileUploadOptions): Promise<UploadResult> {
    try {
      const { hash, name, size, mimeType, context } = options;

      this.logger.debug(
        `处理文件上传: hash=${hash}, name=${name}, size=${size}`,
      );

      // 检查文件是否已存在
      const fileExists = await this.fileCheckService.checkFileExists(hash, name);

      if (fileExists) {
        this.logger.log(`文件已存在，跳过上传: ${name} (${hash})`);
        return { success: true };
      }

      // 创建文件系统节点
      const extension = this.getFileExtension(name);
      const createOptions: CreateNodeOptions = {
        name,
        fileHash: hash,
        size,
        mimeType: mimeType || this.getMimeType(name),
        extension,
        parentId: context.nodeId,
        ownerId: context.userId,
        skipFileCopy: true, // 文件已由调用者处理，无需复制
      };

      const createResult = await this.nodeCreationService.createNode(createOptions);

      if (!createResult.success) {
        return {
          success: false,
          errorMessage: createResult.errorMessage || '创建节点失败',
        };
      }

      this.logger.log(`文件上传成功: ${name} (${hash}), nodeId=${createResult.nodeId}`);

      return {
        success: true,
        nodeId: createResult.nodeId,
      };
    } catch (error) {
      this.logger.error(
        `处理文件上传失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        errorMessage: error.message || '文件上传失败',
      };
    }
  }

  /**
   * 处理合并请求
   *
   * @param options 合并请求选项
   * @returns 上传结果
   */
  async handleMergeRequest(options: HandleMergeRequestOptions): Promise<UploadResult> {
    const { hash, name, size, chunks, context } = options;

    this.logger.debug(
      `处理合并请求: hash=${hash}, name=${name}, size=${size}, chunks=${chunks}`,
    );

    // 使用并发控制执行合并流程
    const result = await this.concurrencyManager.acquireLock(
      `merge:${hash}`,
      async () => {
        return await this.performMerge(options);
      },
    );

    if (result === null) {
      return {
        success: false,
        errorMessage: '合并请求失败：无法获取锁',
      };
    }

    return result;
  }

  /**
   * 检查分片是否存在
   *
   * @param options 分片存在检查选项
   * @returns 上传结果
   */
  async checkChunkExists(options: CheckChunkExistsOptions): Promise<UploadResult> {
    try {
      const { hash, chunk } = options;

      this.logger.debug(`检查分片存在: hash=${hash}, chunk=${chunk}`);

      const exists = await this.chunkUploadService.checkChunkExists(hash, chunk);

      this.logger.debug(
        `分片存在检查结果: hash=${hash}, chunk=${chunk}, exists=${exists}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(
        `检查分片存在失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        errorMessage: error.message || '检查分片存在失败',
      };
    }
  }

  /**
   * 检查文件是否存在
   *
   * @param filename 文件名
   * @param fileHash 文件哈希值
   * @param context 上传上下文
   * @returns 上传结果
   */
  async checkFileExists(
    filename: string,
    fileHash: string,
    context: UploadContext,
  ): Promise<UploadResult> {
    try {
      this.logger.debug(
        `检查文件存在: filename=${filename}, hash=${fileHash}`,
      );

      const exists = await this.fileCheckService.checkFileExists(fileHash, filename);

      this.logger.debug(
        `文件存在检查结果: filename=${filename}, hash=${fileHash}, exists=${exists}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(
        `检查文件存在失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        errorMessage: error.message || '检查文件存在失败',
      };
    }
  }

  /**
   * 执行实际的合并操作
   *
   * @param options 合并请求选项
   * @returns 上传结果
   */
  private async performMerge(options: HandleMergeRequestOptions): Promise<UploadResult> {
    const { hash, name, size, chunks, context } = options;
    const path = require('path');

    try {
      // 生成临时文件路径
      const tempPath = this.chunkUploadService.getChunkTempDirPath(hash);
      const tempFilePath = path.join(tempPath, `${hash}${path.extname(name)}`);

      // 合并分片
      const mergeOptions = {
        hash,
        name,
        size,
        chunks,
        targetPath: tempFilePath,
      };

      const mergeSuccess = await this.chunkUploadService.mergeChunks(mergeOptions);

      if (!mergeSuccess) {
        return {
          success: false,
          errorMessage: '合并分片失败',
        };
      }

      this.logger.log(`分片合并成功: ${name} (${hash})`);

      // 检查文件是否已存在
      const fileExists = await this.fileCheckService.checkFileExists(hash, name);

      let nodeId: string | undefined;

      if (fileExists) {
        // 文件已存在，引用现有节点
        const referenceContext = {
          hash,
          context: this.convertUploadContextToNodeCreationContext(context),
        };

        const referenceResult = await this.nodeCreationService.referenceNode(hash, referenceContext);

        if (!referenceResult.success) {
          return {
            success: false,
            errorMessage: referenceResult.errorMessage || '引用节点失败',
          };
        }

        nodeId = referenceResult.nodeId;
        this.logger.log(`引用现有节点成功: ${name} (${hash}), nodeId=${nodeId}`);
      } else {
        // 创建新节点
        const extension = this.getFileExtension(name);
        const createOptions: CreateNodeOptions = {
          name,
          fileHash: hash,
          size,
          mimeType: this.getMimeType(name),
          extension,
          parentId: context.nodeId,
          ownerId: context.userId,
          sourceFilePath: tempFilePath,
          skipFileCopy: false,
        };

        const createResult = await this.nodeCreationService.createNode(createOptions);

        if (!createResult.success) {
          return {
            success: false,
            errorMessage: createResult.errorMessage || '创建节点失败',
          };
        }

        nodeId = createResult.nodeId;
        this.logger.log(`创建新节点成功: ${name} (${hash}), nodeId=${nodeId}`);
      }

      // 转换文件（如果需要）
      if (this.fileConversionService.needsConversion(name)) {
        const convertedExt = this.fileConversionService.getConvertedExtension(name);
        const convertedPath = path.join(
          path.dirname(tempFilePath),
          `${hash}${convertedExt}`,
        );

        const conversionOptions = {
          srcPath: tempFilePath,
          fileHash: hash,
          createPreloadingData: true,
        };

        const conversionResult = await this.fileConversionService.convertFile(conversionOptions);

        if (!conversionResult.isOk) {
          this.logger.warn(
            `文件转换失败: ${name} (${hash}), error=${conversionResult.error}`,
          );
          // 转换失败不影响上传结果，文件仍可用
        } else {
          this.logger.log(`文件转换成功: ${name} (${hash})`);
        }
      }

      // 清理临时目录
      await this.chunkUploadService.cleanupTempDirectory(hash);

      this.logger.log(`合并流程完成: ${name} (${hash}), nodeId=${nodeId}`);

      return {
        success: true,
        nodeId,
      };
    } catch (error) {
      this.logger.error(
        `执行合并操作失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        errorMessage: error.message || '合并操作失败',
      };
    }
  }

  /**
   * 获取文件扩展名
   *
   * @param filename 文件名
   * @returns 文件扩展名（包含点）
   */
  private getFileExtension(filename: string): string {
    const ext = require('path').extname(filename);
    return ext || '';
  }

  /**
   * 获取 MIME 类型
   *
   * @param filename 文件名
   * @returns MIME 类型
   */
  private getMimeType(filename: string): string {
    const ext = this.getFileExtension(filename).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.dwg': 'application/acad',
      '.dxf': 'application/dxf',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 将 UploadContext 转换为 NodeCreationContext
   */
  private convertUploadContextToNodeCreationContext(
    uploadContext: UploadContext,
  ): NodeCreationContext {
    return {
      nodeId: uploadContext.nodeId,
      userId: uploadContext.userId,
      userRole: uploadContext.userRole,
      srcDwgNodeId: uploadContext.srcDwgNodeId,
      isImage: uploadContext.isImage,
    };
  }
}