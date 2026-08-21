/**
 * 图纸会话（Drawing Session）— 类型化事件 bus
 *
 * 取代 window 裸字符串事件（ADR-0039 决策 2）：subscribe/emit 全部走类型化签名，
 * payload 类型由 sessionEvents.ts 单一来源定义。
 *
 * 订阅分为两类（评审修复）：
 *  - 常驻订阅（subscribePermanent）：模块加载时注册（如 session 的 DATABASE_MODIFIED
 *    → 置脏），clearDrawingSessionListeners 不会清除，保证测试/应用内清理不破坏
 *    模块级行为。
 *  - 外部订阅（subscribe）：组件/hook 注册的订阅，clearDrawingSessionListeners 清空。
 */
import type {
  DrawingEvent,
  DrawingEventPayload,
  DrawingEventHandler,
} from './sessionEvents';

type AnyHandler = (payload: unknown) => void;

/** 外部订阅（可被 clearDrawingSessionListeners 清空） */
const listeners = new Map<DrawingEvent, Set<AnyHandler>>();

/** 常驻订阅（模块加载时注册，clear 不清除） */
const permanentListeners = new Map<DrawingEvent, Set<AnyHandler>>();

function register(
  map: Map<DrawingEvent, Set<AnyHandler>>,
  event: DrawingEvent,
  handler: AnyHandler
): () => void {
  let set = map.get(event);
  if (!set) {
    set = new Set<AnyHandler>();
    map.set(event, set);
  }
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

/** 订阅会话事件（外部订阅），返回取消订阅函数 */
export function subscribe<E extends DrawingEvent>(
  event: E,
  handler: DrawingEventHandler<E>
): () => void {
  return register(listeners, event, handler as AnyHandler);
}

/** 订阅会话事件（常驻订阅，模块加载时注册，clear 不清除） */
export function subscribePermanent<E extends DrawingEvent>(
  event: E,
  handler: DrawingEventHandler<E>
): () => void {
  return register(permanentListeners, event, handler as AnyHandler);
}

/** 事件参数元组：无 payload 事件可省略参数 */
type EmitArgs<E extends DrawingEvent> =
  DrawingEventPayload<E> extends void ? [] : [payload: DrawingEventPayload<E>];

/** 发布会话事件（同步派发，仅内部使用）；单个 handler 抛错不阻断后续 handler */
export function emit<E extends DrawingEvent>(
  event: E,
  ...args: EmitArgs<E>
): void {
  const payload = args[0] as never;
  dispatch(listeners.get(event), payload, event);
  dispatch(permanentListeners.get(event), payload, event);
}

function dispatch(
  set: Set<AnyHandler> | undefined,
  payload: unknown,
  event: DrawingEvent
): void {
  if (!set) return;
  for (const handler of Array.from(set)) {
    try {
      handler(payload);
    } catch (error) {
      // 不吞静默：记录错误，但保证一个 handler 失败不阻断其他 handler
      console.error(`[sessionBus] handler for ${String(event)} 抛异常:`, error);
    }
  }
}

/** 清空外部订阅（测试辅助）；常驻订阅保留 */
export function clearDrawingSessionListeners(): void {
  listeners.clear();
}
