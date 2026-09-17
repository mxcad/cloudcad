import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import React from 'react';
import { ConversionPanel } from './ConversionPanel';
import {
  useConversionQueueStore,
  type ConversionTask,
} from '@/stores/conversionQueueStore';
import {
  conversionTaskControllerListTasks,
  conversionTaskControllerListHistory,
  batchDownloadControllerRetryTask,
  batchDownloadControllerRetryFailedItems,
  batchDownloadControllerGetUserTasks,
} from '@/api-sdk';
import { t } from '@/languages';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';

// 模拟 SDK（面板挂载时 refreshCloud 调用 listTasks；展开时 refreshHistory 调用 listHistory）
vi.mock('@/api-sdk', () => ({
  conversionTaskControllerListTasks: vi
    .fn()
    .mockResolvedValue({ error: undefined, data: { tasks: [], total: 0 } }),
  conversionTaskControllerSubmitTask: vi.fn(),
  conversionTaskControllerCancelTask: vi.fn(),
  conversionTaskControllerListHistory: vi
    .fn()
    .mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0, hasMore: false },
    }),
  // 批量下载重试（P1-3）：DownloadTab 重试按钮经 useBatchDownload.retryTask 调用
  batchDownloadControllerRetryTask: vi.fn(),
  // 批量下载部分失败重试（P1-3）：「仅重试失败项」按钮经 useBatchDownload.retryFailedItems 调用
  batchDownloadControllerRetryFailedItems: vi.fn(),
  // 下载任务服务端同步：面板挂载时 syncTasksFromServer 拉取历史记录（hydrate）。
  // hasMore=true：分页未取尽时 syncTasksFromServer 不剪枝本地任务，
  // 避免各用例直接 setState 注入的任务被服务端空列表清掉。
  batchDownloadControllerGetUserTasks: vi.fn().mockResolvedValue({
    error: undefined,
    data: { tasks: [], hasMore: true },
  }),
}));

// S4-3：getValidToken 可控（默认 undefined=游客不订阅 SSE；SSE 测试设为 token）
const mockGetValidToken = vi.hoisted(() => vi.fn());
vi.mock('@/utils/tokenUtils', () => ({
  getValidToken: (...args: unknown[]) => mockGetValidToken(...args),
}));

// 上传管理器可控（默认空任务；上传区块测试时覆盖 tasks/stats）
const mockUseUploadManager = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useUploadManager', () => ({
  useUploadManager: (...args: unknown[]) =>
    mockUseUploadManager(...args),
}));

/**
 * 渲染面板并 flush 挂载 effect（refreshCloud 异步 + 自动收起 timer 注册）。
 * act 包裹确保异步状态更新被 React 感知（避免 act 警告）。
 */
async function renderPanel() {
  await act(async () => {
    render(<ConversionPanel />);
  });
}

/**
 * 等初始数据 hydrate 完成（settled 生效）。
 *
 * settled 是组件内单调 latch（云端首次拉取 + 下载服务端同步完成），此前只记录
 * 基线不自动展开。「settled 之后新触发」类用例须先 flush 到 settled 再注入任务。
 * 用真实定时器（本文件仅自动收起用例切 fake timers，且各不越用）。
 */
