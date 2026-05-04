import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from './file-system.service';
import { FileConversionService } from './file-conversion.service';
import { FileSystemNodeService, FileSystemNodeContext } from '../node/filesystem-node.service';
import { CacheManagerService } from './cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { VersionControlService } from '../../version-control/version-control.service';
import { UploadChunkOptions, MergeOptions, MergeResult, UploadFileOptions } from './file-upload-manager.types';
import { ChunkUploadManagerService } from './chunk-upload-manager.service';
import { FileMergeService } from './file-merge.service';
import { ExternalRefService } from './external-ref.service';
import { UploadUtilityService } from './upload-utility.service';
import { FileConversionUploadService } from './file-conversion-upload.service';
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
    constructor(configService: ConfigService, fileConversionService: FileConversionService, fileSystemService: MxFileSystemService, fileSystemServiceMain: FileSystemService, fileSystemNodeService: FileSystemNodeService, cacheManager: CacheManagerService, storageManager: StorageManager, versionControlService: VersionControlService, chunkUploadManagerService: ChunkUploadManagerService, fileMergeService: FileMergeService, externalRefService: ExternalRefService, uploadUtilityService: UploadUtilityService, fileConversionUploadService: FileConversionUploadService);
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