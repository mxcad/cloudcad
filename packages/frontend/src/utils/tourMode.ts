/**
 * 引导模式运行时状态（L1 基础设施）
 *
 * 用于跨组件/跨层通信：ui 组件（如 Modal）在引导模式激活时
 * 需要调整交互（禁止点击遮罩关闭），但不能依赖 L2 Context。
 *
 * 唯一事实源是这个小 store：命令式读点走 isTourModeActive()，
 * 响应式读点（引导开关影响渲染）走 useIsTourModeActive()。
 * TourProvider 是唯一写入方，不存在第二份镜像状态。
 */

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

interface TourModeState {
  active: boolean;
}

export const useTourModeStore = create<TourModeState>(() => ({
  active: false,
}));

/** 获取当前引导模式状态（命令式读点） */
export function isTourModeActive(): boolean {
  return useTourModeStore.getState().active;
}

/** 设置当前引导模式状态（TourProvider 唯一写入方） */
export function setTourModeActive(active: boolean): void {
  useTourModeStore.setState({ active });
}

/** 响应式读点：引导模式开关变化会触发重渲染 */
export function useIsTourModeActive(): boolean {
  return useSyncExternalStore(
    useTourModeStore.subscribe,
    () => useTourModeStore.getState().active,
    () => false
  );
}
