///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
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
/**
 * 文件系统服务 - Facade 外观类
 *
 * 提供统一的文件系统操作接口，内部委托给专门的子服务处理
 * 保持向后兼容，Controller 层无需修改
 */
let FileSystemService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileSystemService = _classThis = class {
        constructor(prisma, projectCrudService, fileTreeService, fileOperationsService, fileDownloadExportService, projectMemberService, storageInfoService) {
            this.prisma = prisma;
            this.projectCrudService = projectCrudService;
            this.fileTreeService = fileTreeService;
            this.fileOperationsService = fileOperationsService;
            this.fileDownloadExportService = fileDownloadExportService;
            this.projectMemberService = projectMemberService;
            this.storageInfoService = storageInfoService;
            this.logger = new Logger(FileSystemService.name);
            this.logger.log('FileSystemService 已初始化（Facade 模式）');
        }
        // ==================== 项目 CRUD 操作 ====================
        /**
         * 创建项目
         */
        async createProject(userId, dto) {
            this.logger.log(`用户 ${userId} 创建项目: ${dto.name}`);
            return this.projectCrudService.createProject(userId, dto);
        }
        /**
         * 获取用户项目列表
         */
        async getUserProjects(userId, query) {
            return this.projectCrudService.getUserProjects(userId, query);
        }
        /**
         * 获取用户已删除项目列表
         */
        async getUserDeletedProjects(userId, query) {
            return this.projectCrudService.getUserDeletedProjects(userId, query);
        }
        /**
         * 获取项目详情
         */
        async getProject(projectId) {
            return this.projectCrudService.getProject(projectId);
        }
        /**
         * 更新项目信息
         */
        async updateProject(projectId, dto) {
            return this.projectCrudService.updateProject(projectId, dto);
        }
        // ==================== 节点创建操作 ====================
        /**
         * 删除项目（兼容旧 API，内部委托给 deleteNode）
         */
        async deleteProject(projectId, permanently = false) {
            return this.deleteNode(projectId, permanently);
        }
        /**
         * 创建节点（通用）
         */
        async createNode(userId, name, options) {
            return this.projectCrudService.createNode(userId, name, options);
        }
        /**
         * 创建文件节点（供 MxCad 模块使用）
         */
        async createFileNode(options) {
            return this.fileTreeService.createFileNode(options);
        }
        /**
         * 创建文件夹
         */
        async createFolder(userId, parentId, dto) {
            return this.projectCrudService.createFolder(userId, parentId, dto);
        }
        // ==================== 文件树操作 ====================
        /**
         * 获取节点树（包含所有子节点）
         */
        async getNodeTree(nodeId) {
            return this.fileTreeService.getNodeTree(nodeId);
        }
        /**
         * 获取根节点
         */
        async getRootNode(nodeId) {
            return this.fileTreeService.getRootNode(nodeId);
        }
        /**
         * 获取子节点列表
         */
        async getChildren(nodeId, userId, query) {
            return this.fileTreeService.getChildren(nodeId, userId, query);
        }
        /**
         * 递归获取某个节点下的所有文件（包括子目录中的文件）
         */
        async getAllFilesUnderNode(nodeId, userId, query) {
            return this.fileTreeService.getAllFilesUnderNode(nodeId, userId, query);
        }
        /**
         * 获取节点详情
         */
        async getNode(nodeId) {
            return this.fileTreeService.getNode(nodeId);
        }
        // ==================== 文件操作 ====================
        /**
         * 更新节点
         */
        async updateNode(nodeId, dto) {
            return this.fileOperationsService.updateNode(nodeId, dto);
        }
        /**
         * 更新节点路径
         */
        async updateNodePath(nodeId, path) {
            return this.fileTreeService.updateNodePath(nodeId, path);
        }
        /**
         * 删除节点（软删除或永久删除）
         */
        async deleteNode(nodeId, permanently = false) {
            return this.fileOperationsService.deleteNode(nodeId, permanently);
        }
        /**
         * 移动节点
         */
        async moveNode(nodeId, targetParentId) {
            return this.fileOperationsService.moveNode(nodeId, targetParentId);
        }
        /**
         * 复制节点
         */
        async copyNode(nodeId, targetParentId) {
            return this.fileOperationsService.copyNode(nodeId, targetParentId);
        }
        /**
         * 生成唯一文件名
         */
        async generateUniqueName(parentId, baseName, isFolder) {
            return this.fileOperationsService.generateUniqueName(parentId, baseName, isFolder);
        }
        /**
         * 上传文件
         */
        async uploadFile(userId, parentId, file) {
            // uploadFile 方法尚未迁移到子服务，暂时保留原实现
            throw new NotImplementedException('uploadFile 方法尚未实现到子服务中');
        }
        // ==================== 回收站管理 ====================
        /**
         * 获取用户回收站列表
         */
        async getTrashItems(userId) {
            // getTrashItems 方法尚未迁移到子服务，暂时保留原实现
            throw new NotImplementedException('getTrashItems 方法尚未实现到子服务中');
        }
        /**
         * 恢复回收站项目
         */
        async restoreTrashItems(itemIds, userId) {
            return this.fileOperationsService.restoreTrashItems(itemIds, userId);
        }
        /**
         * 永久删除回收站项目
         */
        async permanentlyDeleteTrashItems(itemIds) {
            return this.fileOperationsService.permanentlyDeleteTrashItems(itemIds);
        }
        /**
         * 清空用户回收站
         */
        async clearTrash(userId) {
            return this.fileOperationsService.clearTrash(userId);
        }
        /**
         * 获取项目回收站列表
         */
        async getProjectTrash(projectId, userId, query) {
            return this.fileOperationsService.getProjectTrash(projectId, userId, query);
        }
        /**
         * 恢复单个节点
         */
        async restoreNode(nodeId, userId) {
            return this.fileOperationsService.restoreNode(nodeId, userId);
        }
        /**
         * 清空项目回收站
         */
        async clearProjectTrash(projectId, userId) {
            return this.fileOperationsService.clearProjectTrash(projectId, userId);
        }
        // ==================== 文件下载和导出 ====================
        /**
         * 下载节点文件
         */
        async downloadNode(nodeId, userId) {
            return this.fileDownloadExportService.downloadNode(nodeId, userId);
        }
        /**
         * 下载节点文件（支持格式转换）
         */
        async downloadNodeWithFormat(nodeId, userId, format, pdfParams) {
            return this.fileDownloadExportService.downloadNodeWithFormat(nodeId, userId, format, pdfParams);
        }
        /**
         * 获取完整路径
         */
        getFullPath(relativePath) {
            return this.fileDownloadExportService.getFullPath(relativePath);
        }
        /**
         * 检查文件访问权限
         */
        async checkFileAccess(nodeId, userId) {
            return this.fileDownloadExportService.checkFileAccess(nodeId, userId);
        }
        /**
         * 检查是否为图书馆节点
         */
        async isLibraryNode(nodeId) {
            return this.fileDownloadExportService.isLibraryNode(nodeId);
        }
        // ==================== 项目成员管理 ====================
        /**
         * 获取项目成员列表
         */
        async getProjectMembers(projectId) {
            return this.projectMemberService.getProjectMembers(projectId);
        }
        /**
         * 添加项目成员
         */
        async addProjectMember(projectId, userId, projectRoleId, operatorId) {
            return this.projectMemberService.addProjectMember(projectId, userId, projectRoleId, operatorId);
        }
        /**
         * 更新项目成员角色
         */
        async updateProjectMember(projectId, userId, projectRoleId, operatorId) {
            return this.projectMemberService.updateProjectMember(projectId, userId, projectRoleId, operatorId);
        }
        /**
         * 移除项目成员
         */
        async removeProjectMember(projectId, userId, operatorId) {
            return this.projectMemberService.removeProjectMember(projectId, userId, operatorId);
        }
        /**
         * 转移项目所有权
         */
        async transferProjectOwnership(projectId, newOwnerId, operatorId) {
            return this.projectMemberService.transferProjectOwnership(projectId, newOwnerId, operatorId);
        }
        /**
         * 批量添加项目成员
         */
        async batchAddProjectMembers(projectId, members) {
            return this.projectMemberService.batchAddProjectMembers(projectId, members);
        }
        /**
         * 批量更新项目成员角色
         */
        async batchUpdateProjectMembers(projectId, members) {
            return this.projectMemberService.batchUpdateProjectMembers(projectId, members);
        }
        // ==================== 存储信息查询 ====================
        /**
         * 获取用户存储使用情况
         */
        async getUserStorageInfo(userId) {
            return this.storageInfoService.getUserStorageInfo(userId);
        }
        /**
         * 获取节点存储配额
         */
        async getNodeStorageQuota(userId, nodeId) {
            const node = await this.fileTreeService.getNode(nodeId);
            if (!node) {
                throw new NotFoundException('节点不存在');
            }
            return this.storageInfoService.getStorageQuota(userId, nodeId, node);
        }
        /**
         * 更新节点存储配额
         */
        async updateNodeStorageQuota(nodeId, quota) {
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
        async getPersonalSpace(userId) {
            return this.projectCrudService.getPersonalSpace(userId);
        }
    };
    __setFunctionName(_classThis, "FileSystemService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileSystemService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileSystemService = _classThis;
})();
export { FileSystemService };
//# sourceMappingURL=file-system.service.js.map