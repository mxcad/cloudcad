/**
 * 上传文件请求体 DTO
 */
export declare class UploadFilesDto {
    file?: Express.Multer.File;
    hash: string;
    name: string;
    size: number;
    chunk?: number;
    chunks?: number;
    nodeId?: string;
    srcDwgNodeId?: string;
    id?: string;
    type?: string;
    lastModifiedDate?: string;
    conflictStrategy?: 'skip' | 'overwrite' | 'rename';
}
//# sourceMappingURL=upload-files.dto.d.ts.map