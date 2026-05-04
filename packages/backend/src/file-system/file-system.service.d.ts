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
export declare class FileSystemService {
    private readonly prisma;
    private readonly projectCrudService;
    private readonly fileTreeService;
    private readonly fileOperationsService;
    private readonly fileDownloadExportService;
    private readonly projectMemberService;
    private readonly storageInfoService;
    private readonly logger;
    constructor(prisma: DatabaseService, projectCrudService: ProjectCrudService, fileTreeService: FileTreeService, fileOperationsService: FileOperationsService, fileDownloadExportService: FileDownloadExportService, projectMemberService: ProjectMemberService, storageInfoService: StorageInfoService);
    /**
     * 创建项目
     */
    createProject(userId: string, dto: CreateProjectDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 获取用户项目列表
     */
    getUserProjects(userId: string, query?: QueryProjectsDto): Promise<import("./dto/file-system-response.dto").NodeListResponseDto>;
    /**
     * 获取用户已删除项目列表
     */
    getUserDeletedProjects(userId: string, query?: QueryProjectsDto): Promise<import("./dto/file-system-response.dto").NodeListResponseDto>;
    /**
     * 获取项目详情
     */
    getProject(projectId: string): Promise<{
        projectMembers: ({
            user: {
                role: {
                    name: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    description: string | null;
                    parentId: string | null;
                    category: import("@prisma/client").$Enums.RoleCategory;
                    level: number;
                    isSystem: boolean;
                };
                id: string;
                email: string | null;
                username: string;
                nickname: string | null;
                avatar: string | null;
            };
            projectRole: {
                name: string;
                id: string;
                description: string | null;
                isSystem: boolean;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            projectId: string;
            projectRoleId: string;
        })[];
        children: {
            name: string;
            id: string;
            createdAt: Date;
            isFolder: boolean;
            size: number | null;
            extension: string | null;
            fileStatus: import("@prisma/client").$Enums.FileStatus | null;
            owner: {
                id: string;
                username: string;
                nickname: string | null;
            };
        }[];
    } & {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 更新项目信息
     */
    updateProject(projectId: string, dto: UpdateNodeDto): Promise<{
        projectMembers: ({
            user: {
                id: string;
                email: string | null;
                username: string;
                nickname: string | null;
                avatar: string | null;
            };
            projectRole: {
                name: string;
                id: string;
                description: string | null;
                isSystem: boolean;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            projectId: string;
            projectRoleId: string;
        })[];
    } & {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 删除项目（兼容旧 API，内部委托给 deleteNode）
     */
    deleteProject(projectId: string, permanently?: boolean): Promise<{
        message: string;
    }>;
    /**
     * 创建节点（通用）
     */
    createNode(userId: string, name: string, options?: {
        parentId?: string;
        description?: string;
    }): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 创建文件节点（供 MxCad 模块使用）
     */
    createFileNode(options: {
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
    }): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 创建文件夹
     */
    createFolder(userId: string, parentId: string, dto: CreateFolderDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    } | null>;
    /**
     * 获取节点树（包含所有子节点）
     */
    getNodeTree(nodeId: string): Promise<{
        projectId: string | null;
        children: ({
            _count: {
                children: number;
            };
            owner: {
                id: string;
                username: string;
                nickname: string | null;
            };
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            description: string | null;
            parentId: string | null;
            isFolder: boolean;
            isRoot: boolean;
            originalName: string | null;
            path: string | null;
            size: number | null;
            mimeType: string | null;
            extension: string | null;
            fileStatus: import("@prisma/client").$Enums.FileStatus | null;
            fileHash: string | null;
            projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
            personalSpaceKey: string | null;
            libraryKey: string | null;
            hasMissingExternalReferences: boolean;
            missingExternalReferencesCount: number;
            externalReferencesJson: string | null;
            ownerId: string;
            deletedByCascade: boolean;
            deletedFromStorage: Date | null;
            projectId: string | null;
            storageQuota: number | null;
        })[];
        owner: {
            id: string;
            username: string;
            nickname: string | null;
        };
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        storageQuota: number | null;
    }>;
    /**
     * 获取根节点
     */
    getRootNode(nodeId: string): Promise<{
        id: string;
    }>;
    /**
     * 获取子节点列表
     */
    getChildren(nodeId: string, userId?: string, query?: QueryChildrenDto): Promise<{
        nodes: ({
            _count: {
                children: number;
            };
            owner: {
                id: string;
                username: string;
                nickname: string | null;
            };
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            description: string | null;
            parentId: string | null;
            isFolder: boolean;
            isRoot: boolean;
            originalName: string | null;
            path: string | null;
            size: number | null;
            mimeType: string | null;
            extension: string | null;
            fileStatus: import("@prisma/client").$Enums.FileStatus | null;
            fileHash: string | null;
            projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
            personalSpaceKey: string | null;
            libraryKey: string | null;
            hasMissingExternalReferences: boolean;
            missingExternalReferencesCount: number;
            externalReferencesJson: string | null;
            ownerId: string;
            deletedByCascade: boolean;
            deletedFromStorage: Date | null;
            projectId: string | null;
            storageQuota: number | null;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    /**
     * 递归获取某个节点下的所有文件（包括子目录中的文件）
     */
    getAllFilesUnderNode(nodeId: string, userId?: string, query?: QueryChildrenDto): Promise<{
        nodes: ({
            owner: {
                id: string;
                username: string;
                nickname: string | null;
            };
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            description: string | null;
            parentId: string | null;
            isFolder: boolean;
            isRoot: boolean;
            originalName: string | null;
            path: string | null;
            size: number | null;
            mimeType: string | null;
            extension: string | null;
            fileStatus: import("@prisma/client").$Enums.FileStatus | null;
            fileHash: string | null;
            projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
            personalSpaceKey: string | null;
            libraryKey: string | null;
            hasMissingExternalReferences: boolean;
            missingExternalReferencesCount: number;
            externalReferencesJson: string | null;
            ownerId: string;
            deletedByCascade: boolean;
            deletedFromStorage: Date | null;
            projectId: string | null;
            storageQuota: number | null;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    /**
     * 获取节点详情
     */
    getNode(nodeId: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 更新节点
     */
    updateNode(nodeId: string, dto: UpdateNodeDto): Promise<{
        owner: {
            id: string;
            username: string;
            nickname: string | null;
        };
    } & {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 更新节点路径
     */
    updateNodePath(nodeId: string, path: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 删除节点（软删除或永久删除）
     */
    deleteNode(nodeId: string, permanently?: boolean): Promise<{
        message: string;
    }>;
    /**
     * 移动节点
     */
    moveNode(nodeId: string, targetParentId: string): Promise<{
        owner: {
            id: string;
            username: string;
            nickname: string | null;
        };
    } & {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 复制节点
     */
    copyNode(nodeId: string, targetParentId: string): Promise<any>;
    /**
     * 生成唯一文件名
     */
    generateUniqueName(parentId: string, baseName: string, isFolder: boolean): Promise<string>;
    /**
     * 上传文件
     */
    uploadFile(userId: string, parentId: string, file: {
        originalname: string;
        mimetype: string;
        size: number;
        path: string;
    }): Promise<void>;
    /**
     * 获取用户回收站列表
     */
    getTrashItems(userId: string): Promise<void>;
    /**
     * 恢复回收站项目
     */
    restoreTrashItems(itemIds: string[], userId: string): Promise<{
        message: string;
    }>;
    /**
     * 永久删除回收站项目
     */
    permanentlyDeleteTrashItems(itemIds: string[]): Promise<{
        message: string;
    }>;
    /**
     * 清空用户回收站
     */
    clearTrash(userId: string): Promise<{
        message: string;
    }>;
    /**
     * 获取项目回收站列表
     */
    getProjectTrash(projectId: string, userId: string, query?: QueryChildrenDto): Promise<{
        nodes: ({
            owner: {
                id: string;
                username: string;
                nickname: string | null;
            };
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            description: string | null;
            parentId: string | null;
            isFolder: boolean;
            isRoot: boolean;
            originalName: string | null;
            path: string | null;
            size: number | null;
            mimeType: string | null;
            extension: string | null;
            fileStatus: import("@prisma/client").$Enums.FileStatus | null;
            fileHash: string | null;
            projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
            personalSpaceKey: string | null;
            libraryKey: string | null;
            hasMissingExternalReferences: boolean;
            missingExternalReferencesCount: number;
            externalReferencesJson: string | null;
            ownerId: string;
            deletedByCascade: boolean;
            deletedFromStorage: Date | null;
            projectId: string | null;
            storageQuota: number | null;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    /**
     * 恢复单个节点
     */
    restoreNode(nodeId: string, userId: string): Promise<{
        owner: {
            id: string;
            username: string;
            nickname: string | null;
        };
    } & {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 清空项目回收站
     */
    clearProjectTrash(projectId: string, userId: string): Promise<{
        message: string;
    }>;
    /**
     * 下载节点文件
     */
    downloadNode(nodeId: string, userId: string): Promise<{
        stream: NodeJS.ReadableStream;
        filename: string;
        mimeType: string;
    }>;
    /**
     * 下载节点文件（支持格式转换）
     */
    downloadNodeWithFormat(nodeId: string, userId: string, format?: CadDownloadFormat, pdfParams?: {
        width?: string;
        height?: string;
        colorPolicy?: string;
    }): Promise<{
        stream: NodeJS.ReadableStream;
        filename: string;
        mimeType: string;
    }>;
    /**
     * 获取完整路径
     */
    getFullPath(relativePath: string): string;
    /**
     * 检查文件访问权限
     */
    checkFileAccess(nodeId: string, userId: string): Promise<boolean>;
    /**
     * 检查是否为图书馆节点
     */
    isLibraryNode(nodeId: string): Promise<boolean>;
    /**
     * 获取项目成员列表
     */
    getProjectMembers(projectId: string): Promise<{
        id: string;
        email: string | null;
        username: string;
        nickname: string | null;
        avatar: string | null;
        projectRoleId: string;
        projectRoleName: string;
        joinedAt: Date;
    }[]>;
    /**
     * 添加项目成员
     */
    addProjectMember(projectId: string, userId: string, projectRoleId: string, operatorId: string): Promise<{
        user: {
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
            avatar: string | null;
        };
        projectRole: {
            permissions: {
                permission: import("@prisma/client").$Enums.ProjectPermission;
            }[];
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            isSystem: boolean;
            projectId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        projectId: string;
        projectRoleId: string;
    }>;
    /**
     * 更新项目成员角色
     */
    updateProjectMember(projectId: string, userId: string, projectRoleId: string, operatorId: string): Promise<{
        user: {
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
            avatar: string | null;
        };
        projectRole: {
            permissions: {
                permission: import("@prisma/client").$Enums.ProjectPermission;
            }[];
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            isSystem: boolean;
            projectId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        projectId: string;
        projectRoleId: string;
    }>;
    /**
     * 移除项目成员
     */
    removeProjectMember(projectId: string, userId: string, operatorId: string): Promise<{
        message: string;
    }>;
    /**
     * 转移项目所有权
     */
    transferProjectOwnership(projectId: string, newOwnerId: string, operatorId: string): Promise<{
        message: string;
    }>;
    /**
     * 批量添加项目成员
     */
    batchAddProjectMembers(projectId: string, members: Array<{
        userId: string;
        projectRoleId: string;
    }>): Promise<{
        message: string;
        addedCount: number;
        failedCount: number;
        errors: Array<{
            userId: string;
            error: string;
        }>;
    }>;
    /**
     * 批量更新项目成员角色
     */
    batchUpdateProjectMembers(projectId: string, members: Array<{
        userId: string;
        projectRoleId: string;
    }>): Promise<{
        message: string;
        updatedCount: number;
        failedCount: number;
        errors: Array<{
            userId: string;
            error: string;
        }>;
    }>;
    /**
     * 获取用户存储使用情况
     */
    getUserStorageInfo(userId: string): Promise<import("./storage-quota/storage-info.service").StorageQuotaInfo>;
    /**
     * 获取节点存储配额
     */
    getNodeStorageQuota(userId: string, nodeId: string): Promise<import("./storage-quota/storage-info.service").StorageQuotaInfo>;
    /**
     * 更新节点存储配额
     */
    updateNodeStorageQuota(nodeId: string, quota: number): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
    /**
     * 获取私人空间
     */
    getPersonalSpace(userId: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        parentId: string | null;
        isFolder: boolean;
        isRoot: boolean;
        originalName: string | null;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: import("@prisma/client").$Enums.FileStatus | null;
        fileHash: string | null;
        projectStatus: import("@prisma/client").$Enums.ProjectStatus | null;
        personalSpaceKey: string | null;
        libraryKey: string | null;
        hasMissingExternalReferences: boolean;
        missingExternalReferencesCount: number;
        externalReferencesJson: string | null;
        ownerId: string;
        deletedByCascade: boolean;
        deletedFromStorage: Date | null;
        projectId: string | null;
        storageQuota: number | null;
    }>;
}
//# sourceMappingURL=file-system.service.d.ts.map