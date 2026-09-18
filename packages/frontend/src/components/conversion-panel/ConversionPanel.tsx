///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this code, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import React, {
  useEffect,
  useCallback,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ListTodo } from 'lucide-react';
import { Z_LAYERS } from '@/constants/layers';
import { t } from '@/languages';
import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken } from '@/utils/tokenUtils';
import {
  useConversionQueueStore,
  hasActiveTask,
  countActiveTasks,
  CONVERSION_POLL_INTERVAL_MS,
  type ConversionTask,
} from '@/stores/conversionQueueStore';
import { useBatchDownload } from '@/hooks/file-system/useBatchDownload';
import { usePanelAutoCollapse } from '@/hooks/conversion/usePanelAutoCollapse';
import { useConversionQuota } from '@/hooks/conversion/useConversionQuota';
import { useUploadManager } from '@/hooks/useUploadManager';
import type { UploadTask } from '@/utils/uploadManager';
import { ConversionTab } from './ConversionTab';
import { DownloadTab } from './DownloadTab';
import { UploadTab } from './UploadTab';
import './ConversionPanel.css';

/** 拖动判定阈值（px）：header pointerdown 后位移小于该值视为「点击」，不进入拖动 */
const DRAG_THRESHOLD_PX = 5;
/** 滚动容器距底部多少 px 时触发加载下一页历史 */
const LOAD_MORE_THRESHOLD_PX = 48;
/** 面板最小尺寸（#476）：resize 下限 */
const MIN_PANEL_W = 260;
const MIN_PANEL_H = 180;
/** 面板距视口边缘的最小留白（#476）：clamp 不超屏 */
const PANEL_EDGE_MARGIN = 8;

/**
 * 把 store 里的 position + size 按面板尺寸 clamp 回视口内（窗口 resize / 展开面板共用）。
 *
 * 上次持久化的位置是按更小/更大的尺寸记录的，同一 position 换尺寸后必然可能越界，
 * 故展开前必须按面板尺寸重算一次——否则首帧渲染在屏外，要手动拖一下 header 才弹回。
 * position 为 null 时面板走 CSS 右下角默认定位，天然在屏内，无需处理。
 */
function clampPanelToViewport(): void {
  const state = useConversionQueueStore.getState();
  const pos = state.position;
  if (!pos) return;
  const sz = state.size;
  const w = Math.min(
    Math.max(MIN_PANEL_W, sz.width),
    Math.max(MIN_PANEL_W, window.innerWidth - PANEL_EDGE_MARGIN * 2)
  );
  const h = Math.min(
    Math.max(MIN_PANEL_H, sz.height),
    Math.max(MIN_PANEL_H, window.innerHeight - PANEL_EDGE_MARGIN * 2)
  );
  const x = Math.min(
    Math.max(PANEL_EDGE_MARGIN, pos.x),
    Math.max(PANEL_EDGE_MARGIN, window.innerWidth - w - PANEL_EDGE_MARGIN)
  );
  const y = Math.min(
    Math.max(PANEL_EDGE_MARGIN, pos.y),
    Math.max(PANEL_EDGE_MARGIN, window.innerHeight - h - PANEL_EDGE_MARGIN)
  );
  if (w !== sz.width || h !== sz.height) state.setSize({ width: w, height: h });
  if (x !== pos.x || y !== pos.y) state.setPosition({ x, y });
}

/**
 * 切换文件队列面板显隐（#497：悬浮药丸已取消，入口只剩这两处）。
 *
 * 顶栏按钮（Layout）与 CAD 命令 Mx_ToggleFileQueue 共用。展开时先按面板尺寸 clamp 回
 * 视口内，保证首帧就在屏内；走 setCollapsed 清掉任务驱动标记，故用户显式打开的面板
 * 不会被「无 active 任务后延迟自动收起」收掉。
 */
export function toggleFileQueuePanel(): void {
  const state = useConversionQueueStore.getState();
  if (state.collapsed) {
    clampPanelToViewport();
    state.setCollapsed(false);
  } else {
    state.setCollapsed(true);
  }
}

