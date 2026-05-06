/**
 * useMxCADPreload - CAD 引擎预加载 Hook
 *
 * 在非 CAD 页面挂载时，利用浏览器空闲时间预加载 CAD 引擎依赖，
 * 减少进入 /cad-editor 时的白屏时间。
 */
import { useEffect, useRef } from 'react';

// 预加载状态（全局单例，避免重复预加载）
let preloadPromise: Promise<void> | null = null;
let isPreloaded = false;

/**
 * 预加载 CAD 引擎依赖
 * 包括：mxcad-app 样式、mxcadManager、mxcad-app 核心
 */
async function preloadCADDependencies(): Promise<void> {
  if (isPreloaded) return;

  try {
    console.log('[MxCAD Preload] 开始预加载 CAD 引擎...');

    // 1. 预加载 mxcad-app 样式（轻量）
    // @ts-expect-error - mxcad-app 没有类型定义
    await import('mxcad-app/style');

    // 2. 预加载 mxcadManager（包含 mxcad-app 核心和 mxdraw）
    await import('../services/mxcadManager');

    isPreloaded = true;
    console.log('[MxCAD Preload] CAD 引擎预加载完成');
  } catch (error) {
    console.warn('[MxCAD Preload] 预加载失败:', error);
    // 预加载失败不阻塞，允许重试
    preloadPromise = null;
  }
}

/**
 * 检查 CAD 引擎是否已预加载
 */
export function isMxCADPreloaded(): boolean {
  return isPreloaded;
}

/**
 * useMxCADPreload Hook
 *
 * 在非 CAD 页面使用此 hook，浏览器空闲时预加载 CAD 引擎。
 * 当用户导航到 /cad-editor 时，如果预加载完成，可以立即显示编辑器。
 */
export function useMxCADPreload() {
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    // 如果已经预加载完成，跳过
    if (isPreloaded) return;

    // 防止重复调度
    if (hasScheduledRef.current) return;
    hasScheduledRef.current = true;

    // 使用 requestIdleCallback 在浏览器空闲时预加载
    // 如果不支持，则延迟 2 秒后开始
    const schedulePreload = () => {
      if ('requestIdleCallback' in window) {
        (window as Window).requestIdleCallback(
          () => {
            if (!isPreloaded && !preloadPromise) {
              preloadPromise = preloadCADDependencies();
            }
          },
          { timeout: 5000 } // 最多等待 5 秒后强制执行
        );
      } else {
        // 降级方案：延迟 2 秒后开始
        setTimeout(() => {
          if (!isPreloaded && !preloadPromise) {
            preloadPromise = preloadCADDependencies();
          }
        }, 2000);
      }
    };

    schedulePreload();
  }, []);
}
