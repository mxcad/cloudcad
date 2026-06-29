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

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemService as MainFileSystemService } from '../../file-system/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as crypto from 'crypto';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../version-control/interfaces/version-control.interface';
import { DatabaseService } from '../../database/database.service';
import { AppConfig } from '../../config/app.config';

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
    private readonly fileSystemServiceMain: MainFileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager,
    private readonly permissionService: FileSystemPermissionService,
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
    private readonly prisma: DatabaseService
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
        return { success: false, message: '缺少文件' };
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.mxweb') {
        return {
          success: false,
          message: `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`,
        };
      }

      const parentNode =
        await this.fileSystemServiceMain.getNode(targetParentId);
      if (!parentNode) {
        return { success: false, message: '目标文件夹不存在' };
      }

      if (!parentNode.isFolder) {
        return { success: false, message: '目标必须是文件夹' };
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

      const newNode = await this.fileSystemServiceMain.createFileNode({
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
      await this.fileSystemServiceMain.updateNodePath(newNodeId, nodePathWithFile);
      await this.prisma.fileSystemNode.update({
        where: { id: newNodeId },
        data: { size: stats.size, fileHash },
      });
      this.logger.log(`[SaveAs] 文件保存成功: nodeId=${newNodeId}, fileHash=${fileHash}`);

      // MX 提交需要使用绝对路径
      // nodeDirectory 已经是绝对路径（如 D:\...\filesData\202604\nodeId）

      // 只对项目和个人空间文件进行 MX 提交，跳过图纸库和图块库
      if (targetType === 'project' && projectId) {
        try {
          // MX 只提交 nodeId.mxweb 初始备份（灾难恢复用），不提交工作文件
          await this.versionControlService.commitFiles(
            [backupPath],
            commitMessage || `Save as: ${finalFileName}`,
          );
          this.logger.log(`[SaveAs] 项目文件 MX 提交成功`);
        } catch (mxError) {
          this.logger.warn(`[SaveAs] MX 提交失败: ${mxError.message}`);
        }
      } else if (targetType === 'personal') {
        try {
          // MX 只提交 nodeId.mxweb 初始备份（灾难恢复用），不提交工作文件
          await this.versionControlService.commitFiles(
            [backupPath],
            commitMessage || `Save as: ${finalFileName}`,
          );
          this.logger.log(`[SaveAs] 个人空间文件 MX 提交成功`);
        } catch (mxError) {
          this.logger.warn(`[SaveAs] MX 提交失败: ${mxError.message}`);
        }
      } else {
        // 跳过图纸库和图块库的 MX 提交
        this.logger.log(
          `[SaveAs] 跳过 MX 提交: ${finalFileName} (图纸库/图块库文件)`
        );
      }

      try {
        await fsPromises.unlink(file.path);
      } catch (e) {
        this.logger.warn(`[SaveAs] 删除临时文件失败: ${e.message}`);
      }

      return {
        success: true,
        message: '保存成功',
        nodeId: newNodeId,
        fileName: finalFileName,
        path: storageInfo.nodeDirectoryRelativePath,
        projectId,
        parentId: targetParentId,
      };
    } catch (error) {
      this.logger.error(`[SaveAs] 保存失败: ${error.message}`, error.stack);
      return { success: false, message: error.message };
    }
  }

  /**
   * 通过文件 hash 另存为（分片上传模式下使用）
   */
  async saveMxwebAsByHash(options: SaveMxwebAsByHashOptions): Promise<SaveMxwebAsResult> {
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
      const uploadPath = this.configService.get('mxcadUploadPath', { infer: true })
        || path.join(process.cwd(), 'uploads');
      const files = await fsPromises.readdir(uploadPath);
      const mxwebFile = files.find(
        (f) => f.startsWith(fileHash) && f.endsWith('.mxweb')
      );
      if (!mxwebFile) {
        return { success: false, message: `上传文件不存在: ${fileHash}` };
      }

      const mxwebSourcePath = path.join(uploadPath, mxwebFile);

      const parentNode = await this.fileSystemServiceMain.getNode(targetParentId);
      if (!parentNode) {
        return { success: false, message: '目标文件夹不存在' };
      }

      if (!parentNode.isFolder) {
        return { success: false, message: '目标必须是文件夹' };
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

      const newNode = await this.fileSystemServiceMain.createFileNode({
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
      this.logger.log(`[SaveAsByHash] 新节点创建成功: ${newNodeId}, 文件名: ${finalFileName}`);

      const storageInfo = await this.storageManager.allocateNodeStorage(newNodeId);
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
      await this.fileSystemServiceMain.updateNodePath(newNodeId, nodePathWithFile);
      await this.prisma.fileSystemNode.update({
        where: { id: newNodeId },
        data: { size: stats.size, fileHash: newFileHash },
      });
      this.logger.log(`[SaveAsByHash] 文件保存成功: nodeId=${newNodeId}, fileHash=${newFileHash}`);

      // MX 提交
      if (targetType === 'project' && projectId) {
        try {
          await this.versionControlService.commitFiles(
            [backupPath],
            commitMessage || `Save as: ${finalFileName}`,
          );
          this.logger.log(`[SaveAsByHash] 项目文件 MX 提交成功`);
        } catch (mxError) {
          this.logger.warn(`[SaveAsByHash] MX 提交失败: ${mxError.message}`);
        }
      } else if (targetType === 'personal') {
        try {
          await this.versionControlService.commitFiles(
            [backupPath],
            commitMessage || `Save as: ${finalFileName}`,
          );
          this.logger.log(`[SaveAsByHash] 个人空间文件 MX 提交成功`);
        } catch (mxError) {
          this.logger.warn(`[SaveAsByHash] MX 提交失败: ${mxError.message}`);
        }
      } else {
        this.logger.log(`[SaveAsByHash] 跳过 MX 提交: ${finalFileName} (图纸库/图块库文件)`);
      }

      return {
        success: true,
        message: '保存成功',
        nodeId: newNodeId,
        fileName: finalFileName,
        path: storageInfo.nodeDirectoryRelativePath,
        projectId,
        parentId: targetParentId,
      };
    } catch (error) {
      this.logger.error(`[SaveAsByHash] 保存失败: ${error.message}`, error.stack);
      return { success: false, message: error.message };
    }
  }

  private generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      const childrenResult =
        await this.fileSystemServiceMain.getChildren(parentId);
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
