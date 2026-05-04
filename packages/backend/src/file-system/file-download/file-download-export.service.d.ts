import { ModuleRef } from '@nestjs/core';
import { DatabaseService } from '../../database/database.service';
import { StorageService } from '../../storage/storage.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { CadDownloadFormat } from '../dto/download-node.dto';
export declare class FileDownloadExportService {
    private readonly prisma;
    private readonly storageService;
    private readonly storageManager;
    private readonly configService;
    private readonly permissionService;
    private readonly moduleRef;
    private readonly logger;
    private mxCadService;
    private readonly fileLimits;
    constructor(prisma: DatabaseService, storageService: StorageService, storageManager: StorageManager, configService: ConfigService, permissionService: FileSystemPermissionService, moduleRef: ModuleRef);
    private getMxCadServiceInstance;
    private sanitizeFileName;
    private getStoragePath;
    private getFileStream;
    checkFileAccess(nodeId: string, userId: string): Promise<boolean>;
    downloadNode(nodeId: string, userId: string): Promise<{
        stream: NodeJS.ReadableStream;
        filename: string;
        mimeType: string;
    }>;
    downloadNodeWithFormat(nodeId: string, userId: string, format?: CadDownloadFormat, pdfParams?: {
        width?: string;
        height?: string;
        colorPolicy?: string;
    }): Promise<{
        stream: NodeJS.ReadableStream;
        filename: string;
        mimeType: string;
    }>;
    private downloadNodeAsZip;
    private addFilesToArchive;
    getMimeType(filename: string): string;
    formatBytes(bytes: number): string;
    /**
     * 获取节点的完整存储路径（公共方法）
     * @param nodePath 节点的相对路径
     * @returns 本地存储的完整路径
     */
    getFullPath(nodePath: string): string;
    /**
     * 检查节点是否属于图书馆节点（公共方法）
     * @param nodeId 节点 ID
     * @returns 是否为图书馆节点
     */
    isLibraryNode(nodeId: string): Promise<boolean>;
}
//# sourceMappingURL=file-download-export.service.d.ts.map