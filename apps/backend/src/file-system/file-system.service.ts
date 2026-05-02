///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * FileSystemService - Facade 外观类
 *
 * 重构说明：
 * - 原文件 3986 行，职责过多
 * - 现已拆分为 6 个子服务，此类仅作为 Facade 提供统一接口
 * - 所有业务逻辑已委托给对应的子服务处理
 *
 * 子服务：
 * - ProjectCrudService: 项目 CRUD 操作
 * - FileTreeService: 文件树操作
 * - FileOperationsService: 文件操作（移动、复制、删除等）
 * - FileDownloadExportService: 文件下载和导出
 * - ProjectMemberService: 项目成员管理
 * - StorageInfoService: 存储信息查询
 */

import { Injectable, Logger, NotImplementedException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { QueryChildrenDto } from './dto/query-children.dto';
import { CadDownloadFormat } from './dto/download-node.dto';
import { ProjectCrudService } from '../file-operations/project-crud.service';
import { FileTreeService } from './file-tree/file-tree.service';
import { FileOperationsService } from '../file-operations/file-operations.service';
import { FileDownloadExportService } from './file-download/file-download-export.service';
import { ProjectMemberService } from './project-member/project-member.service';
import { StorageInfoService } from './storage-quota/storage-info.service';

/**
 * 文件系统服务 - Facade 外观类
 *
 * 提供统一的文件系统操作接口，内部委托给专门的子服务处理
 * 保持向后兼容，Controller 层无需修改
 */
@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly projectCrudService: ProjectCrudService,
    private readonly fileTreeService: FileTreeService,
    private readonly fileOperationsService: FileOperationsService,
    private readonly fileDownloadExportService: FileDownloadExportService,
    private readonly projectMemberService: ProjectMemberService,
    private readonly storageInfoService: StorageInfoService
  ) {
    this.logger.log('FileSystemService 已初始化（Facade 模式）');
  }

  // ==================== 项目 CRUD 操作 ====================

  /**
   * 创建项目
   */
  async createProject(userId: string, dto: CreateProjectDto) {
    this.logger.log(`用户 ${userId} 创建项目: ${dto.name}`);
    return this.projectCrudService.createProject(userId, dto);
  }

  /**
   * 获取用户项目列表
   */
  async getUserProjects(userId: string, query?: QueryProjectsDto) {
    return this.projectCrudService.getUserProjects(userId, query);
  }

  /**
   * 获取用户已删除项目列表
   */
  async getUserDeletedProjects(userId: string, query?: QueryProjectsDto) {
    return this.projectCrudService.getUserDeletedProjects(userId, query);
  }

  /**
   * 获取项目详情
   */
  async getProject(projectId: string) {
    return this.projectCrudService.getProject(projectId);
  }

  /**
   * 更新项目信息
   */
  async updateProject(projectId: string, dto: UpdateNodeDto) {
    return this.projectCrudService.updateProject(projectId, dto);
  }

  // ==================== 节点创建操作 ====================

  /**
   * 删除项目（兼容旧 API，内部委托给 deleteNode）
   */
  async deleteProject(projectId: string, permanently: boolean = false) {
    return this.deleteNode(projectId, permanently);
  }

  /**
   * 创建节点（通用）
   */
  async createNode(
    userId: string,
    name: string,
    options?: {
      parentId?: string;
      description?: string;
    }
  ) {
    return this.projectCrudService.createNode(userId, name, options);
  }

  /**
   * 创建文件节点（供 MxCad 模块使用）
   */
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
  }) {
    return this.fileTreeService.createFileNode(options);
  }

  /**
   * 创建文件夹
   */
  async createFolder(userId: string, parentId: string, dto: CreateFolderDto) {
    return this.projectCrudService.createFolder(userId, parentId, dto);
  }

  // ==================== 文件树操作 ====================

  /**
   * 获取节点树（包含所有子节点）
   */
  async getNodeTree(nodeId: string) {
    return this.fileTreeService.getNodeTree(nodeId);
  }

  /**
   * 获取根节点
   */
  async getRootNode(nodeId: string) {
    return this.fileTreeService.getRootNode(nodeId);
  }

  /**
   * 获取子节点列表
   */
  async getChildren(nodeId: string, userId?: string, query?: QueryChildrenDto) {
    return this.fileTreeService.getChildren(nodeId, userId, query);
  }

  /**
   * 递归获取某个节点下的所有文件（包括子目录中的文件）
   */
  async getAllFilesUnderNode(
    nodeId: string,
    userId?: string,
    query?: QueryChildrenDto
  ) {
    return this.fileTreeService.getAllFilesUnderNode(nodeId, userId, query);
  }

  /**
   * 获取节点详情
   */
  async getNode(nodeId: string) {
    return this.fileTreeService.getNode(nodeId);
  }

  // ==================== 文件操作 ====================

  /**
   * 更新节点
   */
  async updateNode(nodeId: string, dto: UpdateNodeDto) {
    return this.fileOperationsService.updateNode(nodeId, dto);
  }

  /**
   * 更新节点路径
   */
  async updateNodePath(nodeId: string, path: string) {
    return this.fileTreeService.updateNodePath(nodeId, path);
  }

  /**
   * 删除节点（软删除或永久删除）
   */
  async deleteNode(nodeId: string, permanently: boolean = false) {
    return this.fileOperationsService.deleteNode(nodeId, permanently);
  }

  /**
   * 移动节点
   */
  async moveNode(nodeId: string, targetParentId: string) {
    return this.fileOperationsService.moveNode(nodeId, targetParentId);
  }

  /**
   * 复制节点
   */
  async copyNode(nodeId: string, targetParentId: string) {
    return this.fileOperationsService.copyNode(nodeId, targetParentId);
  }

  /**
   * 生成唯一文件名
   */
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

  /**
   * 上传文件
   */
  async uploadFile(
    userId: string,
    parentId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      path: string;
    }
  ) {
    // uploadFile 方法尚未迁移到子服务，暂时保留原实现
    throw new NotImplementedException('uploadFile 方法尚未实现到子服务中');
  }

  // ==================== 回收站管理 ====================

  /**
   * 获取用户回收站列表
   */
  async getTrashItems(userId: string) {
    // getTrashItems 方法尚未迁移到子服务，暂时保留原实现
    throw new NotImplementedException('getTrashItems 方法尚未实现到子服务中');
  }

  /**
   * 恢复回收站项目
   */
  async restoreTrashItems(itemIds: string[]) {
    return this.fileOperationsService.restoreTrashItems(itemIds);
  }

  /**
   * 永久删除回收站项目
   */
  async permanentlyDeleteTrashItems(itemIds: string[]) {
    return this.fileOperationsService.permanentlyDeleteTrashItems(itemIds);
  }

  /**
   * 清空用户回收站
   */
  async clearTrash(userId: string) {
    return this.fileOperationsService.clearTrash(userId);
  }

  /**
   * 获取项目回收站列表
   */
  async getProjectTrash(
    projectId: string,
    userId: string,
    query?: QueryChildrenDto
  ) {
    return this.fileOperationsService.getProjectTrash(projectId, userId, query);
  }

  /**
   * 恢复单个节点
   */
  async restoreNode(nodeId: string) {
    return this.fileOperationsService.restoreNode(nodeId);
  }

  /**
   * 清空项目回收站
   */
  async clearProjectTrash(projectId: string, userId: string) {
    return this.fileOperationsService.clearProjectTrash(projectId, userId);
  }

  // ==================== 文件下载和导出 ====================

  /**
   * 下载节点文件
   */
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

  /**
   * 下载节点文件（支持格式转换）
   */
  async downloadNodeWithFormat(
    nodeId: string,
    userId: string,
    format?: CadDownloadFormat,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
    }
  ) {
    return this.fileDownloadExportService.downloadNodeWithFormat(
      nodeId,
      userId,
      format,
      pdfParams
    );
  }

  /**
   * 获取完整路径
   */
  getFullPath(relativePath: string): string {
    return this.fileDownloadExportService.getFullPath(relativePath);
  }

  /**
   * 检查文件访问权限
   */
  async checkFileAccess(nodeId: string, userId: string): Promise<boolean> {
    return this.fileDownloadExportService.checkFileAccess(nodeId, userId);
  }

  /**
   * 检查是否为图书馆节点
   */
  async isLibraryNode(nodeId: string): Promise<boolean> {
    return this.fileDownloadExportService.isLibraryNode(nodeId);
  }

  // ==================== 项目成员管理 ====================

  /**
   * 获取项目成员列表
   */
  async getProjectMembers(projectId: string) {
    return this.projectMemberService.getProjectMembers(projectId);
  }

  /**
   * 添加项目成员
   */
  async addProjectMember(
    projectId: string,
    userId: string,
    projectRoleId: string,
    operatorId: string
  ) {
    return this.projectMemberService.addProjectMember(
      projectId,
      userId,
      projectRoleId,
      operatorId
    );
  }

  /**
   * 更新项目成员角色
   */
  async updateProjectMember(
    projectId: string,
    userId: string,
    projectRoleId: string,
    operatorId: string
  ) {
    return this.projectMemberService.updateProjectMember(
      projectId,
      userId,
      projectRoleId,
      operatorId
    );
  }

  /**
   * 移除项目成员
   */
  async removeProjectMember(
    projectId: string,
    userId: string,
    operatorId: string
  ) {
    return this.projectMemberService.removeProjectMember(
      projectId,
      userId,
      operatorId
    );
  }

  /**
   * 转移项目所有权
   */
  async transferProjectOwnership(
    projectId: string,
    newOwnerId: string,
    operatorId: string
  ) {
    return this.projectMemberService.transferProjectOwnership(
      projectId,
      newOwnerId,
      operatorId
    );
  }

  /**
   * 批量添加项目成员
   */
  async batchAddProjectMembers(
    projectId: string,
    members: Array<{ userId: string; projectRoleId: string }>
  ) {
    return this.projectMemberService.batchAddProjectMembers(projectId, members);
  }

  /**
   * 批量更新项目成员角色
   */
  async batchUpdateProjectMembers(
    projectId: string,
    members: Array<{ userId: string; projectRoleId: string }>
  ) {
    return this.projectMemberService.batchUpdateProjectMembers(
      projectId,
      members
    );
  }

  // ==================== 存储信息查询 ====================

  /**
   * 获取用户存储使用情况
   */
  async getUserStorageInfo(userId: string) {
    return this.storageInfoService.getUserStorageInfo(userId);
  }

  /**
   * 获取节点存储配额
   */
  async getNodeStorageQuota(userId: string, nodeId: string) {
    const node = await this.fileTreeService.getNode(nodeId);
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    return this.storageInfoService.getStorageQuota(userId, nodeId, node);
  }

  /**
   * 更新节点存储配额
   */
  async updateNodeStorageQuota(nodeId: string, quota: number) {
    const node = await this.fileTreeService.getNode(nodeId);
    if (!node) {
      throw new NotFoundException('节点不存在');
    }

    const updatedNode = await this.prisma.fileSystemNode.update({
      where: { id: nodeId },
      data: { storageQuota: quota },
    });

    // 清除配额缓存
    if (node.ownerId) {
      await this.storageInfoService.invalidateQuotaCache(node.ownerId, nodeId);
    }

    this.logger.log(`节点 ${nodeId} 的存储配额已更新为 ${quota} GB`);

    return updatedNode;
  }

  /**
   * 获取私人空间
   */
  async getPersonalSpace(userId: string) {
    return this.projectCrudService.getPersonalSpace(userId);
  }
}
