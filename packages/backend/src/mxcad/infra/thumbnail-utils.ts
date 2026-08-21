import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

/**
 * 缩略图唯一支持的格式：jpg
 * 注意：webp/png 已废弃（历史链路曾把 MxWebDwg2Jpg 输出的 jpg 内容误存为 thumbnail.webp、
 * 移动端曾上传 thumbnail.png），不再参与查找与输出，避免旧格式遮蔽有效缩略图；
 * 存量缩略图由 scripts/migrate-thumbnail-filenames.js 统一修复为真实内容的 thumbnail.jpg
 */
export const THUMBNAIL_FORMATS = ['jpg'] as const;
export type ThumbnailFormat = (typeof THUMBNAIL_FORMATS)[number];

/**
 * 缩略图基础名称（不含扩展名）
 */
export const THUMBNAIL_BASE_NAME = 'thumbnail';

/**
 * 获取完整的缩略图文件名（含扩展名）
 * @param format 图片格式
 * @returns 完整的缩略图文件名，如 'thumbnail.jpg'
 */
export function getThumbnailFileName(format: ThumbnailFormat): string {
  return `${THUMBNAIL_BASE_NAME}.${format}`;
}

/**
 * 查找节点目录中存在的缩略图（仅 thumbnail.jpg）
 *
 * @param nodeDir 节点目录路径
 * @returns 找到的缩略图信息，如果未找到则返回 null
 */
export async function findThumbnail(nodeDir: string): Promise<{
  path: string;
  fileName: string;
  format: ThumbnailFormat;
  mimeType: string;
} | null> {
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
    } catch {
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
export function findThumbnailSync(nodeDir: string): {
  path: string;
  fileName: string;
  format: ThumbnailFormat;
  mimeType: string;
} | null {
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
export async function hasThumbnail(nodeDir: string): Promise<boolean> {
  return findThumbnail(nodeDir) !== null;
}

/**
 * 同步版本检查缩略图是否存在
 * @param nodeDir 节点目录路径
 * @returns 是否存在缩略图
 */
export function hasThumbnailSync(nodeDir: string): boolean {
  return findThumbnailSync(nodeDir) !== null;
}

/**
 * 默认缩略图文件名映射（按文件扩展名）
 * 仅在没有真实缩略图时兜底使用；无法识别的扩展名才返回 default.jpg
 */
export const DEFAULT_THUMBNAIL_MAP: Record<string, string> = {
  '.dwg': 'dwg.jpg',
  '.dxf': 'dxf.jpg',
  '.mxweb': 'mxweb.jpg',
};

/**
 * 根据文件扩展名获取对应的默认缩略图文件名
 * @param extension 文件扩展名（如 '.dwg'），为空时返回 default.jpg
 * @returns 默认缩略图文件名
 */
export function getDefaultThumbnailFileName(extension?: string | null): string {
  const ext = (extension || '').toLowerCase();
  return DEFAULT_THUMBNAIL_MAP[ext] || 'default.jpg';
}

/**
 * 根据格式获取对应的 MIME 类型
 * @param format 图片格式
 * @returns MIME 类型
 */
export function getMimeType(format: ThumbnailFormat): string {
  const mimeTypes: Record<ThumbnailFormat, string> = {
    jpg: 'image/jpeg',
  };
  return mimeTypes[format];
}

/**
 * 从文件路径中提取缩略图格式
 * @param fileName 文件名（如 'thumbnail.jpg'）
 * @returns 缩略图格式，如果不是缩略图文件则返回 null
 */
export function getThumbnailFormatFromFileName(
  fileName: string
): ThumbnailFormat | null {
  for (const format of THUMBNAIL_FORMATS) {
    if (fileName === getThumbnailFileName(format)) {
      return format;
    }
  }
  return null;
}