// ==================== ConversionPanel ====================

/**
 * 统一队列面板（#471 / #475 / S6 / #476）
 *
 * 可拖动的浮动面板（默认右下角，位置 + 尺寸持久化，#476）+ 三个 tab：
 * - 转换 tab：云端 + 本地结合列表（live active+failed + 本地）+ 云端已完成历史（分页滚动加载）。
 *   云端行 = 用户的文件（DB fileSystemNode），仅「打开」；本地行 = 临时日志（localStorage 自动过期），纯展示。
 * - 下载 tab：批量下载任务（useBatchDownloadStore，进度 + ZIP/逐个下载）。记录由后端 cron 自动过期，不做手动删除。
 * - 上传 tab：本地上传/转换任务（useUploadManager，进度条 + 暂停/恢复/重试，历史任务从 localStorage 恢复）。
 *
 * 有进行中任务时每 5s 轮询云端刷新状态；面板默认收起，仅本会话新动作
 * （上传 / 下载 / 触发转换）自动展开；任务自动展开的面板在无 active 任务后
 * 延迟自动收起（S6-3），用户手动打开的面板保持展开不被收掉。
 * 已完成且关联节点的任务提供「打开」按钮（新标签页打开 CAD 编辑器）。
 */
export function ConversionPanel() {
  const {
    tasks,
    collapsed,
    autoDismissable,
    cloudLoading,
    position,
    size,
    search,
    history,
    historyHasMore,
    historyLoading,
    setCollapsed,
    expandByTask,
    setPosition,
    setSize,

    setSearch,
    refreshCloud,
    refreshHistory,
    loadMoreHistory,
    cancelTask,
    retryTask,
  } = useConversionQueueStore();

  /** 转换配额（ADR-0043 只读）：本窗口剩余额度，仅展示 */
  const { quota, refresh: refreshQuota } = useConversionQuota();

  /** 失败任务重试（原地重新排队，不占配额、不重新上传；完成后刷新配额条） */
  const handleRetry = (task: ConversionTask) => {
    void retryTask(task).then(() => refreshQuota());
  };

  /** 下载/上传 tab 独立搜索词（转换 tab 用 store 的 search，因其触发历史重取；三 tab 各持一词，切 tab 互不串扰） */
  const [downloadSearch, setDownloadSearch] = useState('');
  const [uploadSearch, setUploadSearch] = useState('');

  const { stats: uploadStats } = useUploadManager({ maxConcurrent: 3 });

  const {
    tasks: downloadTasks,
    syncTasksFromServer,
    retryTask: retryDownloadTask,
    retryFailedItems: retryDownloadFailedItems,
  } = useBatchDownload();

  /** 面板 tab：转换 / 下载 / 上传，每个 tab 独立，不混在一起 */
  const [activeTab, setActiveTab] = useState<
    'conversion' | 'download' | 'upload'
  >('conversion');

  /** 下载任务服务端同步是否完成（面板默认关闭：同步前 hydrate 的历史记录不算新动作） */
  const [downloadSynced, setDownloadSynced] = useState(false);

  const activeCount = countActiveTasks(tasks);
  const hasActive = hasActiveTask(tasks);
  /** 活跃上传数（上传中/等待/暂停）：历史（done/failed）不计入，避免面板因历史永不收起 */
  const uploadActiveCount =
    uploadStats.uploading + uploadStats.waiting + uploadStats.paused;

  // 搜索防抖：输入变化立即更新 search（tasks 客户端过滤即时生效），300ms 后
  // 以新搜索词重新拉取历史（DB 侧跨分页检索，前端只持有已加载页）
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // 搜索框输入：按当前 tab 更新对应搜索词。转换 tab 用 store search（即时过滤 live/本地任务）
  // + 防抖触发历史重取（DB 侧跨分页检索）；下载/上传 tab 用各自独立搜索词（客户端过滤）。
  const handleSearchChange = (value: string) => {
    if (activeTab === 'conversion') {
      setSearch(value);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        refreshHistory();
      }, 300);
    } else if (activeTab === 'download') {
      setDownloadSearch(value);
    } else {
      setUploadSearch(value);
    }
  };

  /** 当前 tab 的搜索词（搜索框绑定值） */
  const activeSearch =
    activeTab === 'conversion'
      ? search
      : activeTab === 'download'
        ? downloadSearch
        : uploadSearch;

  // 初次挂载拉取（面板常驻，无需任务门控，S6-2/S6-8）。面板是「本地 + 云端」统一
  // 任务列表，对游客 / 登录用户一视同仁：store.refreshCloud 内部已按 token 门控云端
  // 拉取（游客无 node.taskId 云端任务，拉取 no-op，本地任务照常合并显示）
  useEffect(() => {
    refreshCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 初次挂载同步下载任务（刷新/重开后从服务端 hydrate 下载记录，后端 cron 自动过期）。
  // 同步完成前 settled 保持 false：hydrate 进来的历史记录不算本会话新触发的下载。
  useEffect(() => {
    syncTasksFromServer().finally(() => setDownloadSynced(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 初始数据 hydrate 完成（云端任务首次拉取 + 下载任务服务端同步）。
   *
   * 单调 latch：一旦为 true 不再回退（polling / SSE 触发的后续 refreshCloud 会把
   * cloudLoading 短暂置 true）。此前只记录基线，存量任务不触发自动展开。
   */
  const [settled, settleInitial] = useState(false);
  useEffect(() => {
    if (settled || cloudLoading || !downloadSynced) return;
    settleInitial(true);
  }, [settled, cloudLoading, downloadSynced]);

  // 有进行中任务或面板展开时轮询（S4-3 兜底：SSE 断连 / 事件丢失 / 项目成员无
  // per-owner 通道时，5s 轮询保证最终一致；SSE 正常时提供 sub-5s 实时推送，二者叠加
  // 无害——refreshCloud 幂等）。
  //
  // 不能只门控到 hasActive：任务列表只由 refreshCloud 填充，而 refreshCloud 的触发点
  // 全在这个门控之内，hasActive 一旦为 false 就再也无法变回 true —— 面板永久失明
  // （另一标签页发起的转换不显示、不自动展开、顶栏角标恒 0）。展开态用户在看着面板，
  // 5s 拉取是合理成本；折叠且无任务时轮询与 SSE 都关，省连接；跨标签页发起的任务由
  // store 的 BroadcastChannel 唤醒本标签页。
  // 面板对游客 / 登录用户一视同仁：store.refreshCloud 内部已按 token 门控云端拉取
  // （游客无云端任务时 no-op，本地任务照常显示），故面板层不再按 token 掐断
  useEffect(() => {
    if (!hasActive && collapsed) return;
    const interval = setInterval(() => {
      refreshCloud();
    }, CONVERSION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActive, collapsed, refreshCloud]);

  // S4-3：SSE 实时推送（per-user 长连接）——任务终态变更时后端 emit，前端收到即 refreshCloud。
  // 门控到 hasActive：无进行中任务时不订阅（省常驻连接，HTTP/1.1 下避免占满浏览器 6 连接
  // 池致普通请求排队）；有任务时订阅 + 5s 轮询叠加，保证角标/列表实时刷新。
  // token 走 query（EventSource 无法带 Authorization header，与 batch-download SSE 一致）。
  // 游客（无 token）/ 非浏览器环境（无 EventSource）不订阅；SSE 失败/断连时关闭（轮询兜底）。
  useEffect(() => {
    if (!hasActive) return;
    const token = getValidToken();
    if (!token || typeof EventSource === 'undefined') return;
    const url = `${getApiBaseUrl()}/v1/mxcad/conversion/tasks/stream?token=${encodeURIComponent(token)}`;
    // eslint-disable-next-line no-restricted-syntax -- 豁免：转换任务状态 SSE（SDK 无 SSE 形态，token 走 query，ADR-0034 豁免清单，参照 useBatchDownload）
    const es = new EventSource(url);
    es.onmessage = () => {
      // 任意消息（初始刷新信号 / 状态变更 / 保活注释不触发）→ 刷新云端列表
      refreshCloud();
    };
    es.onerror = () => {
      // SSE 失败/断连：关闭（5s 轮询兜底继续刷新）
      es.close();
    };
    return () => {
      es.close();
    };
  }, [hasActive, refreshCloud]);

  // 面板展开时拉取最新已完成历史 + 进行中任务（保证打开面板即见完整列表，#476）。
  // 进行中列表必须一并刷：refreshCloud 的所有触发点都被门控到 hasActive，而手动展开
  // 是用户唯一的「我知道可能有新任务」信号，不收这里就会看到陈旧的进行中列表。
  // refreshCloud 只挂在「折叠 → 展开」这一跳：初次挂载的云端拉取已由上面的挂载 effect
  // 负责（collapsed=false 的挂载态 wasCollapsed 恒为 false），跳过可避免挂载即重复拉取
  const prevCollapsedRef = useRef(collapsed);
  useEffect(() => {
    const wasCollapsed = prevCollapsedRef.current;
    prevCollapsedRef.current = collapsed;
    if (!collapsed) {
      refreshHistory();
      if (wasCollapsed) refreshCloud();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  // 任务驱动的自动展开：先 clamp 回视口内再展开，保证首帧就在屏内（见 clampPanelToViewport）。
  // 已展开时 expandByTask 不改 autoDismissable——面板可能是用户手动打开的，
  // 任务到达不应让它变成可自动收起。
  const expandPanel = useCallback(() => {
    clampPanelToViewport();
    expandByTask();
  }, [expandByTask]);

  const { activeDownloadCount } = usePanelAutoCollapse({
    hasActive,
    activeCount,
    uploadActiveCount,
    downloadTasks,
    settled,
    autoDismissable,
    expandPanel,
    setActiveTab,
    setCollapsed,
  });
  const hasActiveDownload = activeDownloadCount > 0;

  // 拖动逻辑（展开态 header）：
  // - pointerdown 记录指针相对定位盒的偏移（position 为视口绝对坐标，应用到外层 portal position: fixed），
  //   避免按下瞬间元素跳到指针处；
  // - 位移小于 DRAG_THRESHOLD_PX 视为「点击」，不进入拖动；
  // - 位置 clamp 在视口内。
  const beginDrag = useCallback((e: React.PointerEvent) => {
    // 从 header 拖动 → 所属面板是定位盒
    const box =
      (e.currentTarget as HTMLElement).closest('.conversion-panel') ??
      e.currentTarget;
    const rect = (box as HTMLElement).getBoundingClientRect();
    const state = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    e.preventDefault();

    const onMove = (ev: PointerEvent) => {
      if (!state.moved) {
        // 未超阈值 = 点击，不拖动
        if (
          Math.abs(ev.clientX - state.startX) < DRAG_THRESHOLD_PX &&
          Math.abs(ev.clientY - state.startY) < DRAG_THRESHOLD_PX
        ) {
          return;
        }
        state.moved = true;
      }
      const x = Math.min(
        Math.max(8, ev.clientX - state.dx),
        Math.max(8, window.innerWidth - state.width - 8)
      );
      const y = Math.min(
        Math.max(8, ev.clientY - state.dy),
        Math.max(8, window.innerHeight - state.height - 8)
      );
      setPosition({ x, y });
    };
    const endDrag = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }, [setPosition]);

  // 边缘/角落 resize（#476）：四边（e/w/s/n）+ 四角（se/sw/ne/nw）手柄。
  // - pointerdown 记录起点 + 起始宽高 + 左上角（position 为 null 时先固定到当前 rect，保证缩放基准一致）；
  // - 右/下方向：左上角固定，宽/高扩展（clamp 到视口内，右下不超屏）；
  // - 左/上方向：左上角反向移动，宽/高收缩（clamp 左边/上边不越界、宽/高不小于最小值），并同步更新 position；
  // - 尺寸 + 位置持久化由 store.setSize/setPosition 承担（写入 localStorage）。
  const beginResize = useCallback(
    (
      e: React.PointerEvent,
      dir: 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw'
    ) => {
      const panelEl = (e.currentTarget as HTMLElement).closest(
        '.conversion-panel'
      ) as HTMLElement;
      const rect = panelEl.getBoundingClientRect();
      const state = useConversionQueueStore.getState();
      // position 为 null（默认右下角 CSS 定位）时，先固定到当前 rect 左上角，
      // 让缩放有明确基准（否则 CSS bottom/right 定位下缩放方向不直观）
      const startPos = state.position ?? { x: rect.left, y: rect.top };
      if (!state.position) {
        state.setPosition({
          x: Math.round(rect.left),
          y: Math.round(rect.top),
        });
      }
      const startW = rect.width;
      const startH = rect.height;
      const startX = e.clientX;
      const startY = e.clientY;
      e.preventDefault();
      e.stopPropagation();

      const hasRight = dir === 'e' || dir === 'se' || dir === 'ne';
      const hasLeft = dir === 'w' || dir === 'sw' || dir === 'nw';
      const hasBottom = dir === 's' || dir === 'se' || dir === 'sw';
      const hasTop = dir === 'n' || dir === 'ne' || dir === 'nw';

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let x = startPos.x;
        let y = startPos.y;
        let w = startW;
        let h = startH;

        // 右/下：左上角固定，扩展宽/高（右下不超屏）
        if (hasRight) {
          const maxW = Math.max(
            MIN_PANEL_W,
            window.innerWidth - x - PANEL_EDGE_MARGIN
          );
          w = Math.min(Math.max(MIN_PANEL_W, startW + dx), maxW);
        }
        if (hasBottom) {
          const maxH = Math.max(
            MIN_PANEL_H,
            window.innerHeight - y - PANEL_EDGE_MARGIN
          );
          h = Math.min(Math.max(MIN_PANEL_H, startH + dy), maxH);
        }
        // 左：左上角左移，宽度反向（左边不越左边界、宽度不小于最小值）
        if (hasLeft) {
          const clampedDx = Math.min(
            Math.max(dx, PANEL_EDGE_MARGIN - x),
            startW - MIN_PANEL_W
          );
          x = x + clampedDx;
          w = startW - clampedDx;
        }
        // 上：左上角上移，高度反向（上边不越上边界、高度不小于最小值）
        if (hasTop) {
          const clampedDy = Math.min(
            Math.max(dy, PANEL_EDGE_MARGIN - y),
            startH - MIN_PANEL_H
          );
          y = y + clampedDy;
          h = startH - clampedDy;
        }

        setSize({ width: Math.round(w), height: Math.round(h) });
        // 左/上方向改变了左上角位置，同步更新 position（右/下方向 position 不变）
        if (hasLeft || hasTop) {
          setPosition({ x: Math.round(x), y: Math.round(y) });
        }
      };
      const end = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [setSize, setPosition]
  );

  // 窗口 resize：重新 clamp 当前 position + size，保证面板永不超屏（#476）
  useEffect(() => {
    const onWindowResize = () => clampPanelToViewport();
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  // 搜索过滤：同时作用于 live/本地任务 与 已完成历史
  const matchName = (name: string) =>
    !search || name.toLowerCase().includes(search.toLowerCase());
  const filteredTasks = tasks.filter((task) => matchName(task.name));
  const filteredHistory = history.filter((task) => matchName(task.name));

  const handleOpen = (task: ConversionTask) => {
    // 完成且关联节点 → 新标签页打开 CAD 编辑器（编辑器走 waitForFileReady 等待就绪）
    if (task.nodeId) {
      window.open(`/cad-editor/${task.nodeId}`, '_blank', 'noopener');
    }
  };

  // 上传完成态「打开」：上传结果带 nodeId（转换产物节点）→ 新标签页打开 CAD 编辑器
  const handleOpenUpload = (task: UploadTask) => {
    const nodeId = task.result?.nodeId;
    if (nodeId) {
      window.open(`/cad-editor/${nodeId}`, '_blank', 'noopener');
    }
  };

  // 滚动到底加载下一页历史（#476）
  const handleBodyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom =
      el.scrollTop + el.clientHeight >=
      el.scrollHeight - LOAD_MORE_THRESHOLD_PX;
    if (nearBottom && historyHasMore && !historyLoading) {
      loadMoreHistory();
    }
  };

  // Tab 键盘导航（roving tabindex）：active tab tabIndex=0，左右方向键切换并移动焦点
  const tabRefs = useRef<
    Record<'conversion' | 'download' | 'upload', HTMLButtonElement | null>
  >({ conversion: null, download: null, upload: null });
  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const order: Array<'conversion' | 'download' | 'upload'> = [
      'conversion',
      'download',
      'upload',
    ];
    const idx = order.indexOf(activeTab);
    let next: 'conversion' | 'download' | 'upload' | undefined;
    if (e.key === 'ArrowRight') next = order[(idx + 1) % order.length];
    else if (e.key === 'ArrowLeft')
      next = order[(idx - 1 + order.length) % order.length];
    if (!next) return;
    e.preventDefault();
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  const buttonStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : {};

  // 隐藏态不渲染任何可见元素（#497 取消悬浮药丸）：入口迁移到顶栏按钮（Layout）
  // 与 CAD 命令 Mx_ToggleFileQueue。拖拽 + 8 向缩放 + 位置持久化在展开态保留。
  if (collapsed) return null;

  return createPortal(
    <div
      className="conversion-panel-portal"
      style={{ zIndex: Z_LAYERS.CONVERSION_PANEL, ...buttonStyle }}
    >
      <div
        className="conversion-panel"
        style={{ width: size.width, height: size.height }}
      >
        {/* 头部（可拖动 + 隐藏按钮：隐藏后无任何可见元素，入口只剩顶栏按钮 + CAD 命令） */}
        <div
          className="conversion-header"
          onPointerDown={(e) => beginDrag(e)}
          title={t('拖动调整位置')}
        >
          <span className="conversion-title">
            <ListTodo size={14} />
            {t('文件队列')}
            {activeCount + uploadActiveCount + (hasActiveDownload ? 1 : 0) >
              0 && (
              <span className="conv-badge">
                {activeCount +
                  uploadActiveCount +
                  (hasActiveDownload ? 1 : 0)}
              </span>
            )}
          </span>

          <button
            className="conv-collapse"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCollapsed(true)}
            title={t('隐藏')}
            aria-label={t('隐藏')}
          >
            <X size={14} />
          </button>
        </div>

        {/* 转换配额条（ADR-0043 只读）：本窗口剩余额度，登录用户按 userId、游客按 IP */}
        {quota && (
          <div className="conversion-quota">
            {quota.unlimited
              ? t('转换次数不限')
              : t('本 {h} 小时剩 {n}/{m} 次', {
                h: quota.windowHours,
                n: quota.remaining,
                m: quota.limit,
              })}
          </div>
        )}

        {/* Tab 切换：转换 / 下载 / 上传，每个 tab 独立；role=tablist + 左右方向键切换（roving tabindex） */}
        <div
          className="conversion-tabs"
          role="tablist"
          onKeyDown={handleTabKeyDown}
        >
          <button
            ref={(el) => {
              tabRefs.current.conversion = el;
            }}
            role="tab"
            aria-selected={activeTab === 'conversion'}
            tabIndex={activeTab === 'conversion' ? 0 : -1}
            className={`conversion-tab ${activeTab === 'conversion' ? 'active' : ''}`}
            onClick={() => setActiveTab('conversion')}
          >
            {t('转换')}
            {activeCount > 0 && (
              <span className="conv-badge">{activeCount}</span>
            )}
          </button>
          <button
            ref={(el) => {
              tabRefs.current.download = el;
            }}
            role="tab"
            aria-selected={activeTab === 'download'}
            tabIndex={activeTab === 'download' ? 0 : -1}
            className={`conversion-tab ${activeTab === 'download' ? 'active' : ''}`}
            onClick={() => setActiveTab('download')}
          >
            {t('下载')}
            {activeDownloadCount > 0 && (
              <span className="conv-badge">{activeDownloadCount}</span>
            )}
          </button>
          <button
            ref={(el) => {
              tabRefs.current.upload = el;
            }}
            role="tab"
            aria-selected={activeTab === 'upload'}
            tabIndex={activeTab === 'upload' ? 0 : -1}
            className={`conversion-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            {t('上传')}
            {uploadStats.uploading + uploadStats.waiting + uploadStats.paused > 0 && (
              <span className="conv-badge">
                {uploadStats.uploading + uploadStats.waiting + uploadStats.paused}
              </span>
            )}
          </button>
        </div>

        {/* 搜索框（三 tab 各持独立搜索词，随激活 tab 切换；转换 tab 额外触发历史重取） */}
        <div className="conversion-search">
          <Search size={13} />
          <input
            value={activeSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('搜索文件名...')}
          />
        </div>

        {/* 上传区块（仅上传 tab 显示；常显，无任务时显示空态，历史任务由 UploadManager 从 localStorage 恢复） */}
        {activeTab === 'upload' && (
          <UploadTab search={uploadSearch} onOpen={handleOpenUpload} />
        )}

        {/* 转换/下载区块（live/本地在前 + 已完成历史在后，滚动加载更多）。
            上传 tab 不渲染：上传区块自持滚动容器，独占 body 区域 */}
        {activeTab !== 'upload' && (
          <div
            className="conversion-body"
            onScroll={handleBodyScroll}
          >
            {activeTab === 'conversion' && (
                <ConversionTab
                  filteredTasks={filteredTasks}
                  filteredHistory={filteredHistory}
                  search={search}
                  onOpen={handleOpen}
                  onCancel={cancelTask}
                  onRetry={handleRetry}
                  historyLoading={historyLoading}
                  historyHasMore={historyHasMore}
                  historyCount={history.length}
                />
            )}

            {activeTab === 'download' && (
              <DownloadTab
                search={downloadSearch}
                onRetry={retryDownloadTask}
                onRetryFailed={retryDownloadFailedItems}
              />
            )}
          </div>
        )}

        {/* 边缘/角落 resize 手柄（#476）：四边（左/右/上/下）+ 四角 */}
        <div
          className="conversion-resize-right"
          onPointerDown={(e) => beginResize(e, 'e')}
          title={t('拖动调整宽度')}
        />
        <div
          className="conversion-resize-left"
          onPointerDown={(e) => beginResize(e, 'w')}
          title={t('拖动调整宽度')}
        />
        <div
          className="conversion-resize-bottom"
          onPointerDown={(e) => beginResize(e, 's')}
          title={t('拖动调整高度')}
        />
        <div
          className="conversion-resize-top"
          onPointerDown={(e) => beginResize(e, 'n')}
          title={t('拖动调整高度')}
        />
        <div
          className="conversion-resize-corner-se"
          onPointerDown={(e) => beginResize(e, 'se')}
          title={t('拖动调整大小')}
        />
        <div
          className="conversion-resize-corner-nw"
          onPointerDown={(e) => beginResize(e, 'nw')}
          title={t('拖动调整大小')}
        />
        <div
          className="conversion-resize-corner-ne"
          onPointerDown={(e) => beginResize(e, 'ne')}
          title={t('拖动调整大小')}
        />
        <div
          className="conversion-resize-corner-sw"
          onPointerDown={(e) => beginResize(e, 'sw')}
          title={t('拖动调整大小')}
        />
      </div>
    </div>,
    document.body
  );
}
