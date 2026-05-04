import { FileSystemService as MainFileSystemService } from '../../file-system/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { IVersionControl } from '../../version-control/interfaces/version-control.interface';
import { DatabaseService } from '../../database/database.service';
export interface SaveMxwebAsOptions {
    file: Express.Multer.File;
    targetType: 'personal' | 'project';
    targetParentId: string;
    projectId: string | undefined;
    format: 'dwg' | 'dxf';
    userId: string;
    userName: string;
    commitMessage?: string;
    fileName?: string;
}
export interface SaveMxwebAsResult {
    success: boolean;
    message: string;
    nodeId?: string;
    fileName?: string;
    path?: string;
    projectId?: string;
    parentId?: string;
}
export declare class SaveAsService {
    private readonly fileSystemServiceMain;
    private readonly fileSystemNodeService;
    private readonly storageManager;
    private readonly fileConversionService;
    private readonly permissionService;
    private readonly versionControlService;
    private readonly prisma;
    private readonly logger;
    constructor(fileSystemServiceMain: MainFileSystemService, fileSystemNodeService: FileSystemNodeService, storageManager: StorageManager, fileConversionService: FileConversionService, permissionService: FileSystemPermissionService, versionControlService: IVersionControl, prisma: DatabaseService);
    saveMxwebAs(options: SaveMxwebAsOptions): Promise<SaveMxwebAsResult>;
    private generateNodeId;
    /**
     * 生成唯一的文件名（处理同名文件）
     * 如果文件名已存在，自动添加序号
     * 例如：file.dwg -> file (1).dwg, file (2).dwg, ...
     */
    private generateUniqueFileName;
    /**
     * 生成带序号的文件名
     * 例如：file.dxf -> file (1).dxf, file (2).dxf, ...
     */
    private generateNumberedFileName;
    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp;
}
//# sourceMappingURL=save-as.service.d.ts.map