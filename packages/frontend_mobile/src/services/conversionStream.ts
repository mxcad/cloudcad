import { getApiBaseUrl } from '@/utils/apiConfig';

/**
 * 无节点（本地上传 / 公开图纸）转换完成的实时推送订阅。
 *
 * 移动端打开本地 .dwg/.dxf 时，上传请求立即返回、转换在后台进行。后端
 * `GET /api/v1/mxcad/conversion/file-stream?hash=<md5>`（@Public、@ApiExcludeEndpoint，
 * 不进 SDK——EventSource 订阅无 SDK 形态，ADR-0034）建连先推一次当前状态
 * （处理「订阅前已转完」的竞态），转换结束再推终态并主动断流。
 *
 * 这是移动端唯一的转换就绪信号。此前 command/open 靠 checkPublicFileExternalRefs 的
 * preloading.json 重试（10×2s）碰巧兜住了等待，但该函数永远 resolve true、永不阻塞。
 */

export type ConversionStatus = 'COMPLETED' | 'FAILED';

/** 等待超时：终态事件迟迟不到（服务端任务丢失，如服务重启）按失败处理 */
export const CONVERSION_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 等待某 hash 的无节点转换终态。
 *
 * 返回 COMPLETED 才会去打开 mxweb：access 端点按 hash 在 uploads/ 查找，
 * mxweb 未就位时返回 404，引擎只能把它当成「打开图纸失败」，用户看不到转换进度。
 * EventSource 不可用（老浏览器 / 非 secure 上下文）同样按失败处理——静默继续打开
 * 只会得到不可诊断的 404。
 */
export function waitPublicConversion(
  hash: string,
  timeoutMs: number = CONVERSION_WAIT_TIMEOUT_MS
): Promise<ConversionStatus> {
  return new Promise((resolve) => {
    if (typeof EventSource === 'undefined') {
      resolve('FAILED');
      return;
    }

    let settled = false;
    // eslint-disable-next-line no-restricted-syntax -- 豁免：公开转换 SSE，SDK 无 SSE 形态（ADR-0034，与 PC mxcadOpenFile.waitPublicFileConverted 同判定）
    const es = new EventSource(
      `${getApiBaseUrl()}/v1/mxcad/conversion/file-stream?hash=${encodeURIComponent(hash)}`
    );

    const finish = (status: ConversionStatus): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      es.close();
      resolve(status);
    };

    const timer = setTimeout(() => finish('FAILED'), timeoutMs);

    es.onmessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { status?: string };
        if (payload.status === 'COMPLETED' || payload.status === 'FAILED') {
          finish(payload.status);
        }
        // PROCESSING（建连推的当前状态）→ 继续等终态
      } catch {
        // 忽略畸形帧
      }
    };

    // 断连由 EventSource 自动重连，重连后后端会重推当前状态，无需手动处理
  });
}
