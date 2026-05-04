import { DatabaseService } from '../database/database.service';
import { FileSystemService } from '../file-system/file-system.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { PermissionService } from '../common/services/permission.service';
/**
 * 公共资源库类型
 */
export type LibraryType = 'drawing' | 'block';
/**
 * 保存结果类型
 */
export interface SaveResult {
    nodeId: string;
    path: string;
}
/**
 * 另存为结果类型
 */
export interface SaveAsResult {
    nodeId: string;
    fileName: string;
    path: string;
    parentId: string;
}
/**
 * 公共资源库服务
 *
 * 提供图纸库和图块库的管理功能
 * 复用文件系统的实现，通过 libraryKey 区分不同类型的库
 */
export declare class LibraryService {
    private readonly prisma;
    private readonly fileSystemService;
    private readonly fileTreeService;
    private readonly permissionService;
    private readonly logger;
    constructor(prisma: DatabaseService, fileSystemService: FileSystemService, fileTreeService: FileTreeService, permissionService: PermissionService);
    /**
     * 获取公共资源库项目 ID
     * @param libraryType 库类型：'drawing' | 'block'
     * @returns 库项目 ID
     */
    getLibraryId(libraryType: LibraryType): Promise<string>;
    /**
     * 获取公共资源库项目信息
     * @param libraryType 库类型
     * @returns 库项目信息
     */
    getLibrary(libraryType: LibraryType): Promise<({
        children: {
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
    }) | null>;
    /**
     * 检查是否是公共资源库
     * @param nodeId 节点 ID
     * @returns 是否是公共资源库
     */
    isLibrary(nodeId: string): Promise<boolean>;
    /**
     * 获取库类型
     * @param nodeId 节点 ID
     * @returns 库类型或 null
     */
    getLibraryType(nodeId: string): Promise<LibraryType | null>;
    /**
     * 检查用户是否有库管理权限
     * @param userId 用户 ID
     * @param libraryType 库类型
     * @returns 是否有管理权限
     */
    hasLibraryManagePermission(userId: string, libraryType: LibraryType): Promise<boolean>;
}
//# sourceMappingURL=library.service.d.ts.map