async function flushSettled() {
  await waitFor(() => {
    expect(vi.mocked(conversionTaskControllerListTasks)).toHaveBeenCalled();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

const emptyUploadStats = {
  total: 0,
  done: 0,
  failed: 0,
  uploading: 0,
  waiting: 0,
  paused: 0,
};

beforeEach(() => {
  cleanup();
  mockGetValidToken.mockReset(); // 默认返回 undefined（游客，不订阅 SSE）
  // SDK mock 归位到顶部默认值：历史用例（476/510/563/600）用 mockResolvedValue
  // 做永久覆盖，若不重置会泄漏到后续用例——面板挂载时 refreshHistory 清空 fixture
  // history 并载入泄漏数据（h1/h2），导致「删除历史」断言拿到 nodeId 'h1'。
  vi.mocked(conversionTaskControllerListHistory).mockReset();
  vi.mocked(conversionTaskControllerListHistory).mockResolvedValue({
    error: undefined,
    data: { tasks: [], total: 0, hasMore: false },
  });
  vi.mocked(batchDownloadControllerRetryTask).mockReset();
  vi.mocked(batchDownloadControllerRetryTask).mockResolvedValue({
    error: undefined,
    data: { taskId: '' },
  });
  vi.mocked(batchDownloadControllerRetryFailedItems).mockReset();
  vi.mocked(batchDownloadControllerRetryFailedItems).mockResolvedValue({
    error: undefined,
    data: { newTaskId: 'dl-fail-retry' },
  });
  vi.mocked(batchDownloadControllerGetUserTasks).mockReset();
  vi.mocked(batchDownloadControllerGetUserTasks).mockResolvedValue({
    error: undefined,
    data: { tasks: [], hasMore: true },
  });
  // 上传管理器默认空任务（上传区块测试时覆盖）
  mockUseUploadManager.mockReset();
  mockUseUploadManager.mockReturnValue({
    tasks: [],
    stats: { ...emptyUploadStats },
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    removeTask: vi.fn(),
    retryTask: vi.fn(),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
    clearCompleted: vi.fn(),
    manager: {},
  });
  // 下载 store 重置：前序用例残留的 tasks 会在渲染时被当作「本会话新触发」
  // （settled 前只记录基线，但 settled 后增长即展开），导致用例不独立
  useBatchDownloadStore.setState({ tasks: [] });
  useConversionQueueStore.setState({
    tasks: [],
    collapsed: true,
    autoDismissable: false,
    position: null,
    size: { width: 320, height: 420 },
    history: [],
    historyOffset: 0,
    historyTotal: 0,
    historyHasMore: false,
    historyLoading: false,
    search: '',
    cloudLoading: false,
    cloudError: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).EventSource;
});

describe('ConversionPanel', () => {
  it('常驻：无任务时也渲染悬浮按钮（S6-2）', async () => {
    await renderPanel();
    // 无任务时轻量收起态（.conversion-collapsed 始终渲染）
    expect(document.querySelector('.conversion-collapsed')).toBeTruthy();
  });

  it('拖动收起按钮：position 写入 store 并应用到外层 portal（回归：left/top 曾挂内层 relative 元素致按钮飞出视口）', async () => {
    await renderPanel();
    const pill = document.querySelector('.conversion-collapsed')!;
    const portal = document.querySelector('.conversion-panel-portal')!;

    // pointerdown（happy-dom 的 getBoundingClientRect 全 0 → 偏移量 = 指针坐标）
    await act(async () => {
      pill.dispatchEvent(
        new MouseEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          bubbles: true,
        })
      );
    });
    // pointermove → position 写入 store（x = 150-100，y = 120-100）
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 150, clientY: 120 })
      );
    });
    expect(useConversionQueueStore.getState().position).toEqual({
      x: 50,
      y: 20,
    });
    // left/top 必须挂在外层 portal（position: fixed，视口绝对坐标），而非内层药丸
    expect(portal.style.left).toBe('50px');
    expect(portal.style.top).toBe('20px');
    expect(pill.style.left).toBe('');
    expect(pill.style.top).toBe('');

    // pointerup 结束拖动，position 保留（不回退默认右下角）
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(useConversionQueueStore.getState().position).toEqual({
      x: 50,
      y: 20,
    });
    // 拖动（超阈值）不视为点击 → 面板不展开
    expect(useConversionQueueStore.getState().collapsed).toBe(true);
  });

  it('点击收起药丸（未超拖动阈值）展开面板（回归：点击药丸本体原先无任何反应）', async () => {
    await renderPanel();
    const pill = document.querySelector('.conversion-collapsed')!;

    // pointerdown + pointerup 同位置（无位移）→ 视为点击 → 展开
    await act(async () => {
      pill.dispatchEvent(
        new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true })
      );
      pill.dispatchEvent(
        new MouseEvent('pointerup', { clientX: 100, clientY: 100, bubbles: true })
      );
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(document.querySelector('.conversion-panel')).toBeTruthy();
  });

  it('收起态药丸无内嵌按钮（药丸本体即唯一点击目标，冗余 X 已移除）', async () => {
    await renderPanel();
    const pill = document.querySelector('.conversion-collapsed')!;
    // 内嵌按钮会 stopPropagation 吞掉药丸点击并造成重复入口
    expect(pill.querySelector('button')).toBeNull();
  });

  it('展开时把越界 position 按面板尺寸 clamp 回视口内（首帧即入屏，无需手动拖动）', async () => {
    // 药丸（约 50x40）拖动时按自身尺寸 clamp，合法停到视口最右/最下沿；
    // 同一 position 展开成 320x420 面板必然越界——展开前须按面板尺寸重算。
    useConversionQueueStore.setState({
      collapsed: true,
      position: { x: window.innerWidth - 40, y: window.innerHeight - 30 },
      size: { width: 320, height: 420 },
    });
    await renderPanel();
    const pill = document.querySelector('.conversion-collapsed')!;
    await act(async () => {
      pill.dispatchEvent(
        new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true })
      );
      pill.dispatchEvent(
        new MouseEvent('pointerup', { clientX: 100, clientY: 100, bubbles: true })
      );
    });

    const { position, size } = useConversionQueueStore.getState();
    expect(position).toBeTruthy();
    expect(position!.x).toBeGreaterThanOrEqual(8);
    expect(position!.y).toBeGreaterThanOrEqual(8);
    expect(position!.x + size.width).toBeLessThanOrEqual(window.innerWidth);
    expect(position!.y + size.height).toBeLessThanOrEqual(window.innerHeight);
    // 首帧内联定位即为 clamp 后的值（不是"先渲染到屏外再弹回"）
    const portal = document.querySelector('.conversion-panel-portal')!;
    expect(portal.style.left).toBe(`${position!.x}px`);
    expect(portal.style.top).toBe(`${position!.y}px`);
  });

  it('点击 header 收起按钮收起面板（展开态手动关闭 → 只剩悬浮药丸）', async () => {
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    const collapseBtn = document.querySelector('.conv-collapse')!;
    expect(collapseBtn).toBeTruthy();

    // 点击收起按钮 → setCollapsed(true) → 面板收起为药丸（.conversion-panel 消失，.conversion-collapsed 出现）
    await act(async () => {
      collapseBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(true);
    expect(document.querySelector('.conversion-collapsed')).toBeTruthy();
    expect(document.querySelector('.conversion-panel')).toBeNull();
  });

  it('手动展开后面板不因无任务而自动收起：用户显式打开不受自动收起定时影响', async () => {
    vi.useFakeTimers();
    await renderPanel();
    const pill = document.querySelector('.conversion-collapsed')!;

    // 点击药丸 → 用户显式展开（autoDismissable=false）
    await act(async () => {
      pill.dispatchEvent(
        new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true })
      );
      pill.dispatchEvent(
        new MouseEvent('pointerup', { clientX: 100, clientY: 100, bubbles: true })
      );
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(false);
    expect(document.querySelector('.conversion-panel')).toBeTruthy();

    // 远超自动收起时长（8s = AUTO_COLLAPSE_DELAY_MS）→ 手动打开的面板保持展开
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(document.querySelector('.conversion-panel')).toBeTruthy();
  });

  it('展开态显示任务名 + 进度百分比（S4-2）', async () => {
    useConversionQueueStore.setState({
      tasks: [
        {
          id: 'local-1',
          name: 'a.dwg',
          status: 'processing',
          source: 'local',
          createdAt: Date.now(),
          progress: 42,
        },
      ],
      collapsed: false,
    });
    await renderPanel();
    // 任务名（非 i18n，稳定断言）
    expect(screen.getByText('a.dwg')).toBeTruthy();
    // 进度百分比（processing + progress=42 → "42%"）
    expect(document.body.textContent).toContain('42%');
  });

  it('active 任务显示角标计数', async () => {
    useConversionQueueStore.setState({
      tasks: [
        {
          id: 'local-1',
          name: 'a.dwg',
          status: 'processing',
          source: 'local',
          createdAt: Date.now(),
        },
        {
          id: 'local-2',
          name: 'b.dwg',
          status: 'pending',
          source: 'local',
          createdAt: Date.now(),
        },
      ],
      collapsed: true,
    });
    await renderPanel();
    // 角标显示 active 任务数（2）
    expect(document.querySelector('.conv-badge')?.textContent).toBe('2');
  });

  it('展开态无任务时显示空态（.conversion-empty）', async () => {
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    expect(document.querySelector('.conversion-empty')).toBeTruthy();
  });

  it('永久失败任务展示「永久失败」标签，区别于普通「转换失败」（S6-7）', async () => {
    // 经 refreshCloud 映射：云端 FAILED 节点 + permanent 标记（#465 known-bad 命中）
    vi.mocked(conversionTaskControllerListTasks).mockResolvedValueOnce({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'cloud-perm',
            name: 'perm.dwg',
            fileStatus: 'FAILED',
            taskId: 'task-perm',
            updatedAt: new Date().toISOString(),
            permanent: true,
          },
          {
            nodeId: 'cloud-plain',
            name: 'plain.dwg',
            fileStatus: 'FAILED',
            taskId: 'task-plain',
            updatedAt: new Date().toISOString(),
            permanent: false,
          },
        ],
        total: 2,
      },
    } as never);
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    // 永久失败任务：状态标签为「永久失败」（i18n key 在测试环境回退为 key 本身）
    expect(document.body.textContent).toContain('永久失败');
    // 普通失败任务：状态标签为「转换失败」（非永久失败，可重试）
    expect(document.body.textContent).toContain('转换失败');
  });

  it('排队中任务显示排队位置「第 N 位」（S6-5）', async () => {
    // 经 refreshCloud 映射：云端排队中任务 + queuePosition（conversion-service 排队序号）
    vi.mocked(conversionTaskControllerListTasks).mockResolvedValueOnce({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'cloud-queued',
            name: 'queued.dwg',
            fileStatus: 'PROCESSING',
            taskId: 'task-queued',
            taskStatus: 'PENDING',
            queuePosition: 2,
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
      },
    } as never);
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    // 任务名
    expect(screen.getByText('queued.dwg')).toBeTruthy();
    // 排队位置（zh-CN 插值「第 2 位」）
    expect(document.body.textContent).toContain('第 2 位');
  });

  it('任务自动展开的面板无 active 任务后延迟自动收起（S6-3）', async () => {
    vi.useFakeTimers();
    // 任务驱动的展开（autoDismissable=true）+ 仅终态任务（无 active）→ 触发自动收起 timer
    useConversionQueueStore.setState({
      tasks: [
        {
          id: 'local-1',
          name: 'a.dwg',
          status: 'completed',
          source: 'local',
          createdAt: Date.now(),
        },
      ],
      collapsed: false,
      autoDismissable: true,
    });
    await renderPanel();
    // 初始展开
    expect(document.querySelector('.conversion-panel')).toBeTruthy();
    // 推进 8s（AUTO_COLLAPSE_DELAY_MS）→ 自动收起
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(document.querySelector('.conversion-collapsed')).toBeTruthy();
    expect(document.querySelector('.conversion-panel')).toBeNull();
  });

  it('手动打开的面板不因任务结束而自动收起（用户显式打开 vs 任务驱动展开）', async () => {
    vi.useFakeTimers();
    // 用户手动展开（autoDismissable=false）+ 一个终态任务
    useConversionQueueStore.setState({
      tasks: [
        {
          id: 'local-1',
          name: 'a.dwg',
          status: 'completed',
          source: 'local',
          createdAt: Date.now(),
        },
      ],
      collapsed: false,
      autoDismissable: false,
    });
    await renderPanel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(document.querySelector('.conversion-panel')).toBeTruthy();
  });

  it('挂载时存量进行中转换任务不自动展开面板（默认关闭，仅记录基线）', async () => {
    useConversionQueueStore.setState({
      tasks: [
        {
          id: 'cloud-old',
          name: 'old.dwg',
          status: 'processing',
          source: 'cloud',
          nodeId: 'cloud-old',
          createdAt: Date.now(),
        },
      ],
      collapsed: true,
    });
    await renderPanel();
    await flushSettled();
    // 存量任务是 hydrate 的基线，不是本会话新动作：面板保持收起
    expect(useConversionQueueStore.getState().collapsed).toBe(true);
    expect(document.querySelector('.conversion-collapsed')).toBeTruthy();
    expect(document.querySelector('.conversion-panel')).toBeNull();
  });

  it('settled 后云端新增进行中任务自动展开面板（按 active 数量增长判定）', async () => {
    await renderPanel();
    await flushSettled();
    expect(useConversionQueueStore.getState().collapsed).toBe(true);

    // 本会话新触发转换：云端新增一个进行中节点（active 数 0 → 1）
    vi.mocked(conversionTaskControllerListTasks).mockResolvedValueOnce({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'cloud-1',
            name: 'new.dwg',
            fileStatus: 'PROCESSING',
            taskId: 'task-1',
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
      },
    } as never);
    await act(async () => {
      await useConversionQueueStore.getState().refreshCloud();
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(document.querySelector('.conversion-panel')).toBeTruthy();
  });

  it('挂载时存量下载任务不自动展开面板（localStorage 残留 / 服务端 hydrate 都不算新动作）', async () => {
    useBatchDownloadStore.setState({
      tasks: [
        {
          taskId: 'dl-pending',
          status: 'PENDING',
          mode: 'zip',
          itemNames: ['a.dwg'],
          totalCount: 1,
          completedCount: 0,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        },
        {
          taskId: 'dl-done',
          status: 'COMPLETED',
          mode: 'zip',
          itemNames: ['b.dwg'],
          totalCount: 1,
          completedCount: 1,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await renderPanel();
    await flushSettled();
    expect(useConversionQueueStore.getState().collapsed).toBe(true);
    expect(document.querySelector('.conversion-panel')).toBeNull();
  });

  it('settled 后新增下载任务自动展开并切到下载 tab', async () => {
    await renderPanel();
    await flushSettled();
    expect(useConversionQueueStore.getState().collapsed).toBe(true);

    await act(async () => {
      useBatchDownloadStore.setState({
        tasks: [
          {
            taskId: 'dl-1',
            status: 'PROCESSING',
            mode: 'zip',
            itemNames: ['a.dwg'],
            totalCount: 1,
            completedCount: 0,
            errorCount: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(document.querySelector('.conversion-panel')).toBeTruthy();
    const tabs = document.querySelectorAll('[role="tab"]');
    expect((tabs[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('S4-3：登录用户订阅 SSE（EventSource），收到消息触发 refreshCloud；卸载后关闭', async () => {
    // 登录用户（有 token）→ 订阅 SSE
    mockGetValidToken.mockReturnValue('test-token');

    // happy-dom 无 EventSource，mock 一个可控实现
    class MockEventSource {
      static instances: MockEventSource[] = [];
      url: string;
      onmessage: (() => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;
      constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    (globalThis as Record<string, unknown>).EventSource = MockEventSource;

    MockEventSource.instances = [];
    await renderPanel();

    // 登录用户 → 建立 SSE 连接（URL 含 stream 路径 + token 走 query）
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain(
      '/v1/mxcad/conversion/tasks/stream?token=test-token'
    );

    // 收到消息（状态变更 / 刷新信号）→ refreshCloud（listTasks 再调一次）
    const listTasksBefore =
      vi.mocked(conversionTaskControllerListTasks).mock.calls.length;
    await act(async () => {
      MockEventSource.instances[0].onmessage?.();
    });
    expect(
      vi.mocked(conversionTaskControllerListTasks).mock.calls.length
    ).toBe(listTasksBefore + 1);

    // 卸载（cleanup）→ 关闭 EventSource
    cleanup();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it('S4-3：游客（无 token）不订阅 SSE', async () => {
    // mockGetValidToken 默认返回 undefined（游客）
    class MockEventSource {
      static instances: MockEventSource[] = [];
      url: string;
      onmessage: (() => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;
      constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    (globalThis as Record<string, unknown>).EventSource = MockEventSource;

    MockEventSource.instances = [];
    await renderPanel();

    // 无 token → 不建立 SSE 连接
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('有上传任务时渲染上传区块（上传并入统一面板，#476）', async () => {
    mockUseUploadManager.mockReturnValue({
      tasks: [
        {
          id: 'up-1',
          fileName: 'upload.dwg',
          fileSize: 1024,
          progress: 50,
          status: 'uploading',
          nodeId: 'node-up',
        },
      ],
      stats: {
        total: 1,
        done: 0,
        failed: 0,
        uploading: 1,
        waiting: 0,
        paused: 0,
      },
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      removeTask: vi.fn(),
      retryTask: vi.fn(),
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
      clearCompleted: vi.fn(),
      manager: {},
    });
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    // 切到上传 tab
    const uploadTab = document.querySelector(
      '.conversion-tab:nth-child(3)'
    ) as HTMLElement;
    fireEvent.click(uploadTab);
    // 上传区块渲染
    expect(document.querySelector('.conversion-upload-section')).toBeTruthy();
    // 上传任务名
    expect(screen.getByText('upload.dwg')).toBeTruthy();
  });

  it('无上传任务时上传区块常显空态（上传 tab 需可见历史入口）', async () => {
    // 默认 mock 空任务
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    // 切到上传 tab
    const uploadTab = document.querySelector(
      '.conversion-tab:nth-child(3)'
    ) as HTMLElement;
    fireEvent.click(uploadTab);
    // 上传区块常显，显示空态文案
    expect(document.querySelector('.conversion-upload-section')).toBeTruthy();
    expect(screen.getByText(t('暂无上传任务'))).toBeTruthy();
  });

  it('转换 tab 空态独立：存在下载任务但无转换任务时仍显示空态', async () => {
    useBatchDownloadStore.setState({
      tasks: [
        {
          taskId: 'dl-1',
          status: 'COMPLETED',
          mode: 'zip',
          itemNames: ['a.dwg'],
          totalCount: 1,
          completedCount: 1,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    // 默认转换 tab：下载任务数不污染本 tab 空态判断
    expect(screen.getByText(t('暂无转换任务'))).toBeTruthy();
  });

  it('新增下载任务自动切到下载 tab（导出入队后即时可见，#536）', async () => {
    // 重置下载 store：beforeEach 未重置该 store，前序用例残留的 tasks 会让
    // renderPanel 首次渲染即 downloadTasks.length>0（prevDownloadTotalRef 初始化为非 0），
    // 导致本用例 setState 不再触发 grew。先清空保证用例自包含。
    useBatchDownloadStore.setState({ tasks: [] });
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    // 默认转换 tab：无下载任务时显示转换空态
    expect(screen.getByText(t('暂无转换任务'))).toBeTruthy();
    // 新增下载任务（模拟 dwg/dxf/pdf 导出入队）
    await act(async () => {
      useBatchDownloadStore.setState({
        tasks: [
          {
            taskId: 'dl-1',
            status: 'COMPLETED',
            mode: 'zip',
            itemNames: ['a.dwg'],
            totalCount: 1,
            completedCount: 1,
            errorCount: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });
    // 自动切到下载 tab（新增任务、非首次渲染）：SSE/异步重渲染用 waitFor 兜底
    await waitFor(() => {
      const downloadTab = document.querySelector(
        '.conversion-tab:nth-child(2)'
      ) as HTMLElement;
      expect(downloadTab.classList.contains('active')).toBe(true);
    });
    // 下载任务行可见
    expect(document.querySelectorAll('.conversion-row-download')).toHaveLength(1);
  });

  it('新增上传任务自动展开面板并切到上传 tab（上传图纸即时可见，#476）', async () => {
    // 上传 hook 按可变引用返回：先空任务，再模拟上传入队（活跃数 0 → 1）
    const uploadState = {
      tasks: [] as unknown[],
      stats: { ...emptyUploadStats },
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      removeTask: vi.fn(),
      retryTask: vi.fn(),
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
      clearCompleted: vi.fn(),
      manager: {},
    };
    mockUseUploadManager.mockImplementation(() => uploadState);
    // 重置下载 store：前序用例残留的 tasks 会让首次渲染即触发下载切 tab
    useBatchDownloadStore.setState({ tasks: [] });
    useConversionQueueStore.setState({ collapsed: true });
    const result = await act(async () =>
      render(<ConversionPanel />)
    );
    // 初始收起态（药丸可见，面板未展开）
    expect(document.querySelector('.conversion-collapsed')).toBeTruthy();
    expect(document.querySelector('.conversion-panel')).toBeNull();

    // 模拟上传图纸入队（活跃数 0 → 1）
    uploadState.tasks = [
      {
        id: 'up-1',
        fileName: 'upload.dwg',
        fileSize: 1024,
        progress: 10,
        status: 'uploading',
        nodeId: 'node-up',
      },
    ];
    uploadState.stats = { ...emptyUploadStats, total: 1, uploading: 1 };
    await act(async () => {
      result.rerender(<ConversionPanel />);
    });

    // 面板自动展开（收起态药丸消失，展开态出现）
    expect(document.querySelector('.conversion-collapsed')).toBeNull();
    expect(document.querySelector('.conversion-panel')).toBeTruthy();
    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    // 自动切到上传 tab（默认转换 tab 不再选中）
    const tabs = document.querySelectorAll('[role="tab"]');
    expect((tabs[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
      'false'
    );
    expect((tabs[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
      'true'
    );
    // 上传任务行可见
    expect(screen.getByText('upload.dwg')).toBeTruthy();
  });

  it('下载列表按搜索关键字过滤（匹配任意条目名，无匹配显示「无匹配结果」，#476）', async () => {
    useBatchDownloadStore.setState({
      tasks: [
        {
          taskId: 'dl-1',
          status: 'COMPLETED',
          mode: 'zip',
          itemNames: ['alpha.dwg'],
          totalCount: 1,
          completedCount: 1,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        },
        {
          taskId: 'dl-2',
          status: 'COMPLETED',
          mode: 'zip',
          itemNames: ['beta.dwg', 'gamma.dwg'],
          totalCount: 2,
          completedCount: 2,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    const downloadTab = document.querySelector(
      '.conversion-tab:nth-child(2)'
    ) as HTMLElement;
    fireEvent.click(downloadTab);
    expect(document.querySelectorAll('.conversion-row-download')).toHaveLength(2);
    // 搜索框即时过滤下载列表
    const searchInput = document.querySelector(
      '.conversion-search input'
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'alpha' } });
    expect(document.querySelectorAll('.conversion-row-download')).toHaveLength(1);
    // 匹配非首个条目名（多文件任务可搜任意文件名）
    fireEvent.change(searchInput, { target: { value: 'gamma' } });
    expect(document.querySelectorAll('.conversion-row-download')).toHaveLength(1);
    // 无匹配时显示「无匹配结果」空态（而非「暂无下载任务」）
    fireEvent.change(searchInput, { target: { value: 'nomatch' } });
    expect(screen.getByText(t('无匹配结果'))).toBeTruthy();
  });

  it('展开面板拉取云端已完成历史并渲染（打开面板即见历史记录，#476）', async () => {
    vi.mocked(conversionTaskControllerListHistory).mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h1',
            name: 'h1.dwg',
            fileStatus: 'COMPLETED',
            taskId: 'task-h1',
            updatedAt: new Date().toISOString(),
          },
          {
            nodeId: 'h2',
            name: 'h2.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 2,
        hasMore: false,
      },
    } as never);
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    // 挂载 effect 触发 refreshHistory → 拉取历史
    expect(
      vi.mocked(conversionTaskControllerListHistory).mock.calls.length
    ).toBeGreaterThanOrEqual(1);
    // 历史任务名渲染
    expect(screen.getByText('h1.dwg')).toBeTruthy();
    expect(screen.getByText('h2.dwg')).toBeTruthy();
  });

  it('已完成历史任务显示「打开」按钮，点击在新标签页打开 CAD 编辑器（#476）', async () => {
    vi.mocked(conversionTaskControllerListHistory).mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'node-h1',
            name: 'h1.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
        hasMore: false,
      },
    } as never);
    useConversionQueueStore.setState({ collapsed: false });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPanel();

    // 「打开」按钮存在（title = t('打开')）
    const openBtn = document.querySelector('button[title="打开"]');
    expect(openBtn).toBeTruthy();
    // 点击 → 新标签页打开 /cad-editor/node-h1
    await act(async () => {
      openBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(openSpy).toHaveBeenCalledWith(
      '/cad-editor/node-h1',
      '_blank',
      'noopener'
    );
    openSpy.mockRestore();
  });

  it('滚动到底触发加载下一页历史（#476）', async () => {
    // 第一页（挂载 refreshHistory）返回 p1；第二页（滚动触发）返回 p2
    vi.mocked(conversionTaskControllerListHistory)
      .mockResolvedValueOnce({
        error: undefined,
        data: {
          tasks: [
            {
              nodeId: 'p1',
              name: 'p1.dwg',
              fileStatus: 'COMPLETED',
              updatedAt: new Date().toISOString(),
            },
          ],
          total: 2,
          hasMore: true,
        },
      } as never)
      .mockResolvedValue({
        error: undefined,
        data: {
          tasks: [
            {
              nodeId: 'p2',
              name: 'p2.dwg',
              fileStatus: 'COMPLETED',
              updatedAt: new Date().toISOString(),
            },
          ],
          total: 2,
          hasMore: false,
        },
      } as never);
    useConversionQueueStore.setState({
      collapsed: false,
      historyHasMore: true,
      historyLoading: false,
    });
    await renderPanel();
    // 挂载 refreshHistory 已调用一次 listHistory（第一页）
    const callsAfterMount =
      vi.mocked(conversionTaskControllerListHistory).mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    const body = document.querySelector('.conversion-body')!;
    // 滚动到底 → 触发 loadMoreHistory（第二页）
    await act(async () => {
      body.dispatchEvent(new Event('scroll'));
    });
    expect(
      vi.mocked(conversionTaskControllerListHistory).mock.calls.length
    ).toBe(callsAfterMount + 1);
  });

  it('搜索框过滤转换·历史统一列表（#476）', async () => {
    vi.mocked(conversionTaskControllerListHistory).mockResolvedValue({
      error: undefined,
      data: {
        tasks: [
          {
            nodeId: 'h1',
            name: 'alpha.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: new Date().toISOString(),
          },
          {
            nodeId: 'h2',
            name: 'beta.dwg',
            fileStatus: 'COMPLETED',
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 2,
        hasMore: false,
      },
    } as never);
    // 预设搜索词 → 只显示匹配项
    useConversionQueueStore.setState({
      collapsed: false,
      search: 'alpha',
    });
    await renderPanel();
    expect(screen.getByText('alpha.dwg')).toBeTruthy();
    expect(screen.queryByText('beta.dwg')).toBeNull();
  });

  it('展开态渲染 resize 手柄（四边 + 四角，#476）', async () => {
    useConversionQueueStore.setState({ collapsed: false });
    await renderPanel();
    expect(document.querySelector('.conversion-resize-right')).toBeTruthy();
    expect(document.querySelector('.conversion-resize-left')).toBeTruthy();
    expect(document.querySelector('.conversion-resize-bottom')).toBeTruthy();
    expect(document.querySelector('.conversion-resize-top')).toBeTruthy();
    expect(document.querySelector('.conversion-resize-corner-se')).toBeTruthy();
    expect(document.querySelector('.conversion-resize-corner-nw')).toBeTruthy();
    expect(document.querySelector('.conversion-resize-corner-ne')).toBeTruthy();
    expect(document.querySelector('.conversion-resize-corner-sw')).toBeTruthy();
  });

  it('面板应用内联宽高（来自 store.size，#476）', async () => {
    useConversionQueueStore.setState({
      collapsed: false,
      size: { width: 400, height: 500 },
    });
    await renderPanel();
    const panel = document.querySelector('.conversion-panel')!;
    expect(panel.style.width).toBe('400px');
    expect(panel.style.height).toBe('500px');
  });

  describe('边缘/角落 resize 计算（左/上方向移动 position + 反向宽高，#476）', () => {
    // happy-dom 的 getBoundingClientRect 默认全 0，须 mock 出真实尺寸才有意义
    function mockPanelRect() {
      const panel = document.querySelector('.conversion-panel')!;
      vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 100,
        right: 500,
        bottom: 400,
        width: 400,
        height: 300,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      } as unknown as DOMRect);
    }

    async function dragHandle(
      selector: string,
      down: [number, number],
      move: [number, number]
    ) {
      const handle = document.querySelector(selector)!;
      await act(async () => {
        handle.dispatchEvent(
          new MouseEvent('pointerdown', {
            clientX: down[0],
            clientY: down[1],
            bubbles: true,
          })
        );
      });
      await act(async () => {
        window.dispatchEvent(
          new MouseEvent('pointermove', { clientX: move[0], clientY: move[1] })
        );
      });
      // 收尾：触发 end() 移除 window 监听，避免跨用例累积（beginResize 挂在 window）
      await act(async () => {
        window.dispatchEvent(new MouseEvent('pointerup'));
      });
    }

    it('左边缘：position.x 左移、width 反向增大（position.y / height 不变）', async () => {
      useConversionQueueStore.setState({
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 400, height: 300 },
      });
      await renderPanel();
      mockPanelRect();
      // 向左拖 50px（dx=-50）：x = 100-50=50，w = 400+50=450
      await dragHandle('.conversion-resize-left', [100, 150], [50, 150]);
      const s = useConversionQueueStore.getState();
      expect(s.position).toEqual({ x: 50, y: 100 });
      expect(s.size).toEqual({ width: 450, height: 300 });
    });

    it('上边缘：position.y 上移、height 反向增大（position.x / width 不变）', async () => {
      useConversionQueueStore.setState({
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 400, height: 300 },
      });
      await renderPanel();
      mockPanelRect();
      // 向上拖 20px（dy=-20）：y = 100-20=80，h = 300+20=320
      await dragHandle('.conversion-resize-top', [200, 100], [200, 80]);
      const s = useConversionQueueStore.getState();
      expect(s.position).toEqual({ x: 100, y: 80 });
      expect(s.size).toEqual({ width: 400, height: 320 });
    });

    it('左上角 nw：position 双向移动、宽高双向增大', async () => {
      useConversionQueueStore.setState({
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 400, height: 300 },
      });
      await renderPanel();
      mockPanelRect();
      // 向左上拖（dx=-40, dy=-30）：x=60, w=440, y=70, h=330
      await dragHandle('.conversion-resize-corner-nw', [100, 100], [60, 70]);
      const s = useConversionQueueStore.getState();
      expect(s.position).toEqual({ x: 60, y: 70 });
      expect(s.size).toEqual({ width: 440, height: 330 });
    });

    it('左边缘拖出左边界：clamp 到 margin、width 相应收缩上限', async () => {
      useConversionQueueStore.setState({
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 400, height: 300 },
      });
      await renderPanel();
      mockPanelRect();
      // 向左拖 150px（dx=-150）：被 clamp 到 x=margin(8)，w = 400+92=492
      await dragHandle('.conversion-resize-left', [100, 150], [-50, 150]);
      const s = useConversionQueueStore.getState();
      expect(s.position).toEqual({ x: 8, y: 100 });
      expect(s.size).toEqual({ width: 492, height: 300 });
    });

    it('右边缘（回归）：position 不变、width 增大', async () => {
      useConversionQueueStore.setState({
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 400, height: 300 },
      });
      await renderPanel();
      mockPanelRect();
      // 向右拖 60px（dx=+60）：w = 400+60=460，position 不变
      await dragHandle('.conversion-resize-right', [500, 150], [560, 150]);
      const s = useConversionQueueStore.getState();
      expect(s.position).toEqual({ x: 100, y: 100 });
      expect(s.size).toEqual({ width: 460, height: 300 });
    });
  });

  it('窗口 resize 重新 clamp position + size 不超屏（#476）', async () => {
    // 初始尺寸 / 位置超出视口 → 窗口 resize 后应被 clamp 回视口内
    useConversionQueueStore.setState({
      collapsed: false,
      position: { x: 50, y: 50 },
      size: { width: 5000, height: 4000 },
    });
    await renderPanel();
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    const state = useConversionQueueStore.getState();
    // size clamp 到视口内
    expect(state.size.width).toBeLessThanOrEqual(window.innerWidth - 16);
    expect(state.size.height).toBeLessThanOrEqual(window.innerHeight - 16);
    expect(state.size.width).toBeGreaterThanOrEqual(260);
    expect(state.size.height).toBeGreaterThanOrEqual(180);
    // position clamp 到视口内
    expect(state.position!.x).toBeGreaterThanOrEqual(8);
    expect(state.position!.y).toBeGreaterThanOrEqual(8);
    expect(state.position!.x).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(state.position!.y).toBeLessThanOrEqual(window.innerHeight - 8);
  });

  describe('本地记录展示（相对时间 + 分隔条）', () => {
    it('live 本地记录行显示相对时间（新鲜度上下文）', async () => {
      // 用近 1 小时的 createdAt，断言相对时间渲染为「1小时前」
      const recentTask: ConversionTask = {
        id: 'local-2',
        name: 'recent.dwg',
        status: 'completed',
        source: 'local',
        createdAt: Date.now() - 60 * 60 * 1000,
      };
      useConversionQueueStore.setState({ collapsed: false, tasks: [] });
      await renderPanel();
      await act(async () => {
        useConversionQueueStore.setState({ tasks: [recentTask] });
      });
      const timeSpan = Array.from(
        document.querySelectorAll('.conversion-body .conversion-row')
      )
        .find((row) =>
          row
            .querySelector('.conversion-row-name')
            ?.textContent?.includes('recent.dwg')
        )
        ?.querySelector('.conversion-row-time');
      expect(timeSpan).toBeTruthy();
      expect(timeSpan!.textContent).toContain('1小时前');
    });

    it('live 任务与历史同时存在时渲染「历史记录」分隔条', async () => {
      const liveTask: ConversionTask = {
        id: 'local-3',
        name: 'live.dwg',
        status: 'completed',
        source: 'local',
        createdAt: Date.now(),
      };
      const historyTask: ConversionTask = {
        id: 'hist-1',
        name: 'history.dwg',
        status: 'completed',
        source: 'cloud',
        nodeId: 'node-1',
        createdAt: Date.now() - 2 * 60 * 60 * 1000,
      };
      useConversionQueueStore.setState({ collapsed: false, tasks: [] });
      await renderPanel();
      await act(async () => {
        useConversionQueueStore.setState({
          tasks: [liveTask],
          history: [historyTask],
        });
      });
      const divider = document.querySelector('.conversion-divider');
      expect(divider).toBeTruthy();
      expect(divider!.textContent).toContain('历史记录');
    });
  });

  describe('面板增强批（P0/P1/P2 评估项）', () => {
    it('P1-3：失败下载任务显示「重试」按钮：点击调重试端点并置回 PROCESSING', async () => {
      useBatchDownloadStore.setState({
        tasks: [
          {
            taskId: 'dl-fail',
            status: 'FAILED',
            mode: 'zip',
            itemNames: ['a.dwg'],
            totalCount: 1,
            completedCount: 0,
            errorCount: 1,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      useConversionQueueStore.setState({ collapsed: false });
      await renderPanel();
      const downloadTab = document.querySelector(
        '.conversion-tab:nth-child(2)'
      ) as HTMLElement;
      fireEvent.click(downloadTab);
      const row = document.querySelector('.conversion-row-download')!;
      const retryBtn = row.querySelector(`button[title="${t('重试')}"]`)!;
      expect(retryBtn).toBeTruthy();

      await act(async () => {
        retryBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(batchDownloadControllerRetryTask).toHaveBeenCalledWith({
        path: { taskId: 'dl-fail' },
      });
      // 重试后任务乐观置回 PROCESSING（进度经 SSE 重新推送）
      expect(
        useBatchDownloadStore
          .getState()
          .tasks.find((task) => task.taskId === 'dl-fail')?.status
      ).toBe('PROCESSING');
    });

    it('P1-3：失败下载任务记录了失败项时显示「仅重试失败项」按钮：点击调部分重试端点并加入新任务', async () => {
      useBatchDownloadStore.setState({
        tasks: [
          {
            taskId: 'dl-fail',
            status: 'FAILED',
            mode: 'individual',
            itemNames: ['a.dwg', 'b.dwg'],
            totalCount: 2,
            completedCount: 1,
            errorCount: 1,
            errors: [
              { nodeId: 'n2', fileName: 'b.dwg', error: 'conversion failed' },
            ],
            createdAt: new Date().toISOString(),
          },
        ],
      });
      useConversionQueueStore.setState({ collapsed: false });
      await renderPanel();
      const downloadTab = document.querySelector(
        '.conversion-tab:nth-child(2)'
      ) as HTMLElement;
      fireEvent.click(downloadTab);
      const row = document.querySelector('.conversion-row-download')!;
      const retryFailedBtn = row.querySelector(
        `button[title="${t('仅重试失败项')}"]`
      )!;
      expect(retryFailedBtn).toBeTruthy();

      await act(async () => {
        retryFailedBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(batchDownloadControllerRetryFailedItems).toHaveBeenCalledWith({
        path: { taskId: 'dl-fail' },
      });
      // 新任务加入列表（仅失败项重跑，显示名继承失败项文件名），原任务保持 FAILED
      const store = useBatchDownloadStore.getState();
      const newTask = store.tasks.find((task) => task.taskId === 'dl-fail-retry');
      expect(newTask?.status).toBe('PROCESSING');
      expect(newTask?.itemNames).toEqual(['b.dwg']);
      expect(
        store.tasks.find((task) => task.taskId === 'dl-fail')?.status
      ).toBe('FAILED');
    });

    it('P0-1：完成态上传任务带 nodeId 显示「打开」按钮：点击打开 CAD 编辑器', async () => {
      mockUseUploadManager.mockReturnValue({
        tasks: [
          {
            id: 'up-done',
            fileName: 'done.dwg',
            fileSize: 1024,
            progress: 100,
            status: 'done',
            nodeId: 'dest-folder',
            result: { nodeId: 'node-created' },
          },
        ],
        stats: { ...emptyUploadStats, total: 1, done: 1 },
        pauseTask: vi.fn(),
        resumeTask: vi.fn(),
        removeTask: vi.fn(),
        retryTask: vi.fn(),
        pauseAll: vi.fn(),
        resumeAll: vi.fn(),
        clearCompleted: vi.fn(),
        manager: {},
      });
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      useConversionQueueStore.setState({ collapsed: false });
      await renderPanel();
      const uploadTab = document.querySelector(
        '.conversion-tab:nth-child(3)'
      ) as HTMLElement;
      fireEvent.click(uploadTab);
      const openBtn = document.querySelector(
        `button[title="${t('打开')}"]`
      )!;
      expect(openBtn).toBeTruthy();

      await act(async () => {
        openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(openSpy).toHaveBeenCalledWith(
        '/cad-editor/node-created',
        '_blank',
        'noopener'
      );
      openSpy.mockRestore();
    });

    it('P2-6：Tab 键盘导航：左右方向键按序切换并循环（roving tabindex）', async () => {
      useConversionQueueStore.setState({ collapsed: false });
      await renderPanel();
      const tablist = document.querySelector('[role="tablist"]')!;
      const tabs = tablist.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(3);
      // 默认转换 tab 激活
      expect((tabs[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
        'true'
      );

      // ArrowRight → 下载 tab → 上传 tab → 循环回转换 tab
      fireEvent.keyDown(tablist, { key: 'ArrowRight' });
      expect((tabs[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
        'true'
      );
      fireEvent.keyDown(tablist, { key: 'ArrowRight' });
      expect((tabs[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
        'true'
      );
      fireEvent.keyDown(tablist, { key: 'ArrowRight' });
      expect((tabs[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
        'true'
      );
      // ArrowLeft 从转换 tab 循环到上传 tab
      fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
      expect((tabs[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe(
        'true'
      );
    });

    it('P2-9：下载列表轻量 cap：60 条终态任务初始只渲染 50 条 + 「加载更多」按钮，点击后全部加载', async () => {
      const tasks = Array.from({ length: 60 }, (_, i) => ({
        taskId: `dl-${i}`,
        status: 'COMPLETED' as const,
        mode: 'zip' as const,
        itemNames: [`file${i}.dwg`],
        totalCount: 1,
        completedCount: 1,
        errorCount: 0,
        createdAt: new Date().toISOString(),
      }));
      useBatchDownloadStore.setState({ tasks });
      useConversionQueueStore.setState({ collapsed: false });
      await renderPanel();
      const downloadTab = document.querySelector(
        '.conversion-tab:nth-child(2)'
      ) as HTMLElement;
      fireEvent.click(downloadTab);
      // 初始 cap 50：只渲染 50 行 + 「加载更多」按钮
      expect(document.querySelectorAll('.conversion-row-download')).toHaveLength(
        50
      );
      const loadMoreBtn = document.querySelector('.conversion-load-more')!;
      expect(loadMoreBtn).toBeTruthy();
      // 点击「加载更多」→ +50 → 60 条全部渲染，按钮消失
      fireEvent.click(loadMoreBtn);
      expect(document.querySelectorAll('.conversion-row-download')).toHaveLength(
        60
      );
      expect(document.querySelector('.conversion-load-more')).toBeNull();
    });

    it('P2-8：搜索 per-tab：下载 tab 搜索只过滤下载列表，不污染转换 tab 搜索词', async () => {
      useBatchDownloadStore.setState({
        tasks: [
          {
            taskId: 'dl-1',
            status: 'COMPLETED',
            mode: 'zip',
            itemNames: ['alpha.dwg'],
            totalCount: 1,
            completedCount: 1,
            errorCount: 0,
            createdAt: new Date().toISOString(),
          },
          {
            taskId: 'dl-2',
            status: 'COMPLETED',
            mode: 'zip',
            itemNames: ['beta.dwg'],
            totalCount: 1,
            completedCount: 1,
            errorCount: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      useConversionQueueStore.setState({ collapsed: false });
      await renderPanel();
      const downloadTab = document.querySelector(
        '.conversion-tab:nth-child(2)'
      ) as HTMLElement;
      fireEvent.click(downloadTab);
      const searchInput = document.querySelector(
        '.conversion-search input'
      ) as HTMLInputElement;
      // 下载 tab 输入关键字 → 只过滤下载列表
      fireEvent.change(searchInput, { target: { value: 'alpha' } });
      expect(document.querySelectorAll('.conversion-row-download')).toHaveLength(
        1
      );
      // 下载搜索词是独立本地状态：不写入转换 tab 的 store.search
      expect(useConversionQueueStore.getState().search).toBe('');
      // 切回转换 tab：搜索框回到转换 tab 自己的关键字（空），转换列表不被下载搜索词过滤
      const conversionTab = document.querySelector(
        '.conversion-tab:nth-child(1)'
      ) as HTMLElement;
      fireEvent.click(conversionTab);
      expect(
        (document.querySelector('.conversion-search input') as HTMLInputElement)
          .value
      ).toBe('');
    });
  });
});
