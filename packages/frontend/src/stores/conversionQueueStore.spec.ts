import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useConversionQueueStore,
  hasActiveTask,
  countActiveTasks,
  type ConversionTask,
} from './conversionQueueStore';

// 模拟 SDK（store 在模块加载时引用这些函数）
vi.mock('@/api-sdk', () => ({
  conversionTaskControllerListTasks: vi.fn(),
  conversionTaskControllerSubmitTask: vi.fn(),
  conversionTaskControllerCancelTask: vi.fn(),
  conversionTaskControllerListHistory: vi.fn(),
  conversionTaskControllerRetryTask: vi.fn(),
}));

import {
  conversionTaskControllerListTasks,
  conversionTaskControllerSubmitTask,
  conversionTaskControllerListHistory,
  conversionTaskControllerRetryTask,
} from '@/api-sdk';

const mockedList = vi.mocked(conversionTaskControllerListTasks);
const mockedSubmit = vi.mocked(conversionTaskControllerSubmitTask);
const mockedHistory = vi.mocked(conversionTaskControllerListHistory);
const mockedRetry = vi.mocked(conversionTaskControllerRetryTask);

const LOCAL_KEY = 'cloudcad.conversion.local-tasks';
const PANEL_UI_KEY = 'cloudcad.conversion.panel-ui';

beforeEach(() => {
  localStorage.removeItem(LOCAL_KEY);
  localStorage.removeItem(PANEL_UI_KEY);
  // 默认登录用户（有 token）：refreshCloud 的 token 门控放行，云端拉取真实执行
  localStorage.setItem('accessToken', 'test-token');
  useConversionQueueStore.setState({
    tasks: [],
    collapsed: true,
    autoDismissable: false,
    position: null,
    size: { width: 320, height: 420 },
    history: [],
    historyOffset: 0,
    historyTotal: 0,
    historyHasMore: true,
    historyLoading: false,
    search: '',
    cloudLoading: false,
    cloudError: null,
    cloudTruncated: false,
  });
  vi.clearAllMocks();
});

describe('conversionQueueStore 纯函数', () => {
  it('hasActiveTask：有 pending/processing 时为 true', () => {
    expect(hasActiveTask([])).toBe(false);
    expect(
      hasActiveTask([{ id: '1', name: 'a', status: 'completed', source: 'cloud', createdAt: 0 } as ConversionTask])
    ).toBe(false);
    expect(
      hasActiveTask([{ id: '1', name: 'a', status: 'processing', source: 'cloud', createdAt: 0 } as ConversionTask])
    ).toBe(true);
  });

  it('countActiveTasks：只统计 pending/processing', () => {
    const tasks: ConversionTask[] = [
      { id: '1', name: 'a', status: 'pending', source: 'cloud', createdAt: 0 },
      { id: '2', name: 'b', status: 'processing', source: 'cloud', createdAt: 0 },
      { id: '3', name: 'c', status: 'completed', source: 'cloud', createdAt: 0 },
    ];
    expect(countActiveTasks(tasks)).toBe(2);
  });
});

describe('conversionQueueStore 本地任务', () => {
  it('addLocalTask 写入 localStorage（source=local）', () => {
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'public.dwg',
      status: 'processing',
    });
    const tasks = useConversionQueueStore.getState().tasks;
    expect(tasks.some((t) => t.id === 'local-1' && t.source === 'local')).toBe(true);
    // 持久化到 localStorage
    const raw = localStorage.getItem(LOCAL_KEY);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw!);
    expect(stored.some((t: ConversionTask) => t.id === 'local-1')).toBe(true);
  });

  it('updateTaskStatus 更新本地任务状态', () => {
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'a',
      status: 'processing',
    });
    useConversionQueueStore.getState().updateTaskStatus('local-1', 'completed');
    const task = useConversionQueueStore.getState().tasks.find((t) => t.id === 'local-1');
    expect(task?.status).toBe('completed');
  });
});

