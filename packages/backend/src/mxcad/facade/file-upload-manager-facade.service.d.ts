import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemNodeService, FileSystemNodeContext } from '../node/filesystem-node.service';
import { CacheManagerService } from '../infra/cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { IVersionControl } from '../../version-control/interfaces/version-control.interface';
import { UploadChunkOptions, MergeOptions, MergeResult, UploadFileOptions } from '../upload/file-upload-manager.types';
import { ChunkUploadManagerService } from '../upload/chunk-upload-manager.service';
import { FileMergeService } from '../upload/file-merge.service';
import { ExternalRefService } from '../external-ref/external-ref.service';
import { UploadUtilityService } from '../upload/upload-utility.service';
import { FileConversionUploadService } from '../upload/file-conversion-upload.service';
export declare class FileUploadManagerFacadeService {
    private readonly configService;
    private readonly fileConversionService;
    private readonly fileSystemService;
    private readonly fileSystemServiceMain;
    private readonly fileSystemNodeService;
    private readonly cacheManager;
    private readonly storageManager;
    private readonly versionControlService;
    private readonly chunkUploadManagerService;
    private readonly fileMergeService;
    private readonly externalRefService;
    private readonly uploadUtilityService;
    private readonly fileConversionUploadService;
    private readonly logger;
    private readonly checkingFiles;
    private readonly mxcadUploadPath;
    private readonly filesDataPath;
    constructor(configService: ConfigService, fileConversionService: FileConversionService, fileSystemService: MxFileSystemService, fileSystemServiceMain: FileSystemService, fileSystemNodeService: FileSystemNodeService, cacheManager: CacheManagerService, storageManager: StorageManager, versionControlService: IVersionControl, chunkUploadManagerService: ChunkUploadManagerService, fileMergeService: FileMergeService, externalRefService: ExternalRefService, uploadUtilityService: UploadUtilityService, fileConversionUploadService: FileConversionUploadService);
    checkChunkExist(options: UploadChunkOptions): Promise<{
        ret: string;
    }>;
    checkFileExist(filename: string, fileHash: string, context?: FileSystemNodeContext): Promise<{
        ret: string;
        nodeId?: string;
    }>;
    mergeConvertFile(options: MergeOptions): Promise<MergeResult>;
    uploadChunk(options: UploadChunkOptions): Promise<{
        ret: string;
        tz?: boolean;
    }>;
    uploadAndConvertFile(options: UploadFileOptions): Promise<{
        ret: string;
        tz?: boolean;
    }>;
    mergeChunksWithPermission(options: MergeOptions): Promise<MergeResult>;
    uploadAndConvertFileWithPermission(options: UploadFileOptions): Promise<{
        ret: string;
        tz?: boolean;
        nodeId?: string;
    }>;
    getConvertedFileName(fileHash: string, originalFilename: string): string;
    getExternalRefDirName(srcDwgNodeId: string): Promise<string>;
    handleExternalReferenceFile(extRefHash: string, srcDwgNodeId: string, extRefFileName: string, srcFilePath: string): Promise<void>;
    handleExternalReferenceImage(fileHash: string, srcDwgNodeId: string, extRefFileName: string, srcFilePath: string, context: FileSystemNodeContext): Promise<void>;
}
//# sourceMappingURL=file-upload-manager-facade.service.d.ts.map