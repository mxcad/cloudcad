/**
 * 检查分片响应 DTO
 */
export declare class CheckChunkResponseDto {
    exist: boolean;
}
/**
 * 上传分片响应 DTO
 */
export declare class UploadChunkResponseDto {
    ret: string;
    isLastChunk?: boolean;
}
/**
 * 合并完成响应 DTO（返回文件信息）
 */
export declare class MergeCompleteResponseDto {
    ret: string;
    hash: string;
    fileName: string;
}
/**
 * 临时令牌信息（Redis 存储结构）
 */
export interface TempTokenInfo {
    /** 文件路径 */
    filePath: string;
    /** 原始文件名 */
    fileName: string;
    /** 文件大小 */
    fileSize: number;
    /** 创建时间戳 */
    createdAt: number;
}
//# sourceMappingURL=public-file-response.dto.d.ts.map