describe('conversionQueueStore 云端合并', () => {
  it('refreshCloud 拉取云端任务并保留本地任务', async () => {
    mockedList.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'node-1',
            name: 'a.dwg',
            fileStatus: 'PROCESSING',
            taskId: 'task-1',
            taskStatus: 'PROCESSING',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never);
    // 先有一条本地任务
    useConversionQueueStore.getState().addLocalTask({ id: 'local-1', name: 'b.dwg' });

    await useConversionQueueStore.getState().refreshCloud();

    const tasks = useConversionQueueStore.getState().tasks;
    // 云端任务（nodeId 关联）+ 本地任务 都在
    expect(tasks.some((t) => t.id === 'node-1' && t.source === 'cloud')).toBe(true);
    expect(tasks.some((t) => t.id === 'local-1' && t.source === 'local')).toBe(true);
    // 云端任务状态映射（PROCESSING → processing）
    const cloud = tasks.find((t) => t.id === 'node-1');
    expect(cloud?.status).toBe('processing');
  });

  it('游客（无 token）refreshCloud no-op：不发云端请求，本地任务照常保留', async () => {
    localStorage.removeItem('accessToken');
    // 先有一条本地任务（游客的转换记录）
    useConversionQueueStore.getState().addLocalTask({ id: 'local-1', name: 'b.dwg' });

    await useConversionQueueStore.getState().refreshCloud();

    // 无 token → 云端拉取 no-op（不触发 SDK 请求，不再恒 401）
    expect(mockedList).not.toHaveBeenCalled();
    // 本地任务仍在面板数据里（面板是「本地 + 云端」统一列表，游客只见本地）
    const tasks = useConversionQueueStore.getState().tasks;
    expect(tasks.some((t) => t.id === 'local-1' && t.source === 'local')).toBe(true);
    // cloudLoading 保持 false（门控在置 loading 之前早退）
    expect(useConversionQueueStore.getState().cloudLoading).toBe(false);
  });

  it('refreshCloud 合并后按时刻倒序（最新在前）：较新的本地任务排在旧云端任务之前', async () => {
    mockedList.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'node-old',
            name: 'old.dwg',
            fileStatus: 'PROCESSING',
            taskId: 'task-1',
            taskStatus: 'PROCESSING',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never);
    // 本地任务比云端任务新（模拟乐观插入 / 提交失败记录）
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-new',
      name: 'new.dwg',
      createdAt: Date.parse('2026-09-02T00:00:00Z'),
    });

    await useConversionQueueStore.getState().refreshCloud();

    const names = useConversionQueueStore.getState().tasks.map((t) => t.name);
    expect(names).toEqual(['new.dwg', 'old.dwg']);
  });

  it('refreshCloud 透传任务 progress（S4-2，面板展示转换进度）', async () => {
    mockedList.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'node-1',
            name: 'a.dwg',
            fileStatus: 'PROCESSING',
            taskId: 'task-1',
            taskStatus: 'PROCESSING',
            progress: 42,
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    const cloud = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'node-1');
    expect(cloud?.progress).toBe(42);
  });

  it('refreshCloud 将云端 FAILED 节点映射为 failed 状态', async () => {
    mockedList.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'node-failed',
            name: 'fail.dwg',
            fileStatus: 'FAILED',
            taskId: 'task-failed',
            error: '转换失败',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    const cloud = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'node-failed');
    expect(cloud?.status).toBe('failed');
    expect(cloud?.error).toBe('转换失败');
  });

  it('refreshCloud 失败时记录 cloudError（不抛错）', async () => {
    mockedList.mockResolvedValue({
      error: new Error('network'),
      data: undefined,
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    expect(useConversionQueueStore.getState().cloudError).toBeTruthy();
  });
});

