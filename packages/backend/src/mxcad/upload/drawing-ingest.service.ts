///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { NodeTrashService } from '../../file-operations/node-trash.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemNodeContext } from '../node/filesystem-node.service';
import { CacheManagerService } from '../infra/cache-manager.service';
import { QuotaExceededException } from '../../vip/errors/quota-exceeded.error';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { UploadUtilityService } from './upload-utility.service';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { FileStatus, NodeType } from '@cloudcad/db';
import { FileNodeMaterializer } from './file-node-materializer.service';
import * as path from 'path';

/**
 * 摄入源：传输层差异（整包 / 分片）在此收敛为判别联合
 */
export type IngestSource =
  | {
      kind: 'file';
      filePath: string;
      fileHash: string;
      name: string;
      size: number;
      forceUpload?: boolean;
      /** 游客上传场景的客户端 IP（转换频率限制按 IP 计数，ADR-0043） */
      ip?: string;
    }
  | {
      kind: 'chunks';
      hash: string;
      name: string;
      size: number;
      chunkCount: number;
      skipDb?: boolean;
      ip?: string;
    };

/**
 * 摄入目标：文件落点 + 行为参数
 */
export interface IngestTarget {
  userId: string;
  parentNodeId: string;
  ownerId: string;
  srcDwgNodeId?: string;
  isImage?: boolean;
  isLibrary?: boolean;
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
  fileSize?: number;
}

/**
 * 摄入结果：ret 码为既有线缆契约（MxUploadReturn），HTTP 契约不变
 */
export interface IngestResult {
  ret: MxUploadReturn;
  nodeId?: string;
  tz?: boolean;
  /**
   * 本次摄入是否真正新建了 FileSystemNode（审计区分"新增图纸"）。
   * 仅新建节点时置 true；skip 冲突返回已有节点/外部参照跳过建节点时不设。
   * 供 uploadFiles / fileisExist 控制器决定是否埋 FILE_CREATE。
   */
  created?: boolean;
}

/**
 * 图纸摄入深模块（Drawing Ingest）
 *
 * 「外部文件 → FileSystemNode」的唯一摄入入口，取代 FileConversionUploadService
 * 与 FileMergeService 两条并行实现（ADR-0035）。整包 / 分片被定义为传输层差异
 * 收进 IngestSource 判别联合；秒传、格式转换、状态机流转、存储分配、缩略图生成
 * 全部收进 implementation。
 *
 * 摄入路径的 FileStatus 写入一律经 NodeStatusTransitioner.transition，
 * 禁止直接写 prisma.fileStatus。
 */
@Injectable()
export class DrawingIngestService {
  private readonly logger = new Logger(DrawingIngestService.name);

