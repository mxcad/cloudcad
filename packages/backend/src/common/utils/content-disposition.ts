import type { Response } from 'express';

/** Content-Disposition 处置类型 */
export type ContentDispositionType = 'attachment' | 'inline';

/**
 * 构建 Content-Disposition 响应头值（中文等非 ASCII 文件名编码的唯一实现）。
 *
 * 双写策略（RFC 6266 / RFC 5987）：
 * - `filename="..."`：ASCII fallback（非可打印 ASCII 字符替换为 `_`），
 *   兼容不识别 `filename*` 的旧客户端，同时消除非 ASCII 字符导致的响应头错误；
 * - `filename*=UTF-8''...`：encodeURIComponent 全量编码，现代浏览器按此解出原始文件名。
 *
 * 供 res.setHeader 与 NestJS StreamableFile 的 disposition 选项共用。
 */
export function buildContentDisposition(
  filename: string,
  disposition: ContentDispositionType = 'attachment'
): string {
  const encodedFilename = encodeURIComponent(filename);
  const fallbackFilename = filename.replace(/[^\x20-\x7E]/g, '_');
  return `${disposition}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`;
}

/**
 * 在 Express 响应上设置 Content-Disposition（含中文名支持），值见 buildContentDisposition。
 */
export function setContentDisposition(
  res: Response,
  filename: string,
  disposition: ContentDispositionType = 'attachment'
): void {
  res.setHeader(
    'Content-Disposition',
    buildContentDisposition(filename, disposition)
  );
}