describe('conversionQueueStore retryTask（原地重新排队，不重新上传、不占配额、无次数上限）', () => {
  const cloudTask = {
    id: 'node-retry',
    name: 'retry.dwg',
    status: 'failed' as const,
    source: 'cloud' as const,
    nodeId: 'node-retry',
    taskId: 'task-retry',
    createdAt: 1000,
    error: 'read file error',
  };

  it('成功：调重试端点、按 nodeId 合并新 taskId、任务回到排队中', async () => {
    mockedList.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'node-retry',
            name: 'retry.dwg',
            fileStatus: 'PROCESSING',
            taskId: 'task-retry-new',
            taskStatus: 'PENDING',
            updatedAt: '2026-09-17T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never);
    mockedRetry.mockResolvedValue({
      error: undefined,
      data: { taskId: 'task-retry-new', nodeId: 'node-retry' },
    } as never);
    useConversionQueueStore.setState({ tasks: [cloudTask] });

    const ok = await useConversionQueueStore.getState().retryTask(cloudTask);

    expect(ok).toBe(true);
    expect(mockedRetry).toHaveBeenCalledWith({ path: { taskId: 'task-retry' } });
    const task = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'node-retry');
    // taskStatus=PENDING → pending（与乐观置入的排队中一致）
    expect(task?.status).toBe('pending');
    expect(task?.taskId).toBe('task-retry-new');
    expect(task?.error).toBeUndefined();
  });

  it('后端拒绝（非 FAILED 节点等）：回退失败态并写入错误原因', async () => {
    mockedRetry.mockResolvedValue({
      error: new Error('not retryable'),
      data: undefined,
    } as never);
    useConversionQueueStore.setState({ tasks: [cloudTask] });

    const ok = await useConversionQueueStore.getState().retryTask(cloudTask);

    expect(ok).toBe(false);
    const task = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'node-retry');
    expect(task?.status).toBe('failed');
    expect(task?.error).toBeTruthy();
  });

  it('网络异常（reject）：走失败分支，不抛错', async () => {
    mockedRetry.mockRejectedValueOnce(new Error('network'));
    useConversionQueueStore.setState({ tasks: [cloudTask] });

    const ok = await useConversionQueueStore.getState().retryTask(cloudTask);

    expect(ok).toBe(false);
    const task = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'node-retry');
    expect(task?.status).toBe('failed');
    expect(task?.error).toContain('network');
  });

  it('本地任务无后端可重试：直接返回 false，不发请求也不改状态', async () => {
    const localTask = {
      id: 'local-retry',
      name: 'local.dwg',
      status: 'failed' as const,
      source: 'local' as const,
      createdAt: 1000,
    };
    useConversionQueueStore.setState({ tasks: [localTask] });

    const ok = await useConversionQueueStore.getState().retryTask(localTask);

    expect(ok).toBe(false);
    expect(mockedRetry).not.toHaveBeenCalled();
    const task = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'local-retry');
    expect(task?.status).toBe('failed');
  });
});

describe('conversionQueueStore submitTask', () => {
  it('提交成功：插入进行中的云端任务（乐观更新）', async () => {
    mockedSubmit.mockResolvedValue({
      error: undefined,
      data: { taskId: 'task-9', nodeId: 'node-9', async: true },
    } as never);
    const taskId = await useConversionQueueStore
      .getState()
      .submitTask('node-9');
    expect(taskId).toBe('task-9');
    const task = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'node-9');
    expect(task?.status).toBe('processing');
    expect(task?.taskId).toBe('task-9');
  });

  it('提交失败：记一条本地失败任务，返回 null', async () => {
    mockedSubmit.mockResolvedValue({
      error: new Error('boom'),
      data: undefined,
    } as never);
    const taskId = await useConversionQueueStore.getState().submitTask('node-9');
    expect(taskId).toBeNull();
    const failed = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.source === 'local' && t.status === 'failed');
    expect(failed).toBeTruthy();
  });

  it('提交成功：自动展开面板（collapsed=false）', async () => {
    mockedSubmit.mockResolvedValue({
      error: undefined,
      data: { taskId: 'task-9', nodeId: 'node-9', async: true },
    } as never);
    expect(useConversionQueueStore.getState().collapsed).toBe(true);
    await useConversionQueueStore.getState().submitTask('node-9');
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
  });
});

