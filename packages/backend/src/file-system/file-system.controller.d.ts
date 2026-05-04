import type { Request as ExpressRequest, Response } from "express";
import { ProjectPermission } from "../common/enums/permissions.enum";
import { PermissionService } from "../common/services/permission.service";
import { ProjectPermissionService } from "../roles/project-permission.service";
import type { CopyNodeDto } from "./dto/copy-node.dto";
import type { CreateFolderDto } from "./dto/create-folder.dto";
import type { CreateProjectDto } from "./dto/create-project.dto";
import { type DownloadNodeQueryDto } from "./dto/download-node.dto";
import { NodeListResponseDto } from "./dto/file-system-response.dto";
import type { MoveNodeDto } from "./dto/move-node.dto";
import type { QueryChildrenDto } from "./dto/query-children.dto";
import type { QueryProjectsDto } from "./dto/query-projects.dto";
import type { SearchDto } from "./dto/search.dto";
import type { UpdateNodeDto } from "./dto/update-node.dto";
import type { UpdateProjectMemberDto } from "./dto/update-project-member.dto";
import type { UpdateStorageQuotaDto } from "./dto/update-storage-quota.dto";
import { FileDownloadHandlerService } from "./file-download/file-download-handler.service";
import { FileSystemService } from "./file-system.service";
import { FileTreeService } from "./file-tree/file-tree.service";
import { SearchService } from "./search/search.service";
export declare class FileSystemController {
    private readonly fileSystemService;
    private readonly fileTreeService;
    private readonly searchService;
    private readonly projectPermissionService;
    private readonly systemPermissionService;
    private readonly fileDownloadHandler;
    private readonly logger;
    constructor(fileSystemService: FileSystemService, fileTreeService: FileTreeService, searchService: SearchService, projectPermissionService: ProjectPermissionService, systemPermissionService: PermissionService, fileDownloadHandler: FileDownloadHandlerService);
    createProject(req: ExpressRequest & {
        user: {
            id: string;
        };
    }, dto: CreateProjectDto): Promise<{
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
    getProjects(req: ExpressRequest & {
        user: {
            id: string;
        };
    }, query?: QueryProjectsDto): Promise<NodeListResponseDto>;
    getPersonalSpace(req: ExpressRequest & {
        user: {
            id: string;
        };
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
    getTrash(req: any): Promise<void>;
    restoreTrashItems(body: {
        itemIds: string[];
    }, req: ExpressRequest & {
        user: {
            id: string;
        };
    }): Promise<{
        message: string;
    }>;
    permanentlyDeleteTrashItems(body: {
        itemIds: string[];
    }): Promise<{
        message: string;
    }>;
    clearTrash(req: any): Promise<{
        message: string;
    }>;
    createNode(req: ExpressRequest & {
        user: {
            id: string;
        };
    }, body: {
        name: string;
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
    createFolder(req: ExpressRequest & {
        user: {
            id: string;
        };
    }, parentId: string, dto: CreateFolderDto): Promise<{
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
    getRootNode(nodeId: string): Promise<{
        id: string;
    }>;
    restoreNode(nodeId: string, req: ExpressRequest & {
        user: {
            id: string;
        };
    }): Promise<{
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
    getNode(nodeId: string): Promise<{
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
    getChildren(nodeId: string, req: any, query?: QueryChildrenDto): Promise<{
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
    deleteNode(nodeId: string, body?: {
        permanently?: boolean;
    }, permanentlyQuery?: boolean): Promise<{
        message: string;
    }>;
    moveNode(nodeId: string, dto: MoveNodeDto): Promise<{
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
    copyNode(nodeId: string, dto: CopyNodeDto): Promise<any>;
    getStorageQuota(req: any, nodeId?: string): Promise<import("./storage-quota/storage-info.service").StorageQuotaInfo>;
    updateStorageQuota(req: any, dto: UpdateStorageQuotaDto): Promise<{
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
    addProjectMember(projectId: string, body: {
        userId: string;
        projectRoleId: string;
    }, req: any): Promise<{
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
    updateProjectMember(projectId: string, userId: string, dto: UpdateProjectMemberDto & {
        roleId?: string;
    }, req: any): Promise<{
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
    removeProjectMember(projectId: string, userId: string, req: any): Promise<{
        message: string;
    }>;
    getThumbnail(nodeId: string, req: ExpressRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    downloadNodeOptions(req: ExpressRequest, res: Response): Promise<void>;
    downloadNode(nodeId: string, req: ExpressRequest, res: Response): Promise<void>;
    downloadNodeWithFormat(nodeId: string, req: ExpressRequest, res: Response, query: DownloadNodeQueryDto): Promise<Response<any, Record<string, any>> | undefined>;
    getUserProjectPermissions(req: any, projectId: string): Promise<{
        projectId: string;
        userId: any;
        permissions: import("@prisma/client").$Enums.ProjectPermission[];
    }>;
    checkProjectPermission(req: any, projectId: string, permission: ProjectPermission): Promise<{
        projectId: string;
        userId: any;
        permission: import("@prisma/client").$Enums.ProjectPermission;
        hasPermission: boolean;
    }>;
    getUserProjectRole(req: any, projectId: string): Promise<{
        projectId: string;
        userId: any;
        role: import("../common/enums/permissions.enum").ProjectRole | null;
    }>;
    search(req: any, dto: SearchDto): Promise<NodeListResponseDto>;
}
//# sourceMappingURL=file-system.controller.d.ts.map