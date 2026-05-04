import { FileSystemNode as PrismaFileSystemNode } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { QueryChildrenDto } from '../dto/query-children.dto';
import { StorageInfoService } from './storage-info.service';
export declare class FileTreeService {
    private readonly prisma;
    private readonly storageManager;
    private readonly storageInfoService;
    private readonly logger;
    constructor(prisma: DatabaseService, storageManager: StorageManager, storageInfoService: StorageInfoService);
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
    }): Promise<PrismaFileSystemNode>;
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
     * 获取节点详情（不包含子节点，用于判断库类型）
     */
    getNodeWithLibraryKey(nodeId: string): Promise<{
        id: string;
        personalSpaceKey: string | null;
        libraryKey: string | null;
    }>;
    isLibraryNode(nodeId: string): Promise<boolean>;
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
    getRootNode(nodeId: string): Promise<{
        id: string;
    }>;
    getProjectId(nodeId: string): Promise<string | null>;
    getLibraryKey(nodeId: string): Promise<'drawing' | 'block' | null>;
    getTrashItems(userId: string): Promise<{
        items: ({
            itemType: string;
            projectMembers: ({
                user: {
                    id: string;
                    email: string | null;
                    username: string;
                    nickname: string | null;
                };
            } & {
                id: string;
                createdAt: Date;
                userId: string;
                projectId: string;
                projectRoleId: string;
            })[];
            owner: {
                id: string;
                email: string | null;
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
            projectId: string | null;
            storageQuota: number | null;
        } | {
            itemType: string;
            _count: {
                children: number;
            };
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
            projectId: string | null;
            storageQuota: number | null;
        })[];
        total: number;
    }>;
    /**
     * 递归获取某个节点下的所有文件（包括子目录中的文件）
     * @param nodeId 节点 ID
     * @param userId 用户 ID
     * @param query 查询参数
     * @returns 文件列表（分页）
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
}
//# sourceMappingURL=file-tree.service.d.ts.map