describe('conversionQueueStore 自动展开（S6-3）', () => {
  it('addLocalTask 新增 active（processing）任务 → 自动展开', () => {
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'a.dwg',
      status: 'processing',
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
  });

  it('addLocalTask 新增终态（completed）任务 → 不自动展开', () => {
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'a.dwg',
      status: 'completed',
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(true);
  });
});

describe('conversionQueueStore 自动收起来源标记（autoDismissable）', () => {
  it('expandByTask 从收起展开 → 标记可自动收起', () => {
    useConversionQueueStore.getState().expandByTask();
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(true);
  });

  it('expandByTask 面板已展开时 no-op：不把手动打开的面板变成可自动收起', () => {
    useConversionQueueStore.getState().setCollapsed(false);
    useConversionQueueStore.getState().expandByTask();
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(false);
  });

  it('addLocalTask 新增 active 任务（收起→展开）→ 标记可自动收起', () => {
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'a.dwg',
      status: 'processing',
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(true);
  });

  it('addLocalTask 面板已手动展开时新增 active 任务 → 标记保持 false', () => {
    useConversionQueueStore.getState().setCollapsed(false);
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'a.dwg',
      status: 'processing',
    });
    expect(useConversionQueueStore.getState().autoDismissable).toBe(false);
  });

  it('addLocalTask 新增终态任务 → 不展开也不改标记', () => {
    useConversionQueueStore.getState().expandByTask();
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'a.dwg',
      status: 'completed',
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(true);
  });

  it('setCollapsed 清掉任务驱动标记：手动收起后面板保持用户选择', () => {
    useConversionQueueStore.getState().expandByTask();
    expect(useConversionQueueStore.getState().autoDismissable).toBe(true);
    useConversionQueueStore.getState().setCollapsed(true);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(false);
  });

  it('setCollapsed(false) 手动展开 → 不可自动收起', () => {
    useConversionQueueStore.getState().expandByTask();
    useConversionQueueStore.getState().setCollapsed(true);
    useConversionQueueStore.getState().setCollapsed(false);
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(false);
  });

  it('submitTask 提交成功从收起展开 → 标记可自动收起', async () => {
    mockedSubmit.mockResolvedValue({
      error: undefined,
      data: { taskId: 'task-9', nodeId: 'node-9', async: true },
    } as never);
    await useConversionQueueStore.getState().submitTask('node-9');
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(true);
  });

  it('submitTask 面板已手动展开时 → 标记保持 false', async () => {
    mockedSubmit.mockResolvedValue({
      error: undefined,
      data: { taskId: 'task-9', nodeId: 'node-9', async: true },
    } as never);
    useConversionQueueStore.getState().setCollapsed(false);
    await useConversionQueueStore.getState().submitTask('node-9');
    expect(useConversionQueueStore.getState().autoDismissable).toBe(false);
  });
});

