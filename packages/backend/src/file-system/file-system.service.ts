///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * FileSystemService - 外部模块 Facade
 *
 * ADR 0002: Controller 直注子 Service，此类仅保留外部消费者（library/、mxcad/、file-download/）需要的方法。
 *
 * 子服务：
 * - ProjectCrudService: 项目 CRUD 操作
 * - FileTreeService: 文件树操作
 * - FileOperationsService: 文件操作（移动、复制、删除等）
 * - FileDownloadExportService: 文件下载和导出
 */

import { Injectable, Logger } from '@nestjs/common';
import { FileStatus } from '@prisma/client';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { QueryChildrenDto } from './dto/query-children.dto';
import { ProjectCrudService } from '../file-operations/project-crud.service';
import { FileTreeService } from './file-tree/file-tree.service';
import { FileOperationsService } from '../file-operations/file-operations.service';
import { FileDownloadExportService } from './file-download/file-download-export.service';

@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);

  constructor(
    private readonly projectCrudService: ProjectCrudService,
    private readonly fileTreeService: FileTreeService,
    private readonly fileOperationsService: FileOperationsService,
    private readonly fileDownloadExportService: FileDownloadExportService,
  ) {
    this.logger.log('FileSystemService 已初始化（外部模块 Facade）');
  }

  // ==================== 节点创建（mxcad/upload, mxcad/save） ====================

  async createFileNode(options: {
    name: string;
    fileHash: string;
    size: number;
    mimeType: string;
    extension: string;
    parentId: string;
    ownerId: string;
    sourceFilePath?: string;
    sourceDirectoryPath?: string;
    skipFileCopy?: boolean;
    fileStatus?: FileStatus;
  }) {
    return this.fileTreeService.createFileNode(options);
  }

  // ==================== 文件树（library, mxcad） ====================

  async getNode(nodeId: string) {
    return this.fileTreeService.getNode(nodeId);
  }

  async getChildren(nodeId: string, userId?: string, query?: QueryChildrenDto) {
    return this.fileTreeService.getChildren(nodeId, userId, query);
  }

  async getAllFilesUnderNode(
    nodeId: string,
    userId?: string,
    query?: QueryChildrenDto
  ) {
    return this.fileTreeService.getAllFilesUnderNode(nodeId, userId, query);
  }

  async getCategoryTree(nodeId: string) {
    return this.fileTreeService.getCategoryTree(nodeId);
  }

  async getNodeTree(nodeId: string) {
    return this.fileTreeService.getNodeTree(nodeId);
  }

  async updateNodePath(nodeId: string, path: string) {
    return this.fileTreeService.updateNodePath(nodeId, path);
  }

  /**
   * 更新文件节点状态
   *
   * 调用方应在调用前通过 FileStatusStateMachine.validateTransition() 校验转换合法性。
   *
   * @param nodeId     文件节点 ID
   * @param fileStatus 目标状态
   */
  async updateFileStatus(nodeId: string, fileStatus: FileStatus) {
    return this.fileTreeService.updateFileStatus(nodeId, fileStatus);
  }

  // ==================== 文件操作（library, mxcad） ====================

  async generateUniqueName(
    parentId: string,
    baseName: string,
    isFolder: boolean
  ) {
    return this.fileOperationsService.generateUniqueName(
      parentId,
      baseName,
      isFolder
    );
  }

  async deleteNode(nodeId: string, permanently: boolean = false) {
    return this.fileOperationsService.deleteNode(nodeId, permanently);
  }

  async createFolder(userId: string, parentId: string, dto: CreateFolderDto) {
    return this.projectCrudService.createFolder(userId, parentId, dto);
  }

  async updateNode(nodeId: string, dto: UpdateNodeDto) {
    return this.fileOperationsService.updateNode(nodeId, dto);
  }

  async moveNode(nodeId: string, targetParentId: string) {
    return this.fileOperationsService.moveNode(nodeId, targetParentId);
  }

  async copyNode(nodeId: string, targetParentId: string) {
    return this.fileOperationsService.copyNode(nodeId, targetParentId);
  }

  // ==================== 批量操作 ====================

  async batchDeleteNodes(nodeIds: string[], permanently: boolean = false) {
    return this.fileOperationsService.batchDeleteNodes(nodeIds, permanently);
  }

  async batchMoveNodes(nodeIds: string[], targetParentId: string) {
    return this.fileOperationsService.batchMoveNodes(nodeIds, targetParentId);
  }

  async batchCopyNodes(nodeIds: string[], targetParentId: string) {
    return this.fileOperationsService.batchCopyNodes(nodeIds, targetParentId);
  }

  // ==================== 文件下载（file-download） ====================

  async downloadNode(
    nodeId: string,
    userId: string
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    mimeType: string;
  }> {
    return this.fileDownloadExportService.downloadNode(nodeId, userId);
  }

  getFullPath(relativePath: string): string {
    return this.fileDownloadExportService.getFullPath(relativePath);
  }

  async checkFileAccess(nodeId: string, userId: string): Promise<boolean> {
    return this.fileDownloadExportService.checkFileAccess(nodeId, userId);
  }

  async isLibraryNode(nodeId: string): Promise<boolean> {
    return this.fileDownloadExportService.isLibraryNode(nodeId);
  }
}
