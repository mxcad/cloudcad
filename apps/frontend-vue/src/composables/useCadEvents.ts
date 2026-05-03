import { onUnmounted } from 'vue';

/**
 * CAD 事件通信 Composable
 *
 * 职责：
 *   - 封装 CustomEvent，提供 on/emit 方法
 *   - 组件卸载时自动清理监听器
 *   - 事件名统一前缀 mxcad- 以保持与 React 版兼容
 *
 * 使用方式：
 *   const { emit, on } = useCadEvents()
 *   emit('file-opened', { fileId: '123' })
 *   on('file-opened', (payload) => { ... })
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (payload: any) => void;

interface RegisteredHandler {
  event: string;
  handler: EventHandler;
  listener: (e: Event) => void;
}

export function useCadEvents() {
  const handlers: RegisteredHandler[] = [];

  /**
   * 注册事件监听器
   * @param event 事件名（自动添加 mxcad- 前缀）
   * @param handler 事件处理函数
   */
  function on(event: string, handler: EventHandler): void {
    const fullEvent = `mxcad-${event}`;
    const listener = (e: Event) => {
      handler((e as CustomEvent).detail);
    };

    window.addEventListener(fullEvent, listener);
    handlers.push({ event: fullEvent, handler, listener });
  }

  /**
   * 发送事件
   * @param event 事件名（自动添加 mxcad- 前缀）
   * @param detail 事件负载
   */
  function emit(event: string, detail?: unknown): void {
    const fullEvent = `mxcad-${event}`;
    window.dispatchEvent(new CustomEvent(fullEvent, { detail }));
  }

  /**
   * 移除指定事件的所有监听器
   */
  function off(event: string): void {
    const fullEvent = `mxcad-${event}`;
    const idx = handlers.findIndex((h) => h.event === fullEvent);

    while (idx !== -1) {
      const [removed] = handlers.splice(idx, 1);
      window.removeEventListener(removed.event, removed.listener);
    }
  }

  /**
   * 自动清理：在组件卸载时移除所有在此 composable 注册的监听器
   */
  function cleanup(): void {
    for (const { event, listener } of handlers) {
      window.removeEventListener(event, listener);
    }
    handlers.length = 0;
  }

  onUnmounted(cleanup);

  return { on, emit, off };
}
