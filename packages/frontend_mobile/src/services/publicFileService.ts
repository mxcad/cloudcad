import {
  publicFileControllerGetPreloadingData,
  publicFileControllerCheckExtReference,
} from '../api-sdk';
import { cachedApiUrl } from '../utils/apiConfig';

export interface PublicPreloadingData {
  tz: boolean;
  src_file_md5: string;
  images: string[];
  externalReference: string[];
}

export function isHashLike(id: string): boolean {
  return /^[a-f0-9]{32}$/i.test(id);
}

/**
 * 取公开图纸的预加载数据。
 *
 * 契约：`null` = 暂时取不到（转换未就绪、后端报错或网络失败三态合一）。
 * 这个坍缩是**故意的**——useFileLoader.getPublicPreloadingDataWithRetry 依赖
 * null 触发重试，改成抛错会打断重试循环。代价是后端 500 会被当作
 * 「还在转换」静默重试 10×2s。
 */
export async function getPublicPreloadingData(
  hash: string
): Promise<PublicPreloadingData | null> {
  try {
    const result = await publicFileControllerGetPreloadingData({
      path: { hash },
    });
    if (result.error) return null;
    return result.data as unknown as PublicPreloadingData;
  } catch {
    return null;
  }
}

/**
 * 查公开外部参照是否已就位。
 *
 * 契约：`false` = 未就位或查询失败。偏向「让用户看到缺失提示」这一侧，
 * 因此查询失败不会静默放过缺失的参照。
 */
export async function checkPublicExtReference(
  srcHash: string,
  fileName: string
): Promise<boolean> {
  try {
    const result = await publicFileControllerCheckExtReference({
      query: { srcHash, fileName },
    });
    const data = result.data as unknown as { exists: boolean };
    return data?.exists ?? false;
  } catch {
    return false;
  }
}

export function buildPublicMxwebUrl(hash: string): string {
  return cachedApiUrl(`/public-file/access/${hash}.mxweb`);
}
