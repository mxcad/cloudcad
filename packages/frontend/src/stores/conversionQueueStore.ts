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

import { create } from 'zustand';
import {
  conversionTaskControllerListTasks,
  conversionTaskControllerSubmitTask,
  conversionTaskControllerCancelTask,
  conversionTaskControllerListHistory,
  conversionTaskControllerRetryTask,
} from '@/api-sdk';
import { getErrorMessage } from '@/utils/errorHandler';
import { getValidToken } from '@/utils/tokenUtils';
import { t } from '@/languages';

/**
 * 统一转换队列（#471 / #475）
 *
 * 面板数据源 = 云端 + 本地结合列表（2026-09-01 用户决策）：
 * - 云端（cloud）：真正存到数据库、影响 node 状态的转换（node.taskId 非空），
 *   由 `GET /mxcad/conversion/tasks` 拉取。
 * - 本地（local）：无 nodeId 关联的转换（游客 / 公开图纸），只记到浏览器
 *   localStorage，丢失即丢失。
 *
 * 悬浮可拖动按钮 + 展开面板（#471）：有任务时全局可见，无任务时隐藏。
 */

export type ConversionTaskStatus =
  'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type ConversionTaskSource = 'cloud' | 'local';

export interface ConversionTask {
  /** cloud: nodeId；local: 本地生成的 id */
  id: string;
  name: string;
  status: ConversionTaskStatus;
  source: ConversionTaskSource;
  /** cloud：关联节点 ID */
  nodeId?: string;
  /** cloud：转换任务 ID（取消用） */
  taskId?: string;
  createdAt: number;
  /** 转换进度 0-100（S4-2，仅进行中任务；黑盒未上报时 undefined） */
  progress?: number;
  /** 排队位置（S6-5，仅排队中任务有意义；运行中/未入队 undefined） */
  queuePosition?: number;
  error?: string;
  /**
   * 失败性质分类（仅 FAILED 有意义，结构化过线，替代按错误文案判断）：
   * 'content-error' = 内容性永久失败（重试无意义，面板据此门控重试）；
   * 其余（timeout/killed/not-started/output-unparseable/unknown）为环境性可重试。
   */
  errorCategory?: string;
}

const LOCAL_STORAGE_KEY = 'cloudcad.conversion.local-tasks';
const MAX_LOCAL_TASKS = 100;
/** 面板 UI（位置 + 尺寸）持久化 key（#476）：刷新后保留位置与宽高 */
const PANEL_UI_STORAGE_KEY = 'cloudcad.conversion.panel-ui';
/** 面板默认尺寸（#476） */
const DEFAULT_PANEL_SIZE = { width: 320, height: 420 };
/** 历史分页每页数量（#476） */
const HISTORY_PAGE_SIZE = 20;
/** 非终态任务的轮询间隔（有进行中任务时拉取云端） */
export const CONVERSION_POLL_INTERVAL_MS = 5000;
/**
 * 终态（completed/failed/cancelled）本地任务保留时长（S6-5）。
 * 超过后在 refreshCloud 时清理，避免 localStorage 永久驻留（游客/公开图纸
 * 只记本地，终态后无跟踪价值）。active（pending/processing）任务不受影响。
 */
const TERMINAL_TASK_TTL_MS = 30 * 60 * 1000;

/** 任务是否为终态（completed/failed/cancelled） */
function isTerminalStatus(status: ConversionTaskStatus): boolean {
  return (
    status === 'completed' || status === 'failed' || status === 'cancelled'
  );
}

/** 任务是否 active（pending/processing） */
function isActiveStatus(status: ConversionTaskStatus): boolean {
  return status === 'pending' || status === 'processing';
}

/** 清理超过 TTL 的终态本地任务（active 任务保留） */
function pruneExpiredTerminalTasks(
  tasks: ConversionTask[],
  now: number = Date.now()
): ConversionTask[] {
  return tasks.filter((t) => {
    if (t.source !== 'local' || !isTerminalStatus(t.status)) return true;
    return now - t.createdAt < TERMINAL_TASK_TTL_MS;
  });
}

function mapToTaskStatus(
  fileStatus: string,
  taskStatus?: string
): ConversionTaskStatus {
  const ts = taskStatus?.toUpperCase();
  if (ts === 'CANCELLED') return 'cancelled';
  if (ts === 'PENDING' || fileStatus === 'UPLOADING') return 'pending';
  if (ts === 'COMPLETED' || fileStatus === 'COMPLETED') return 'completed';
  if (ts === 'FAILED' || fileStatus === 'FAILED') return 'failed';
  // PROCESSING / UPLOADING / UNKNOWN / 缺省 → 转换中
  return 'processing';
}

