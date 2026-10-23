import { useSyncExternalStore } from 'react';
import {
  getAppBrandSnapshot,
  subscribeBrandChanges,
  type AppBrandConfig,
} from '../constants/appConfig';

/**
 * 应用品牌标题 / 标语 / Logo 的响应式出口。
 *
 * 裸 `getAppBrandConfig()` 只读模块级缓存，不参与 React 依赖——管理端改完
 * `brandTitle` / `brandLogo` 后，那些调用点不会重渲染，页面（含 CAD 编辑器的
 * 常驻组件）会一直显示旧值直到整页刷新。这里挂上 `useSyncExternalStore`
 * 才跟着变。
 */
export function useAppBrand(): AppBrandConfig {
  return useSyncExternalStore(
    subscribeBrandChanges,
    getAppBrandSnapshot,
    getAppBrandSnapshot
  );
}
