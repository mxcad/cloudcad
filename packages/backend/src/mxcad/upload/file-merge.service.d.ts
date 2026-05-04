import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemNodeService, FileSystemNodeContext } from '../node/filesystem-node.service';
import { CacheManagerService } from '../infra/cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { IVersionControl } from '../../version-control/interfaces/version-control.interface';
import { MergeOptions, MergeResult } from './file-upload-manager.types';
import { ExternalRefService } from '../external-ref/external-ref.service';
import { UploadUtilityService } from './upload-utility.service';
import { ThumbnailGenerationService } from '../infra/thumbnail-generation.service';
import { StorageService } from '../../storage/storage.service';
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
    private readonly storageService;
    private readonly logger;
    private readonly mapCurrentFilesBeingMerged;
    private readonly mxcadUploadPath;
    private readonly filesDataPath;
    private readonly mxcadFileExt;
    constructor(configService: ConfigService, fileSystemService: MxFileSystemService, fileSystemServiceMain: FileSystemService, fileSystemNodeService: FileSystemNodeService, cacheManager: CacheManagerService, storageManager: StorageManager, versionControlService: IVersionControl, fileConversionService: FileConversionService, externalRefService: ExternalRefService, uploadUtilityService: UploadUtilityService, thumbnailGenerationService: ThumbnailGenerationService, storageService: StorageService);
    mergeConvertFile(options: MergeOptions): Promise<MergeResult>;
    mergeChunksWithPermission(options: MergeOptions): Promise<MergeResult>;
    performFileExistenceCheck(filename: string, fileHash: string, suffix: string, convertedExt: string, context?: FileSystemNodeContext): Promise<{
        ret: string;
        nodeId?: string;
    }>;
}
//# sourceMappingURL=file-merge.service.d.ts.map