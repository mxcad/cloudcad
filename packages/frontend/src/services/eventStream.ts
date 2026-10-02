import { getApiBaseUrl } from '@/config/apiConfig';

/**
 * SSE 事件流唯一接线出口。
 *
 * 全仓唯一允许 `new EventSource` 的位置（SDK 无 SSE 形态，token/业务参数走
 * query，ADR-0034 豁免清单）。此前转换面板、批量下载进度、公开文件转换等待
 * 三处各自内联 EventSource 接线，token 编码、畸形帧忽略、关流时机、降级路径
 * 各写一份；现收敛于此，调用方只声明「订阅什么端点、每帧干什么」。
 */

export type EventStreamCloseReason = 'timeout' | 'error' | 'manual';

export interface EventStreamHandle {
  /** 手动关流（幂等；组件卸载 / 调用方终态时调用） */
  close(): void;
}

export interface OpenEventStreamOptions {
  /** 端点路径（以 / 开头），自动拼 API base */
  path: string;
  /** query 参数（值统一 encodeURIComponent；undefined 项跳过） */
  query?: Record<string, string | undefined>;
  /** 超时（毫秒）：超时关流并以 'timeout' 回调 onClose */
  timeoutMs?: number;
  /** 出错是否关流。默认 true（关流 + onClose('error')，轮询等兜底接管）；
   *  断连需依赖 EventSource 自动重连的端点传 false（后端重连后重推当前状态） */
  closeOnError?: boolean;
  /** 每帧回调，入参为已 JSON.parse 的帧数据；畸形帧已在实现内静默忽略 */
  onFrame: (data: unknown) => void;
  onClose?: (reason: EventStreamCloseReason) => void;
}

/**
 * 打开一条 SSE 事件流。EventSource 不可用（非浏览器环境）返回 null，由调用方
 * 走各自降级路径（轮询 / 直接判失败）。
 */
export function openEventStream(
  options: OpenEventStreamOptions
): EventStreamHandle | null {
  if (typeof EventSource === 'undefined') return null;

  // 与原各站点手拼行为逐字节一致：encodeURIComponent（URLSearchParams 会把空格
  // 编成 +，与既有端点/服务端解析习惯不同，不用）
  const qs = Object.entries(options.query ?? {})
    .filter((entry) => entry[1] !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`
    )
    .join('&');
  const url = `${getApiBaseUrl()}${options.path}${qs ? `?${qs}` : ''}`;

  // eslint-disable-next-line no-restricted-syntax -- 豁免：SSE 唯一接线点（SDK 无 SSE 形态，token/参数走 query，ADR-0034 豁免清单）
  const es = new EventSource(url);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = (reason: EventStreamCloseReason): void => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    es.close();
    options.onClose?.(reason);
  };

  if (options.timeoutMs !== undefined) {
    timer = setTimeout(() => close('timeout'), options.timeoutMs);
  }

  es.onmessage = (event: MessageEvent) => {
    try {
      options.onFrame(JSON.parse(event.data));
    } catch {
      // 畸形帧静默忽略（单帧失败不影响后续帧；断连重连由 EventSource 处理）
    }
  };

  if (options.closeOnError !== false) {
    es.onerror = () => close('error');
  }
  // closeOnError=false 时不设 onerror：断连由 EventSource 自动重连

  return { close: () => close('manual') };
}
