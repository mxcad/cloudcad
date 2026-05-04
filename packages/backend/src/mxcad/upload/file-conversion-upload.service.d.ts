import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { CacheManagerService } from '../infra/cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { IVersionControl } from '../../version-control/interfaces/version-control.interface';
import { ExternalReferenceUpdateService } from '../external-ref/external-reference-update.service';
import { UploadFileOptions } from './file-upload-manager.types';
import { ExternalRefService } from '../external-ref/external-ref.service';
import { UploadUtilityService } from './upload-utility.service';
import { FileMergeService } from './file-merge.service';
import { ThumbnailGenerationService } from '../infra/thumbnail-generation.service';
import { StorageService } from '../../storage/storage.service';
export declare class FileConversionUploadService {
    private readonly configService;
    private readonly fileSystemService;
    private readonly fileSystemServiceMain;
    private readonly fileSystemNodeService;
    private readonly cacheManager;
    private readonly storageManager;
    private readonly versionControlService;
    private readonly fileConversionService;
    private readonly externalReferenceUpdateService;
    private readonly externalRefService;
    private readonly uploadUtilityService;
    private readonly fileMergeService;
    private readonly thumbnailGenerationService;
    private readonly storageService;
    private readonly logger;
    private readonly checkingFiles;
    private readonly mxcadUploadPath;
    private readonly filesDataPath;
    constructor(configService: ConfigService, fileSystemService: MxFileSystemService, fileSystemServiceMain: FileSystemService, fileSystemNodeService: FileSystemNodeService, cacheManager: CacheManagerService, storageManager: StorageManager, versionControlService: IVersionControl, fileConversionService: FileConversionService, externalReferenceUpdateService: ExternalReferenceUpdateService, externalRefService: ExternalRefService, uploadUtilityService: UploadUtilityService, fileMergeService: FileMergeService, thumbnailGenerationService: ThumbnailGenerationService, storageService: StorageService);
    uploadAndConvertFile(options: UploadFileOptions): Promise<{
        ret: string;
        tz?: boolean;
    }>;
    uploadAndConvertFileWithPermission(options: UploadFileOptions): Promise<{
        ret: string;
        tz?: boolean;
        nodeId?: string;
    }>;
    checkFileExist(filename: string, fileHash: string, context?: {
        userId?: string;
        nodeId?: string;
        srcDwgNodeId?: string;
        isImage?: boolean;
        fileSize?: number;
        userRole?: string;
        conflictStrategy?: 'skip' | 'overwrite' | 'rename';
    }): Promise<{
        ret: string;
        nodeId?: string;
    }>;
    private handleFileNodeCreation;
}
//# sourceMappingURL=file-conversion-upload.service.d.ts.map