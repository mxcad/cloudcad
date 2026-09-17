///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const permissionMock = vi.hoisted(() => ({
  hasPermission: vi.fn((p: string) => p === 'SYSTEM_MONITOR'),
}));
const notificationMock = vi.hoisted(() => ({
  showToast: vi.fn(),
  showConfirm: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionMock,
}));
vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => undefined,
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => notificationMock,
}));
vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars
      ? m.replace(/\{(\w+)\}/g, (_match: string, key: string) =>
          vars[key] !== undefined ? vars[key] : ''
        )
      : m,
  // dateUtils 读 i18nScope.activeLanguage 决定日期 locale
  i18nScope: { activeLanguage: 'zh-CN' },
}));
vi.mock('@/api-sdk', () => ({
  healthControllerCheck: vi.fn(() =>
    Promise.resolve({
      data: {
        status: 'ok',
        info: {
          database: { status: 'up' },
          storage: { status: 'up' },
        },
      },
    })
  ),
  conversionMonitorControllerGetStats: vi.fn(() =>
    Promise.resolve({
      data: {
        mode: 'process-pool',
        processPool: {
          queueLength: 2,
          criticalPriorityQueueLength: 1,
          highPriorityQueueLength: 1,
          lowPriorityQueueLength: 0,
          runningCount: 3,
          maxConcurrent: 4,
          timeout: 600000,
          duration: {
            sampleCount: 10,
            p50DurationMs: 1200,
            p95DurationMs: 4500,
            p50WaitMs: 0,
            p95WaitMs: 15,
          },
        },
        conversionService: null,
        conversionServiceError: null,
        history: [
          { t: Date.now() - 60000, queueDepth: 1, running: 2, p95DurationMs: 4000 },
          { t: Date.now(), queueDepth: 2, running: 3, p95DurationMs: 4500 },
        ],
        sampledAt: Date.now(),
      },
    })
  ),
  cacheMonitorControllerGetSummary: vi.fn(() =>
    Promise.resolve({
      data: {
        stats: {
          levels: {
            L1: { level: 'L1', size: 1024, hitRate: 95, totalRequests: 60 },
            L2: { level: 'L2', size: 2048, hitRate: 90, totalRequests: 40 },
          },
          summary: {
            totalHits: 95,
            totalMisses: 5,
            totalRequests: 100,
            overallHitRate: 92.5,
            totalMemoryUsage: 1048576,
          },
        },
        healthStatus: {
          L1: { level: 'L1', status: 'healthy', availability: 100 },
          L2: { level: 'L2', status: 'healthy', availability: 100 },
          overall: 'healthy',
        },
        performanceMetrics: {},
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    })
  ),
  cacheMonitorControllerGetWarnings: vi.fn(() =>
    Promise.resolve({ data: { warnings: ['测试缓存警告'] } })
  ),
  cacheMonitorControllerGetSizeTrend: vi.fn(() =>
    Promise.resolve({ data: { L1: [100, 200], L2: [300, 400] } })
  ),
  cacheMonitorControllerGetPerformanceTrend: vi.fn(() =>
    Promise.resolve({
      data: { timestamps: [], avgResponseTimes: [], errorRates: [] },
    })
  ),
  cacheMonitorControllerGetValue: vi.fn(),
  cacheMonitorControllerSetValue: vi.fn(),
  cacheMonitorControllerDeleteValue: vi.fn(),
  cacheMonitorControllerDeleteByPattern: vi.fn(),
  cacheMonitorControllerRefresh: vi.fn(),
  cacheMonitorControllerCleanup: vi.fn(),
  alertControllerList: vi.fn(),
  taskRunControllerListRuns: vi.fn(),
  taskRunControllerListTasks: vi.fn(),
  taskRunControllerRunTask: vi.fn(),
  runtimeConfigControllerGetAllConfigs: vi.fn(),
  runtimeConfigControllerUpdateConfig: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(SystemMonitorPage)
    )
  );
}

vi.mock('recharts', () => {
  const passthrough = (name: string) =>
    function MockRechartsComponent(props: Record<string, unknown>) {
      return (
        <div data-testid={`recharts-${name}`}>
          {props.children as React.ReactNode}
        </div>
      );
    };
  return {
    ResponsiveContainer: passthrough('ResponsiveContainer'),
    LineChart: passthrough('LineChart'),
    Line: () => <div data-testid="recharts-Line" />,
    XAxis: () => <div data-testid="recharts-XAxis" />,
    YAxis: () => <div data-testid="recharts-YAxis" />,
    CartesianGrid: () => <div data-testid="recharts-CartesianGrid" />,
    Tooltip: () => <div data-testid="recharts-Tooltip" />,
    Legend: () => <div data-testid="recharts-Legend" />,
  };
});

import { SystemMonitorPage } from './index';
import {
  alertControllerList,
  taskRunControllerListRuns,
  taskRunControllerListTasks,
} from '@/api-sdk';

const alertListMock = vi.mocked(alertControllerList);
const taskRunListMock = vi.mocked(taskRunControllerListRuns);
const taskListMock = vi.mocked(taskRunControllerListTasks);

function mockAlertList(items: unknown[] = [], pagination: Record<string, unknown> = {}) {
  alertListMock.mockResolvedValue({
    data: {
      data: items,
      pagination: {
        page: 1,
        limit: 20,
        total: items.length,
        totalPages: Math.max(1, Math.ceil(items.length / 20)),
        ...pagination,
      },
    } as never,
  });
}

function mockTaskRunList(items: unknown[] = []) {
  taskRunListMock.mockResolvedValue({
    data: {
      data: items,
      pagination: {
        page: 1,
        limit: 50,
        total: items.length,
        totalPages: 1,
      },
    } as never,
  });
}

function mockTaskList(items: unknown[] = []) {
  taskListMock.mockResolvedValue({ data: { data: items } } as never);
}

function makeTaskRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    taskName: 'storage-cleanup:expired-storage',
    status: 'SUCCESS',
    startedAt: '2026-08-01T00:00:00.000Z',
    finishedAt: '2026-08-01T00:00:02.000Z',
    durationMs: 2000,
    errorSummary: null,
    trigger: 'SCHEDULED',
    triggeredBy: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    source: 'disk-monitor',
    messageKey: 'disk.usage.high',
    level: 'P1',
    message: '磁盘使用率超过 85%',
    status: 'OPEN',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SystemMonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(
      (p: string) => p === 'SYSTEM_MONITOR'
    );
    mockAlertList();
    mockTaskRunList();
    mockTaskList();
  });

  it('默认展示核心服务 Tab（核心服务/系统信息；转换队列已独立成 Tab）', async () => {
    renderPage();

    expect(await screen.findByText('PostgreSQL 数据库')).toBeInTheDocument();
    expect(screen.getByText('系统信息')).toBeInTheDocument();
    // 转换队列不再内嵌核心 Tab，而是独立 Tab 按钮（#406）
    expect(
      screen.getByRole('button', { name: '转换队列' })
    ).toBeInTheDocument();
  });

  it('渲染监控中心全部 Tab，均可用', async () => {
    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    for (const label of ['核心服务', '缓存监控', '后台任务', '转换队列', '告警历史']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    expect(screen.getByRole('button', { name: '后台任务' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '转换队列' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '告警历史' })).not.toBeDisabled();
  });

  it('转换队列 Tab 渲染 process-pool 模式当前值、耗时与趋势图', async () => {
    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '转换队列' }));

    expect(await screen.findByText('转换队列状态')).toBeInTheDocument();
    expect(screen.getByText('进程内执行')).toBeInTheDocument();
    expect(screen.getByText('进程内转换队列')).toBeInTheDocument();
    // 队列深度 2 / 运行中 3 / 并发上限 4
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    // 耗时 P50/P95 与样本数
    expect(screen.getByText('1.2s')).toBeInTheDocument();
    expect(screen.getByText('4.5s')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // 趋势图
    expect(screen.getByText('近 24 小时趋势')).toBeInTheDocument();
    expect(screen.getByTestId('recharts-LineChart')).toBeInTheDocument();
  });

  it('转换队列 Tab 在 conversion-service 模式渲染三级工作池与自动扩容状态', async () => {
    const { conversionMonitorControllerGetStats } = await import('@/api-sdk');
    vi.mocked(conversionMonitorControllerGetStats).mockResolvedValue({
      data: {
        mode: 'conversion-service',
        processPool: null,
        conversionService: {
          tasks: {
            total: 20,
            pending: 3,
            processing: 2,
            completed: 14,
            failed: 1,
          },
          duration: { sampleCount: 14, p50Ms: 900, p95Ms: 3200 },
          workers: {
            '1': {
              label: 'upload',
              maxConcurrent: 2,
              currentMax: 4,
              running: 2,
              waiting: 1,
              autoScale: true,
              backlogSince: 1700000000000,
            },
            '2': {
              label: 'export',
              maxConcurrent: 2,
              currentMax: 2,
              running: 0,
              waiting: 0,
              autoScale: true,
              backlogSince: null,
            },
          },
        },
        conversionServiceError: null,
        history: [],
        sampledAt: Date.now(),
      },
    } as never);

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '转换队列' }));

    expect(await screen.findByText('独立转换服务')).toBeInTheDocument();
    // 队列积压（pending=3 > 0）
    expect(screen.getByText('队列积压')).toBeInTheDocument();
    // 任务计数
    expect(screen.getByText('排队中')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    // 三级工作池卡片 + 自动扩容标签
    expect(screen.getByText('upload')).toBeInTheDocument();
    expect(screen.getByText('export')).toBeInTheDocument();
    expect(screen.getByText('已自动扩容')).toBeInTheDocument();
    expect(screen.getByText('基准容量')).toBeInTheDocument();
  });

  it('转换队列 Tab 在 cloud-faas 模式展示不适用说明', async () => {
    const { conversionMonitorControllerGetStats } = await import('@/api-sdk');
    vi.mocked(conversionMonitorControllerGetStats).mockResolvedValue({
      data: {
        mode: 'cloud-faas',
        processPool: null,
        conversionService: null,
        conversionServiceError: null,
        history: [],
        sampledAt: Date.now(),
      },
    } as never);

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '转换队列' }));

    expect(await screen.findByText('云函数')).toBeInTheDocument();
    expect(
      screen.getByText('云函数由云厂商托管调度，无队列概念，本 Tab 不适用')
    ).toBeInTheDocument();
  });

  it('转换队列 Tab 渲染排队 ETA（conversion-service 模式，#478）', async () => {
    const sdk = await import('@/api-sdk');
    vi.mocked(sdk.conversionMonitorControllerGetStats).mockResolvedValue({
      data: { mode: 'conversion-service', processPool: null,
        conversionService: { tasks: { total: 5, pending: 4, processing: 2, completed: 1, failed: 0 },
          duration: { sampleCount: 8, p50Ms: 3000, p95Ms: 9000 }, workers: {} },
        conversionServiceError: null, history: [], sampledAt: Date.now() },
    } as never);
    renderPage();
    await screen.findByText('PostgreSQL 数据库');
    fireEvent.click(screen.getByRole('button', { name: '转换队列' }));
    // 排队 ETA：pending=4 / processing=2 × p50=3000ms = 6000ms = 6s
    expect(await screen.findByText(/排队 4 个 · 预计约 6s 清空/)).toBeInTheDocument();
    // 永久失败（known-bad）机制已整体移除：面板不再有该区块与复位入口
    expect(screen.queryByText(/永久失败/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复位全部' })).not.toBeInTheDocument();
  });

  it('切换到缓存监控 Tab 渲染摘要/健康/警告/图表/key 操作', async () => {
    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '缓存监控' }));

    expect(await screen.findByText('缓存摘要')).toBeInTheDocument();
    expect(await screen.findByText('92.50%')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('1.00 MB')).toBeInTheDocument();
    expect(screen.getAllByText('缓存健康状态').length).toBeGreaterThan(0);
    expect(screen.getByText('L1 内存缓存')).toBeInTheDocument();
    expect(screen.getByText('L2 Redis 缓存')).toBeInTheDocument();
    expect(screen.getByText('测试缓存警告')).toBeInTheDocument();
    expect(screen.getAllByText('缓存 Key 操作').length).toBeGreaterThan(0);
    expect(screen.getByTestId('recharts-LineChart')).toBeInTheDocument();
  });

  it('非 SYSTEM_ADMIN 用户在缓存 Tab 看不到写操作按钮', async () => {
    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '缓存监控' }));
    await screen.findByText('缓存摘要');

    expect(screen.getByRole('button', { name: '查询' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '清空所有缓存' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '按模式删除' })).not.toBeInTheDocument();
  });

  it('SYSTEM_ADMIN 用户在缓存 Tab 可见写操作按钮', async () => {
    permissionMock.hasPermission.mockImplementation(
      (p: string) => p === 'SYSTEM_MONITOR' || p === 'SYSTEM_ADMIN'
    );

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '缓存监控' }));
    await screen.findByText('缓存摘要');

    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按模式删除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清空所有缓存' })).toBeInTheDocument();
  });

  it('告警历史 Tab 渲染分页列表与状态标签，open 告警高亮', async () => {
    mockAlertList(
      [
        makeAlert({ id: 'a1', message: '磁盘使用率超过 85%' }),
        makeAlert({
          id: 'a2',
          level: 'P0',
          message: 'Redis 连接失败',
        }),
        makeAlert({
          id: 'a3',
          level: 'P2',
          message: '磁盘使用率持续升高',
          status: 'RESOLVED',
        }),
      ],
      { total: 3, totalPages: 1 }
    );

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '告警历史' }));

    expect(await screen.findByText('磁盘使用率超过 85%')).toBeInTheDocument();
    expect(screen.getByText('Redis 连接失败')).toBeInTheDocument();
    expect(screen.getByText('磁盘使用率持续升高')).toBeInTheDocument();
    expect(screen.getAllByText('警告').length).toBeGreaterThan(0);
    expect(screen.getByText('严重')).toBeInTheDocument();
    expect(screen.getByText('提示')).toBeInTheDocument();
    expect(screen.getAllByText('未解决').length).toBe(2);
    expect(screen.getByText('已解决')).toBeInTheDocument();
    expect(screen.getAllByText('disk-monitor').length).toBe(3);
  });

  it('告警历史 Tab 空态展示空文案', async () => {
    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '告警历史' }));

    expect(await screen.findByText('暂无告警记录')).toBeInTheDocument();
  });

  it('告警历史超过一页时展示分页器，切页携带页码', async () => {
    mockAlertList([makeAlert()], { total: 25, totalPages: 2 });

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '告警历史' }));
    await screen.findByText('磁盘使用率超过 85%');

    expect(screen.getByRole('button', { name: '下一页' })).toBeInTheDocument();

    alertListMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(alertListMock).toHaveBeenCalledWith({
        query: { page: 2, limit: 20 },
      });
    });
  });

  it('无 SYSTEM_MONITOR 权限显示访问受限', async () => {
    permissionMock.hasPermission.mockImplementation(() => false);

    renderPage();

    expect(await screen.findByText('访问受限')).toBeInTheDocument();
    expect(
      screen.getByText('您需要系统监控权限才能访问此页面')
    ).toBeInTheDocument();
  });

  it('后台任务 Tab 渲染任务列表（任务名/时间/结果/耗时/触发方式），失败任务红色高亮', async () => {
    mockTaskRunList([
      makeTaskRun({ id: 'r1', taskName: 'storage-cleanup:expired-storage' }),
      makeTaskRun({
        id: 'r2',
        taskName: 'cache-cleanup:health-check',
        status: 'FAILED',
        errorSummary: 'Redis 连接超时',
        durationMs: 1500,
        trigger: 'MANUAL',
        startedAt: '2026-08-01T01:00:00.000Z',
      }),
    ]);

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '后台任务' }));

    expect(
      await screen.findByText('storage-cleanup:expired-storage')
    ).toBeInTheDocument();
    expect(screen.getByText('cache-cleanup:health-check')).toBeInTheDocument();
    expect(screen.getByText('Redis 连接超时')).toBeInTheDocument();
    expect(screen.getAllByText('成功').length).toBeGreaterThan(0);
    expect(screen.getAllByText('失败').length).toBeGreaterThan(0);
    expect(screen.getAllByText('定时').length).toBeGreaterThan(0);
    expect(screen.getAllByText('手动').length).toBeGreaterThan(0);

    const failedRow = screen
      .getByText('cache-cleanup:health-check')
      .closest('tr');
    expect(failedRow).toHaveAttribute('data-status', 'FAILED');
    const successRow = screen
      .getByText('storage-cleanup:expired-storage')
      .closest('tr');
    expect(successRow).toHaveAttribute('data-status', 'SUCCESS');
  });

  it('后台任务 Tab 空态展示空文案', async () => {
    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '后台任务' }));

    expect(await screen.findByText('暂无任务执行记录')).toBeInTheDocument();
  });

  it('非 SYSTEM_ADMIN/SYSTEM_CONFIG_WRITE 用户看不到触发按钮与开关', async () => {
    mockTaskRunList([makeTaskRun()]);

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '后台任务' }));
    await screen.findByText('storage-cleanup:expired-storage');

    expect(screen.queryByRole('button', { name: '手动触发' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('SYSTEM_ADMIN + SYSTEM_CONFIG_WRITE 用户可见触发按钮与开关，点击触发走确认流程', async () => {
    permissionMock.hasPermission.mockImplementation((p: string) =>
      ['SYSTEM_MONITOR', 'SYSTEM_ADMIN', 'SYSTEM_CONFIG_WRITE'].includes(p)
    );
    mockTaskRunList([makeTaskRun()]);
    mockTaskList([
      {
        taskName: 'storage-cleanup:expired-storage',
        description: '清理过期存储',
      },
    ]);

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '后台任务' }));
    await screen.findByRole('button', { name: '手动触发' });

    expect(screen.getByRole('button', { name: '手动触发' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '手动触发' }));

    await waitFor(() => {
      expect(notificationMock.showConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '手动触发任务',
          message: '确定要手动触发任务 storage-cleanup:expired-storage 吗？',
        })
      );
    });
  });

  it('任务清单每任务一个手动触发按钮（不随执行记录数变化）', async () => {
    permissionMock.hasPermission.mockImplementation((p: string) =>
      ['SYSTEM_MONITOR', 'SYSTEM_ADMIN'].includes(p)
    );
    mockTaskRunList([
      makeTaskRun({ id: 'r1', startedAt: '2026-08-01T02:00:00.000Z' }),
      makeTaskRun({ id: 'r2', startedAt: '2026-08-01T01:00:00.000Z' }),
    ]);
    mockTaskList([
      { taskName: 'storage-cleanup:expired-storage', description: '清理过期存储' },
      { taskName: 'cache-cleanup:warning-check', description: '缓存监控告警检查' },
    ]);

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '后台任务' }));

    const triggerButtons = await screen.findAllByRole('button', {
      name: '手动触发',
    });
    expect(triggerButtons).toHaveLength(2);
  });

  it('任务清单定时列：显示人类可读描述（hover 显示 cron），无独立定时显示「—」', async () => {
    permissionMock.hasPermission.mockImplementation((p: string) =>
      ['SYSTEM_MONITOR', 'SYSTEM_ADMIN'].includes(p)
    );
    mockTaskList([
      {
        taskName: 'storage-cleanup:expired-storage',
        description: '清理过期存储',
        schedule: '0 03 * * *',
        scheduleLabel: '每天 03:00',
      },
      {
        taskName: 'backup:remote-push',
        description: '推送最新备份到异地',
        schedule: null,
        scheduleLabel: null,
      },
    ]);

    renderPage();
    await screen.findByText('PostgreSQL 数据库');

    fireEvent.click(screen.getByRole('button', { name: '后台任务' }));
    await screen.findByText('storage-cleanup:expired-storage');

    // 主显示人类可读描述，tooltip 保留原始 cron
    const scheduleCell = screen.getByText('每天 03:00');
    expect(scheduleCell).toBeInTheDocument();
    expect(scheduleCell).toHaveAttribute('title', '0 03 * * *');
    expect(screen.getByText('—', { exact: true })).toBeInTheDocument();
  });
});
