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
import { Loader2, X, Search, ListTodo } from 'lucide-react';
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
import { useUploadManager } from '@/hooks/useUploadManager';
import type { UploadTask } from '@/utils/uploadManager';
import { ConversionTab } from './ConversionTab';
import { DownloadTab } from './DownloadTab';
import { UploadTab } from './UploadTab';
import './ConversionPanel.css';

/** 无 active 任务后延迟收起面板的时长（S6-3）：让用户看到终态结果后再收起 */
const AUTO_COLLAPSE_DELAY_MS = 8000;
/** 拖动判定阈值（px）：pointerdown 后位移小于该值视为「点击」（收起态药丸点击展开），超过才进入拖动 */
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
 * 药丸拖动时按药丸自身尺寸 clamp（约 50×40），同一 position 展开成 320×420 面板必然越界，
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

// ==================== ConversionPanel ====================

/**
 * 统一队列面板（#471 / #475 / S6 / #476）
 *
 * 悬浮可拖动按钮（默认右下角，常驻可见，S6-2）+ 展开面板，内含三个 tab：
 * - 转换 tab：云端 + 本地结合列表（live active+failed + 本地）+ 云端已完成历史（分页滚动加载）。
 *   云端行 = 用户的文件（DB fileSystemNode），仅「打开」；本地行 = 临时日志（localStorage 自动过期），纯展示。
 * - 下载 tab：批量下载任务（useBatchDownloadStore，进度 + ZIP/逐个下载）。记录由后端 cron 自动过期，不做手动删除。
 * - 上传 tab：本地上传/转换任务（useUploadManager，进度条 + 暂停/恢复/重试，历史任务从 localStorage 恢复）。
 *
 * 有进行中任务时每 5s 轮询云端刷新状态；无 active 任务后延迟自动收起（S6-3）。
 * 已完成且关联节点的任务提供「打开」按钮（新标签页打开 CAD 编辑器）。
 */
