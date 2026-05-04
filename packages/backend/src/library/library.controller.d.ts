import { Response } from 'express';
import { LibraryService } from './library.service';
import { FileSystemService } from '../file-system/file-system.service';
import { FileDownloadHandlerService } from '../file-system/file-download/file-download-handler.service';
import { MxcadFileHandlerService } from '../mxcad/core/mxcad-file-handler.service';
import { QueryChildrenDto } from '../file-system/dto/query-children.dto';
import { IPublicLibraryProvider } from './interfaces/public-library-provider.interface';
/**
 * 公共资源库控制器（仅保留只读接口）
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目，不是某个人的资源库
 * - 读操作：公开访问（无需登录）
 * - 写操作：已废弃，统一走文件管理模块
 * - 无版本管理、无回收站（删除即永久删除）
 */
export declare class LibraryController {
    private readonly libraryService;
    private readonly fileSystemService;
    private readonly fileDownloadHandler;
    private readonly mxcadFileHandler;
    private readonly drawingLibraryProvider;
    private readonly blockLibraryProvider;
    private readonly logger;
    constructor(libraryService: LibraryService, fileSystemService: FileSystemService, fileDownloadHandler: FileDownloadHandlerService, mxcadFileHandler: MxcadFileHandlerService, drawingLibraryProvider: IPublicLibraryProvider, blockLibraryProvider: IPublicLibraryProvider);
    /**
     * 获取图纸库详情
     */
    getDrawingLibrary(): Promise<any>;
    /**
     * 获取图纸库子节点列表
     */
    getDrawingChildren(nodeId: string, query?: QueryChildrenDto): Promise<{
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
     * 递归获取图纸库节点下的所有文件（包括子目录）
     */
    getDrawingAllFiles(nodeId: string, query?: QueryChildrenDto): Promise<{
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
     * 图纸库统一文件访问路由（公开访问）
     *
     * URL 格式：/api/library/drawing/filesData/*path
     */
    getDrawingFile(filePath: string[], res: Response): Promise<void>;
    /**
     * 获取图纸库节点详情
     */
    getDrawingNode(nodeId: string): Promise<{
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
     * 下载图纸库文件（需要图纸库管理权限）
     */
    downloadDrawingNode(nodeId: string, req: any, res: Response): Promise<void>;
    /**
     * 获取图纸库文件缩略图
     */
    getDrawingThumbnail(nodeId: string, req: any): Promise<boolean>;
    /**
     * 获取图块库详情
     */
    getBlockLibrary(): Promise<any>;
    /**
     * 获取图块库子节点列表
     */
    getBlockChildren(nodeId: string, query?: QueryChildrenDto): Promise<{
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
     * 递归获取图块库节点下的所有文件（包括子目录）
     */
    getBlockAllFiles(nodeId: string, query?: QueryChildrenDto): Promise<{
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
     * 图块库统一文件访问路由（公开访问）
     *
     * URL 格式：/api/library/block/filesData/*path
     */
    getBlockFile(filePath: string[], res: Response, req: any): Promise<void>;
    /**
     * 获取图块库节点详情
     */
    getBlockNode(nodeId: string): Promise<{
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
     * 下载图块库文件（需要图块库管理权限）
     */
    downloadBlockNode(nodeId: string, req: any, res: Response): Promise<void>;
    /**
     * 获取图块库文件缩略图
     */
    getBlockThumbnail(nodeId: string, req: any): Promise<boolean>;
}
//# sourceMappingURL=library.controller.d.ts.map