/**
 * useSidebarContentReady — 侧边栏数据内容面板的就绪门控
 *
 * CAD 编辑器启动阶段，侧边栏 Tab 栏可立即渲染，但数据密集的内容面板
 *（项目/图纸/图块列表、分类树）延迟到 mxcad-app 引擎就绪 + 图纸打开终态之后
 * 再加载，避免与图纸 mxweb 下载抢带宽、与引擎初始化抢主线程。
 *
 * 放行条件（engineReady 为前提，任一满足即放行）：
 * - !isActive：非 CAD 路由，编辑器不可见，不门控
 * - 无图纸入口：主页空白模式 / 协同链接
 * - settled：图纸打开终态已定（成功写入 fileInfo 或失败写入 error）
 * - 打开已结束：曾观察到打开操作且现已结束（everHadPendingOpen && !hasPendingOpen）
 * - 故障兜底：引擎就绪满超时且仍无终态，放行让用户能用侧边栏换图纸自救
 *
 * 判据细节与理由：
 *
 * 1. 间隙判据必须带 everHadPendingOpen：首次打开是两段式（useCadFileLoader 先
 *    initializeMxCADView 无参加载默认空模板，引擎 ready 后才调 openFile 打开目标图纸），
 *    引擎 isReady() 变 true 的瞬间 openFile 尚未调用、pendingOpenInfo 尚未设置，
 *    hasPendingOpen() 为 false。若无 everHadPendingOpen 前缀，会在图纸开始打开的瞬间
 *    误判为间隙而提前放行，门控形同虚设。
 *
 * 2. 兜底按时长分两档而非一刀切：
 *    - 从未观察到打开操作 → NO_OPEN_FALLBACK_MS（打开流程未启动）
 *    - 打开进行中但终态永不来 → OPEN_STALL_FALLBACK_MS（引擎 _isStopLoading 闩锁
 *      致 openFileComplete 被吞、retCall 也未到达）。openFile 自身 60s 超时写 error
 *      触发 settled，这里提前 30s 放行给用户留自救窗口——否则侧边栏永久卡住，
 *      用户连「换一张图纸」都做不到。
 *    正常慢打开不该被超时抢占：它有 fileInfo/error 终态，会走 settled 判据。
 *
 * 3. 不用 loading state：useCadFileLoader 在 waitForEngineReady + 2 RAF 后就置 false，
 *    早于图纸打开完成。不用 OPEN_COMPLETE 事件：空模板 empty_template.mxweb 也派发。
 *
 * 一次性放行：放行后停止轮询。侧边栏已挂载，后续切图纸不再门控——也避免 contentReady
 * false→true 抖动导致面板卸载重挂载、丢失树展开/滚动等本地状态。
 */
import { useEffect, useRef, useState } from 'react';
import { useDrawingSession } from '../services/drawingSession';

/** 引擎状态轮询间隔，与 waitForEngineReady / useCollabActions 一致 */
const POLL_INTERVAL_MS = 200;
/** 从未观察到打开操作时的兜底上限（打开流程未启动） */
const NO_OPEN_FALLBACK_MS = 15_000;
/** 打开进行中但终态永不来时的兜底上限（故障自救窗口） */
const OPEN_STALL_FALLBACK_MS = 30_000;

export interface UseSidebarContentReadyOptions {
  /** 是否处于 CAD 编辑器路由 */
  isActive: boolean;
  /** 主页空白模式（无图纸入口） */
  isHomeMode: boolean;
  /** 协同链接（图纸由 auto-join 加载，无 useCadFileLoader 打开动作） */
  isCollabLink: boolean;
  /** 打开失败信息 */
  error: string | null;
}

export function useSidebarContentReady({
  isActive,
  isHomeMode,
  isCollabLink,
  error,
}: UseSidebarContentReadyOptions): boolean {
  const { fileInfo } = useDrawingSession();
  const [contentReady, setContentReady] = useState(false);

  // probe 闭包读取最新依赖快照：effect 只随 isActive 重启，
  // 依赖变化（fileInfo/error）不能触发重启，否则 everHadPendingOpen 会归零
  const depsRef = useRef({ isHomeMode, isCollabLink, error, fileInfo });
  depsRef.current = { isHomeMode, isCollabLink, error, fileInfo };

  useEffect(() => {
    if (!isActive) {
      setContentReady(true);
      return;
    }
    setContentReady(false);

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let everHadPendingOpen = false;
    let readyAt = 0;
    let ready = false;

    const probe = async () => {
      if (stopped) return;
      const { mxcadManager } = await import('../services/mxcadManager');
      const { isHomeMode, isCollabLink, error, fileInfo } = depsRef.current;

      const engineReady = mxcadManager.isReady();
      const hasPendingOpen = mxcadManager.hasPendingOpen();
      if (hasPendingOpen) everHadPendingOpen = true;
      if (engineReady && readyAt === 0) readyAt = Date.now();
      if (!engineReady) readyAt = 0;

      const settled = fileInfo !== null || error !== null;
      const stallLimit = everHadPendingOpen
        ? OPEN_STALL_FALLBACK_MS
        : NO_OPEN_FALLBACK_MS;

      const next = engineReady && (
        isHomeMode ||
        isCollabLink ||
        settled ||
        (everHadPendingOpen && !hasPendingOpen) ||
        (readyAt > 0 && Date.now() - readyAt >= stallLimit)
      );

      if (next !== ready) {
        ready = next;
        setContentReady(next);
        if (next && timer) {
          // 一次性放行：停止轮询
          clearInterval(timer);
          timer = null;
        }
      }
    };

    void probe();
    timer = setInterval(() => void probe(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [isActive]);

  return contentReady;
}

export default useSidebarContentReady;
