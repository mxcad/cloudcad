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

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import {
  I_EXTERNAL_REF_FACADE,
  IExternalRefFacade,
  WritePreloadingData,
} from '../external-ref/interfaces/ext-ref-facade.interface';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as crypto from 'crypto';
import { NodeType } from '@cloudcad/db';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../version-control/interfaces/version-control.interface';
import { DatabaseService } from '../../database/database.service';
import { AppConfig } from '../../config/app.config';

import { I18nContext } from 'nestjs-i18n';
import { QuotaExceededException } from '../../vip/errors/quota-exceeded.error';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
export interface SaveMxwebAsOptions {
  file: Express.Multer.File;
  targetType: 'personal' | 'project' | 'library';
  targetParentId: string;
  projectId: string | undefined;
  format: 'dwg' | 'dxf' | 'mxweb';
  userId: string;
  userName: string;
  commitMessage?: string;
  fileName?: string;
  libraryType?: 'drawing' | 'block';
  sourceNodeId?: string;
  sourceFileHash?: string;
}

export interface SaveMxwebAsByHashOptions {
  fileHash: string;
  targetType: 'personal' | 'project' | 'library';
  targetParentId: string;
  projectId: string | undefined;
  format: 'dwg' | 'dxf' | 'mxweb';
  userId: string;
  userName: string;
  commitMessage?: string;
  fileName?: string;
  libraryType?: 'drawing' | 'block';
  sourceNodeId?: string;
  sourceFileHash?: string;
}

export interface SaveMxwebAsResult {
  success: boolean;
  message: string;
  nodeId?: string;
  fileName?: string;
  path?: string;
  projectId?: string;
  parentId?: string;
}

