/**
 * useMxCADPreload - CAD 引擎预加载 Hook
 *
 * 在非 CAD 页面挂载时，等待页面加载完成后利用浏览器空闲时间预加载 CAD 引擎依赖，
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

    // 预加载 mxcadManager（包含 mxcad-app 核心和 mxdraw）
    // 注意：不要手动 import('mxcad-app/style')，mxcad-app 会自动加载样式。
    // 手动导入会导致全局样式冲突，破坏 mxdraw WebGL 渲染。
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
 * 判断当前路由是否为 CAD 编辑器路由
 */
function isCADRoute(): boolean {
  const { pathname } = window.location;
  return pathname === '/' || pathname === '/cad-editor' || pathname.startsWith('/cad-editor/');
}

/**
 * 调度预加载 — 等待页面 load 事件后再用 requestIdleCallback 空闲时执行
 */
function scheduleIdlePreload(): void {
  const doSchedule = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(
        () => {
          if (!isPreloaded && !preloadPromise) {
            preloadPromise = preloadCADDependencies();
          }
        },
        { timeout: 5000 }
      );
    } else {
      // 降级方案：延迟 1 秒后开始
      setTimeout(() => {
        if (!isPreloaded && !preloadPromise) {
          preloadPromise = preloadCADDependencies();
        }
      }, 1000);
    }
  };

  // 如果页面已加载完成，立即调度
  if (document.readyState === 'complete') {
    doSchedule();
  } else {
    // 等待页面 load 事件后再调度空闲预加载
    window.addEventListener('load', () => doSchedule(), { once: true });
  }
}

/**
 * useMxCADPreload Hook
 *
 * 在非 CAD 页面使用此 hook，页面加载完成后在浏览器空闲时预加载 CAD 引擎。
 * 当用户导航到 /cad-editor 时，如果预加载完成，可以立即显示编辑器。
 */
export function useMxCADPreload() {
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    // CAD 编辑器自身会加载依赖，无需预加载
    if (isPreloaded || isCADRoute()) return;

    // 防止重复调度
    if (hasScheduledRef.current) return;
    hasScheduledRef.current = true;

    scheduleIdlePreload();
  }, []);
}
