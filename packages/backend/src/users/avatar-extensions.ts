/**
 * 头像文件扩展名的唯一事实源。
 *
 * 写入侧决定落盘后缀、读取侧决定扫描哪些后缀、落盘前清理决定删哪些旧文件——
 * 三处历史上各硬编码一份，其中读取侧漏了 `.jfif`：移动端相册/微信产出的
 * `*.jfif`（JFIF 标准 JPEG）被正常写入，但 serveAvatar 扫不到，头像永久 404，
 * 前端 `<img>` 静默回落成首字母，表现成「上传失败」。
 */

/** 落盘扫描 + 旧文件清理共用的全部头像扩展名 */
export const AVATAR_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.jfif'] as const;

export type AvatarExtension = (typeof AVATAR_EXTENSIONS)[number];

export const AVATAR_MIME_BY_EXTENSION: Record<AvatarExtension, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.jfif': 'image/jpeg',
};

/** 允许上传的 MIME 类型。`image/jfif` 是部分移动端浏览器/WebView 标识 JPEG 的写法 */
export const AVATAR_ALLOWED_MIME_TYPES: string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/jfif',
];

/** JFIF JPEG 家族的全部历史后缀，落盘时统一归一成 `.jpg` */
const JPEG_VARIANT_EXTENSIONS = new Set(['.jpe', '.jif', '.jfif', '.jpeg', '.jpg']);

/** 归一化后的规范落盘后缀（不含 `.jpeg`/`.jfif` 等遗留写法） */
const CANONICAL_EXTENSIONS = new Set(['.png', '.jpg', '.gif', '.webp']);

/**
 * 把不可信的客户端文件名后缀归一成落盘后缀。
 *
 * 返回类型限定在 `AvatarExtension` 内，保证写入的文件一定被 serveAvatar 扫得到。
 * 非图片后缀（含空串）回落 `.png`——内容合法性由调用方按 MIME 白名单先行校验。
 */
export function normalizeAvatarExtension(rawExtension: string): AvatarExtension {
  const ext = rawExtension.trim().toLowerCase();
  if (JPEG_VARIANT_EXTENSIONS.has(ext)) return '.jpg';
  if (CANONICAL_EXTENSIONS.has(ext)) return ext as AvatarExtension;
  return '.png';
}
