/**
 * 检查文件是否存在请求 DTO
 */
export declare class CheckFileExistDto {
    fileHash: string;
    filename: string;
    nodeId: string;
    fileSize: number;
    conflictStrategy?: 'skip' | 'overwrite' | 'rename';
}
//# sourceMappingURL=check-file-exist.dto.d.ts.map