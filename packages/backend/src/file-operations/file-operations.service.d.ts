import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../common/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import { IVersionControl } from '../version-control/interfaces/version-control.interface';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { QueryChildrenDto } from '../file-system/dto/query-children.dto';
import { StorageInfoService } from '../file-system/storage-quota/storage-info.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { ProjectPermissionService } from '../roles/project-permission.service';
import { PermissionService } from '../common/services/permission.service';
import { IStorageProvider } from '../storage/interfaces/storage-provider.interface';
export declare class FileOperationsService {
    private readonly prisma;
    private readonly storageManager;
    private readonly configService;
    private readonly versionControlService;
    private readonly storageInfoService;
    private readonly fileTreeService;
    private readonly storageProvider;
    private readonly projectPermissionService;
    private readonly permissionService;
    private readonly logger;
    constructor(prisma: DatabaseService, storageManager: StorageManager, configService: ConfigService, versionControlService: IVersionControl, storageInfoService: StorageInfoService, fileTreeService: FileTreeService, storageProvider: IStorageProvider, projectPermissionService: ProjectPermissionService, permissionService: PermissionService);
    checkNameUniqueness(name: string, userId: string, parentId: string | null, excludeNodeId?: string): Promise<void>;
    generateUniqueName(parentId: string, baseName: string, isFolder: boolean): Promise<string>;
    private generateNumberedName;
    deleteNode(nodeId: string, permanently?: boolean): Promise<{
        message: string;
    }>;
    deleteProject(projectId: string, permanently?: boolean): Promise<{
        message: string;
    }>;
    private getParentProjectId;
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
    restoreProject(projectId: string): Promise<{
        message: string;
    }>;
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
    clearProjectTrash(projectId: string, userId: string): Promise<{
        message: string;
    }>;
    getAllProjectNodeIds(projectId: string): Promise<string[]>;
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
    copyNode(nodeId: string, targetParentId: string): Promise<any>;
    copyNodeRecursive(sourceNodeId: string, targetParentId: string, newName: string, ownerId: string): Promise<any>;
    softDeleteDescendants(tx: Prisma.TransactionClient, nodeId: string): Promise<void>;
    deleteDescendantsWithFiles(tx: Prisma.TransactionClient, nodeId: string): Promise<void>;
    deleteFileIfNotReferenced(tx: Prisma.TransactionClient, nodeId: string, nodePath: string, fileHash: string | null): Promise<void>;
    collectFilesToDelete(nodeId: string, filesToDelete: Array<{
        path: string;
        fileHash: string | null;
        nodeId: string;
    }>, nodesToDelete: string[]): Promise<void>;
    collectChildNodes(nodeId: string, nodesToCollect: string[]): Promise<void>;
    deleteFileFromStorage(nodePath: string, fileHash: string | null, commitSvn: boolean): Promise<void>;
    permanentlyDeleteProject(projectId: string, commitSvn?: boolean): Promise<{
        message: string;
    }>;
    permanentlyDeleteNode(nodeId: string, commitSvn?: boolean): Promise<{
        message: string;
    }>;
    restoreTrashItems(itemIds: string[], userId: string): Promise<{
        message: string;
    }>;
    permanentlyDeleteTrashItems(itemIds: string[]): Promise<{
        message: string;
    }>;
    clearTrash(userId: string): Promise<{
        message: string;
    }>;
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
}
//# sourceMappingURL=file-operations.service.d.ts.map