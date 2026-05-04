import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { StorageService } from '../../storage/storage.service';
export declare class UploadUtilityService {
    private readonly configService;
    private readonly fileSystemService;
    private readonly fileSystemServiceMain;
    private readonly fileSystemNodeService;
    private readonly storageManager;
    private readonly storageService;
    private readonly logger;
    private readonly mxcadUploadPath;
    constructor(configService: ConfigService, fileSystemService: MxFileSystemService, fileSystemServiceMain: FileSystemService, fileSystemNodeService: FileSystemNodeService, storageManager: StorageManager, storageService: StorageService);
    createNonCadNode(originalName: string, fileHash: string, fileSize: number, sourceFilePath: string, context: {
        userId: string;
        nodeId: string;
    }): Promise<void>;
    getFileSize(fileHash: string, filename: string, targetFile: string): Promise<number>;
    checkFileExistsInStorage(fileHash: string, originalFilename: string): Promise<boolean>;
    getConvertedFileName(fileHash: string, originalFilename: string): string;
    generateUniqueFileName(parentId: string, baseName: string): Promise<string>;
}
//# sourceMappingURL=upload-utility.service.d.ts.map