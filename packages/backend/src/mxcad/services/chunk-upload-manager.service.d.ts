import { ConfigService } from '@nestjs/config';
import { FileSystemService as MxFileSystemService } from './file-system.service';
import { UploadChunkOptions } from './file-upload-manager.types';
import { FileMergeService } from './file-merge.service';
export declare class ChunkUploadManagerService {
    private readonly configService;
    private readonly fileSystemService;
    private readonly fileMergeService;
    private readonly logger;
    private readonly uploadRateLimiter;
    constructor(configService: ConfigService, fileSystemService: MxFileSystemService, fileMergeService: FileMergeService);
    checkChunkExist(options: UploadChunkOptions): Promise<{
        ret: string;
    }>;
    uploadChunk(options: UploadChunkOptions): Promise<{
        ret: string;
        tz?: boolean;
    }>;
}
//# sourceMappingURL=chunk-upload-manager.service.d.ts.map