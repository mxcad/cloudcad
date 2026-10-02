/**
 * 图纸取数 URL 协议唯一出口（与 PC 端 UrlHelper.buildMxwebFileUrl 同构）。
 *
 * 此前 filesData 拼装散在三处（fileService / libraryOperationService /
 * useFileLoader 内联模板）、public-file/access 前缀裸写四处、缓存戳三口径
 * （updatedAt 缺失分别「产出 NaN / 抛错 / 回落 Date.now()」），本模块收敛。
 *
 * 纯路径/纯字符串：不含 API origin、不做请求——带 origin 的绝对 URL 由
 * 调用方经 cachedApiUrl 组合（cachedApiUrl 自带 ?t=Date.now() 缓存打散）。
 */

const FILES_DATA_PREFIX = 'filesData'

export interface MxwebFileUrlOptions {
  libraryKey?: 'drawing' | 'block'
  version?: number
  cacheTimestamp?: number
  shareToken?: string
}

/**
 * mxweb 文件访问 URL（/api/v1 起的相对路径）。
 * 协议格式：
 * - 项目/个人空间：/api/v1/mxcad/filesData/{nodePath}
 * - 图纸库/图块库：/api/v1/library/{libraryKey}/filesData/{nodePath}
 * 查询参数顺序与 PC 一致：version(v) → cacheTimestamp(t) → shareToken。
 */
export function buildMxwebFileUrl(
  nodePath: string,
  opts: MxwebFileUrlOptions = {},
): string {
  return `/api/v1${mxwebFilesDataPath(nodePath, opts.libraryKey)}${buildMxwebQuery(opts)}`
}

/**
 * mxweb filesData 访问 path（不带 /api/v1 前缀、不带 query，供 cachedApiUrl 组合）。
 * nodePath 缺 filesData/ 前缀时自动补齐（与 PC 同口径）。
 */
export function mxwebFilesDataPath(
  nodePath: string,
  libraryKey?: 'drawing' | 'block',
): string {
  const path = nodePath.startsWith(`${FILES_DATA_PREFIX}/`)
    ? nodePath
    : `${FILES_DATA_PREFIX}/${nodePath}`
  return libraryKey ? `/library/${libraryKey}/${path}` : `/mxcad/${path}`
}

/** 公开文件访问 path（供 cachedApiUrl 组合）：`/public-file/access/{accessName}` */
export function publicFileAccessPath(accessName: string): string {
  return `/public-file/access/${accessName}`
}

/**
 * 缓存时间戳唯一口径：updatedAt 缺失/非法回退 Date.now()——宁可强制一次
 * 新鲜请求，也不产出 t=NaN 的死缓存 URL（与 PC UrlHelper.resolveCacheTimestamp 同口径）。
 */
export function resolveCacheTimestamp(updatedAt?: string | null): number {
  const ts = updatedAt ? new Date(updatedAt).getTime() : NaN
  return Number.isFinite(ts) ? ts : Date.now()
}

/** 查询参数段：v → t → shareToken（与 PC buildMxwebFileUrl 同序） */
function buildMxwebQuery(opts: MxwebFileUrlOptions): string {
  const params: string[] = []
  if (opts.version !== undefined) params.push(`v=${opts.version}`)
  if (opts.cacheTimestamp !== undefined)
    params.push(`t=${opts.cacheTimestamp}`)
  if (opts.shareToken) params.push(`shareToken=${opts.shareToken}`)
  return params.length > 0 ? `?${params.join('&')}` : ''
}
