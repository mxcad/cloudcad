///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileUploadManagerFacadeService } from './services/file-upload-manager-facade.service';
import { FileSystemNodeService } from './node/filesystem-node.service';
import { FileConversionService } from './conversion/file-conversion.service';
import { ExternalReferenceUpdateService } from './services/external-reference-update.service';
import { StorageManager } from '../common/services/storage-manager.service';
import { VersionControlService } from '../version-control/version-control.service';
import { DatabaseService } from '../database/database.service';
import { PreloadingDataDto } from './dto/preloading-data.dto';
import { ConversionOptions } from './interfaces/file-conversion.interface';
import {
  ExternalReferenceStats,
  ExternalReferenceInfo,
} from './types/external-reference.types';
import { MxCadContext, ConvertServerFileParam } from './types/mxcad-context.types';
import { Request } from 'express';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';
import { AppConfig } from '../config/app.config';
import { findThumbnail, findThumbnailSync, getThumbnailFileName, getMimeType, THUMBNAIL_FORMATS, type ThumbnailFormat } from './services/thumbnail-utils';

@Injectable()
export class MxCadService {
  private readonly logger = new Logger(MxCadService.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @Inject(forwardRef(() => FileUploadManagerFacadeService))
    private readonly fileUploadManager: FileUploadManagerFacadeService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly fileConversionService: FileConversionService,
    private readonly externalReferenceUpdateService: ExternalReferenceUpdateService,
    private readonly storageManager: StorageManager,
    private readonly versionControlService: VersionControlService,
    private readonly prisma: DatabaseService
  ) {
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath', { infer: true });
  }

  /**
   * 检查分片是否存在
   */
  async checkChunkExist(
    chunk: number,
    fileHash: string,
    size: number,
    chunks: number,
    fileName: string,
    context?: MxCadContext
  ): Promise<{ ret: string }> {
    return this.fileUploadManager.checkChunkExist({
      hash: fileHash,
      name: fileName,
      size,
      chunk,
      chunks,
      context: this.validateContext(context),
    });
  }

  /**
   * 检查文件是否存在
   */
  async checkFileExist(
    filename: string,
    fileHash: string,
    context?: MxCadContext
  ): Promise<{ ret: string }> {
    return this.fileUploadManager.checkFileExist(
      filename,
      fileHash,
      this.validateContext(context)
    );
  }

