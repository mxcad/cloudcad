/**
 * 构建带缓存破坏参数的文件 URL
 *
 * L1（浏览器）和 L2（CDN/Nginx）将 `?t=` 视为新 URL，无需 PURGE。
 *
 * @param path 文件路径
 * @param updatedAt 文件最后更新时间（时间戳或 Date）
 * @param version 可选版本号
 */
export function buildFileUrl(
  path: string,
  updatedAt: Date | number,
  version?: string,
): string {
  const timestamp = typeof updatedAt === 'number' ? updatedAt : updatedAt.getTime();
  const params = new URLSearchParams();
  params.set('t', String(timestamp));
  if (version) {
    params.set('v', version);
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${params.toString()}`;
}
