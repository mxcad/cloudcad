export interface UploadResult {
    key: string;
    etag: string;
    size: number;
}
export interface Part {
    partNumber: number;
    etag: string;
}
export interface StorageProvider {
    uploadFile(key: string, data: Buffer): Promise<UploadResult>;
    downloadFile(key: string): Promise<Buffer>;
    deleteFile(key: string): Promise<void>;
    fileExists(key: string): Promise<boolean>;
    getFileStream(key: string): Promise<NodeJS.ReadableStream>;
    getPresignedPutUrl(key: string, expiry?: number): Promise<string>;
}
//# sourceMappingURL=storage.interface.d.ts.map