/**
 * 缩略图支持的文件格式及优先级
 * 优先级从高到低：webp > jpg > png
 */
export declare const THUMBNAIL_FORMATS: readonly ["webp", "jpg", "png"];
export type ThumbnailFormat = (typeof THUMBNAIL_FORMATS)[number];
/**
 * 缩略图基础名称（不含扩展名）
 */
export declare const THUMBNAIL_BASE_NAME = "thumbnail";
/**
 * 获取完整的缩略图文件名（含扩展名）
 * @param format 图片格式
 * @returns 完整的缩略图文件名，如 'thumbnail.webp'
 */
export declare function getThumbnailFileName(format: ThumbnailFormat): string;
/**
 * 按优先级查找节点目录中存在的缩略图
 * 查找顺序：thumbnail.webp > thumbnail.jpg > thumbnail.png
 *
 * @param nodeDir 节点目录路径
 * @returns 找到的缩略图信息，如果未找到则返回 null
 */
export declare function findThumbnail(nodeDir: string): Promise<{
    path: string;
    fileName: string;
    format: ThumbnailFormat;
    mimeType: string;
} | null>;
/**
 * 同步版本的查找缩略图（用于需要同步检查的场景）
 * @param nodeDir 节点目录路径
 * @returns 找到的缩略图信息，如果未找到则返回 null
 */
export declare function findThumbnailSync(nodeDir: string): {
    path: string;
    fileName: string;
    format: ThumbnailFormat;
    mimeType: string;
} | null;
/**
 * 检查节点目录中是否存在任意格式的缩略图
 * @param nodeDir 节点目录路径
 * @returns 是否存在缩略图
 */
export declare function hasThumbnail(nodeDir: string): Promise<boolean>;
/**
 * 同步版本检查缩略图是否存在
 * @param nodeDir 节点目录路径
 * @returns 是否存在缩略图
 */
export declare function hasThumbnailSync(nodeDir: string): boolean;
/**
 * 根据格式获取对应的 MIME 类型
 * @param format 图片格式
 * @returns MIME 类型
 */
export declare function getMimeType(format: ThumbnailFormat): string;
/**
 * 从文件路径中提取缩略图格式
 * @param fileName 文件名（如 'thumbnail.webp'）
 * @returns 缩略图格式，如果不是缩略图文件则返回 null
 */
export declare function getThumbnailFormatFromFileName(fileName: string): ThumbnailFormat | null;
//# sourceMappingURL=thumbnail-utils.d.ts.map