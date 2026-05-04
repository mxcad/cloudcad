export declare const VERSION_CONTROL_TOKEN: unique symbol;
export interface IVersionControl {
    isReady(): boolean;
    ensureInitialized(): Promise<void>;
    commitNodeDirectory(directoryPath: string, message: string, userId?: string, userName?: string): Promise<CommitResult>;
    commitFiles(filePaths: string[], message: string): Promise<CommitResult>;
    commitWorkingCopy(message: string): Promise<CommitResult>;
    deleteNodeDirectory(directoryPath: string): Promise<CommitResult>;
    getFileHistory(path: string, limit?: number): Promise<HistoryResult>;
    listDirectoryAtRevision(directoryPath: string, revision: string | number): Promise<ListResult>;
    getFileContentAtRevision(filePath: string, revision: string | number): Promise<FileContentResult>;
    rollbackToRevision(path: string, revision: string | number, message?: string): Promise<CommitResult>;
}
export interface CommitResult {
    success: boolean;
    message: string;
    revision?: string | number;
    data?: unknown;
}
export interface HistoryResult {
    success: boolean;
    message: string;
    entries: HistoryEntry[];
}
export interface HistoryEntry {
    revision: string | number;
    author: string;
    date: Date;
    message: string;
    userName?: string;
    paths?: HistoryPath[];
}
export interface HistoryPath {
    action: 'A' | 'M' | 'D' | 'R';
    kind: 'file' | 'dir';
    path: string;
}
export interface ListResult {
    success: boolean;
    message: string;
    files?: string[];
}
export interface FileContentResult {
    success: boolean;
    message: string;
    content?: Buffer;
}
//# sourceMappingURL=version-control.interface.d.ts.map