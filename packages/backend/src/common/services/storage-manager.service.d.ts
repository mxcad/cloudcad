import { DirectoryAllocator } from './directory-allocator.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';
export interface NodeStorageInfo {
    nodeId: string;
    directory: string;
    /** 节点目录的完整路径 (YYYYMM/nodeId) */
    nodeDirectoryPath: string;
    /** 节点目录的相对路径 (YYYYMM/nodeId) */
    nodeDirectoryRelativePath: string;
    /** 文件的完整路径 (如果传了 fileName: YYYYMM/nodeId/fileName) */
    filePath?: string;
    /** 文件的相对路径 (如果传了 fileName: YYYYMM/nodeId/fileName) */
    fileRelativePath?: string;
}
export declare class StorageManager {
    private readonly directoryAllocator;
    private readonly localStorageProvider;
    private readonly logger;
    constructor(directoryAllocator: DirectoryAllocator, localStorageProvider: LocalStorageProvider);
    /**
     * 为新节点分配存储空间
     * @param nodeId 节点 ID
     * @param fileName 文件名（可选）
     * @returns 存储信息
     */
    allocateNodeStorage(nodeId: string, fileName?: string): Promise<NodeStorageInfo>;
    /**
     * 获取节点存储信息
     * @param nodeId 节点 ID
     * @param directory 目录（YYYYMM[/N]）
     * @param fileName 文件名（可选）
     * @returns 存储信息
     */
    getNodeStorageInfo(nodeId: string, directory: string, fileName?: string): NodeStorageInfo;
    /**
     * 删除节点存储
     * @param nodeId 节点 ID
     * @param directory 目录（YYYYMM[/N]）
     */
    deleteNodeStorage(nodeId: string, directory: string): Promise<void>;
    /**
     * 检查节点存储是否存在
     * @param nodeId 节点 ID
     * @param directory 目录（YYYYMM[/N]）
     * @returns 是否存在
     */
    nodeStorageExists(nodeId: string, directory: string): Promise<boolean>;
    /**
     * 获取存储统计信息
     * @returns 统计信息
     */
    getStorageStats(): Promise<{
        totalDirectories: number;
        totalNodes: number;
        directories: Array<{
            name: string;
            nodeCount: number;
            isFull: boolean;
        }>;
    }>;
    /**
     * 清理空目录
     * @returns 清理的目录数量
     */
    cleanupEmptyDirectories(): Promise<number>;
    /**
     * 递归复制目录
     */
    private recursiveCopyDirectory;
    /**
     * 复制整个节点目录（包括所有相关文件）
     * @param sourceDirRelativePath 源目录相对路径
     * @param targetNodeId 目标节点ID
     * @param fileName 文件名
     * @returns 目标文件的相对路径
     */
    copyNodeDirectory(sourceDirRelativePath: string, targetNodeId: string, fileName: string): Promise<string>;
    /**
     * 获取节点完整路径
     * @param relativePath 相对路径（可能是 /mxcad/file/YYYYMM[/N]/nodeId/... 或 YYYYMM[/N]/nodeId/...）
     * @returns 完整路径
     */
    getFullPath(relativePath: string): string;
    /**
     * 从数据库存储路径中提取节点目录路径
     * @param dbRelativePath 数据库中的相对路径 (YYYYMM/nodeId/fileName 或 YYYYMM/nodeId)
     * @returns 节点目录的完整路径
     */
    getNodeDirectoryPath(dbRelativePath: string): string;
    /**
     * 从数据库存储路径中提取节点目录相对路径
     * @param dbRelativePath 数据库中的相对路径
     * @returns 节点目录的相对路径 (YYYYMM/nodeId)
     */
    getNodeDirectoryRelativePath(dbRelativePath: string): string;
}
//# sourceMappingURL=storage-manager.service.d.ts.map