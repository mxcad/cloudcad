/**
 * 检查文件是否存在的 DTO（秒传检查）
 */
export declare class CheckFileDto {
    /** 文件名 */
    filename: string;
    /** 文件 MD5 哈希 */
    fileHash: string;
}
/**
 * 文件存在检查响应 DTO
 */
export declare class CheckFileResponseDto {
    /** 文件是否已存在 */
    exist: boolean;
    /** 如果存在，返回文件哈希 */
    hash?: string;
    /** 原始文件名 */
    fileName?: string;
}
//# sourceMappingURL=check-file.dto.d.ts.map