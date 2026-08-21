///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import {
  FileSystemNodeService,
  FileSystemNodeContext,
} from '../node/filesystem-node.service';
import {
  StorageManager,
  NodeStorageInfo,
} from '../../storage-management/services/storage-manager.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { ThumbnailGenerationService } from '../infra/thumbnail-generation.service';
import { getThumbnailFileName } from '../infra/thumbnail-utils';
import { I_EXTERNAL_REF_FACADE } from '../external-ref/interfaces/ext-ref-facade.interface';
import type { IExternalRefFacade } from '../external-ref/interfaces/ext-ref-facade.interface';
import { copyFileOrDir } from './copy-file-or-dir';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

/**
 * 落盘来源：单文件直拷（mxweb / 非 CAD）与转换产物多拷贝（CAD / 秒传）的判别联合
 */
export type MaterializeSource =
  | {
      kind: 'single';
      /** 源文件路径（上传临时文件） */
      path: string;
      /** 双写初始备份 {nodeId}.mxweb（mxweb 直传场景，灾难恢复锚点） */
      writeBackup?: boolean;
    }
  | {
      kind: 'artifacts';
      /** uploads 目录（转换产物缓存目录），默认 process.cwd()/uploads */
      uploadPath?: string;
      /** 源扩展名（无点小写，如 'dwg'），用于扫描 hash 前缀产物与缩略图缓存 */
      suffix: string;
      /** 原始上传文件路径：存在时落盘 {nodeId}{ext} 灾难恢复备份（CAD 转换成功路径） */
      originalFilePath?: string;
    };

/**
 * 外部参照回调参数（FileNodeMaterializer 边界内）
 */
export interface MaterializeExtRef {
  /** 存在时执行 handleExternalReferenceFile/Image 回调 */
  srcDwgNodeId?: string;
  isImage?: boolean;
  /** handleExternalReferenceImage 需要（其内部含配额断言） */
  context?: FileSystemNodeContext;
  /** 回调源文件路径：默认 single 变体的 path；artifacts 由调用点指定（合并文件/转换产物） */
  sourcePath?: string;
  /** 上传完成后更新外部参照信息（CAD 转换成功路径，失败不影响主流程） */
  updateAfterUploadNodeId?: string;
}

/**
 * 落盘输入：从输入文件到落盘完成所需的最小参数集
 */
export interface MaterializeInput {
  /** 父容器 ID（节点未建时必填；existingNodeId 模式可省） */
  parentId?: string;
  ownerId: string;
  name: string;
  fileHash: string;
  size: number;
  /** 节点已由编排层创建（状态机前置 UPLOADING→PROCESSING），落盘时复用不新建 */
  existingNodeId?: string;
  source: MaterializeSource;
  /** CAD 文件（dwg/dxf）自动生成缩略图 */
  isCadFile?: boolean;
  extRef?: MaterializeExtRef;
}

export interface MaterializeResult {
  nodeId: string;
}

/**
 * 节点落盘深 module（FileNodeMaterializer）
 *
 * 「输入文件 → 落盘完成的 FileSystemNode」的统一实现（issue #226）：
 * 收敛 DrawingIngestService 6 处平行落盘编排（建节点 / 分配存储 / 源文件三变体 /
 * 缩略图 / 原始备份 / ext-ref 回调 / resolveParentId），失败语义统一为
 * 返回 null（父容器不存在与内部异常），由编排层（DrawingIngestService）统一
 * 映射为 kConvertFileError。配额检查与冲突策略不在本 module 边界内。
 */
@Injectable()
export class FileNodeMaterializer {
  private readonly logger = new Logger(FileNodeMaterializer.name);

  constructor(
    private readonly fileTreeService: FileTreeService,
    private readonly storageManager: StorageManager,
    @Inject(IStorageService) private readonly storageService: IStorageService,
    private readonly thumbnailGenerationService: ThumbnailGenerationService,
    @Inject(I_EXTERNAL_REF_FACADE)
    private readonly externalRefFacade: IExternalRefFacade,
    private readonly fileSystemNodeService: FileSystemNodeService
  ) {}