@Injectable()
export class SaveAsService {
  private readonly logger = new Logger(SaveAsService.name);
  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileTreeService: FileTreeService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager,
    private readonly permissionService: FileSystemPermissionService,
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
    private readonly prisma: DatabaseService,
    @Inject(I_EXTERNAL_REF_FACADE)
    private readonly externalRefFacade: IExternalRefFacade,
    private readonly nodeMutationGuard: NodeMutationGuard
  ) {}

  async saveMxwebAs(options: SaveMxwebAsOptions): Promise<SaveMxwebAsResult> {
    const {
      file,
      targetType,
      targetParentId,
      projectId,
      format: userFormat,
      userId,
      userName,
      commitMessage,
      fileName: userFileName,
    } = options;

    const format = targetType === 'library' ? 'mxweb' : userFormat;

    try {
      this.logger.log(
        `[SaveAs] 开始保存: targetType=${targetType}, parentId=${targetParentId}, format=${format}`
      );

      if (!file || !file.path) {
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.file.missing_file') ?? '缺少文件',
        };
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.mxweb') {
        return {
          success: false,
          message: `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`,
        };
      }

      const parentNode = await this.fileTreeService.getNode(targetParentId);
      if (!parentNode) {
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.mxcad.target_folder_not_found') ??
            '目标文件夹不存在',
        };
      }

      if (userId && file?.size) {
        await this.nodeMutationGuard.assertByteQuota(
          { node: { id: targetParentId }, incrementBytes: file.size },
          userId
        );
      }

      if (parentNode.nodeType === NodeType.FILE) {
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.mxcad.target_must_be_folder') ??
            '目标必须是文件夹',
        };
      }

      // ========== 同名文件处理 ==========
      const baseFileName = userFileName
        ? `${userFileName}.${format}`
        : `untitled.${format}`;

      const uniqueFileName = await this.generateUniqueFileName(
        targetParentId,
        baseFileName
      );

      if (uniqueFileName !== baseFileName) {
        this.logger.log(
          `[SaveAs] 文件名重复，自动重命名: ${baseFileName} -> ${uniqueFileName}`
        );
      }

      const finalFileName = uniqueFileName;
      const extension = `.${format}`;
      const mimeType = this.fileSystemNodeService.getMimeType(extension);

      const newNode = await this.fileTreeService.createFileNode({
        name: finalFileName,
        fileHash: '',
        size: 0,
        mimeType,
        extension,
        parentId: targetParentId,
        ownerId: userId,
        skipFileCopy: true,
      });

      const newNodeId = newNode.id;
      this.logger.log(
        `[SaveAs] 新节点创建成功: ${newNodeId}, 文件名: ${finalFileName}`
      );

      const storageInfo =
        await this.storageManager.allocateNodeStorage(newNodeId);
      const nodeDirectory = storageInfo.nodeDirectoryPath;

      // 统一存储为 mxweb，不做格式转换（转换仅在下载/导出时按需执行）
      const mxwebFileName = `${newNodeId}.${format}.mxweb`;
      const mxwebTargetPath = path.join(nodeDirectory, mxwebFileName);
      await fsPromises.copyFile(file.path, mxwebTargetPath);
      this.logger.log(`[SaveAs] mxweb文件保存成功: ${mxwebTargetPath}`);

      // 同时保存 nodeId.mxweb 作为初始备份（灾难恢复用，MX 只提交此文件）
      const backupFileName = `${newNodeId}.mxweb`;
      const backupPath = path.join(nodeDirectory, backupFileName);
      await fsPromises.copyFile(file.path, backupPath);
      this.logger.log(`[SaveAs] 初始备份保存成功: ${backupPath}`);

      const fileBuffer = await fsPromises.readFile(mxwebTargetPath);
      const hashSum = crypto.createHash('md5');
      hashSum.update(fileBuffer);
      const fileHash = hashSum.digest('hex');
      const stats = fs.statSync(mxwebTargetPath);

      const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`;
      await this.fileTreeService.updateNodePath(newNodeId, nodePathWithFile);
      await this.prisma.fileSystemNode.update({
        where: { id: newNodeId },
        data: { size: stats.size, fileHash },
      });
      this.logger.log(
        `[SaveAs] 文件保存成功: nodeId=${newNodeId}, fileHash=${fileHash}`
      );

      // 复制外部参照 preloading 数据（如有，失败不阻断另存为）
      try {
        await this.copyPreloadingData({
          newNodeId,
          nodeDirectory,
          sourceNodeId: options.sourceNodeId,
          sourceFileHash: options.sourceFileHash,
        });
      } catch (err) {
        this.logger.warn(`[SaveAs] 复制外部参照数据失败: ${err.message}`);
      }

      // 跳过 MX 即时提交：与上传/新建/复制流程一致，
      // 版本历史通过 getFileHistory 在无 SVN 提交时自动注入虚拟 r0（初始版本）
      this.logger.log(`[SaveAs] 跳过 MX 初始提交: ${finalFileName}`);

      try {
        await fsPromises.unlink(file.path);
      } catch (e) {
        this.logger.warn(`[SaveAs] 删除临时文件失败: ${e.message}`);
      }

      return {
        success: true,
        message: I18nContext.current()?.t('success.saved') ?? '保存成功',
        nodeId: newNodeId,
        fileName: finalFileName,
        path: storageInfo.nodeDirectoryRelativePath,
        projectId,
        parentId: targetParentId,
      };
    } catch (error) {
      if (error instanceof QuotaExceededException) {
        throw error;
      }
      this.logger.error(`[SaveAs] 保存失败: ${error.message}`, error.stack);
      return { success: false, message: error.message };
    }
  }

  /**
   * 通过文件 hash 另存为（分片上传模式下使用）
   */
  async saveMxwebAsByHash(
    options: SaveMxwebAsByHashOptions
  ): Promise<SaveMxwebAsResult> {
    const {
      fileHash,
      targetType,
      targetParentId,
      projectId,
      format: userFormat,
      userId,
      userName,
      commitMessage,
      fileName: userFileName,
      libraryType,
    } = options;

    const format = targetType === 'library' ? 'mxweb' : userFormat;

    try {
      this.logger.log(
        `[SaveAsByHash] 开始保存: targetType=${targetType}, parentId=${targetParentId}, hash=${fileHash}`
      );

      // 在 uploads 目录中查找 {hash}.mxweb
      const uploadPath =
        this.configService.get('mxcadUploadPath', { infer: true }) ||
        path.join(process.cwd(), 'uploads');
      const files = await fsPromises.readdir(uploadPath);
      const mxwebFile = files.find(
        (f) => f.startsWith(fileHash) && f.endsWith('.mxweb')
      );
      if (!mxwebFile) {
        return { success: false, message: `上传文件不存在: ${fileHash}` };
      }

      const mxwebSourcePath = path.join(uploadPath, mxwebFile);

      const parentNode = await this.fileTreeService.getNode(targetParentId);
      if (!parentNode) {
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.mxcad.target_folder_not_found') ??
            '目标文件夹不存在',
        };
      }

      if (userId) {
        const stats = await fsPromises.stat(mxwebSourcePath).catch(() => null);
        if (stats?.size) {
          await this.nodeMutationGuard.assertByteQuota(
            { node: { id: targetParentId }, incrementBytes: stats.size },
            userId
          );
        }
      }

      if (parentNode.nodeType === NodeType.FILE) {
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.mxcad.target_must_be_folder') ??
            '目标必须是文件夹',
        };
      }

      // 同名文件处理
      const baseFileName = userFileName
        ? `${userFileName}.${format}`
        : `untitled.${format}`;

      const uniqueFileName = await this.generateUniqueFileName(
        targetParentId,
        baseFileName
      );

      if (uniqueFileName !== baseFileName) {
        this.logger.log(
          `[SaveAsByHash] 文件名重复，自动重命名: ${baseFileName} -> ${uniqueFileName}`
        );
      }

      const finalFileName = uniqueFileName;
      const extension = `.${format}`;
      const mimeType = this.fileSystemNodeService.getMimeType(extension);

      const newNode = await this.fileTreeService.createFileNode({
        name: finalFileName,
        fileHash: '',
        size: 0,
        mimeType,
        extension,
        parentId: targetParentId,
        ownerId: userId,
        skipFileCopy: true,
      });

      const newNodeId = newNode.id;
      this.logger.log(
        `[SaveAsByHash] 新节点创建成功: ${newNodeId}, 文件名: ${finalFileName}`
      );

      const storageInfo =
        await this.storageManager.allocateNodeStorage(newNodeId);
      const nodeDirectory = storageInfo.nodeDirectoryPath;

      const mxwebFileName = `${newNodeId}.${format}.mxweb`;
      const mxwebTargetPath = path.join(nodeDirectory, mxwebFileName);
      await fsPromises.copyFile(mxwebSourcePath, mxwebTargetPath);
      this.logger.log(`[SaveAsByHash] mxweb文件保存成功: ${mxwebTargetPath}`);

      const backupFileName = `${newNodeId}.mxweb`;
      const backupPath = path.join(nodeDirectory, backupFileName);
      await fsPromises.copyFile(mxwebSourcePath, backupPath);
      this.logger.log(`[SaveAsByHash] 初始备份保存成功: ${backupPath}`);

      const fileBuffer = await fsPromises.readFile(mxwebTargetPath);
      const hashSum = crypto.createHash('md5');
      hashSum.update(fileBuffer);
      const newFileHash = hashSum.digest('hex');
      const stats = fs.statSync(mxwebTargetPath);

      const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`;
      await this.fileTreeService.updateNodePath(newNodeId, nodePathWithFile);
      await this.prisma.fileSystemNode.update({
        where: { id: newNodeId },
        data: { size: stats.size, fileHash: newFileHash },
      });
      this.logger.log(
        `[SaveAsByHash] 文件保存成功: nodeId=${newNodeId}, fileHash=${newFileHash}`
      );

      // 复制外部参照 preloading 数据（如有，失败不阻断另存为）
      try {
        await this.copyPreloadingData({
          newNodeId,
          nodeDirectory,
          sourceNodeId: options.sourceNodeId,
          sourceFileHash: options.sourceFileHash,
        });
      } catch (err) {
        this.logger.warn(`[SaveAsByHash] 复制外部参照数据失败: ${err.message}`);
      }

      // 跳过 MX 即时提交：与上传/新建/复制流程一致
      this.logger.log(`[SaveAsByHash] 跳过 MX 初始提交: ${finalFileName}`);

      return {
        success: true,
        message: I18nContext.current()?.t('success.saved') ?? '保存成功',
        nodeId: newNodeId,
        fileName: finalFileName,
        path: storageInfo.nodeDirectoryRelativePath,
        projectId,
        parentId: targetParentId,
      };
    } catch (error) {
      if (error instanceof QuotaExceededException) {
        throw error;
      }
      this.logger.error(
        `[SaveAsByHash] 保存失败: ${error.message}`,
        error.stack
      );
      return { success: false, message: error.message };
    }
  }

  private async copyPreloadingData(params: {
    newNodeId: string;
    nodeDirectory: string;
    sourceNodeId?: string;
    sourceFileHash?: string;
  }): Promise<void> {
    const { newNodeId, nodeDirectory, sourceNodeId, sourceFileHash } = params;
    const preloadingData: WritePreloadingData = {
      tz: false,
      images: [],
      externalReference: [],
      srcFileMd5: undefined,
    };
    let hasData = false;

    // 1) 从 uploads 目录查找（CAD 编辑器公开场景）
    // 路径遍历防护：sourceFileHash 来自客户端（DTO 仅 @IsString，无格式校验），
    // 仅接受十六进制哈希串；含路径分隔符/.. 等一律跳过并告警，防 path.join(uploadPath, …)
    // 与 path.join(nodeDirectory, srcFileMd5)（srcFileMd5 回落 sourceFileHash）逃逸出
    // uploads/nodeDirectory。合法 MD5 为 32 位十六进制，此校验对正常流程是 no-op。
    if (sourceFileHash && /^[a-f0-9]+$/i.test(sourceFileHash)) {
      try {
        const uploadPath =
          this.configService.get('mxcadUploadPath', { infer: true }) ||
          path.join(process.cwd(), 'uploads');
        const preloadingFilePath = path.join(
          uploadPath,
          `${sourceFileHash}.mxweb_preloading.json`
        );
        if (fs.existsSync(preloadingFilePath)) {
          const content = await fsPromises.readFile(
            preloadingFilePath,
            'utf-8'
          );
          const data = JSON.parse(content);
          preloadingData.images = data.images || [];
          preloadingData.externalReference = data.externalReference || [];
          preloadingData.tz = !!data.tz;
          preloadingData.srcFileMd5 = data.src_file_md5 || sourceFileHash;
          hasData = true;

          // 复制 xref 物理文件
          const srcXrefDir = path.join(uploadPath, sourceFileHash);
          if (fs.existsSync(srcXrefDir)) {
            const destXrefDir = path.join(
              nodeDirectory,
              preloadingData.srcFileMd5
            );
            await this.copyDirectoryContents(srcXrefDir, destXrefDir);
          }
          this.logger.log(
            `[copyPreloadingData] 从 uploads 复制 preloading: hash=${sourceFileHash}`
          );
        }
      } catch (err) {
        this.logger.warn(
          `[copyPreloadingData] 从 uploads 复制失败: ${err.message}`
        );
      }
    } else if (sourceFileHash) {
      this.logger.warn(
        `[copyPreloadingData] 非法 sourceFileHash（非十六进制），跳过外部参照复制: ${sourceFileHash}`
      );
    }

    // 2) 从源节点存储查找（文件系统场景）
    if (sourceNodeId) {
      try {
        const sourcePreloading =
          await this.externalRefFacade.readPreloadingData(sourceNodeId);
        if (sourcePreloading) {
          const srcFileMd5 = sourcePreloading.srcFileMd5 || sourceNodeId;
          preloadingData.srcFileMd5 ||= srcFileMd5;
          preloadingData.tz = preloadingData.tz || sourcePreloading.tz;

          // 合并 images 数组（去重）
          const existingImages = new Set(preloadingData.images);
          for (const img of sourcePreloading.images) {
            if (!existingImages.has(img)) {
              preloadingData.images.push(img);
              existingImages.add(img);
            }
          }
          // 合并 externalReference 数组（去重）
          const existingRefs = new Set(preloadingData.externalReference);
          for (const ref of sourcePreloading.externalReference) {
            if (!existingRefs.has(ref)) {
              preloadingData.externalReference.push(ref);
              existingRefs.add(ref);
            }
          }
          hasData = true;

          // 复制 xref 物理文件
          const sourceNode =
            await this.fileSystemNodeService.findById(sourceNodeId);
          if (sourceNode?.path) {
            const fullPath = this.storageManager.getFullPath(sourceNode.path);
            const sourceRootDir = path.dirname(fullPath);
            const srcXrefDir = path.join(sourceRootDir, srcFileMd5);
            if (fs.existsSync(srcXrefDir)) {
              const destXrefDir = path.join(nodeDirectory, srcFileMd5);
              await this.copyDirectoryContents(srcXrefDir, destXrefDir);
            }
          }
          this.logger.log(
            `[copyPreloadingData] 从节点复制 preloading: nodeId=${sourceNodeId}`
          );
        }
      } catch (err) {
        this.logger.warn(`[copyPreloadingData] 从节点复制失败: ${err.message}`);
      }
    }

    // 3) 写入新节点的 preloading.json
    if (hasData) {
      await this.externalRefFacade.writePreloading(newNodeId, preloadingData);
      this.logger.log(
        `[copyPreloadingData] preloading.json 已写入: nodeId=${newNodeId}`
      );
    }
  }

  /**
   * 递归复制目录内容
   */
  private async copyDirectoryContents(
    srcDir: string,
    destDir: string
  ): Promise<void> {
    try {
      if (!fs.existsSync(destDir)) {
        await fsPromises.mkdir(destDir, { recursive: true });
      }
      const entries = await fsPromises.readdir(srcDir);
      for (const entry of entries) {
        const srcPath = path.join(srcDir, entry);
        const destPath = path.join(destDir, entry);
        const stat = await fsPromises.stat(srcPath);
        if (stat.isDirectory()) {
          await this.copyDirectoryContents(srcPath, destPath);
        } else {
          try {
            await fsPromises.copyFile(srcPath, destPath);
          } catch (copyErr) {
            this.logger.warn(
              `[copyDirectoryContents] 复制文件失败: ${srcPath}, ${copyErr.message}`
            );
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `[copyDirectoryContents] 复制目录失败: ${srcDir}, ${err.message}`
      );
    }
  }

  /**
   * 生成唯一的文件名（处理同名文件）
   * 如果文件名已存在，自动添加序号
   * 例如：file.dwg -> file (1).dwg, file (2).dwg, ...
   */
  private async generateUniqueFileName(
    parentId: string,
    baseName: string
  ): Promise<string> {
    try {
      // 获取父节点下的所有子节点
      const childrenResult = await this.fileTreeService.getChildren(parentId);
      const existingNodes = childrenResult.nodes || [];

      // 提取现有文件名
      const existingNames = existingNodes.map((n) => n.name);

      // 如果文件名不重复，直接返回
      if (!existingNames.includes(baseName)) {
        return baseName;
      }

      // 文件名处理：提取名称和扩展名
      const lastDotIndex = baseName.lastIndexOf('.');
      if (lastDotIndex === -1) {
        // 没有扩展名
        return this.generateNumberedFileName(baseName, '', existingNames);
      }

      const nameWithoutExt = baseName.substring(0, lastDotIndex);
      const extension = baseName.substring(lastDotIndex);
      const numberedName = this.generateNumberedFileName(
        nameWithoutExt,
        extension,
        existingNames
      );
      return `${numberedName}${extension}`;
    } catch (error) {
      this.logger.error(
        `[generateUniqueFileName] 生成唯一文件名失败: ${error.message}`,
        error.stack
      );
      // 出错时返回原文件名，让后续逻辑处理
      return baseName;
    }
  }

  /**
   * 生成带序号的文件名
   * 例如：file.dxf -> file (1).dxf, file (2).dxf, ...
   */
  private generateNumberedFileName(
    baseName: string,
    extension: string,
    existingNames: string[]
  ): string {
    // 提取已存在的同名文件序号
    const regex = new RegExp(
      `^${this.escapeRegExp(baseName)}(?: \\((\\d+)\\))?${this.escapeRegExp(extension)}$`
    );

    let maxNumber = 0;
    for (const name of existingNames) {
      const match = name.match(regex);
      if (match) {
        const number = match[1] ? parseInt(match[1], 10) : 0;
        if (number > maxNumber) {
          maxNumber = number;
        }
      }
    }

    // 生成新序号
    const newNumber = maxNumber + 1;
    return `${baseName} (${newNumber})`;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
