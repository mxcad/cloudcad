/**
 * 上传错误代码枚举
 */
export declare enum UploadErrorCode {
    FILE_NOT_FOUND = "FILE_NOT_FOUND",
    CHUNK_ALREADY_EXISTS = "CHUNK_ALREADY_EXISTS",
    CHUNK_NOT_FOUND = "CHUNK_NOT_FOUND",
    CONVERSION_FAILED = "CONVERSION_FAILED",
    NODE_CREATION_FAILED = "NODE_CREATION_FAILED",
    PERMISSION_DENIED = "PERMISSION_DENIED",
    CONCURRENT_OPERATION = "CONCURRENT_OPERATION",
    INVALID_FILE = "INVALID_FILE",
    STORAGE_ERROR = "STORAGE_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
/**
 * 上传错误类
 */
export declare class UploadError extends Error {
    /**
     * 错误代码
     */
    readonly code: UploadErrorCode;
    /**
     * 错误详情
     */
    readonly details?: Record<string, unknown>;
    constructor(code: UploadErrorCode, message: string, details?: Record<string, unknown>);
    /**
     * 创建文件不存在错误
     */
    static fileNotFound(details?: Record<string, unknown>): UploadError;
    /**
     * 创建分片已存在错误
     */
    static chunkAlreadyExists(details?: Record<string, unknown>): UploadError;
    /**
     * 创建分片不存在错误
     */
    static chunkNotFound(details?: Record<string, unknown>): UploadError;
    /**
     * 创建转换失败错误
     */
    static conversionFailed(details?: Record<string, unknown>): UploadError;
    /**
     * 创建节点创建失败错误
     */
    static nodeCreationFailed(details?: Record<string, unknown>): UploadError;
    /**
     * 创建权限拒绝错误
     */
    static permissionDenied(details?: Record<string, unknown>): UploadError;
    /**
     * 创建并发操作错误
     */
    static concurrentOperation(details?: Record<string, unknown>): UploadError;
    /**
     * 创建无效文件错误
     */
    static invalidFile(details?: Record<string, unknown>): UploadError;
    /**
     * 创建存储错误
     */
    static storageError(details?: Record<string, unknown>): UploadError;
    /**
     * 创建未知错误
     */
    static unknown(details?: Record<string, unknown>): UploadError;
}
//# sourceMappingURL=upload.error.d.ts.map