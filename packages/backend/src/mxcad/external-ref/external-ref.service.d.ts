import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { FileSystemNodeContext } from '../node/filesystem-node.service';
export declare class ExternalRefService {
    private readonly fileSystemService;
    private readonly fileSystemNodeService;
    private readonly storageManager;
    private readonly logger;
    constructor(fileSystemService: MxFileSystemService, fileSystemNodeService: FileSystemNodeService, storageManager: StorageManager);
    getExternalRefDirName(srcDwgNodeId: string): Promise<string>;
    handleExternalReferenceFile(extRefHash: string, srcDwgNodeId: string, extRefFileName: string, srcFilePath: string): Promise<void>;
    handleExternalReferenceImage(fileHash: string, srcDwgNodeId: string, extRefFileName: string, srcFilePath: string, context: FileSystemNodeContext): Promise<void>;
}
//# sourceMappingURL=external-ref.service.d.ts.map