  private readonly checkingFiles: Map<
    string,
    Promise<{ ret: MxUploadReturn }>
  > = new Map();
  private readonly mxcadUploadPath: string;
  private readonly filesDataPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileSystemService: MxFileSystemService,
    private readonly fileTreeService: FileTreeService,
    private readonly nodeTrashService: NodeTrashService,
    private readonly cacheManager: CacheManagerService,
    private readonly fileConversionService: FileConversionService,
    private readonly uploadUtilityService: UploadUtilityService,
    private readonly nodeMutationGuard: NodeMutationGuard,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly nodeStatusTransitioner: NodeStatusTransitioner,
    private readonly materializer: FileNodeMaterializer
  ) {
    this.mxcadUploadPath =
      this.configService.get('mxcadUploadPath') || '../../uploads';
    this.filesDataPath =
      this.configService.get('filesDataPath') || '../../filesData';
  }

  private targetToContext(target: IngestTarget): FileSystemNodeContext {
    return {
      userId: target.userId,
      userRole: 'USER',
      nodeId: target.parentNodeId,
      srcDwgNodeId: target.srcDwgNodeId,
      isImage: target.isImage,
      isLibrary: target.isLibrary,
      conflictStrategy: target.conflictStrategy,
      fileSize: target.fileSize,
    };
  }

  private transition(
    nodeId: string,
    from: FileStatus,
    to: FileStatus
  ): Promise<void> {
    return this.nodeStatusTransitioner.transition(nodeId, from, to);
  }

  /**
   * 唯一摄入入口：整包 / 分片上传 + 秒传 + 格式转换 + 状态机流转 + 存储分配
   */
  async ingest(
    source: IngestSource,
    target: IngestTarget
  ): Promise<IngestResult> {
    if (source.kind === 'file') {
      return this.ingestWholeFile(source, target);
    }
    return this.ingestChunks(source, target);
  }

  /**
   * 秒传预检：本地存储已存在该文件时创建节点并落盘（含冲突策略 / 缩略图 / 外部参照）
   *
   * 同时承担上传前配额预检：前端所有正常上传路径的第一步都会先调 fileisExist，
   * 此时尚未传输任何文件字节，按客户端上报的 fileSize 断言配额，
   * 空间不足立即拒绝，避免整包 / 分片上传完成甚至合并后才提示"空间不足"。
   */
  async checkExist(
    fileHash: string,
    name: string,
    target: IngestTarget
  ): Promise<IngestResult> {
    const suffix = name.substring(name.lastIndexOf('.') + 1);
    const convertedExt = this.fileConversionService.getConvertedExtension(name);

    const checkKey = `${fileHash}.${suffix}`;
    if (this.checkingFiles.has(checkKey)) {
      return await this.checkingFiles.get(checkKey)!;
    }

    const context = this.targetToContext(target);
    const checkPromise = (async () => {
      // 上传前配额预检（ADR-0037 时机前移）：权威断言仍在摄入时按真实文件大小
      // 复核（防客户端上报值偏小绕过），此处仅提前拦截超限请求
      await this.assertQuotaBeforeUpload(target);
      return this.performFileExistenceCheck(
        name,
        fileHash,
        suffix,
        convertedExt,
        context
      );
    })();
    this.checkingFiles.set(checkKey, checkPromise);

    try {
      return await checkPromise;
    } finally {
      this.checkingFiles.delete(checkKey);
    }
  }

  /**
   * 上传前配额预检（ADR-0037 时机前移）：按客户端上报文件大小断言配额，
   * 空间不足立即抛 QuotaExceededException（403），避免整包 / 分片上传完成
   * 甚至合并后才提示"空间不足"。
   *
   * 供两处共用：
   * - 秒传预检 checkExist（前端所有正常上传路径的第一步，尚未传输任何字节）
   * - 分片上传入口（controller 每个分片请求，绕过秒传预检/直连 API 时尽早失败）
   *
   * 权威断言（摄入时按服务器真实文件大小复核）保留，防客户端上报值偏小绕过；
   * 本项目预检只是提前拦截，不替代权威检查。
   */
  async assertQuotaBeforeUpload(target: IngestTarget): Promise<void> {
    await this.checkQuota(this.targetToContext(target), target.fileSize);
  }

  private async checkQuota(
    context: FileSystemNodeContext,
    fileSize?: number
  ): Promise<void> {
    if (!context?.userId || !context?.nodeId) return;
    if (!fileSize || fileSize <= 0) return;
    await this.nodeMutationGuard.assertByteQuota(
      { node: { id: context.nodeId }, incrementBytes: fileSize },
      context.userId
    );
  }

  /**
   * 摄入整包上传：秒传 → MXWeb 直传 → CAD 转换 → 非 CAD 直传
   */
  private async ingestWholeFile(
    source: Extract<IngestSource, { kind: 'file' }>,
    target: IngestTarget
  ): Promise<IngestResult> {
    const { filePath, fileHash: hash, name, size, forceUpload } = source;
    const context = this.targetToContext(target);
    const uploadPath =
      this.mxcadUploadPath || path.join(process.cwd(), 'uploads');

    const fileExists =
      !forceUpload &&
      (await this.uploadUtilityService.checkFileExistsInStorage(hash, name));
    if (fileExists) {
      this.logger.log(`[DrawingIngest.ingest] 文件已存在，执行秒传: ${name}`);

      // 外部参照上传：跳过创建数据库节点和存储分配，直接处理外部参照文件
      if (context.srcDwgNodeId) {
        this.logger.log(
          `[DrawingIngest.ingest] 外部参照文件已存在，跳过创建节点和存储分配: ${name}`
        );
        const targetFile = path.join(
          uploadPath,
          this.uploadUtilityService.getConvertedFileName(hash, name)
        );
        await this.materializer.handleExtRef({
          srcDwgNodeId: context.srcDwgNodeId,
          isImage: context.isImage,
          name,
          fileHash: hash,
          sourcePath: targetFile,
          context,
        });
        return { ret: MxUploadReturn.kFileAlreadyExist };
      }

      // 普通图纸上传：创建数据库节点和存储分配
      if (context && context.userId && context.nodeId) {
        const parentId = await this.materializer.resolveParentId(context.nodeId);
        if (!parentId) return { ret: MxUploadReturn.kConvertFileError };

        await this.nodeMutationGuard.assertByteQuota(
          { node: { id: parentId }, incrementBytes: size },
          context.userId
        );

        const result = await this.materializer.materialize({
          parentId,
          ownerId: target.ownerId,
          name,
          fileHash: hash,
          size,
          source: {
            kind: 'artifacts',
            suffix: path.extname(name).replace('.', '').toLowerCase(),
            uploadPath,
          },
        });
        if (!result) return { ret: MxUploadReturn.kConvertFileError };
        return {
          ret: MxUploadReturn.kFileAlreadyExist,
          nodeId: result.nodeId,
          created: true,
        };
      }
      return { ret: MxUploadReturn.kFileAlreadyExist };
    }

    const isMxwebFile = path.extname(name).toLowerCase() === '.mxweb';
    if (isMxwebFile) {
      this.logger.log(`检测到 MXWeb 文件，直接复制到节点目录: ${name}`);
      try {
        const fileSize = await this.fileSystemService.getFileSize(filePath);
        await this.checkQuota(context, fileSize);

        if (context && context.userId && context.nodeId) {
          const parentId = await this.materializer.resolveParentId(
            context.nodeId
          );
          if (!parentId) return { ret: MxUploadReturn.kConvertFileError };

          const result = await this.materializer.materialize({
            parentId,
            ownerId: target.ownerId,
            name,
            fileHash: hash,
            size: fileSize,
            source: { kind: 'single', path: filePath, writeBackup: true },
          });
          if (!result) return { ret: MxUploadReturn.kConvertFileError };
          return {
            ret: MxUploadReturn.kOk,
            nodeId: result.nodeId,
            created: true,
          };
        }
        this.logger.warn(
          `MXWeb 文件上传失败: 缺少用户上下文 (userId=${context?.userId}, nodeId=${context?.nodeId})`
        );
        return { ret: MxUploadReturn.kConvertFileError };
      } catch (error) {
        if (error instanceof QuotaExceededException) throw error;
        this.logger.error(`MXWeb 文件上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }

    if (this.fileConversionService.needsConversion(name)) {
      return this.ingestCadFile(source, target, context, uploadPath);
    }

    // 非 CAD 文件直接拷贝
    this.logger.log(`检测到非CAD文件，直接拷贝到本地存储: ${name}`);
    try {
      const fileSize = await this.fileSystemService.getFileSize(filePath);
      await this.checkQuota(context, fileSize);

      if (context && context.userId && context.nodeId) {
        const parentId = await this.materializer.resolveParentId(
          context.nodeId
        );
        if (!parentId) return { ret: MxUploadReturn.kConvertFileError };

        const result = await this.materializer.materialize({
          parentId,
          ownerId: target.ownerId,
          name,
          fileHash: hash,
          size: fileSize,
          source: { kind: 'single', path: filePath },
          extRef:
            context.srcDwgNodeId && context.isImage
              ? {
                  srcDwgNodeId: context.srcDwgNodeId,
                  isImage: true,
                  context,
                  sourcePath: filePath,
                }
              : undefined,
        });
        if (!result) return { ret: MxUploadReturn.kConvertFileError };
        return {
          ret: MxUploadReturn.kOk,
          nodeId: result.nodeId,
          created: true,
        };
      }
      return { ret: MxUploadReturn.kConvertFileError };
    } catch (error) {
      if (error instanceof QuotaExceededException) throw error;
      this.logger.error(`非CAD文件上传失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }

  /**
   * CAD 整包转换：预留次数 → UPLOADING/PROCESSING → 转换 → COMPLETED/FAILED → 落盘
   */
  private async ingestCadFile(
    source: Extract<IngestSource, { kind: 'file' }>,
    target: IngestTarget,
    context: FileSystemNodeContext,
    uploadPath: string
  ): Promise<IngestResult> {
    const { filePath, fileHash: hash, name, size } = source;

    this.logger.log(`检测到CAD文件，执行转换流程: ${name}`);
    // 字节配额断言增量取服务器侧真实文件大小，防止客户端上报值偏小绕过配额
    const realSize = await this.fileSystemService.getFileSize(filePath);
    await this.checkQuota(context, realSize);
    // ADR-0043：转换频率限制只在转换执行点占位——登录用户按 userId，游客按 IP
    await this.reserveConversionReservation(context, source);

    let cadNodeId: string | undefined;
    if (
      (!context.srcDwgNodeId || context.isImage) &&
      context?.nodeId &&
      context?.userId
    ) {
      try {
        const parentId = await this.materializer.resolveParentId(context.nodeId);
        if (parentId) {
          const extension = path.extname(name).toLowerCase();
          const newNode = await this.fileTreeService.createFileNode({
            name,
            fileHash: hash,
            size,
            mimeType: this.materializer.getMimeType(extension),
            extension,
            parentId,
            ownerId: target.ownerId,
            skipFileCopy: true,
            fileStatus: FileStatus.UPLOADING,
          });
          cadNodeId = newNode.id;
          this.logger.log(
            `[DrawingIngest.ingest] 节点创建成功 (UPLOADING): ${cadNodeId}`
          );
          await this.transition(
            cadNodeId,
            FileStatus.UPLOADING,
            FileStatus.PROCESSING
          );
        }
      } catch (nodeErr) {
        this.logger.warn(
          `[DrawingIngest.ingest] 节点创建失败，继续转换: ${nodeErr.message}`
        );
      }
    }

    let isOk: boolean;
    let ret: { tz?: boolean } | undefined;
    try {
      await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
      const result = await this.fileConversionService.convertFile({
        srcPath: filePath,
        fileHash: hash,
        createPreloadingData: true,
        debugNodeId: cadNodeId,
      });
      isOk = result.isOk;
      ret = result.ret;
    } catch (error) {
      await this.releaseConversionReservation(context, source);
      throw error;
    }

    if (isOk) {
      if (cadNodeId) {
        await this.transition(
          cadNodeId,
          FileStatus.PROCESSING,
          FileStatus.COMPLETED
        );
      }

      // 外部参照上传：跳过创建数据库节点和存储分配，直接处理外部参照文件
      if (context.srcDwgNodeId && !context.isImage) {
        this.logger.log(
          `[DrawingIngest.ingest] 外部参照 DWG 文件上传，跳过创建节点和存储分配: ${name}`
        );
        const convertedFilePath = path.join(
          uploadPath,
          this.uploadUtilityService.getConvertedFileName(hash, name)
        );
        await this.materializer.handleExtRef({
          srcDwgNodeId: context.srcDwgNodeId,
          name,
          fileHash: hash,
          sourcePath: convertedFilePath,
        });
      } else {
        const finalNodeId = await this.finalizeCadNode(
          name,
          hash,
          size,
          filePath,
          context,
          target.ownerId,
          cadNodeId
        );
        if (finalNodeId === null) {
          return { ret: MxUploadReturn.kConvertFileError };
        }
        // finalize 兜底建节点时 cadNodeId 可能为空，以 finalize 返回的节点 id 为准
        cadNodeId = finalNodeId;
      }
      return {
        ret: MxUploadReturn.kOk,
        tz: ret?.tz,
        nodeId: cadNodeId,
        created: !!cadNodeId,
      };
    }

    await this.releaseConversionReservation(context, source);
    if (cadNodeId) {
      await this.transition(
        cadNodeId,
        FileStatus.PROCESSING,
        FileStatus.FAILED
      );
      await this.nodeTrashService.deleteNode(cadNodeId, true);
      this.logger.log(`[DrawingIngest.ingest] 已删除失败节点: ${cadNodeId}`);
    }
    return { ret: MxUploadReturn.kConvertFileError };
  }

  /**
   * 预留本次转换的频率限制额度：登录用户按 userId，游客按 IP（ADR-0043）。
   * 超限抛 QuotaExceededException（403）向上传播。返回是否已占位。
   */
  private async reserveConversionReservation(
    context: FileSystemNodeContext,
    source: { ip?: string }
  ): Promise<boolean> {
    if (context?.userId) {
      await this.restrictionEngine.reserveConversionCountOrThrow(
        context.userId
      );
      return true;
    }
    if (source.ip) {
      await this.restrictionEngine.reserveGuestConversionCountOrThrow(
        source.ip
      );
      return true;
    }
    return false;
  }

  /**
   * 释放本次转换的频率限制占位：登录用户按 userId，游客按 IP。
   * 转换失败/转换引擎异常时调用，避免失败任务耗尽窗口额度（ADR-0043）。
   */
  private async releaseConversionReservation(
    context: FileSystemNodeContext,
    source: { ip?: string }
  ): Promise<void> {
    if (context?.userId) {
      await this.restrictionEngine
        .releaseConversionCount(context.userId)
        .catch(() => undefined);
    } else if (source.ip) {
      await this.restrictionEngine
        .releaseGuestConversionCount(source.ip)
        .catch(() => undefined);
    }
  }

  /**
   * CAD 转换成功后的落盘：委托 FileNodeMaterializer（分配存储 → 复制转换产物 →
   * 缩略图 → 原始备份 → 外部参照更新）。返回是否落盘成功（公开上传/预览场景
   * 按设计跳过落盘，视为成功）。
   */
  /**
   * CAD 转换成功后的落盘：已有节点（existingNodeId）直接落盘，
   * 否则解析父目录后建节点落盘。返回最终节点 id（可能由本方法兜底创建）；
   * 公开上传/预览场景（无节点 ID）返回 undefined；落盘失败返回 null。
   */
  private async finalizeCadNode(
    originalName: string,
    fileHash: string,
    fileSize: number,
    originalFilePath: string,
    context: FileSystemNodeContext,
    ownerId: string,
    existingNodeId?: string
  ): Promise<string | null | undefined> {
    if (!context.nodeId && !existingNodeId) {
      this.logger.log(
        '[DrawingIngest.finalize] 公开上传/预览场景（无节点ID），按设计跳过文件系统节点创建，文件仅保存在 uploads 目录供预览'
      );
      return undefined;
    }

    const parentId = existingNodeId
      ? undefined
      : ((await this.materializer.resolveParentId(context.nodeId)) ??
        undefined);
    const result = await this.materializer.materialize({
      parentId,
      ownerId,
      name: originalName,
      fileHash,
      size: fileSize,
      existingNodeId,
      source: {
        kind: 'artifacts',
        suffix: path
          .extname(originalName)
          .replace('.', '')
          .toLowerCase(),
        uploadPath: this.mxcadUploadPath,
        originalFilePath,
      },
      isCadFile:
        path.extname(originalName).toLowerCase() === '.dwg' ||
        path.extname(originalName).toLowerCase() === '.dxf',
      extRef: { context, updateAfterUploadNodeId: context.nodeId },
    });
    if (!result) {
      this.logger.error(
        `[DrawingIngest.finalize] 落盘失败: ${originalName} (${fileHash})`
      );
      return null;
    }
    return result.nodeId;
  }

  /**
   * 分片摄入：合并分片 → 建节点（冲突策略）→ 转换 → 落盘 → 外部参照
   */
  private async ingestChunks(
    source: Extract<IngestSource, { kind: 'chunks' }>,
    target: IngestTarget
  ): Promise<IngestResult> {
    const {
      hash: hashFile,
      name: fileName,
      size: fileSize,
      chunkCount: chunks,
      skipDb,
    } = source;
    const context = this.targetToContext(target);
    const fileMd5 = hashFile;
    const tmpDir = this.fileSystemService.getChunkTempDirPath(fileMd5);
    const uploadPath =
      this.mxcadUploadPath || path.join(process.cwd(), 'uploads');

    this.logger.log(
      `[DrawingIngest.chunks] 开始合并转换: userId=${context.userId}, nodeId=${context.nodeId}, fileHash=${fileMd5}, fileName=${fileName}, chunks=${chunks}, srcDwgNodeId=${context.srcDwgNodeId}`
    );

    // ADR-0043：本次合并是否已做转换频率占位（超限不占位、mxweb 不占位）
    let conversionReserved = false;

    try {
      const dirExists = await this.fileSystemService.exists(tmpDir);
      if (!dirExists) {
        this.logger.warn(`[DrawingIngest.chunks] 临时目录不存在: ${tmpDir}`);
        return { ret: MxUploadReturn.kChunkNoExist };
      }

      const stack = await this.fileSystemService.readDirectory(tmpDir);
      if (chunks !== stack.length) {
        return { ret: MxUploadReturn.kOk };
      }

      const mergeKey = `merging:${fileMd5}`;
      const isMerging = await this.cacheManager.get<boolean>(
        'file-upload',
        mergeKey
      );
      if (isMerging) {
        this.logger.log(
          `[DrawingIngest.chunks] 文件正在合并中，跳过: ${fileMd5}`
        );
        return { ret: MxUploadReturn.kOk };
      }
      await this.cacheManager.set('file-upload', mergeKey, true);

      const fileExtName = fileName.substring(fileName.lastIndexOf('.') + 1);
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

        if (skipDb) {
          this.logger.log(
            `[DrawingIngest.chunks] skipDb 模式，合并完成: ${fileMd5}`
          );
          await this.fileSystemService.deleteDirectory(tmpDir);
          await this.cacheManager.delete('file-upload', mergeKey);
          return { ret: MxUploadReturn.kOk };
        }

        // Step 0: 转换频率占位（ADR-0043）—— 超限时不转换、不创建节点。
        // .mxweb 无需转换不占位；占位失败抛 QuotaExceededException 向上传播（403）。
        const extension = path.extname(fileName).toLowerCase();
        const isMxwebFile = extension === '.mxweb';
        if (!isMxwebFile) {
          conversionReserved =
            await this.reserveConversionReservation(context, source);
        }

        await this.fileSystemService.writeStatusFile(
          fileName,
          fileSize,
          hashFile,
          filepath
        );

        // Step 1: 提前创建 FileNode（状态 = UPLOADING），含冲突策略
        if (context && context.userId && context.nodeId) {
          const parentId = await this.materializer.resolveParentId(
            context.nodeId
          );
          if (!parentId) {
            // 未发生转换，释放本次占位（ADR-0043）
            if (conversionReserved) {
              await this.releaseConversionReservation(context, source);
            }
            await this.cacheManager.delete('file-upload', mergeKey);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          // 字节配额断言：合并完成后、冲突处理（overwrite 会先删除旧节点）与创建节点之前，
          // 配额不足时直接拒绝，避免旧文件已被删除造成数据丢失（ADR-0037）。
          // 增量取合并后的真实文件大小，防止客户端上报值偏小绕过配额。
          const realFileSize =
            await this.fileSystemService.getFileSize(filepath);
          await this.checkQuota(context, realFileSize);

          const conflict = await this.resolveConflict(
            parentId,
            fileName,
            context.conflictStrategy
          );
          if (conflict.earlyReturn) {
            // 冲突跳过：未发生转换，释放本次占位（ADR-0043）
            if (conversionReserved) {
              await this.releaseConversionReservation(context, source);
            }
            await this.fileSystemService.deleteDirectory(tmpDir);
            await this.cacheManager.delete('file-upload', mergeKey);
            return conflict.earlyReturn;
          }
          const finalFileName = conflict.finalName;

          const newNode = await this.fileTreeService.createFileNode({
            name: finalFileName,
            fileHash: fileMd5,
            size: realFileSize,
            mimeType: this.materializer.getMimeType(
              path.extname(fileName).toLowerCase()
            ),
            extension: path.extname(fileName).toLowerCase(),
            parentId,
            ownerId: target.ownerId,
            skipFileCopy: true,
            fileStatus: FileStatus.UPLOADING,
          });
          newNodeId = newNode.id;
          this.logger.log(
            `[DrawingIngest.chunks] 节点创建成功 (UPLOADING): ${newNodeId}`
          );
          await this.transition(
            newNodeId,
            FileStatus.UPLOADING,
            FileStatus.PROCESSING
          );
        }

        // Step 2: 格式转换（.mxweb 文件无需转换）
        let isOk = true;
        let ret = MxUploadReturn.kOk;
        let conversionRet:
          | import('../interfaces/file-conversion.interface').MxCadConversionResult
          | undefined;

        if (!isMxwebFile) {
          const convertResult = await this.fileConversionService.convertFile({
            srcPath: filepath,
            fileHash: fileMd5,
            createPreloadingData: true,
          });
          isOk = convertResult.isOk;
          conversionRet = convertResult.ret;
          ret =
            convertResult.ret?.code === 0
              ? MxUploadReturn.kOk
              : MxUploadReturn.kConvertFileError;
        } else {
          this.logger.log(
            `[DrawingIngest.chunks] .mxweb 文件，跳过转换: ${fileName}`
          );
        }

        // Step 3: 根据转换结果更新状态
        if (!isOk) {
          if (conversionReserved) {
            await this.releaseConversionReservation(context, source);
          }
          if (newNodeId) {
            await this.transition(
              newNodeId,
              FileStatus.PROCESSING,
              FileStatus.FAILED
            );
            await this.nodeTrashService.deleteNode(newNodeId, true);
            this.logger.log(
              `[DrawingIngest.chunks] 已删除失败节点: ${newNodeId}`
            );
          }
          await this.fileSystemService.deleteDirectory(tmpDir);
          await this.cacheManager.delete('file-upload', mergeKey);
          return { ret: MxUploadReturn.kConvertFileError };
        }

        if (newNodeId) {
          await this.transition(
            newNodeId,
            FileStatus.PROCESSING,
            FileStatus.COMPLETED
          );
        }

        if (context && context.userId && context.nodeId && newNodeId) {
          const result = await this.materializer.materialize({
            ownerId: target.ownerId,
            name: fileName,
            fileHash: fileMd5,
            size: fileSize,
            existingNodeId: newNodeId,
            source: {
              kind: 'artifacts',
              suffix: fileExtName.toLowerCase(),
              uploadPath: this.mxcadUploadPath,
            },
            isCadFile:
              extension === '.dwg' || extension === '.dxf',
            extRef: context.srcDwgNodeId
              ? {
                  srcDwgNodeId: context.srcDwgNodeId,
                  sourcePath: filepath,
                }
              : undefined,
          });
          if (!result) {
            // 落盘失败：释放占位 + 删除节点（保持原 catch 语义）
            if (conversionReserved) {
              await this.releaseConversionReservation(context, source);
            }
            await this.nodeTrashService.deleteNode(newNodeId, true);
            await this.fileSystemService.deleteDirectory(tmpDir);
            await this.cacheManager.delete('file-upload', mergeKey);
            return { ret: MxUploadReturn.kConvertFileError };
          }

          await this.fileSystemService.deleteDirectory(tmpDir);

          await this.cacheManager.delete('file-upload', mergeKey);
          return {
            ret: MxUploadReturn.kOk,
            tz: conversionRet?.tz,
            nodeId: newNodeId,
            created: true,
          };
        }

        await this.cacheManager.delete('file-upload', mergeKey);
        return { ret: MxUploadReturn.kOk };
      } catch (error) {
        await this.cacheManager.delete('file-upload', mergeKey);
        if (conversionReserved) {
          await this.releaseConversionReservation(context, source);
        }
        if (error instanceof QuotaExceededException) throw error;
        this.logger.error(
          `[DrawingIngest.chunks] error for file ${fileName}, hash ${fileMd5}:`,
          error
        );
        if (newNodeId) {
          try {
            await this.nodeTrashService.deleteNode(newNodeId, true);
          } catch (deleteError) {
            this.logger.error(
              `[DrawingIngest.chunks] Failed to delete node ${newNodeId} after error: ${deleteError.message}`
            );
          }
        }
        return { ret: MxUploadReturn.kConvertFileError };
      }
    } catch (error) {
      if (error instanceof QuotaExceededException) throw error;
      this.logger.error(`合并转换文件失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }

  /**
   * 冲突策略解析：返回最终文件名，或 skip 时的提前返回结果
   */
  private async resolveConflict(
    parentId: string,
    fileName: string,
    conflictStrategy?: 'skip' | 'overwrite' | 'rename'
  ): Promise<{ finalName: string; earlyReturn?: IngestResult }> {
    const strategy = conflictStrategy || 'rename';
    const childrenResult = await this.fileTreeService.getChildren(parentId);
    const existingNodes = childrenResult.nodes || [];
    const existingFile = existingNodes.find(
      (node) =>
        node.nodeType === NodeType.FILE &&
        node.name.toLowerCase() === fileName.toLowerCase()
    );

    if (existingFile) {
      if (strategy === 'skip') {
        this.logger.log(`[DrawingIngest] 同名文件已存在，跳过: ${fileName}`);
        return {
          finalName: fileName,
          earlyReturn: {
            ret: MxUploadReturn.kFileAlreadyExist,
            nodeId: existingFile.id,
          },
        };
      } else if (strategy === 'overwrite') {
        this.logger.log(`[DrawingIngest] 覆盖同名文件: ${fileName}`);
        await this.nodeTrashService.deleteNode(existingFile.id, true);
        return { finalName: fileName };
      }
    }

    if (strategy === 'rename') {
      const uniqueName = await this.uploadUtilityService.generateUniqueFileName(
        parentId,
        fileName
      );
      if (uniqueName !== fileName) {
        this.logger.log(
          `[DrawingIngest] 重命名文件: ${fileName} -> ${uniqueName}`
        );
        return { finalName: uniqueName };
      }
    }
    return { finalName: fileName };
  }

  /**
   * 秒传落盘：校验本地文件存在后创建节点 + 复制转换产物 + 缩略图 + 外部参照
   */
  private async performFileExistenceCheck(
    filename: string,
    fileHash: string,
    suffix: string,
    convertedExt: string,
    context: FileSystemNodeContext
  ): Promise<IngestResult> {
    const targetFile = `${fileHash}.${suffix}${convertedExt}`;
    const localPath = this.fileSystemService.getMd5Path(targetFile);
    const localExists = await this.fileSystemService.exists(localPath);
    if (!localExists) {
      return { ret: MxUploadReturn.kFileNoExist };
    }

    if (context && context.userId && context.nodeId) {
      try {
        const parentId = await this.materializer.resolveParentId(
          context.nodeId
        );
        if (!parentId) return { ret: MxUploadReturn.kConvertFileError };

        // 字节配额断言：冲突处理（overwrite 会先删除旧节点）与创建节点之前，
        // 配额不足时直接拒绝，避免旧文件已被删除造成数据丢失（ADR-0037）。
        // 增量取本地转换产物的真实大小，防止客户端上报值偏小绕过配额。
        const realFileSize =
          await this.fileSystemService.getFileSize(localPath);
        await this.checkQuota(context, realFileSize);

        const conflict = await this.resolveConflict(
          parentId,
          filename,
          context.conflictStrategy
        );
        if (conflict.earlyReturn) return conflict.earlyReturn;
        const finalFileName = conflict.finalName;

        const fileSize = context.fileSize || 0;
        const result = await this.materializer.materialize({
          parentId,
          ownerId: context.userId,
          name: finalFileName,
          fileHash,
          size: fileSize,
          source: {
            kind: 'artifacts',
            suffix: suffix.toLowerCase(),
            uploadPath: this.mxcadUploadPath,
          },
          isCadFile: suffix.toLowerCase() === 'dwg' || suffix.toLowerCase() === 'dxf',
          extRef: context.srcDwgNodeId
            ? {
                srcDwgNodeId: context.srcDwgNodeId,
                isImage: context.isImage,
                context,
                sourcePath: path.join(
                  this.mxcadUploadPath,
                  this.uploadUtilityService.getConvertedFileName(
                    fileHash,
                    filename
                  )
                ),
              }
            : undefined,
        });
        if (!result) return { ret: MxUploadReturn.kConvertFileError };
        return {
          ret: MxUploadReturn.kFileAlreadyExist,
          nodeId: result.nodeId,
          created: true,
        };
      } catch (error) {
        this.logger.error(`秒传节点创建失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
    return { ret: MxUploadReturn.kConvertFileError };
  }
}
