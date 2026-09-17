import * as path from 'path';

/**
 * 判定文件路径是否属于 uploads/ 内容寻址缓存目录。
 *
 * 转换产物落在 `uploads/{md5}-{paramKey}.{ext}` 是共享缓存条目：
 * 删除它会让「下载管理 → 重下」立刻 404，并破坏后续相同参数转换的缓存命中。
 * 三个清理/判定站点（orchestrator / service / cleanup service）共用本函数，
 * 避免平台敏感的路径归一化逻辑漂移。
 */
export function isInUploadsCache(
  filePath: string,
  uploadsRoot: string
): boolean {
  if (!uploadsRoot) return false;
  const normalizedRoot = path.normalize(uploadsRoot).replace(/\\/g, '/');
  const normalized = path.normalize(filePath).replace(/\\/g, '/');
  return normalized.startsWith(`${normalizedRoot}/`);
}