  /**
   * 解析父节点 ID：父容器（项目/文件夹/个人空间/资源库）直接使用，FILE 则取其父级
   */
  async resolveParentId(nodeId: string): Promise<string | null> {
    const parentNode = await this.fileTreeService.getNode(nodeId);
    if (!parentNode) return null;
    return parentNode.nodeType !== NodeType.FILE
      ? parentNode.id
      : parentNode.parentId;
  }

  /** 文件扩展名 → MIME 类型（建节点用，随节点创建归属本 module） */
  getMimeType(extension: string): string {
    return this.fileSystemNodeService.getMimeType(extension);
  }

  /**
   * 落盘编排：建节点（或复用已有节点）→ 分配存储 → 源文件落盘 → 缩略图 →
   * 原始备份 → ext-ref 回调。任何内部失败（含父容器不存在）返回 null。
   */
  async materialize(
    input: MaterializeInput
  ): Promise<MaterializeResult | null> {
    const { parentId, ownerId, name, fileHash, size, source, isCadFile, extRef } =
      input;
    try {
      let nodeId: string;
      if (input.existingNodeId) {
        nodeId = input.existingNodeId;
        this.logger.log(`[FileNodeMaterializer] 使用已有节点: ${nodeId}`);
      } else {
        if (!parentId) {
          this.logger.error(
            `[FileNodeMaterializer] 缺少父容器 ID，无法建节点: ${name}`
          );
          return null;
        }
        const newNode = await this.createFileNode(
          name,
          fileHash,
          size,
          parentId,
          ownerId
        );
        nodeId = newNode.id;
        this.logger.log(`[FileNodeMaterializer] 节点创建成功: ${nodeId}`);
      }

      const storageInfo =
        source.kind === 'single'
          ? await this.allocateSingleFile(nodeId, name, source)
          : await this.allocateArtifacts(nodeId, name, fileHash, source);

      // CAD 文件自动生成缩略图（仅 artifacts 场景存在转换产物缓存）
      if (source.kind === 'artifacts' && isCadFile) {
        await this.handleThumbnail(
          fileHash,
          source.suffix,
          nodeId,
          storageInfo,
          source.uploadPath
        );
      }

      // 原始上传文件备份（如 {nodeId}.dwg），MX 只提交此文件用于灾难恢复
      if (source.kind === 'artifacts' && source.originalFilePath) {
        await this.writeOriginalBackup(
          nodeId,
          name,
          source.originalFilePath,
          storageInfo
        );
      }

      // ext-ref 回调（handleExternalReferenceFile/Image、updateAfterUpload）
      if (extRef) {
        if (extRef.srcDwgNodeId) {
          await this.handleExtRefCallback(fileHash, name, extRef, source);
        }
        if (extRef.updateAfterUploadNodeId) {
          try {
            await this.externalRefFacade.updateAfterUpload(
              extRef.updateAfterUploadNodeId
            );
          } catch (extRefError) {
            this.logger.warn(
              `[FileNodeMaterializer] 外部参照信息更新失败: ${extRefError.message}`
            );
          }
        }
      }

      return { nodeId };
    } catch (error) {
      this.logger.error(
        `[FileNodeMaterializer] 落盘失败 (${name}, hash=${fileHash}): ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  /**
   * 纯外部参照回调（不建节点不落盘）：秒传外部参照、CAD 转换成功的外部参照 DWG。
   * 失败不冒泡（ext-ref 失败不影响上传结果，保持 ingest 原语义）。
   */
  async handleExtRef(input: {
    srcDwgNodeId: string;
    isImage?: boolean;
    name: string;
    fileHash: string;
    sourcePath: string;
    context?: FileSystemNodeContext;
  }): Promise<void> {
    try {
      if (input.isImage && input.context) {
        await this.externalRefFacade.handleExternalReferenceImage(
          input.fileHash,
          input.srcDwgNodeId,
          input.name,
          input.sourcePath,
          input.context
        );
      } else {
        await this.externalRefFacade.handleExternalReferenceFile(
          input.fileHash,
          input.srcDwgNodeId,
          input.name,
          input.sourcePath
        );
      }
    } catch (error) {
      this.logger.error(
        `[FileNodeMaterializer] 外部参照文件拷贝失败: ${error.message}`
      );
    }
  }

  private async createFileNode(
    name: string,
    fileHash: string,
    size: number,
    parentId: string,
    ownerId: string
  ): Promise<{ id: string }> {
    const extension = path.extname(name).toLowerCase();
    const mimeType = this.fileSystemNodeService.getMimeType(extension);
    return this.fileTreeService.createFileNode({
      name,
      fileHash,
      size,
      mimeType,
      extension,
      parentId,
      ownerId,
      skipFileCopy: true,
    });
  }

  /**
   * 单文件直拷：写主文件并更新节点路径；writeBackup 时工作文件命名
   * {nodeId}.mxweb.mxweb（与 save-as 格式统一，DB path 指向它）并双写
   * {nodeId}.mxweb 初始备份（MX 只提交此文件，用于灾难恢复）。
   */
  private async allocateSingleFile(
    nodeId: string,
    name: string,
    source: Extract<MaterializeSource, { kind: 'single' }>
  ): Promise<NodeStorageInfo> {
    const workFileName = source.writeBackup ? `${nodeId}.mxweb.mxweb` : name;
    const storageInfo = await this.storageManager.allocateNodeStorage(
      nodeId,
      workFileName
    );
    const mainRelativePath = storageInfo.fileRelativePath;
    if (!mainRelativePath) {
      throw new Error(`节点 ${nodeId} 未分配文件相对路径`);
    }

    await this.storageService.copyFromFs(source.path, mainRelativePath);
    await this.fileTreeService.updateNodePath(nodeId, mainRelativePath);

    if (source.writeBackup) {
      const backupFileName = `${nodeId}.mxweb`;
      const backupRelativePath = `${storageInfo.nodeDirectoryRelativePath}/${backupFileName}`;
      await this.storageService.copyFromFs(source.path, backupRelativePath);
      this.logger.log(
        `[FileNodeMaterializer] 初始备份保存成功: ${backupRelativePath}`
      );
    }
    return storageInfo;
  }

  /**
   * 转换产物落盘：分配存储后扫描 uploads 目录中 hash 前缀命名的产物，
   * 复制到节点目录并更新节点路径。
   */
  private async allocateArtifacts(
    nodeId: string,
    name: string,
    fileHash: string,
    source: Extract<MaterializeSource, { kind: 'artifacts' }>
  ): Promise<NodeStorageInfo> {
    const storageInfo = await this.storageManager.allocateNodeStorage(
      nodeId,
      name
    );
    const extension = `.${source.suffix}`.toLowerCase();
    await this.copyMatchingFiles(
      fileHash,
      nodeId,
      storageInfo,
      extension,
      source.uploadPath
    );
    return storageInfo;
  }

  /**
   * 扫描 uploads 目录中以 hash 前缀命名的转换产物，复制到节点目录并更新节点路径。
   * 返回命中的 mxweb 文件名（无则空串）。
   */
  private async copyMatchingFiles(
    fileHash: string,
    nodeId: string,
    storageInfo: NodeStorageInfo,
    extension: string,
    uploadPath?: string
  ): Promise<string> {
    const resolvedUploadPath = uploadPath || path.join(process.cwd(), 'uploads');
    const files = await fsPromises.readdir(resolvedUploadPath);
    const matchingFiles = files.filter((file) => file.startsWith(fileHash));

    let mxwebFileName = '';
    if (matchingFiles.length > 0) {
      const nodeDirectory = storageInfo.nodeDirectoryPath;
      for (const file of matchingFiles) {
        const sourcePath = path.join(resolvedUploadPath, file);
        const targetFileName = file.replace(fileHash, nodeId);
        const targetPath = path.join(nodeDirectory, targetFileName);
        await copyFileOrDir(sourcePath, targetPath, {
          fileHash,
          newNodeId: nodeId,
        });
        if (targetFileName.endsWith('.mxweb')) {
          mxwebFileName = targetFileName;
        }
      }

      const nodePathWithFile = mxwebFileName
        ? `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`
        : `${storageInfo.nodeDirectoryRelativePath}/${nodeId}${extension}.mxweb`;
      await this.fileTreeService.updateNodePath(nodeId, nodePathWithFile);
    }
    return mxwebFileName;
  }

  /**
   * CAD 缩略图处理：优先拷贝缓存 {hash}.{suffix}.jpg，否则生成并缓存
   */
  private async handleThumbnail(
    fileHash: string,
    suffix: string,
    nodeId: string,
    storageInfo: NodeStorageInfo,
    uploadPath?: string
  ): Promise<void> {
    const resolvedUploadPath = uploadPath || path.join(process.cwd(), 'uploads');
    try {
      const thumbnailCachePath = path.join(
        resolvedUploadPath,
        `${fileHash}.${suffix}.jpg`
      );
      // MxWebDwg2Jpg 输出的是 jpg，目标文件名必须用 .jpg，
      // 否则内容与扩展名/Content-Type 不符（webp）导致浏览器解码失败
      const thumbnailFileName = getThumbnailFileName('jpg');
      const thumbnailTargetPath = path.join(
        storageInfo.nodeDirectoryPath,
        thumbnailFileName
      );
      const thumbnailRelativeKey = `${storageInfo.nodeDirectoryRelativePath}/${thumbnailFileName}`;

      const thumbnailExists = await fsPromises
        .access(thumbnailCachePath)
        .then(() => true)
        .catch(() => false);

      if (thumbnailExists) {
        await this.storageService.copyFromFs(
          thumbnailCachePath,
          thumbnailRelativeKey
        );
        this.logger.log(`[FileNodeMaterializer] 拷贝缩略图: ${nodeId}`);
      } else if (this.thumbnailGenerationService.isEnabled()) {
        const cadFilePath = path.join(
          resolvedUploadPath,
          `${fileHash}.${suffix}`
        );
        const cacheFileName = `${fileHash}.${suffix}.jpg`;
        const result = await this.thumbnailGenerationService.generateThumbnail(
          cadFilePath,
          resolvedUploadPath,
          nodeId,
          cacheFileName
        );
        if (result.success) {
          await this.storageService.copyFromFs(
            thumbnailCachePath,
            thumbnailRelativeKey
          );
          this.logger.log(
            `[FileNodeMaterializer] 缩略图生成成功: ${thumbnailRelativeKey}`
          );
        } else {
          this.logger.warn(
            `[FileNodeMaterializer] 缩略图生成失败: ${result.error}`
          );
        }
      }
    } catch (thumbnailError) {
      this.logger.warn(
        `[FileNodeMaterializer] 缩略图处理异常: ${thumbnailError.message}`
      );
    }
  }

  /**
   * 保存原始上传文件作为灾难恢复备份（如 {nodeId}.dwg），MX 只提交此文件
   */
  private async writeOriginalBackup(
    nodeId: string,
    originalName: string,
    originalFilePath: string,
    storageInfo: NodeStorageInfo
  ): Promise<void> {
    const originalExt = path.extname(originalName).toLowerCase();
    if (
      await fsPromises
        .access(originalFilePath)
        .then(() => true)
        .catch(() => false)
    ) {
      const originalBackupPath = path.join(
        storageInfo.nodeDirectoryPath,
        `${nodeId}${originalExt}`
      );
      await fsPromises.copyFile(originalFilePath, originalBackupPath);
      this.logger.log(
        `[FileNodeMaterializer] 原始备份保存成功: ${originalBackupPath}`
      );
    }
  }

  /**
   * materialize 流程内的 ext-ref 回调（handleExternalReferenceFile/Image）。
   * 失败向上冒泡 → 由 materialize 统一映射为 null（kConvertFileError）。
   */
  private async handleExtRefCallback(
    fileHash: string,
    name: string,
    extRef: MaterializeExtRef,
    source: MaterializeSource
  ): Promise<void> {
    const sourcePath =
      extRef.sourcePath ?? (source.kind === 'single' ? source.path : undefined);
    if (!sourcePath) {
      this.logger.warn(
        `[FileNodeMaterializer] ext-ref 回调缺少源文件路径: ${name}`
      );
      return;
    }
    if (extRef.isImage && extRef.context) {
      await this.externalRefFacade.handleExternalReferenceImage(
        fileHash,
        extRef.srcDwgNodeId,
        name,
        sourcePath,
        extRef.context
      );
    } else {
      await this.externalRefFacade.handleExternalReferenceFile(
        fileHash,
        extRef.srcDwgNodeId,
        name,
        sourcePath
      );
    }
  }
}