export function ConversionPanel() {
  const {
    tasks,
    collapsed,
    position,
    size,
    search,
    history,
    historyHasMore,
    historyLoading,
    setCollapsed,
    setPosition,
    setSize,

    setSearch,
    refreshCloud,
    refreshHistory,
    loadMoreHistory,
    cancelTask,
  } = useConversionQueueStore();

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

  // 初次挂载拉取云端（面板常驻，无需任务门控，S6-2/S6-8）
  useEffect(() => {
    refreshCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 初次挂载同步下载任务（刷新/重开后从服务端 hydrate 下载记录，后端 cron 自动过期）
  useEffect(() => {
    syncTasksFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 有进行中任务时轮询云端（S4-3 兜底：SSE 断连 / 事件丢失 / 项目成员无 per-owner 通道时，
  // 5s 轮询保证最终一致；SSE 正常时提供 sub-5s 实时推送，二者叠加无害——refreshCloud 幂等）
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => {
      refreshCloud();
    }, CONVERSION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActive, refreshCloud]);

  // S4-3：SSE 实时推送（per-user 长连接）——任务终态变更时后端 emit，前端收到即 refreshCloud。
  // token 走 query（EventSource 无法带 Authorization header，与 batch-download SSE 一致）。
  // 游客（无 token）/ 非浏览器环境（无 EventSource）不订阅；SSE 失败/断连时关闭（轮询兜底）。
  useEffect(() => {
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
  }, [refreshCloud]);

  // 面板展开时拉取最新已完成历史（保证打开面板即见历史记录，#476）
  useEffect(() => {
    if (!collapsed) refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  // 展开面板：先 clamp 回视口内再展开，保证首帧就在屏内（见 clampPanelToViewport）
  const expandPanel = useCallback(() => {
    clampPanelToViewport();
    setCollapsed(false);
  }, [setCollapsed]);

  // 新增活跃上传任务时自动展开面板并切到上传 tab（并入统一面板后，上传需即时可见，#476）
  // 用活跃数而非 total：历史任务（done/failed）恢复时不应触发展开；
  // 挂载时活跃数恒为 0（UploadManager 仅恢复终态历史），故首次渲染不会误切 tab
  const prevUploadActiveRef = useRef(0);
  useEffect(() => {
    if (uploadActiveCount > prevUploadActiveRef.current) {
      expandPanel();
      setActiveTab('upload');
    }
    prevUploadActiveRef.current = uploadActiveCount;
  }, [uploadActiveCount, expandPanel]);

  // 新增下载任务时自动展开面板并切到下载 tab（#536 统一异步：单文件 dwg/dxf/pdf 导出入队后即时可见）
  const prevDownloadTotalRef = useRef(0);
  const downloadTotalInitializedRef = useRef(false);
  useEffect(() => {
    const grew =
      downloadTasks.length > prevDownloadTotalRef.current &&
      downloadTasks.length > 0;
    if (grew) {
      expandPanel();
      // 首次渲染仅展开（保留 auto-expand-on-mount，不切 tab，默认仍是转换 tab）；
      // 新增任务才切到下载 tab，让用户即时看到刚入队的任务
      if (downloadTotalInitializedRef.current) setActiveTab('download');
    }
    prevDownloadTotalRef.current = downloadTasks.length;
    downloadTotalInitializedRef.current = true;
  }, [downloadTasks.length, expandPanel]);

  // 无 active 任务且无活跃上传且无活跃下载任务时延迟收起（S6-3）：
  // 让用户看到终态结果后再收起；active/活跃上传/活跃下载存在时保持展开
  // （上传历史 done/failed 不阻止收起，否则有历史后面板永不收起）
  const activeDownloadCount = downloadTasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'PROCESSING'
  ).length;
  const hasActiveDownload = activeDownloadCount > 0;
  // 无活动任务时自动收起
  useEffect(() => {
    if (hasActive || uploadActiveCount > 0 || hasActiveDownload) return;
    const timer = setTimeout(() => setCollapsed(true), AUTO_COLLAPSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    hasActive,
    uploadActiveCount,
    hasActiveDownload,
    setCollapsed,
  ]);

  // 拖动 + 点击逻辑（收起态药丸 / 展开态 header 共用）：
  // - pointerdown 记录指针相对定位盒的偏移（position 为视口绝对坐标，应用到外层 portal position: fixed），
  //   避免按下瞬间元素跳到指针处；
  // - 位移小于 DRAG_THRESHOLD_PX 视为「点击」，pointerup 时回调 onNoMove（收起态药丸点击展开），超过才拖动；
  // - 位置 clamp 在视口内。
  const beginDrag = useCallback(
    (e: React.PointerEvent, onNoMove?: () => void) => {
      // 收起态：药丸自身即定位盒；展开态：从 header 拖动 → 所属面板是定位盒
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
        if (!state.moved && onNoMove) onNoMove();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    },
    [setPosition]
  );

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

  return createPortal(
    <div
      className="conversion-panel-portal"
      style={{ zIndex: Z_LAYERS.CONVERSION_PANEL, ...buttonStyle }}
    >
      {collapsed ? (
        <div
          className="conversion-collapsed"
          onPointerDown={(e) => beginDrag(e, expandPanel)}
          title={t('点击展开转换队列，拖动调整位置')}
        >
          {hasActive || uploadActiveCount > 0 || hasActiveDownload ? (
            <Loader2 size={18} className="conv-icon spin" />
          ) : (
            <ListTodo size={18} />
          )}
          {activeCount + uploadActiveCount + (hasActiveDownload ? 1 : 0) >
            0 && (
            <span className="conv-badge">
              {activeCount + uploadActiveCount + (hasActiveDownload ? 1 : 0)}
            </span>
          )}
        </div>
      ) : (
        <div
          className="conversion-panel"
          style={{ width: size.width, height: size.height }}
        >
          {/* 头部（可拖动 + 收起按钮：点击收起为悬浮药丸，D1 常驻入口） */}
          <div
            className="conversion-header"
            onPointerDown={(e) => beginDrag(e)}
            title={t('拖动调整位置')}
          >
            <span className="conversion-title">
              <ListTodo size={14} />
              {t('转换队列')}
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
              title={t('收起')}
            >
              <X size={14} />
            </button>
          </div>

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
            <UploadTab
              uploadActiveCount={uploadActiveCount}
              search={uploadSearch}
              onOpen={handleOpenUpload}
            />
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
      )}
    </div>,
    document.body
  );
}