describe('conversionQueueStore 终态过期清理（S6-5）', () => {
  it('refreshCloud 按 terminalAt（终态时刻）清理本地终态任务', async () => {
    mockedList.mockResolvedValue({ error: undefined, data: { tasks: [], total: 0 } } as never);
    const now = Date.now();
    // 过期：终态时刻在 TTL（7 天）之外
    const oldTerminal: ConversionTask = {
      id: 'local-old',
      name: 'old.dwg',
      status: 'completed',
      source: 'local',
      createdAt: now - 6 * 60 * 1000,
      terminalAt: now - 8 * 24 * 60 * 60 * 1000,
    };
    // 新鲜：终态时刻在 TTL 内
    const freshTerminal: ConversionTask = {
      id: 'local-fresh',
      name: 'fresh.dwg',
      status: 'completed',
      source: 'local',
      createdAt: now - 6 * 60 * 1000,
      terminalAt: now - 1 * 60 * 1000,
    };
    // 长耗时转换：提交已 40 分钟（旧实现按 createdAt 起算 30 分钟 TTL 会误杀），
    // 但终态只发生在 1 分钟前 → 必须保留
    const longRunning: ConversionTask = {
      id: 'local-long',
      name: 'long.dwg',
      status: 'failed',
      source: 'local',
      createdAt: now - 40 * 60 * 1000,
      terminalAt: now - 1 * 60 * 1000,
    };
    // 历史数据无 terminalAt：回落 createdAt 判定
    const legacyExpired: ConversionTask = {
      id: 'local-legacy-old',
      name: 'legacy-old.dwg',
      status: 'completed',
      source: 'local',
      createdAt: now - 8 * 24 * 60 * 60 * 1000,
    };
    const legacyFresh: ConversionTask = {
      id: 'local-legacy-fresh',
      name: 'legacy-fresh.dwg',
      status: 'completed',
      source: 'local',
      createdAt: now - 1 * 60 * 60 * 1000,
    };
    useConversionQueueStore.setState({
      tasks: [oldTerminal, freshTerminal, longRunning, legacyExpired, legacyFresh],
    });

    await useConversionQueueStore.getState().refreshCloud();

    const tasks = useConversionQueueStore.getState().tasks;
    expect(tasks.some((t) => t.id === 'local-old')).toBe(false);
    expect(tasks.some((t) => t.id === 'local-fresh')).toBe(true);
    expect(tasks.some((t) => t.id === 'local-long')).toBe(true);
    expect(tasks.some((t) => t.id === 'local-legacy-old')).toBe(false);
    expect(tasks.some((t) => t.id === 'local-legacy-fresh')).toBe(true);
    // 清理同步到 localStorage（过期条目不再被写回）
    const stored = JSON.parse(localStorage.getItem(LOCAL_KEY)!);
    expect(stored.some((t: ConversionTask) => t.id === 'local-old')).toBe(false);
    expect(stored.some((t: ConversionTask) => t.id === 'local-long')).toBe(true);
  });

  it('updateTaskStatus 进入终态写 terminalAt、离开终态清掉', () => {
    useConversionQueueStore.getState().addLocalTask({
      id: 'local-1',
      name: 'a.dwg',
      status: 'processing',
    });
    expect(useConversionQueueStore.getState().tasks[0].terminalAt).toBeUndefined();

    useConversionQueueStore.getState().updateTaskStatus('local-1', 'completed');
    const done = useConversionQueueStore.getState().tasks[0];
    expect(done.status).toBe('completed');
    expect(done.terminalAt).toBeTruthy();

    // 重试回到排队中：终态时间清掉，避免旧终态污染下一轮 TTL 判定
    useConversionQueueStore.getState().updateTaskStatus('local-1', 'pending');
    expect(useConversionQueueStore.getState().tasks[0].terminalAt).toBeUndefined();
  });

  it('刷新页面残留 active 本地任务置 failed 时写 terminalAt（loadLocalTasks）', async () => {
    // loadLocalTasks 只在模块加载时执行一次，需 resetModules 后重新导入才能真正覆盖
    vi.resetModules();
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(PANEL_UI_KEY);
    const now = Date.now();
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify([
        {
          id: 'local-residual',
          name: 'r.dwg',
          status: 'processing',
          source: 'local',
          createdAt: now - 5 * 60 * 1000,
        },
      ])
    );
    const mod = await import('./conversionQueueStore');
    const initial = mod.useConversionQueueStore.getState().tasks;
    expect(initial).toHaveLength(1);
    expect(initial[0].status).toBe('failed');
    // 终态时刻是刷新这一刻，不是任务提交时刻（否则长任务刷新后立即被判过期）
    expect(typeof initial[0].terminalAt).toBe('number');
    expect(initial[0].terminalAt).toBeGreaterThanOrEqual(now);
  });

  it('active（processing）任务不随过期清理移除', async () => {
    mockedList.mockResolvedValue({ error: undefined, data: { tasks: [], total: 0 } } as never);
    const now = Date.now();
    const oldProcessing: ConversionTask = {
      id: 'local-proc',
      name: 'proc.dwg',
      status: 'processing',
      source: 'local',
      createdAt: now - 60 * 60 * 1000,
    };
    useConversionQueueStore.setState({ tasks: [oldProcessing] });

    await useConversionQueueStore.getState().refreshCloud();

    expect(
      useConversionQueueStore
        .getState()
        .tasks.some((t) => t.id === 'local-proc')
    ).toBe(true);
  });
});