  /**
   * 检查目录中是否存在重复文件（相同文件名和hash）
   * @param filename 文件名
   * @param fileHash 文件hash
   * @param nodeId 目标目录节点ID
   * @param currentFileId 当前文件ID（可选，用于排除当前文件）
   * @returns 重复文件信息，如果存在
   */
  async checkDuplicateFile(
    filename: string,
    fileHash: string,
    nodeId: string,
    currentFileId?: string
  ): Promise<{
    isDuplicate: boolean;
    existingNodeId?: string;
    existingFileName?: string;
  }> {
    try {
      // 在目标目录下查找同名同hash的文件
      const existingFile = await this.prisma.fileSystemNode.findFirst({
        where: {
          parentId: nodeId,
          name: filename,
          fileHash: fileHash,
          isFolder: false,
          deletedAt: null,
          // 排除当前文件（如果是覆盖保存的情况）
          ...(currentFileId && { id: { not: currentFileId } }),
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (existingFile) {
        this.logger.log(
          `发现重复文件: ${filename} (hash: ${fileHash}), 节点ID: ${existingFile.id}`
        );
        return {
          isDuplicate: true,
          existingNodeId: existingFile.id,
          existingFileName: existingFile.name,
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      this.logger.error(
        `检查重复文件失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 上传分片文件
   */
  async uploadChunk(
    hash: string,
    name: string,
    size: number,
    chunk: number,
    chunks: number,
    context?: MxCadContext
  ): Promise<{ ret: string; tz?: boolean }> {
    return this.fileUploadManager.uploadChunk({
      hash,
      name,
      size,
      chunk,
      chunks,
      context: this.validateContext(context),
    });
  }

  /**
   * 上传完整文件并转换
   */
  async uploadAndConvertFile(
    filePath: string,
    hash: string,
    name: string,
    size: number
  ): Promise<{ ret: string; tz?: boolean }> {
    // 对于没有上下文的上传，创建一个默认上下文
    const context = await this.createDefaultContext();
    return this.fileUploadManager.uploadAndConvertFile({
      filePath,
      hash,
      name,
      size,
      context,
    });
  }

  /**
   * 转换服务器文件
   */
  async convertServerFile(param: ConvertServerFileParam): Promise<unknown> {
    try {
      // 检查参数是否为 null 或 undefined
      if (!param) {
        return { code: 12, message: 'param error' };
      }

      // 构建转换选项
      const conversionOptions: ConversionOptions = {
        srcPath: param.srcPath || param.srcpath || '',
        fileHash: param.fileHash || param.src_file_md5 || '',
        createPreloadingData: true,
        outname: param.outname,
        cmd: param.cmd,
        width: param.width ? String(param.width) : undefined,
        height: param.height ? String(param.height) : undefined,
        colorPolicy: param.colorPolicy,
        outjpg: param.outjpg,
      };

      if (param.async === 'true' && param.resultposturl) {
        // 异步转换
        this.fileConversionService
          .convertFileAsync(conversionOptions, param.resultposturl)
          .then((taskId) => {
            // 这里应该发送回调，暂时省略
            this.logger.log(
              `异步转换完成: ${param.srcPath || param.srcpath}, 任务ID: ${taskId}`
            );
          });
        return { code: 0, message: 'async calling' };
      } else {
        // 同步转换
        const { isOk, ret } =
          await this.fileConversionService.convertFile(conversionOptions);
        return isOk ? ret : { code: 12, message: 'param error' };
      }
    } catch (error) {
      this.logger.error(`转换服务器文件失败: ${error.message}`, error.stack);
      return { code: 12, message: 'param error' };
    }
  }

  /**
   * 检查图纸状态
   */
  async checkTzStatus(fileHash: string): Promise<{ code: number }> {
    // 这里应该实现 tz 状态检查逻辑，暂时返回成功
    return { code: 0 };
  }

  /**
   * 获取外部参照预加载数据
   * @param nodeId 文件系统节点 ID 或文件哈希值（兼容旧版本）
   * @returns 预加载数据，如果文件不存在则返回 null
   */
  async getPreloadingData(nodeId: string): Promise<PreloadingDataDto | null> {
    return this.externalReferenceUpdateService.getPreloadingData(nodeId);
  }

  /**
   * 检查外部参照文件是否存在
   * @param nodeId 源图纸文件的节点 ID
   * @param fileName 外部参照文件名
   * @returns 文件是否存在
   */
  async checkExternalReferenceExists(
    nodeId: string,
    fileName: string
  ): Promise<boolean> {
    return this.externalReferenceUpdateService.checkExists(nodeId, fileName);
  }

  /**
   * 为 MxCAD-App 推断上下文信息
   */
  async inferContextForMxCadApp(fileHash: string, request: Request): Promise<import('./services/filesystem-node.service').FileSystemNodeContext | null> {
    return this.fileSystemNodeService.inferContextForMxCadApp(
      fileHash,
      request
    );
  }

  /**
   * 上传分片文件方法
   * 注意：权限验证已在 Controller 层通过 @RequireProjectPermission 装饰器处理
   */
  async uploadChunkWithPermission(
    hash: string,
    name: string,
    size: number,
    chunk: number,
    chunks: number,
    context?: MxCadContext
  ): Promise<{ ret: string; tz?: boolean; nodeId?: string }> {
    const result = await this.fileUploadManager.uploadChunk({
      hash,
      name,
      size,
      chunk,
      chunks,
      context: this.validateContext(context),
    });
    return result;
  }

  /**
   * 合并分片文件方法（用于完成请求）
   * 注意：权限验证已在 Controller 层通过 @RequireProjectPermission 装饰器处理
   */
  async mergeChunksWithPermission(
    hash: string,
    name: string,
    size: number,
    chunks: number,
    context?: MxCadContext,
    srcDwgNodeId?: string
  ): Promise<{ ret: string; tz?: boolean; nodeId?: string }> {
    const result = await this.fileUploadManager.mergeChunksWithPermission({
      hash,
      name,
      size,
      chunks,
      context: this.validateContext(context),
      srcDwgNodeId, // 外部参照上传时的源图纸节点 ID
    });
    return result;
  }

  /**
   * 上传完整文件方法
   * 注意：权限验证已在 Controller 层通过 @RequireProjectPermission 装饰器处理
   */
  async uploadAndConvertFileWithPermission(
    filePath: string,
    hash: string,
    name: string,
    size: number,
    context?: MxCadContext
  ): Promise<{ ret: string; tz?: boolean; nodeId?: string }> {
    return this.fileUploadManager.uploadAndConvertFileWithPermission({
      filePath,
      hash,
      name,
      size,
      context: this.validateContext(context),
    });
  }

  /**
   * 公共日志方法，供其他模块使用
   */
  logError(message: string, error?: unknown): void {
    this.logger.error(message, error);
  }

  logInfo(message: string): void {
    this.logger.log(message);
  }

  logWarn(message: string): void {
    this.logger.warn(message);
  }

  /**
   * 验证和标准化上下文
   */
  private validateContext(context?: MxCadContext): MxCadContext {
    // 在测试环境中，如果 context 为空，返回一个 mock context
    if (!context) {
      // 检查是否是测试环境
      const nodeEnv = this.configService.get('nodeEnv', { infer: true });
      if (nodeEnv === 'test' || process.env.JEST_WORKER_ID !== undefined) {
        return {
          userId: 'test-user-id',
          username: 'test-user',
          role: 'USER',
          userRole: 'USER',
          nodeId: 'test-node-id',
        };
      }
      throw new BadRequestException('上下文参数不能为空');
    }

    // 确保必要的字段存在
    if (!context.userId) {
      throw new BadRequestException('上下文缺少用户ID');
    }

    if (!context.nodeId) {
      throw new BadRequestException('上下文缺少节点ID');
    }

    // 确保 userRole 有值
    if (!context.userRole) {
      context.userRole = context.role || 'USER';
    }

    return context;
  }

  /**
   * 获取外部参照统计信息
   * @param nodeId 文件系统节点 ID
   * @returns 外部参照统计信息
   */
  async getExternalReferenceStats(
    nodeId: string
  ): Promise<ExternalReferenceStats> {
    return this.externalReferenceUpdateService.getStats(nodeId);
  }

  /**
   * 更新文件节点的外部参照信息
   * @param nodeId 文件系统节点 ID
   * @param stats 外部参照统计信息
   */
  async updateExternalReferenceInfo(
    nodeId: string,
    stats: ExternalReferenceStats
  ): Promise<void> {
    return this.externalReferenceUpdateService.updateInfo(nodeId, stats);
  }

  /**
   * 上传完成后更新外部参照信息
   * @param nodeId 文件系统节点 ID
   */
  async updateExternalReferenceAfterUpload(nodeId: string): Promise<void> {
    return this.externalReferenceUpdateService.updateAfterUpload(nodeId);
  }

  /**
   * 处理外部参照图片上传（公开方法）
   */
  async handleExternalReferenceImage(
    fileHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
    context: MxCadContext
  ): Promise<void> {
    return this.fileUploadManager.handleExternalReferenceImage(
      fileHash,
      srcDwgNodeId,
      extRefFileName,
      srcFilePath,
      context
    );
  }

  /**
   * 处理外部参照 DWG 上传（公开方法）
   */
  async handleExternalReferenceFile(
    extRefHash: string,
    srcDwgFileHash: string,
    extRefFileName: string,
    srcFilePath: string
  ): Promise<void> {
    return this.fileUploadManager.handleExternalReferenceFile(
      extRefHash,
      srcDwgFileHash,
      extRefFileName,
      srcFilePath
    );
  }

  /**
   * 创建默认上下文（用于没有上下文的操作）
   */
  private async createDefaultContext(): Promise<any> {
    // 在测试环境中，返回一个默认的上下文
    const nodeEnv = this.configService.get('nodeEnv', { infer: true });
    if (nodeEnv === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      return {
        userId: 'test-user-id',
        username: 'test-user',
        role: 'USER',
        nodeId: 'test-node-id',
      };
    }
    // 在生产环境中，抛出异常要求必须提供上下文
    throw new BadRequestException('必须提供有效的上下文参数');
  }

  /**
   * 验证文件路径安全性，防止路径遍历攻击
   */
  private validateFilePath(filePath: string, uploadPath: string): boolean {
    const resolvedPath = path.normalize(filePath);
    const normalizedUploadPath = path.normalize(uploadPath);
    return resolvedPath.startsWith(normalizedUploadPath);
  }

  /**
   * 验证预加载数据文件名合法性
   */
  private isValidPreloadingFileName(fileName: string): boolean {
    return /^[a-f0-9]+\.[a-z]+\.[a-z]+_preloading\.json$/i.test(fileName);
  }

  /**
   * 根据存储路径查找文件节点（用于路径转换）
   * @param storagePath 本地存储路径
   * @returns 文件节点或 null
   */
  async getFileSystemNodeByPath(storagePath: string): Promise<any | null> {
    return await this.fileSystemNodeService.findByPath(storagePath);
  }

  /**
   * 根据节点 ID 查找文件节点
   * @param nodeId 文件系统节点 ID
   * @returns 文件节点或 null
   */
  async getFileSystemNodeByNodeId(nodeId: string): Promise<any | null> {
    return await this.fileSystemNodeService.findById(nodeId);
  }

  /**
   * 查询缩略图是否存在
   * @param nodeId 节点 ID
   * @returns 缩略图信息（是否存在、存储位置、文件名）
   */
  async checkThumbnailExists(nodeId: string): Promise<{
    exists: boolean;
    location: 'local' | 'none';
    fileName?: string;
    mimeType?: string;
  }> {
    try {
      // 通过 nodeId 查找节点
      const node = await this.fileSystemNodeService.findById(nodeId);

      if (!node || !node.path || !node.fileHash) {
        this.logger.warn(
          `[checkThumbnailExists] 节点不存在或没有 path 字段: ${nodeId}`
        );
        return { exists: false, location: 'none' };
      }

      // 构建缩略图路径：filesData/YYYYMM[/N]/nodeId/thumbnail.{webp|jpg|png}
      // 注意：node.path 包含文件名，需要先提取目录路径
      const nodeFullPath = this.storageManager.getFullPath(node.path);
      const nodeDir = path.dirname(nodeFullPath);
      const thumbnail = await findThumbnail(nodeDir);

      if (thumbnail) {
        return {
          exists: true,
          location: 'local',
          fileName: thumbnail.fileName,
          mimeType: thumbnail.mimeType,
        };
      }
      return { exists: false, location: 'none' };
    } catch (error) {
      return { exists: false, location: 'none' };
    }
  }

  /**
   * 上传缩略图
   * @param nodeId 节点 ID
   * @param filePath 上传的缩略图文件路径
   * @returns 上传结果
   */
  async uploadThumbnail(
    nodeId: string,
    filePath: string
  ): Promise<{ success: boolean; message: string; fileName?: string }> {
    try {
      // 通过 nodeId 查找节点
      const node = await this.fileSystemNodeService.findById(nodeId);

      if (!node || !node.path) {
        this.logger.warn(
          `[uploadThumbnail] 节点不存在或没有 path 字段: ${nodeId}`
        );
        return {
          success: false,
          message: '文件节点不存在或没有 path 字段',
        };
      }

      // 验证文件是否存在
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          message: '上传文件不存在',
        };
      }

      // 获取文件扩展名并映射到标准缩略图格式
      const ext = path.extname(filePath).toLowerCase();
      const extMap: Record<string, string> = {
        '.png': 'png',
        '.jpg': 'jpg',
        '.jpeg': 'jpg',
        '.webp': 'webp',
      };
      const thumbnailFormat = extMap[ext];
      if (!thumbnailFormat) {
        return {
          success: false,
          message: `不支持的图片格式: ${ext}，仅支持 ${THUMBNAIL_FORMATS.join(', ')}`,
        };
      }

      // 构建目标文件名（使用上传文件的格式）
      const targetFileName = getThumbnailFileName(thumbnailFormat as ThumbnailFormat);

      // 构建目标路径：filesData/YYYYMM[/N]/nodeId/thumbnail.{format}
      // 注意：node.path 包含文件名，需要先提取目录路径
      const nodeFullPath = this.storageManager.getFullPath(node.path);
      const nodeDir = path.dirname(nodeFullPath);
      const targetLocalPath = path.join(nodeDir, targetFileName);

      // 上传到本地文件系统
      try {
        // 如果目标文件已存在，先删除
        if (fs.existsSync(targetLocalPath)) {
          fs.unlinkSync(targetLocalPath);
          this.logger.log(
            `[uploadThumbnail] 删除已存在的本地缩略图: ${targetLocalPath}`
          );
        }

        // 拷贝文件到目标位置
        fs.copyFileSync(filePath, targetLocalPath);
        this.logger.log(
          `[uploadThumbnail] 缩略图上传到本地成功: ${filePath} -> ${targetLocalPath}`
        );
      } catch (error) {
        this.logger.error(
          `[uploadThumbnail] 上传到本地文件系统失败: ${error.message}`,
          error.stack
        );
        return {
          success: false,
          message: `上传到本地失败: ${error.message}`,
        };
      }

      return {
        success: true,
        message: '缩略图上传成功',
        fileName: targetFileName,
      };
    } catch (error) {
      this.logger.error(
        `[uploadThumbnail] 上传缩略图失败: ${error.message}`,
        error.stack
      );
      return {
        success: false,
        message: `上传失败: ${error.message}`,
      };
    }
  }

  /**
   * 根据文件扩展名获取 MIME 类型
   * @param ext 文件扩展名（包含点号，如 .png）
   * @returns MIME 类型
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 保存 mxweb 文件到指定节点
   * @param nodeId 节点 ID
   * @param file 上传的 mxweb 文件
   * @param userId 用户 ID（可选）
   * @param userName 用户名称（可选）
   * @param commitMessage 提交信息（可选）
   * @param skipBinGeneration 是否跳过生成 bin 文件（公开资源库使用）
   * @returns 保存结果
   */
  async saveMxwebFile(
    nodeId: string,
    file: Express.Multer.File,
    userId?: string,
    userName?: string,
    commitMessage?: string,
    skipBinGeneration = false
  ): Promise<{ success: boolean; message: string; path?: string }> {
    try {
      this.logger.log(
        `[saveMxwebFile] 开始保存: nodeId=${nodeId}, file=${file?.originalname}`
      );

      // 验证文件是否存在
      if (!file || !file.path) {
        return {
          success: false,
          message: '缺少文件',
        };
      }

      // 通过 nodeId 查找节点
      const node = await this.fileSystemNodeService.findById(nodeId);

      if (!node) {
        this.logger.error(`[saveMxwebFile] 节点不存在: nodeId=${nodeId}`);
        return {
          success: false,
          message: '节点不存在',
        };
      }

      // 获取完整节点信息（包含 libraryKey）
      const fullNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { libraryKey: true, name: true, path: true },
      });

      if (!fullNode) {
        this.logger.error(`[saveMxwebFile] 节点不存在: nodeId=${nodeId}`);
        return {
          success: false,
          message: '节点不存在',
        };
      }

      // 验证文件扩展名
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.mxweb') {
        return {
          success: false,
          message: `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`,
        };
      }

      // 获取节点目录路径
      const nodeFullPath = this.storageManager.getFullPath(node.path);
      const nodeDir = path.dirname(nodeFullPath);

      // 确保目标目录存在
      if (!fs.existsSync(nodeDir)) {
        await fsPromises.mkdir(nodeDir, { recursive: true });
        this.logger.log(`[saveMxwebFile] 创建目录: ${nodeDir}`);
      }

      // 目标文件路径
      const targetPath = nodeFullPath;

      // 在保存新版本之前，检查是否需要备份初始版本的 mxweb
      // 初始版本命名规则：{basename}_initial.mxweb
      const mxwebBaseName = path.basename(targetPath);
      const initialMxwebName = mxwebBaseName.replace(
        /\.mxweb$/,
        '_initial.mxweb'
      );
      const initialMxwebPath = path.join(nodeDir, initialMxwebName);

      // 如果目标文件已存在，且没有初始版本备份，则先备份当前版本作为初始版本
      if (fs.existsSync(targetPath) && !fs.existsSync(initialMxwebPath)) {
        this.logger.log(
          `[saveMxwebFile] 备份初始版本: ${targetPath} -> ${initialMxwebPath}`
        );
        await fsPromises.copyFile(targetPath, initialMxwebPath);
      }

      // 拷贝文件到目标位置（覆盖原文件）
      await fsPromises.copyFile(file.path, targetPath);
      this.logger.log(
        `[saveMxwebFile] 文件保存成功: ${file.path} -> ${targetPath}`
      );

      // 更新数据库中的 updatedAt 字段，确保前端能检测到文件变更
      await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: { updatedAt: new Date() },
      });
      this.logger.log(`[saveMxwebFile] 更新节点时间戳: ${nodeId}`);

      // 调用 mxcadassembly 生成 bin 文件（公开资源库跳过）
      if (!skipBinGeneration) {
        await this.generateBinFiles(targetPath, node.name);
      } else {
        this.logger.log(`[saveMxwebFile] 跳过生成 bin 文件: ${node.name}`);
      }

      // 只有非公共资源库（libraryKey 为 null）才提交到 SVN 版本控制
      // 公共资源库（图纸库、图块库等）的文件不参与 SVN 版本管理
      if (!fullNode.libraryKey) {
        const nodeDirectory = path.dirname(targetPath);
        const message = commitMessage
          ? `Save: ${node.name} - ${commitMessage}`
          : `Save: ${node.name}`;

        this.logger.log(
          `[saveMxwebFile] 提交到 SVN: ${nodeDirectory}, 消息: ${message}`
        );
        const commitResult = await this.versionControlService.commitNodeDirectory(
          nodeDirectory,
          message,
          userId,
          userName
        );

        if (commitResult.success) {
          this.logger.log(`节点目录已提交到 SVN: ${node.name}`);
        } else {
          this.logger.warn(
            `节点目录 SVN 提交失败: ${node.name}, 原因: ${commitResult.message}`
          );
        }
      } else {
        this.logger.log(
          `[saveMxwebFile] 跳过 SVN 提交: ${node.name} (公共资源库: ${node.libraryKey})`
        );
      }

      // 删除临时上传文件
      try {
        await fsPromises.unlink(file.path);
        this.logger.log(`[saveMxwebFile] 删除临时文件: ${file.path}`);
      } catch (error) {
        this.logger.warn(`[saveMxwebFile] 删除临时文件失败: ${error.message}`);
      }

      return {
        success: true,
        message: '保存成功',
        path: node.path,
      };
    } catch (error) {
      this.logger.error(
        `[saveMxwebFile] 保存失败: ${error.message}`,
        error.stack
      );
      return {
        success: false,
        message: `保存失败: ${error.message}`,
      };
    }
  }

   /**
    * 调用 mxcadassembly 生成 bin 文件
    * @param mxwebPath mxweb 文件完整路径
    * @param nodeName 节点名称（用于日志）
    */
  async generateBinFiles(
    mxwebPath: string,
    nodeName: string
  ): Promise<void> {
    try {
      this.logger.log(`[generateBinFiles] 开始生成 bin 文件: ${mxwebPath}`);

      // 获取 mxweb 文件所在目录和文件名
      const mxwebDir = path.dirname(mxwebPath);
      const mxwebName = path.basename(mxwebPath);

      // 构造 outname：原文件名 + .bin（例如：test2.mxweb.bin）
      const outname = `${mxwebName}.bin`;

      // 调用 fileConversionService 进行转换
      const result = await this.fileConversionService.convertFile({
        srcPath: mxwebPath,
        fileHash: '', // bin 生成不需要 hash
        createPreloadingData: true,
        outname: outname,
      });

      if (result.isOk) {
        this.logger.log(`[generateBinFiles] bin 文件生成成功: ${nodeName}`);
      } else {
        this.logger.error(
          `[generateBinFiles] bin 文件生成失败: ${result.error || '未知错误'}`
        );
      }
    } catch (error) {
      // bin 生成失败不应影响文件保存流程，仅记录日志
      this.logger.error(
        `[generateBinFiles] bin 文件生成异常: ${nodeName}`,
        error.stack
      );
    }
  }
}
