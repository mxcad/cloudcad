import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
/**
 * 缩略图支持的文件格式及优先级
 * 优先级从高到低：webp > jpg > png
 */
export const THUMBNAIL_FORMATS = ['webp', 'jpg', 'png'];
/**
 * 缩略图基础名称（不含扩展名）
 */
export const THUMBNAIL_BASE_NAME = 'thumbnail';
/**
 * 获取完整的缩略图文件名（含扩展名）
 * @param format 图片格式
 * @returns 完整的缩略图文件名，如 'thumbnail.webp'
 */
export function getThumbnailFileName(format) {
    return `${THUMBNAIL_BASE_NAME}.${format}`;
}
/**
 * 按优先级查找节点目录中存在的缩略图
 * 查找顺序：thumbnail.webp > thumbnail.jpg > thumbnail.png
 *
 * @param nodeDir 节点目录路径
 * @returns 找到的缩略图信息，如果未找到则返回 null
 */
export async function findThumbnail(nodeDir) {
    for (const format of THUMBNAIL_FORMATS) {
        const fileName = getThumbnailFileName(format);
        const filePath = path.join(nodeDir, fileName);
        try {
            await fsPromises.access(filePath);
            return {
                path: filePath,
                fileName,
                format,
                mimeType: getMimeType(format),
            };
        }
        catch {
            // 文件不存在，继续尝试下一个格式
        }
    }
    return null;
}
/**
 * 同步版本的查找缩略图（用于需要同步检查的场景）
 * @param nodeDir 节点目录路径
 * @returns 找到的缩略图信息，如果未找到则返回 null
 */
export function findThumbnailSync(nodeDir) {
    for (const format of THUMBNAIL_FORMATS) {
        const fileName = getThumbnailFileName(format);
        const filePath = path.join(nodeDir, fileName);
        if (fs.existsSync(filePath)) {
            return {
                path: filePath,
                fileName,
                format,
                mimeType: getMimeType(format),
            };
        }
    }
    return null;
}
/**
 * 检查节点目录中是否存在任意格式的缩略图
 * @param nodeDir 节点目录路径
 * @returns 是否存在缩略图
 */
export async function hasThumbnail(nodeDir) {
    return findThumbnail(nodeDir) !== null;
}
/**
 * 同步版本检查缩略图是否存在
 * @param nodeDir 节点目录路径
 * @returns 是否存在缩略图
 */
export function hasThumbnailSync(nodeDir) {
    return findThumbnailSync(nodeDir) !== null;
}
/**
 * 根据格式获取对应的 MIME 类型
 * @param format 图片格式
 * @returns MIME 类型
 */
export function getMimeType(format) {
    const mimeTypes = {
        webp: 'image/webp',
        jpg: 'image/jpeg',
        png: 'image/png',
    };
    return mimeTypes[format];
}
/**
 * 从文件路径中提取缩略图格式
 * @param fileName 文件名（如 'thumbnail.webp'）
 * @returns 缩略图格式，如果不是缩略图文件则返回 null
 */
export function getThumbnailFormatFromFileName(fileName) {
    for (const format of THUMBNAIL_FORMATS) {
        if (fileName === getThumbnailFileName(format)) {
            return format;
        }
    }
    return null;
}
//# sourceMappingURL=thumbnail-utils.js.map