describe('conversionQueueStore 历史分页（#476）', () => {
  it('loadMoreHistory 追加第一页并更新 offset/total/hasMore', async () => {
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h1',
            name: 'h1.dwg',
            fileStatus: 'COMPLETED',
            taskId: 'task-h1',
            updatedAt: '2026-09-01T00:00:00Z',
          },
          {
            nodeId: 'h2',
            name: 'h2.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T01:00:00Z',
          },
        ],
        total: 30,
        hasMore: true,
      },
    } as never);
    await useConversionQueueStore.getState().loadMoreHistory();

    const state = useConversionQueueStore.getState();
    expect(state.history).toHaveLength(2);
    expect(state.history[0].id).toBe('h1');
    expect(state.history[0].status).toBe('completed');
    expect(state.history[0].source).toBe('cloud');
    expect(state.historyOffset).toBe(2);
    expect(state.historyTotal).toBe(30);
    expect(state.historyHasMore).toBe(true);
    expect(state.historyLoading).toBe(false);
    // 请求携带 limit/offset 查询
    expect(mockedHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ offset: '0' }),
      })
    );
  });

  it('loadMoreHistory 携带 search 查询（搜索词下推 DB，跨分页检索）', async () => {
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0, hasMore: false },
    } as never);
    useConversionQueueStore.setState({ search: 'dwg' });
    await useConversionQueueStore.getState().loadMoreHistory();
    expect(mockedHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ search: 'dwg' }),
      })
    );
  });

  it('loadMoreHistory 无有效 search（空白）时不携带 search 查询', async () => {
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0, hasMore: false },
    } as never);
    useConversionQueueStore.setState({ search: '   ' });
    await useConversionQueueStore.getState().loadMoreHistory();
    const call = mockedHistory.mock.calls[0][0] as {
      query: { search?: string };
    };
    expect(call.query.search).toBeUndefined();
  });

  it('loadMoreHistory 翻页：offset 递增，历史追加去重（按返回顺序）', async () => {
    const store = useConversionQueueStore.getState();
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h1',
            name: 'h1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 30,
        hasMore: true,
      },
    } as never);
    await store.loadMoreHistory();
    expect(useConversionQueueStore.getState().historyOffset).toBe(1);

    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h2',
            name: 'h2.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T01:00:00Z',
          },
        ],
        total: 30,
        hasMore: true,
      },
    } as never);
    await useConversionQueueStore.getState().loadMoreHistory();

    const state = useConversionQueueStore.getState();
    expect(state.history.map((t) => t.id)).toEqual(['h1', 'h2']);
    expect(state.historyOffset).toBe(2);
    // 第二页 offset 从 1 开始
    expect(mockedHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ offset: '1' }),
      })
    );
  });

  it('hasMore=false 时不再加载更多', async () => {
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h1',
            name: 'h1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      },
    } as never);
    await useConversionQueueStore.getState().loadMoreHistory();
    expect(useConversionQueueStore.getState().historyHasMore).toBe(false);
  });

  it('loading 防重入：并发调用只发一次请求', async () => {
    let resolveFn: (v: unknown) => void = () => {};
    mockedHistory.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = (v) =>
            resolve(
              v as {
                error?: Error;
                data?: {
                  tasks: unknown[];
                  total: number;
                  hasMore: boolean;
                };
              }
            );
        }) as ReturnType<typeof mockedHistory>
    );
    const store = useConversionQueueStore.getState();
    const p1 = store.loadMoreHistory();
    const p2 = store.loadMoreHistory();
    expect(useConversionQueueStore.getState().historyLoading).toBe(true);
    // 第二次调用被防重入拦截（loading 中直接 return）
    resolveFn({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h1',
            name: 'h1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      },
    });
    await Promise.all([p1, p2]);
    expect(mockedHistory).toHaveBeenCalledTimes(1);
    expect(useConversionQueueStore.getState().historyLoading).toBe(false);
  });

  it('refreshHistory 重置后重新加载第一页', async () => {
    // 先加载一页
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'old1',
            name: 'old1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-08-01T00:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      },
    } as never);
    await useConversionQueueStore.getState().loadMoreHistory();
    expect(useConversionQueueStore.getState().history[0].id).toBe('old1');

    // refreshHistory 重置并拉取最新
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'new1',
            name: 'new1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      },
    } as never);
    await useConversionQueueStore.getState().refreshHistory();

    const state = useConversionQueueStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].id).toBe('new1');
    expect(state.historyOffset).toBe(1);
  });

  it('loadMoreHistory 失败时记录 cloudError 并复位 loading', async () => {
    mockedHistory.mockResolvedValue({
      error: new Error('network'),
      data: undefined,
    } as never);
    await useConversionQueueStore.getState().loadMoreHistory();
    const state = useConversionQueueStore.getState();
    expect(state.cloudError).toBeTruthy();
    expect(state.historyLoading).toBe(false);
    expect(state.history).toHaveLength(0);
  });

  it('游客（无 token）loadMoreHistory no-op：不发请求、复位 loading 与 hasMore', async () => {
    localStorage.removeItem('accessToken');
    useConversionQueueStore.setState({ historyLoading: true, historyHasMore: true });

    await useConversionQueueStore.getState().loadMoreHistory();

    expect(mockedHistory).not.toHaveBeenCalled();
    const state = useConversionQueueStore.getState();
    expect(state.historyLoading).toBe(false);
    expect(state.historyHasMore).toBe(false);
    expect(state.history).toHaveLength(0);
  });

  it('mergeRecentHistory 增量合并：新完成条目插头部，已翻页内容与 offset 不动', async () => {
    // 先加载一页历史（模拟用户已翻到第 2 页）
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h1',
            name: 'h1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-08-01T00:00:00Z',
          },
        ],
        total: 1,
        hasMore: true,
      },
    } as never);
    await useConversionQueueStore.getState().loadMoreHistory();
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h2',
            name: 'h2.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-08-02T00:00:00Z',
          },
        ],
        total: 1,
        hasMore: true,
      },
    } as never);
    await useConversionQueueStore.getState().loadMoreHistory();
    expect(useConversionQueueStore.getState().historyOffset).toBe(2);

    // 新完成的条目 + 已加载条目（时间被更新）
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h3',
            name: 'h3.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T00:00:00Z',
          },
          {
            nodeId: 'h1',
            name: 'h1-renamed.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-02T00:00:00Z',
          },
        ],
        total: 3,
        hasMore: false,
      },
    } as never);
    await useConversionQueueStore.getState().mergeRecentHistory();

    const state = useConversionQueueStore.getState();
    // 新条目 h3 在最前，已加载条目保持在后且顺序不变
    expect(state.history.map((t) => t.id)).toEqual(['h3', 'h1', 'h2']);
    // 已加载条目原地更新（拿到最新状态/时间），不丢
    expect(state.history[1].name).toBe('h1-renamed.dwg');
    // 只拉第一页（offset=0），且不改翻页游标
    expect(mockedHistory).toHaveBeenLastCalledWith({
      query: { limit: String(20), offset: '0' },
    });
    expect(state.historyOffset).toBe(2);
    expect(state.historyTotal).toBe(3);
  });

  it('mergeRecentHistory 游客 no-op：无 token 不发请求', async () => {
    localStorage.removeItem('accessToken');
    await useConversionQueueStore.getState().mergeRecentHistory();
    expect(mockedHistory).not.toHaveBeenCalled();
  });

  it('refreshCloud 检测到云端任务从进行中/失败中消失 → 触发 mergeRecentHistory', async () => {
    // 第一轮：有一个进行中的云端任务
    mockedList.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'c1',
            name: 'c1.dwg',
            fileStatus: 'PROCESSING',
            taskId: 't1',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never);
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0, hasMore: false },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    expect(mockedHistory).not.toHaveBeenCalled();
    expect(useConversionQueueStore.getState().tasks[0].id).toBe('c1');

    // 第二轮：任务已完成（后端 listTasks 不再返回 COMPLETED）
    mockedList.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0 },
    } as never);
    mockedHistory.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'c1',
            name: 'c1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: '2026-09-01T01:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    // mergeRecentHistory 是 fire-and-forget，等它落地
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedHistory).toHaveBeenCalledTimes(1);
    expect(useConversionQueueStore.getState().history[0].id).toBe('c1');
    // live 列表里已完成任务消失
    expect(useConversionQueueStore.getState().tasks.some((t) => t.id === 'c1')).toBe(false);
  });

  it('refreshCloud 首轮无既有云端任务时不触发 mergeRecentHistory', async () => {
    mockedList.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0 },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    expect(mockedHistory).not.toHaveBeenCalled();
  });

  it('云端任务达到后端上限（50）时置 cloudTruncated，未达上限为 false', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      nodeId: `c${i}`,
      name: `c${i}.dwg`,
      fileStatus: 'PROCESSING',
      taskId: `t${i}`,
      updatedAt: new Date().toISOString(),
    }));
    mockedList.mockResolvedValue({
      error: undefined,
      data: { tasks: fifty, total: 50 },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    expect(useConversionQueueStore.getState().cloudTruncated).toBe(true);

    mockedList.mockResolvedValue({
      error: undefined,
      data: { tasks: fifty.slice(0, 49), total: 49 },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    expect(useConversionQueueStore.getState().cloudTruncated).toBe(false);
  });
});

