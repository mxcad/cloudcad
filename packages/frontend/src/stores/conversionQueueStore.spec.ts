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
}));

import {
  conversionTaskControllerListTasks,
  conversionTaskControllerSubmitTask,
  conversionTaskControllerListHistory,
} from '@/api-sdk';

const mockedList = vi.mocked(conversionTaskControllerListTasks);
const mockedSubmit = vi.mocked(conversionTaskControllerSubmitTask);
const mockedHistory = vi.mocked(conversionTaskControllerListHistory);

const LOCAL_KEY = 'cloudcad.conversion.local-tasks';
const PANEL_UI_KEY = 'cloudcad.conversion.panel-ui';

beforeEach(() => {
  localStorage.removeItem(LOCAL_KEY);
  localStorage.removeItem(PANEL_UI_KEY);
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

  it('refreshCloud 透传任务 permanent（S6-7，面板展示「永久失败」）', async () => {
    mockedList.mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'node-perm',
            name: 'perm.dwg',
            fileStatus: 'FAILED',
            taskId: 'task-perm',
            permanent: true,
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never);
    await useConversionQueueStore.getState().refreshCloud();
    const cloud = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === 'node-perm');
    expect(cloud?.permanent).toBe(true);
    expect(cloud?.status).toBe('failed');
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
  it('refreshCloud 清理超过 TTL 的本地终态任务（localStorage 不永久驻留）', async () => {
    mockedList.mockResolvedValue({ error: undefined, data: { tasks: [], total: 0 } } as never);
    const now = Date.now();
    // 过期终态任务（createdAt 在 31 分钟前）+ 新鲜终态任务（createdAt 在 1 分钟前）
    const oldCompleted: ConversionTask = {
      id: 'local-old',
      name: 'old.dwg',
      status: 'completed',
      source: 'local',
      createdAt: now - 31 * 60 * 1000,
    };
    const freshCompleted: ConversionTask = {
      id: 'local-fresh',
      name: 'fresh.dwg',
      status: 'completed',
      source: 'local',
      createdAt: now - 1 * 60 * 1000,
    };
    useConversionQueueStore.setState({
      tasks: [oldCompleted, freshCompleted],
    });

    await useConversionQueueStore.getState().refreshCloud();

    const tasks = useConversionQueueStore.getState().tasks;
    expect(tasks.some((t) => t.id === 'local-old')).toBe(false);
    expect(tasks.some((t) => t.id === 'local-fresh')).toBe(true);
    // 清理同步到 localStorage
    const stored = JSON.parse(localStorage.getItem(LOCAL_KEY)!);
    expect(stored.some((t: ConversionTask) => t.id === 'local-old')).toBe(false);
    expect(stored.some((t: ConversionTask) => t.id === 'local-fresh')).toBe(true);
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
