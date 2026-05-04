export declare class InitiateMultipartUploadDto {
    fileName: string;
    fileSize: number;
    parentId?: string;
}
export declare class UploadChunkDto {
    uploadId: string;
    chunkIndex: number;
    chunkData: string;
}
export declare class CompleteMultipartUploadDto {
    uploadId: string;
    parts: Array<{
        partNumber: number;
        etag: string;
    }>;
}
export declare class UploadProgressDto {
    uploadId: string;
}
//# sourceMappingURL=multipart-upload.dto.d.ts.map