function loadLocalTasks(): ConversionTask[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    const tasks = (arr as ConversionTask[]).map((t) =>
      // 残留 active（pending/processing）本地任务：页面刷新后其 SSE 等待已中断、
      // 无法续等（游客无云端任务列表可刷新），置 failed 避免面板永远「转换中」
      t.source === 'local' && isActiveStatus(t.status)
        ? { ...t, status: 'failed' as ConversionTaskStatus }
        : t
    );
    return pruneExpiredTerminalTasks(tasks, now);
  } catch {
    return [];
  }
}

function persistLocalTasks(tasks: ConversionTask[]): void {
  try {
    const local = tasks
      .filter((t) => t.source === 'local')
      .slice(0, MAX_LOCAL_TASKS);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));
  } catch {
    // 隐私模式 / 配额满：忽略（本地记录丢失即丢失）
  }
}

/** 面板 UI 状态（位置 + 尺寸），刷新后保留（#476） */
interface PanelUiState {
  position: { x: number; y: number } | null;
  size: { width: number; height: number };
}

/** 读取面板 UI（位置 + 尺寸）；损坏 / 缺失时回退默认（位置 null=右下角，尺寸默认） */
function loadPanelUi(): PanelUiState {
  const fallback: PanelUiState = {
    position: null,
    size: { ...DEFAULT_PANEL_SIZE },
  };
  try {
    const raw = localStorage.getItem(PANEL_UI_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PanelUiState>;
    const position =
      parsed.position &&
      typeof parsed.position.x === 'number' &&
      typeof parsed.position.y === 'number'
        ? { x: parsed.position.x, y: parsed.position.y }
        : null;
    const size =
      parsed.size &&
      typeof parsed.size.width === 'number' &&
      typeof parsed.size.height === 'number'
        ? { width: parsed.size.width, height: parsed.size.height }
        : { ...DEFAULT_PANEL_SIZE };
    return { position, size };
  } catch {
    return fallback;
  }
}

/** 持久化面板 UI（位置 + 尺寸）；隐私模式 / 配额满时忽略 */
function persistPanelUi(
  position: { x: number; y: number } | null,
  size: { width: number; height: number }
): void {
  try {
    localStorage.setItem(
      PANEL_UI_STORAGE_KEY,
      JSON.stringify({ position, size })
    );
  } catch {
    // 忽略
  }
}

interface ConversionQueueState {
  tasks: ConversionTask[];
  collapsed: boolean;
  /**
   * 面板是否由任务驱动的自动展开拉起。
   *
   * true = 允许「无 active 任务后延迟自动收起」（S6-3）；false = 用户显式打开
   * （点击药丸 / 顶栏入口），保持展开不被自动收掉。避免用户打开面板看历史任务时
   * 被 8s 后自动收起。仅 `expandByTask` / `addLocalTask` / `submitTask` 能置 true，
   * 用户显式控制（`setCollapsed`）恒置 false。
   */
  autoDismissable: boolean;
  /** null = 默认右下角；拖动后记录位置（持久化，#476） */
  position: { x: number; y: number } | null;
  /** 面板尺寸（持久化，#476） */
  size: { width: number; height: number };
  /** 云端已完成（COMPLETED）历史任务，分页加载（#476） */
  history: ConversionTask[];
  /** 已加载历史条数（下一页 offset） */
  historyOffset: number;
  /** 云端已完成任务总数 */
  historyTotal: number;
  /** 是否还有更多历史 */
  historyHasMore: boolean;
  /** 历史加载中（防重入） */
  historyLoading: boolean;
  search: string;
  cloudLoading: boolean;
  cloudError: string | null;

  /** 拉取云端任务并合并到列表 */
  refreshCloud: () => Promise<void>;
  /** 重置历史并加载第一页（面板展开时调用，保证最新） */
  refreshHistory: () => Promise<void>;
  /** 追加加载下一页历史（滚动到底触发） */
  loadMoreHistory: () => Promise<void>;
  /** 提交云端转换任务（打开类型 open + nodeId），返回 taskId */
  submitTask: (nodeId: string, priority?: 1 | 2 | 3) => Promise<string | null>;
  /** 记录本地转换任务（游客 / 公开图纸等无 nodeId 关联） */
  addLocalTask: (task: {
    id: string;
    name: string;
    status?: ConversionTaskStatus;
    taskId?: string;
    createdAt?: number;
    error?: string;
  }) => void;
  /** 更新任务状态（本地任务完成/失败，或云端轮询刷新） */
  updateTaskStatus: (
    id: string,
    status: ConversionTaskStatus,
    extra?: Partial<ConversionTask>
  ) => void;
  /** 取消任务（cloud + taskId 时调后端；否则仅本地标记） */
  cancelTask: (task: ConversionTask) => Promise<boolean>;
  /**
   * 重试失败的转换任务（cloud + taskId）：后端原地重新排队并返回新 taskId，
   * 成功即刷新云端列表（同一 nodeId 合并覆盖）。不重新上传、不占配额、无次数上限。
   */
  retryTask: (task: ConversionTask) => Promise<boolean>;
  setCollapsed: (collapsed: boolean) => void;
  /**
   * 任务驱动的自动展开：展开并标记为「无任务后可自动收起」。
   *
   * 已展开时不重置标记——面板可能是用户手动打开的，任务到达不应把它变成
   * 可自动收起（否则用户手动打开后面板照样在 8s 后消失）。
   */
  expandByTask: () => void;
  setPosition: (position: { x: number; y: number } | null) => void;
  setSize: (size: { width: number; height: number }) => void;
  setSearch: (search: string) => void;
}

const initialPanelUi = loadPanelUi();

export const useConversionQueueStore = create<ConversionQueueState>(
  (set, get) => ({
    tasks: loadLocalTasks(),
    collapsed: true,
    autoDismissable: false,
    position: initialPanelUi.position,
    size: initialPanelUi.size,
    history: [],
    historyOffset: 0,
    historyTotal: 0,
    historyHasMore: true,
    historyLoading: false,
    search: '',
    cloudLoading: false,
    cloudError: null,

    refreshCloud: async () => {
      // 面板是「本地 + 云端」统一任务列表：游客有本地任务、登录用户有云端 + 本地，
      // 两者都在面板里（区别只是 source 标记）。这里只门控云端拉取——游客没有
      // node.taskId 云端任务，拉取是 no-op（此前无门控导致游客挂载/轮询恒 401）。
      // 游客的转换等待走按文件 SSE，本地任务在面板照常显示与更新。
      if (!getValidToken()) return;
      set({ cloudLoading: true, cloudError: null });
      try {
        const res = await conversionTaskControllerListTasks();
        // SDK 默认不抛错：失败时错误在 res.error
        if (res.error) throw res.error;
        const cloudTasks: ConversionTask[] = (res.data?.tasks ?? []).map(
          (item) => ({
            id: item.nodeId,
            name: item.name,
            status: mapToTaskStatus(item.fileStatus, item.taskStatus),
            source: 'cloud',
            nodeId: item.nodeId,
            taskId: item.taskId,
            createdAt: new Date(item.updatedAt).getTime(),
            progress: item.progress,
            error: item.error,
            // 失败性质分类（结构化过线）→ 面板据此门控 content-error 的重试
            errorCategory: item.errorCategory,
            // S6-5：排队位置（仅排队中任务有意义）→ 面板展示「第 N 位」
            queuePosition: item.queuePosition,
          })
        );
        set((state) => {
          // 云端任务按 nodeId 覆盖/新增；本地任务保留（先清理过期终态任务，S6-5）
          const localTasks = pruneExpiredTerminalTasks(state.tasks).filter(
            (t) => t.source === 'local'
          );
          // 合并后按时刻倒序（最新在前）：云端任务后端已按 updatedAt 降序返回，
          // 但本地任务（乐观插入 / 提交失败记录）落在云端之后，须统一排序否则新任务沉底
          const merged: ConversionTask[] = [...cloudTasks, ...localTasks].sort(
            (a, b) => b.createdAt - a.createdAt
          );
          persistLocalTasks(merged);
          return { tasks: merged, cloudLoading: false };
        });
      } catch (err) {
        set({
          cloudLoading: false,
          cloudError: getErrorMessage(err) || t('获取转换任务失败'),
        });
      }
    },

    /** 重置历史并加载第一页（面板展开时调用，保证拿到最新已完成记录） */
    refreshHistory: async () => {
      set({
        history: [],
        historyOffset: 0,
        historyTotal: 0,
        historyHasMore: true,
      });
      await get().loadMoreHistory();
    },

    /** 追加加载下一页历史（滚动到底触发）；loading 防重入 */
    loadMoreHistory: async () => {
      if (get().historyLoading) return;
      set({ historyLoading: true });
      try {
        const offset = get().historyOffset;
        // 搜索词下推到 DB（跨分页检索：前端只持有已加载页，无法搜到未加载数据）
        const search = get().search?.trim() || undefined;
        const res = await conversionTaskControllerListHistory({
          query: {
            limit: String(HISTORY_PAGE_SIZE),
            offset: String(offset),
            ...(search ? { search } : {}),
          },
        });
        if (res.error) throw res.error;
        const items = res.data?.tasks ?? [];
        const newTasks: ConversionTask[] = items.map((item) => ({
          id: item.nodeId,
          name: item.name,
          status: mapToTaskStatus(item.fileStatus, item.taskStatus),
          source: 'cloud',
          nodeId: item.nodeId,
          taskId: item.taskId,
          createdAt: new Date(item.updatedAt).getTime(),
          progress: item.progress,
          error: item.error,
          queuePosition: item.queuePosition,
        }));
        set((state) => ({
          history: [...state.history, ...newTasks],
          historyOffset: offset + newTasks.length,
          historyTotal: res.data?.total ?? state.historyTotal,
          historyHasMore: res.data?.hasMore ?? false,
          historyLoading: false,
        }));
      } catch (err) {
        set({
          historyLoading: false,
          cloudError: getErrorMessage(err) || t('获取转换历史失败'),
        });
      }
    },

    submitTask: async (nodeId, priority = 1) => {
      const res = await conversionTaskControllerSubmitTask({
        body: { type: 'open', target: { nodeId }, priority },
      });
      if (res.error) {
        // 提交失败：记一条本地失败任务，让面板可见
        get().addLocalTask({
          id: `local_${nodeId}_${Date.now()}`,
          name: nodeId,
          status: 'failed',
          error: getErrorMessage(res.error) || t('提交转换失败'),
        });
        return null;
      }
      // 提交成功：立即插入一条进行中的云端任务（乐观更新），下次轮询刷新真实态；
      // 并自动展开面板（S6-3），让用户即时看到在途转换
      set((state) => {
        const exists = state.tasks.some((t) => t.id === nodeId);
        const tasks = exists
          ? state.tasks
          : [
              {
                id: nodeId,
                name: nodeId,
                status: 'processing' as ConversionTaskStatus,
                source: 'cloud' as ConversionTaskSource,
                nodeId,
                taskId: res.data?.taskId,
                createdAt: Date.now(),
              },
              ...state.tasks,
            ];
        persistLocalTasks(tasks);
        return {
          tasks,
          collapsed: false,
          // 任务驱动的自动展开（S6-3）；仅「从隐藏到显示」的展开标记可自动收起，
          // 已展开（可能是用户手动打开的）保持原标记
          autoDismissable: state.collapsed ? true : state.autoDismissable,
        };
      });
      return res.data?.taskId ?? null;
    },

    addLocalTask: (task) => {
      const status = task.status ?? 'processing';
      set((state) => {
        const newTask: ConversionTask = {
          id: task.id,
          name: task.name,
          status,
          source: 'local',
          taskId: task.taskId,
          createdAt: task.createdAt ?? Date.now(),
          error: task.error,
        };
        // 去重（同 id 覆盖）
        const rest = state.tasks.filter((t) => t.id !== task.id);
        const tasks = [newTask, ...rest].slice(0, MAX_LOCAL_TASKS + 50);
        persistLocalTasks(tasks);
        // 新增 active（pending/processing）任务自动展开面板（S6-3）；终态记录不展开
        const isActive = isActiveStatus(status);
        return {
          tasks,
          collapsed: isActive ? false : state.collapsed,
          // 仅「从隐藏到显示」的自动展开标记可自动收起；已展开（可能是用户手动
          // 打开的）保持原标记
          autoDismissable:
            isActive && state.collapsed ? true : state.autoDismissable,
        };
      });
    },

    updateTaskStatus: (id, status, extra) => {
      set((state) => {
        const tasks = state.tasks.map((t) =>
          t.id === id ? { ...t, status, ...extra } : t
        );
        persistLocalTasks(tasks);
        return { tasks };
      });
    },

    cancelTask: async (task) => {
      if (task.source === 'cloud' && task.taskId) {
        const res = await conversionTaskControllerCancelTask({
          path: { taskId: task.taskId },
        });
        if (res.error) {
          const reason = getErrorMessage(res.error) || t('取消失败');
          get().updateTaskStatus(task.id, task.status, { error: reason });
          return false;
        }
        // 后端返回 { ok, status?, reason? }（非 DTO，SDK 类型为 {}），显式断言
        const data = res.data as
          { ok?: boolean; status?: string; reason?: string } | undefined;
        const ok = data?.ok ?? false;
        if (ok) {
          get().updateTaskStatus(task.id, 'cancelled');
        } else {
          get().updateTaskStatus(task.id, task.status, {
            error: data?.reason,
          });
        }
        return ok;
      }
      // 本地任务：仅本地标记取消（无后端可取消）
      get().updateTaskStatus(task.id, 'cancelled');
      return true;
    },

    retryTask: async (task) => {
      if (task.source !== 'cloud' || !task.taskId) return false;
      // 乐观置为排队中（清掉失败原因），让用户即时看到重试生效
      get().updateTaskStatus(task.id, 'pending', { error: undefined });
      try {
        const res = await conversionTaskControllerRetryTask({
          path: { taskId: task.taskId },
        });
        if (res.error) {
          get().updateTaskStatus(task.id, 'failed', {
            error: getErrorMessage(res.error) || t('重试失败'),
          });
          return false;
        }
        // 新 taskId 落在同一 nodeId 上：刷新云端列表按 nodeId 合并覆盖
        await get().refreshCloud();
        return true;
      } catch (err) {
        get().updateTaskStatus(task.id, 'failed', {
          error: getErrorMessage(err) || t('重试失败'),
        });
        return false;
      }
    },

    // 用户显式控制（点击药丸 / 顶栏入口）：清掉「任务驱动」标记，面板保持用户
    // 选择的状态，不被 8s 后自动收起
    setCollapsed: (collapsed) => set({ collapsed, autoDismissable: false }),
    expandByTask: () => {
      // 已展开时不改标记：面板可能是用户手动打开的，任务到达不应让它变成可自动收起
      if (!get().collapsed) return;
      set({ collapsed: false, autoDismissable: true });
    },
    setPosition: (position) => {
      set({ position });
      persistPanelUi(position, get().size);
    },
    setSize: (size) => {
      set({ size });
      persistPanelUi(get().position, size);
    },
    setSearch: (search) => set({ search }),
  })
);

/** 是否有进行中（pending/processing）任务 —— 决定悬浮按钮可见性 */
export function hasActiveTask(tasks: ConversionTask[]): boolean {
  return tasks.some((t) => t.status === 'pending' || t.status === 'processing');
}

/** 进行中任务数 —— 悬浮按钮角标 */
export function countActiveTasks(tasks: ConversionTask[]): number {
  return tasks.filter(
    (t) => t.status === 'pending' || t.status === 'processing'
  ).length;
}

/**
 * 跨标签页转换活动广播。
 *
 * 面板的 5s 轮询与 SSE 订阅都门控到「有进行中任务」以省常驻连接，这制造了一个
 * 盲区：本标签页 hasActive=false 时既不轮询也不订阅，而任务列表只由 refreshCloud
 * 填充、refreshCloud 的触发点又都在门控之内 —— 另一标签页发起的转换在本标签页
 * 永远不可见（列表为空、不自动展开、顶栏角标恒 0）。
 *
 * 通道只承载「有标签页可能触发了转换」这一事实，不携带任务数据：接收方无条件
 * refreshCloud（内部已按 token 门控，游客 no-op）。模式同 NoticeProvider 的
 * 已读广播。模块加载即建通道，保证只浏览页面、从未发起转换的标签页也能收；
 * 非浏览器环境（无 BroadcastChannel）降级为 no-op。
 */
const CONVERSION_ACTIVITY_CHANNEL = 'cloudcad.conversion.activity';

const conversionActivityChannel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined'
    ? null
    : (() => {
        const channel = new BroadcastChannel(CONVERSION_ACTIVITY_CHANNEL);
        channel.onmessage = () => {
          void useConversionQueueStore.getState().refreshCloud();
        };
        return channel;
      })();

/** 通知其他标签页有转换活动：发起方已本地 refreshCloud 后再调用 */
export function broadcastConversionActivity(): void {
  conversionActivityChannel?.postMessage({ type: 'conversion-activity' });
}