describe('conversionQueueStore 面板位置/尺寸持久化（#476）', () => {
  it('setPosition 写入 localStorage（含当前 size）', () => {
    useConversionQueueStore.getState().setPosition({ x: 100, y: 200 });
    const raw = localStorage.getItem(PANEL_UI_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.position).toEqual({ x: 100, y: 200 });
    // size 一并持久化（默认 320×420）
    expect(parsed.size).toEqual({ width: 320, height: 420 });
  });

  it('setSize 写入 localStorage（含当前 position）', () => {
    useConversionQueueStore.getState().setSize({ width: 400, height: 500 });
    const raw = localStorage.getItem(PANEL_UI_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.size).toEqual({ width: 400, height: 500 });
    // position 为 null 时一并持久化
    expect(parsed.position).toBeNull();
  });

  it('setPosition(null) 恢复默认位置并持久化', () => {
    useConversionQueueStore.getState().setPosition({ x: 5, y: 6 });
    useConversionQueueStore.getState().setPosition(null);
    const parsed = JSON.parse(localStorage.getItem(PANEL_UI_KEY)!);
    expect(parsed.position).toBeNull();
  });

  it('setPosition / setSize 同步更新 store 状态', () => {
    const store = useConversionQueueStore.getState();
    store.setPosition({ x: 12, y: 34 });
    store.setSize({ width: 360, height: 480 });
    expect(useConversionQueueStore.getState().position).toEqual({
      x: 12,
      y: 34,
    });
    expect(useConversionQueueStore.getState().size).toEqual({
      width: 360,
      height: 480,
    });
  });
});
