/**
 * 字体上传目标枚举
 */
export declare enum FontUploadTarget {
    /** 仅上传到后端转换程序目录 */
    BACKEND = "backend",
    /** 仅上传到前端资源目录 */
    FRONTEND = "frontend",
    /** 同时上传到两个目录 */
    BOTH = "both"
}
/**
 * 字体上传 DTO
 */
export declare class UploadFontDto {
    target?: FontUploadTarget;
}
/**
 * 字体删除 DTO
 */
export declare class DeleteFontDto {
    target?: FontUploadTarget;
}
/**
 * 字体信息响应 DTO
 */
export declare class FontInfoDto {
    name: string;
    size: number;
    extension: string;
    existsInBackend: boolean;
    existsInFrontend: boolean;
    createdAt: Date;
    updatedAt: Date;
    creator?: string;
}
//# sourceMappingURL=font.dto.d.ts.map