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
import { ConversionResult } from '../interfaces/file-conversion.interface';
import { AsyncConversionService } from '../conversion/async-conversion.service';
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
    private readonly materializer: FileNodeMaterializer,
    private readonly asyncConversionService: AsyncConversionService
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

    // 外部参照 DWG 上传：不建数据库节点，前端经 checkMissingReferences 独立轮询预加载数据，
    // 不套用「节点 PROCESSING → 轮询」模型。转换 + handleExtRef 保持同步（请求返回即就位，
    // 前端按 ret 判定每文件成败），故此处不进入 fire-and-forget。
    if (context.srcDwgNodeId && !context.isImage) {
      return this.ingestExternalRefDwg({
        filePath,
        fileHash: hash,
        name,
        size,
        srcDwgNodeId: context.srcDwgNodeId,
        context,
        uploadPath,
        source,
      });
    }

    // 普通 CAD 文件：节点已建（PROCESSING），fire-and-forget 后台转换 + 落盘 + 状态迁移。
    // 上传请求立即返回（ret=kOk + nodeId），前端轮询节点状态（waitForFileReady）直到 COMPLETED，
    // 用户不阻塞在上传请求上，「文件转换中」由前端轮询呈现。
    if (cadNodeId) {
      this.runBackgroundCadConversion({
        filePath,
        fileHash: hash,
        name,
        size,
        context,
        target,
        cadNodeId,
        source,
      });
      return { ret: MxUploadReturn.kOk, nodeId: cadNodeId, created: true };
    }

    // 无 nodeId（CAD 编辑器打开图纸 = 纯打开/预览，游客与登录用户一致，不建数据库节点）：
    // 同步转换（请求返回即 mxweb 就位），文件留在 uploads 目录，前端经
    // public-file/access/<hash>.mxweb 打开（findMxwebFile 按 hash 在 uploads/ 查找）。
    // 恢复 #433 之前「转换无条件执行」语义——#433 把转换耦合到节点创建，无 nodeId 时
    // 转换被跳过、前端拿到 convertFileError（CAD 编辑器打开图纸恒失败）。
    if (!context.nodeId) {
      return this.ingestNoNodePreview({
        filePath,
        fileHash: hash,
        name,
        size,
        context,
        source,
      });
    }

    // 节点创建失败（nodeId 存在但建节点失败）：回滚转换额度，返回转换错误
    await this.releaseConversionReservation(context, source);
    return { ret: MxUploadReturn.kConvertFileError };
  }

  /**
   * 无节点场景（CAD 编辑器打开图纸 = 纯打开/预览，游客与登录用户一致）：
   * 不建数据库节点，同步转换（请求返回即 mxweb 就位），文件留在 uploads 目录，
   * 前端经 public-file/access/<hash>.mxweb 打开（findMxwebFile 按 hash 在 uploads/
   * 查找 <hash>.*.mxweb）。与 ingestExternalRefDwg 同为同步转换，区别是不挂外部参照、
   * 不建节点——mxweb 留在 uploads 供预览。
   */
  private async ingestNoNodePreview(args: {
    filePath: string;
    fileHash: string;
    name: string;
    size: number;
    context: FileSystemNodeContext;
    source: Extract<IngestSource, { kind: 'file' }>;
  }): Promise<IngestResult> {
    const { filePath, fileHash: hash, name, size, context, source } = args;
    let isOk: boolean;
    let ret: { tz?: boolean } | undefined;
    try {
      await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
      const result = await this.fileConversionService.convertFile({
        srcPath: filePath,
        fileHash: hash,
        createPreloadingData: true,
      });
      isOk = result.isOk;
      ret = result.ret;
    } catch (error) {
      await this.releaseConversionReservation(context, source);
      throw error;
    }

    if (isOk) {
      this.logger.log(
        `[DrawingIngest.ingest] 无节点场景（CAD 编辑器打开），跳过节点创建，同步转换: ${name}`
      );
      return { ret: MxUploadReturn.kOk, tz: ret?.tz, created: false };
    }

    await this.releaseConversionReservation(context, source);
    return { ret: MxUploadReturn.kConvertFileError };
  }

  /**
   * 外部参照 DWG 上传（同步）：不建数据库节点，转换后 handleExtRef 挂到源 DWG 的外部参照列表。
   * 前端 useExternalReferenceUpload 按请求 ret 判定每文件成败，并经 checkMissingReferences
   * 轮询预加载数据，故此处保持同步——请求返回即代表外部参照已就位。
   */
  private async ingestExternalRefDwg(args: {
    filePath: string;
    fileHash: string;
    name: string;
    size: number;
    srcDwgNodeId: string;
    context: FileSystemNodeContext;
    uploadPath: string;
    source: Extract<IngestSource, { kind: 'file' }>;
  }): Promise<IngestResult> {
    const {
      filePath,
      fileHash: hash,
      name,
      size,
      srcDwgNodeId,
      context,
      uploadPath,
      source,
    } = args;
    let isOk: boolean;
    let ret: { tz?: boolean } | undefined;
    try {
      await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
      const result = await this.fileConversionService.convertFile({
        srcPath: filePath,
        fileHash: hash,
        createPreloadingData: true,
      });
      isOk = result.isOk;
      ret = result.ret;
    } catch (error) {
      await this.releaseConversionReservation(context, source);
      throw error;
    }

    if (isOk) {
      this.logger.log(
        `[DrawingIngest.ingest] 外部参照 DWG 文件上传，跳过创建节点和存储分配: ${name}`
      );
      const convertedFilePath = path.join(
        uploadPath,
        this.uploadUtilityService.getConvertedFileName(hash, name)
      );
      await this.materializer.handleExtRef({
        srcDwgNodeId,
        name,
        fileHash: hash,
        sourcePath: convertedFilePath,
      });
      return { ret: MxUploadReturn.kOk, tz: ret?.tz, created: false };
    }

    await this.releaseConversionReservation(context, source);
    return { ret: MxUploadReturn.kConvertFileError };
  }

  /**
   * 后台 CAD 转换（#433 异步化）：fire-and-forget，不阻塞上传请求。
   *
   * 转换 + 落盘（finalize）+ 外部参照 + 状态迁移全部在后台完成：
   * - 成功：finalize（置 path）→ COMPLETED；外部参照场景走 handleExtRef。
   * - 失败/异常：回滚转换额度 → FAILED → 保留节点（不硬删）。
   * 前端 waitForFileReady 轮询节点 fileStatus，FAILED 立即失败、COMPLETED 后打开。
   * 任何异常都不向上抛出（后台任务，避免 unhandledRejection）。
   */
  /**
   * 返回后台任务 Promise：调用方（ingestCadFile）fire-and-forget 忽略返回值，
   * 测试可 await 它等待后台转换完成再断言。
   */
  private runBackgroundCadConversion(args: {
    filePath: string;
    fileHash: string;
    name: string;
    size: number;
    context: FileSystemNodeContext;
    target: IngestTarget;
    cadNodeId: string;
    source: Extract<IngestSource, { kind: 'file' }>;
  }): Promise<void> {
    const {
      filePath,
      fileHash: hash,
      name,
      size,
      context,
      target,
      cadNodeId,
      source,
    } = args;
    return (async () => {
      try {
        // S5-2 上传链路统一：注册后台转换任务（写 node.taskId + 确保 PROCESSING），
        // 使上传图纸进面板「云端」列表（node.taskId 非空 = 云端任务）。
        // 转换仍走同步 convertFile（下方）+ finalizeCadNode 落盘，不触发 executor.invoke。
        await this.asyncConversionService.registerTask(cadNodeId);
        await this.fileSystemService.writeStatusFile(name, size, hash, filePath);
        const result = await this.fileConversionService.convertFile({
          srcPath: filePath,
          fileHash: hash,
          createPreloadingData: true,
          debugNodeId: cadNodeId,
        });

        if (result.isOk) {
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
            // 落盘失败：节点置 FAILED（保留节点，不硬删）——用户可在文件列表看到失败节点，
            // 而不是上传结束后什么痕迹都查不到。
            await this.transition(
              cadNodeId,
              FileStatus.PROCESSING,
              FileStatus.FAILED
            );
            this.logger.warn(
              `[DrawingIngest.background] 落盘失败，保留 FAILED 节点: ${cadNodeId}`
            );
            return;
          }
          await this.transition(
            cadNodeId,
            FileStatus.PROCESSING,
            FileStatus.COMPLETED
          );
          this.logger.log(
            `[DrawingIngest.background] 转换完成: ${name} (node ${cadNodeId})`
          );
        } else {
          await this.releaseConversionReservation(context, source);
          await this.transition(
            cadNodeId,
            FileStatus.PROCESSING,
            FileStatus.FAILED
          );
          // 保留 FAILED 节点（不硬删）：FileSystemNode 没有错误信息字段，引擎错误原文
          // 只进后端日志；硬删后用户既看不到失败记录也拿不到失败原因。
          // transient=true = 环境性失败（超时/引擎未启动，可重试）；false = 确定性内容失败。
          this.logger.warn(
            `[DrawingIngest.background] 转换失败，保留 FAILED 节点: ${cadNodeId} ` +
              `（transient=${result.transient ?? 'unknown'}，${
                result.error || '未知错误'
              }）`
          );
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[DrawingIngest.background] 后台转换异常: ${errMsg}`,
          error instanceof Error ? error.stack : undefined
        );
        try {
          await this.releaseConversionReservation(context, source);
          await this.transition(
            cadNodeId,
            FileStatus.PROCESSING,
            FileStatus.FAILED
          );
        } catch (cleanupErr) {
          this.logger.error(
            `[DrawingIngest.background] 失败清理异常: ${
              cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
            }`
          );
        }
      }
    })();
  }

  /**
   * 后台分片合并转换（#433 异步化）：fire-and-forget，不阻塞合并请求。
   *
   * 转换 + 落盘（materialize）+ 外部参照 + 临时目录/缓存清理 + 状态迁移全部在后台完成：
   * - 成功：materialize（置 path）→ COMPLETED；外部参照场景走 materialize 的 extRef。
   * - 失败/异常：回滚转换额度 → FAILED → 保留节点（不硬删）→ 清理临时目录/缓存。
   * 前端 waitForFileReady 轮询节点 fileStatus，FAILED 立即失败、COMPLETED 后打开。
   * 任何异常都不向上抛出（后台任务，避免 unhandledRejection）。
   *
   * 返回后台任务 Promise：调用方（ingestChunks）fire-and-forget 忽略返回值，
   * 测试可 await 它等待后台转换完成再断言。
   */
  private runBackgroundChunkConversion(args: {
    filepath: string;
    fileMd5: string;
    fileName: string;
    fileExtName: string;
    fileSize: number;
    context: FileSystemNodeContext;
    target: IngestTarget;
    newNodeId: string;
    tmpDir: string;
    mergeKey: string;
    conversionReserved: boolean;
    source: Extract<IngestSource, { kind: 'chunks' }>;
  }): Promise<void> {
    const {
      filepath,
      fileMd5,
      fileName,
      fileExtName,
      fileSize,
      context,
      target,
      newNodeId,
      tmpDir,
      mergeKey,
      conversionReserved,
      source,
    } = args;
    const extension = path.extname(fileName).toLowerCase();
    const isMxwebFile = extension === '.mxweb';

    return (async () => {
      try {
        // Step 2: 格式转换（.mxweb 文件无需转换）
        let isOk = true;
        let convertResult: ConversionResult | undefined;
        if (!isMxwebFile) {
          convertResult = await this.fileConversionService.convertFile({
            srcPath: filepath,
            fileHash: fileMd5,
            createPreloadingData: true,
            debugNodeId: newNodeId,
          });
          isOk = convertResult.isOk;
        } else {
          this.logger.log(
            `[DrawingIngest.chunks-bg] .mxweb 文件，跳过转换: ${fileName}`
          );
        }

        if (!isOk) {
          if (conversionReserved) {
            await this.releaseConversionReservation(context, source);
          }
          await this.transition(
            newNodeId,
            FileStatus.PROCESSING,
            FileStatus.FAILED
          );
          // 保留 FAILED 节点（不硬删），与后台单文件上传一致：
          // transient=true = 环境性失败（可重试）；false = 确定性内容失败。
          this.logger.warn(
            `[DrawingIngest.chunks-bg] 转换失败，保留 FAILED 节点: ${newNodeId} ` +
              `（transient=${convertResult?.transient ?? 'unknown'}，${
                convertResult?.error || '未知错误'
              }）`
          );
          await this.fileSystemService.deleteDirectory(tmpDir);
          await this.cacheManager.delete('file-upload', mergeKey);
          return;
        }

        await this.transition(
          newNodeId,
          FileStatus.PROCESSING,
          FileStatus.COMPLETED
        );

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
          isCadFile: extension === '.dwg' || extension === '.dxf',
          extRef: context.srcDwgNodeId
            ? {
                srcDwgNodeId: context.srcDwgNodeId,
                sourcePath: filepath,
              }
            : undefined,
        });
        if (!result) {
          // 落盘失败：释放占位 + 删除节点 + 清理临时目录/缓存
          if (conversionReserved) {
            await this.releaseConversionReservation(context, source);
          }
          await this.nodeTrashService.deleteNode(newNodeId, true);
          await this.fileSystemService.deleteDirectory(tmpDir);
          await this.cacheManager.delete('file-upload', mergeKey);
          this.logger.log(
            `[DrawingIngest.chunks-bg] 落盘失败，已删除节点: ${newNodeId}`
          );
          return;
        }

        await this.fileSystemService.deleteDirectory(tmpDir);
        await this.cacheManager.delete('file-upload', mergeKey);
        this.logger.log(
          `[DrawingIngest.chunks-bg] 转换完成: ${fileName} (node ${newNodeId})`
        );
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[DrawingIngest.chunks-bg] 后台转换异常: ${errMsg}`,
          error instanceof Error ? error.stack : undefined
        );
        try {
          if (conversionReserved) {
            await this.releaseConversionReservation(context, source);
          }
          // 保留 FAILED 节点（不硬删）。节点若已 COMPLETED（materialize 前已迁移），
          // PROCESSING→FAILED 非法会抛异常——不阻断下方临时目录/缓存清理。
          try {
            await this.transition(
              newNodeId,
              FileStatus.PROCESSING,
              FileStatus.FAILED
            );
          } catch (transitionErr) {
            this.logger.warn(
              `[DrawingIngest.chunks-bg] 状态迁移跳过: ${newNodeId} ` +
                `(${
                  transitionErr instanceof Error
                    ? transitionErr.message
                    : String(transitionErr)
                })`
            );
          }
          await this.fileSystemService.deleteDirectory(tmpDir);
          await this.cacheManager.delete('file-upload', mergeKey);
        } catch (cleanupErr) {
          this.logger.error(
            `[DrawingIngest.chunks-bg] 失败清理异常: ${
              cleanupErr instanceof Error
                ? cleanupErr.message
                : String(cleanupErr)
            }`
          );
        }
      }
    })();
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

        // 异步转换（#433）：fire-and-forget，节点保持 PROCESSING，后台转换 + 落盘 + 状态迁移。
        // 合并请求立即返回（ret=kOk + nodeId），前端轮询节点状态（waitForFileReady）直到 COMPLETED，
        // 用户不阻塞在合并请求上，「文件转换中」由前端轮询呈现。
        if (newNodeId) {
          this.runBackgroundChunkConversion({
            filepath,
            fileMd5,
            fileName,
            fileExtName,
            fileSize,
            context,
            target,
            newNodeId,
            tmpDir,
            mergeKey,
            conversionReserved,
            source,
          });
          return {
            ret: MxUploadReturn.kOk,
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
