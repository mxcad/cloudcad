import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import { IVersionControl, CommitResult, HistoryResult, ListResult, FileContentResult } from '../interfaces/version-control.interface';
export declare class SvnVersionControlProvider implements IVersionControl, OnModuleInit {
    private readonly configService;
    private readonly logger;
    private readonly svnRepoPath;
    private readonly filesDataPath;
    private readonly svnIgnorePatterns;
    private isInitialized;
    private initPromise;
    constructor(configService: ConfigService<AppConfig>);
    onModuleInit(): Promise<void>;
    ensureInitialized(): Promise<void>;
    private initializeSvnRepository;
    private isSvnLockedError;
    private executeWithLockRetry;
    private setupGlobalIgnores;
    private collectFilePaths;
    isReady(): boolean;
    commitNodeDirectory(directoryPath: string, message: string, userId?: string, userName?: string): Promise<CommitResult>;
    commitFiles(filePaths: string[], message: string): Promise<CommitResult>;
    commitWorkingCopy(message: string): Promise<CommitResult>;
    deleteNodeDirectory(directoryPath: string): Promise<CommitResult>;
    getFileHistory(path: string, limit?: number): Promise<HistoryResult>;
    private parseSvnLogXml;
    private decodeXmlEntities;
    listDirectoryAtRevision(directoryPath: string, revision: string | number): Promise<ListResult>;
    getFileContentAtRevision(filePath: string, revision: string | number): Promise<FileContentResult>;
    rollbackToRevision(filePath: string, revision: string | number, message?: string): Promise<CommitResult>;
}
//# sourceMappingURL=svn-version-control.provider.d.ts.map