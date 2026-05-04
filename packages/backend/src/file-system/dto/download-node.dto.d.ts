/**
 * CAD 文件下载格式枚举
 */
export declare enum CadDownloadFormat {
    /** DWG 格式（通过 mxweb 转换） */
    DWG = "dwg",
    /** DXF 格式（通过 mxweb 转换） */
    DXF = "dxf",
    /** MXWEB 格式（直接下载） */
    MXWEB = "mxweb",
    /** PDF 格式（通过 mxweb 转换） */
    PDF = "pdf"
}
/**
 * PDF 转换参数
 */
export declare class PdfConversionParams {
    width?: string;
    height?: string;
    colorPolicy?: string;
}
/**
 * 节点下载查询参数 DTO
 */
export declare class DownloadNodeQueryDto {
    format?: CadDownloadFormat;
    width?: string;
    height?: string;
    colorPolicy?: string;
}
//# sourceMappingURL=download-node.dto.d.ts.map