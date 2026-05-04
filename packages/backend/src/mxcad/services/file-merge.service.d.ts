import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from './file-system.service';
import { FileConversionService } from './file-conversion.service';
import { FileSystemNodeService, FileSystemNodeContext } from '../node/filesystem-node.service';
import { CacheManagerService } from './cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { VersionControlService } from '../../version-control/version-control.service';
import { MergeOptions, MergeResult } from './file-upload-manager.types';
import { ExternalRefService } from './external-ref.service';
import { UploadUtilityService } from './upload-utility.service';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
export declare class FileMergeService {
    private readonly configService;
    private readonly fileSystemService;
    private readonly fileSystemServiceMain;
    private readonly fileSystemNodeService;
    private readonly cacheManager;
    private readonly storageManager;
    private readonly versionControlService;
    private readonly fileConversionService;
    private readonly externalRefService;
    private readonly uploadUtilityService;
    private readonly thumbnailGenerationService;
    private readonly logger;
    private readonly mapCurrentFilesBeingMerged;
    private readonly mxcadUploadPath;
    private readonly filesDataPath;
    private readonly mxcadFileExt;
    constructor(configService: ConfigService, fileSystemService: MxFileSystemService, fileSystemServiceMain: FileSystemService, fileSystemNodeService: FileSystemNodeService, cacheManager: CacheManagerService, storageManager: StorageManager, versionControlService: VersionControlService, fileConversionService: FileConversionService, externalRefService: ExternalRefService, uploadUtilityService: UploadUtilityService, thumbnailGenerationService: ThumbnailGenerationService);
    mergeConvertFile(options: MergeOptions): Promise<MergeResult>;
    mergeChunksWithPermission(options: MergeOptions): Promise<MergeResult>;
    performFileExistenceCheck(filename: string, fileHash: string, suffix: string, convertedExt: string, context?: FileSystemNodeContext): Promise<{
        ret: string;
        nodeId?: string;
    }>;
}
//# sourceMappingURL=file-merge.service.d.ts.map