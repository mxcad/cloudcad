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

import { Injectable, Logger } from '@nestjs/common';
import { FileSystemService as MainFileSystemService } from '../../file-system/file-system.service';
import { FileSystemNodeService } from './filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as crypto from 'crypto';
import { FileSystemPermissionService } from '../../file-system/file-system-permission.service';
import { VersionControlService } from '../../version-control/version-control.service';
import { DatabaseService } from '../../database/database.service';

export interface SaveMxwebAsOptions {
  file: Express.Multer.File;
  targetType: 'personal' | 'project';
  targetParentId: string;
  projectId: string | undefined;
  format: 'dwg' | 'dxf';
  userId: string;
  userName: string;
  commitMessage?: string;
  fileName?: string;
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
    private readonly fileSystemServiceMain: MainFileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager,
    private readonly fileConversionService: FileConversionService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly versionControlService: VersionControlService,
    private readonly prisma: DatabaseService
  ) {}

  async saveMxwebAs(options: SaveMxwebAsOptions): Promise<SaveMxwebAsResult> {
    const {
      file,
      targetType,
      targetParentId,
      projectId,
      format,
      userId,
      userName,
      commitMessage,
      fileName: userFileName,
    } = options;

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
      // 生成初始文件名
      const baseFileName = userFileName
        ? `${userFileName}.${format}`
        : `untitled.${format}`;

      // 检查同名文件并生成唯一文件名
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

      // 不传入文件名，让 relativePath 返回目录路径，后续拼接 mxweb 文件名
      const storageInfo = await this.storageManager.allocateNodeStorage(
        newNodeId
      );
      const nodeDirectory = storageInfo.nodeDirectoryPath;

      const mxwebFileName = `${newNodeId}.${format}.mxweb`;
      const mxwebTargetPath = path.join(nodeDirectory, mxwebFileName);
      await fsPromises.copyFile(file.path, mxwebTargetPath);
      this.logger.log(`[SaveAs] mxweb文件保存成功: ${mxwebTargetPath}`);

      const convertedFileName = `${newNodeId}.${format}`;
      const convertedTargetPath = path.join(nodeDirectory, convertedFileName);

      const { isOk, ret } = await this.fileConversionService.convertFile({
        srcPath: mxwebTargetPath,
        fileHash: '',
        createPreloadingData: true,
        outname: convertedFileName,
      });

      const code = ret.code as number | string;
      const isSuccess = isOk && (code === 0 || code === '0' || code === 'ok');

      if (!isSuccess) {
        this.logger.error(
          `[SaveAs] 文件转换失败: ${ret?.message || '未知错误'}, code=${code}`
        );
        return { success: false, message: ret?.message || '文件转换失败' };
      }

      this.logger.log(`[SaveAs] 文件转换成功: ${convertedTargetPath}`);

      // 计算转换后文件的 MD5 hash
      const fileBuffer = await fsPromises.readFile(convertedTargetPath);
      const hashSum = crypto.createHash('md5');
      hashSum.update(fileBuffer);
      const fileHash = hashSum.digest('hex');

      const node = await this.fileSystemNodeService.findById(newNodeId);
      if (node) {
        const stats = fs.statSync(convertedTargetPath);
        // path 应指向 mxweb 文件，而不是目录或 dwg 文件
        const nodePathWithFile = `${storageInfo.nodeDirectoryRelativePath}/${mxwebFileName}`;
        await this.fileSystemServiceMain.updateNodePath(
          newNodeId,
          nodePathWithFile
        );
        await this.prisma.fileSystemNode.update({
          where: { id: newNodeId },
          data: {
            size: stats.size,
            fileHash: fileHash,
          },
        });
        this.logger.log(
          `[SaveAs] 节点更新成功: nodeId=${newNodeId}, fileHash=${fileHash}`
        );
      }

      // SVN 提交需要使用绝对路径
      // nodeDirectory 已经是绝对路径（如 D:\...\filesData\202604\nodeId）

      // 只对项目和个人空间文件进行 SVN 提交，跳过图纸库和图块库
      if (targetType === 'project' && projectId) {
        try {
          await this.versionControlService.commitNodeDirectory(
            nodeDirectory,
            commitMessage || `Save as: ${finalFileName}`,
            userId,
            userName
          );
          this.logger.log(`[SaveAs] 项目文件 SVN 提交成功`);
        } catch (svnError) {
          this.logger.warn(`[SaveAs] SVN 提交失败: ${svnError.message}`);
        }
      } else if (targetType === 'personal') {
        try {
          await this.versionControlService.commitNodeDirectory(
            nodeDirectory,
            commitMessage || `Save as: ${finalFileName}`,
            userId,
            userName
          );
          this.logger.log(`[SaveAs] 个人空间文件 SVN 提交成功`);
        } catch (svnError) {
          this.logger.warn(`[SaveAs] SVN 提交失败: ${svnError.message}`);
        }
      } else {
        // 跳过图纸库和图块库的 SVN 提交
        this.logger.log(`[SaveAs] 跳过 SVN 提交: ${finalFileName} (图纸库/图块库文件)`);
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
