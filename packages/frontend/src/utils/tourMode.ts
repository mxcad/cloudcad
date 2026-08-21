/**
 * 引导模式运行时状态（L1 基础设施）
 *
 * 用于跨组件/跨层通信：ui 组件（如 Modal）在引导模式激活时
 * 需要调整交互（禁止点击遮罩关闭），但不能依赖 L2 Context。
 * TourProvider 通过 setTourModeActive 同步该状态。
 */

let tourModeState = false;

/** 获取当前引导模式状态 */
export function isTourModeActive(): boolean {
  return tourModeState;
}

/** 设置当前引导模式状态 */
export function setTourModeActive(active: boolean): void {
  tourModeState = active;
}
