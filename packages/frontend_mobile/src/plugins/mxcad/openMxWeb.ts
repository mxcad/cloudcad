import { t } from '@/languages';
import { MxCpp } from 'mxcad';
import { showToastOnce } from '@/utils/toast';

export interface OpenMxWebOptions {
  requestHeaders?: Record<string, string>;
  /**
   * 引擎 fetch 标志位。「无缓存打开」传 LOAD_TO_MEMORY | PERSIST_FILE | REPLACE，
   * 强制绕过 IndexedDB 与浏览器缓存重新拉取；不传则用引擎默认（走缓存）。
   */
  fetchAttributes?: number;
}

export function openMxWeb(url: string, options?: OpenMxWebOptions) {
  return new Promise<boolean>((res) => {
    try {
      const token = localStorage.getItem('accessToken');
      const baseHeaders: Record<string, string> | undefined =
        options?.requestHeaders ||
        (token ? { Authorization: `Bearer ${token}` } : undefined);

      // SDK 的 openWebFile 在 emscripten 同步模式下可能丢失 query 参数，
      // 所以把 shareToken 也塞到请求头里，后端双路检测（query + header）
      const shareTokenMatch = url.match(/[?&]shareToken=([^&]+)/);
      let headers: { requestHeaders: Record<string, string> } | undefined =
        baseHeaders ? { requestHeaders: baseHeaders } : undefined;
      if (shareTokenMatch && headers) {
        headers = {
          requestHeaders: {
            ...headers.requestHeaders,
            'x-share-token': decodeURIComponent(shareTokenMatch[1]),
          },
        };
      }

      const isOpen = MxCpp.App.getCurrentMxCAD().openWebFile(
        url,
        (iRet) => {
          if (iRet === 0) {
            showToastOnce(t('打开图纸成功'));
            res(true);
          } else {
            res(false);
          }
        },
        undefined,
        headers,
        options?.fetchAttributes
      );
      if (!isOpen) res(false);
    } catch (e) {
      console.error('openMxWeb failed:', e);
      res(false);
    }
  });
}
