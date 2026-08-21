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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { t } from '@/languages';
import { TOAST_EVENT } from '@/utils/notificationEvents';
import '@/config/clientSetup';
// 页面级权限：默认授予 SYSTEM_BILLING_WRITE（canWrite=true，操作按钮可用）；
// 只读权限的禁用行为由 PermissionAssignment 同级单测覆盖
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true }),
}));
import AdminBillingPage from './index';
import { PAGE_SIZE } from './constants';
import type {
  VipTierItem,
  DurationItem,
  AdminOrder,
  RefundApplicationItem,
} from './types';

// ── 数据工厂 ────────────────────────────────────────────────────────────

const REGISTRY_ENTRIES = [
  {
    id: 'reg-1',
    key: 'quota.personal_storage_mb',
    type: 'number',
    label: '个人存储空间',
    defaultValue: 1024,
    description: '',
    sortOrder: 1,
  },
  {
    id: 'reg-2',
    key: 'quota.conversion_priority',
    type: 'bool',
    label: '转换优先',
    defaultValue: false,
    description: null,
    sortOrder: 2,
  },
];

const TIERS: VipTierItem[] = [
  {
    id: 'tier-1',
    level: 0,
    name: '免费版',
    baseMonthlyPrice: 0,
    isActive: true,
    configs: {},
  },
  {
    id: 'tier-2',
    level: 1,
    name: '标准会员',
    baseMonthlyPrice: 1500,
    isActive: true,
    configs: { 'quota.personal_storage_mb': 10240 },
  },
  {
    id: 'tier-3',
    level: 2,
    name: '高级会员',
    baseMonthlyPrice: 3000,
    isActive: false,
    configs: {},
  },
];

const DURATIONS: DurationItem[] = [
  {
    id: 'dur-1',
    months: 3,
    multiplierBps: 9500,
    label: '3个月',
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'dur-2',
    months: 12,
    multiplierBps: 7000,
    label: '12个月',
    isActive: false,
    sortOrder: 2,
  },
];

const PENDING_ORDER: AdminOrder = {
  id: 'o1',
  orderNo: 'O20260801001',
  userId: 'u1',
  amount: 9850,
  status: 'PENDING',
  gateway: 'wechat',
  createdAt: '2026-08-01T10:00:00.000Z',
  user: { id: 'u1', email: 'alice@example.com' },
};

const SUCCEEDED_ORDER: AdminOrder = {
  id: 'o2',
  orderNo: 'O20260801002',
  userId: 'u2',
  amount: 3000,
  status: 'SUCCEEDED',
  gateway: 'wechat',
  createdAt: '2026-08-02T10:00:00.000Z',
};

const FAILED_ORDER: AdminOrder = {
  id: 'o3',
  orderNo: 'O20260801003',
  userId: 'u3',
  amount: 1234,
  status: 'FAILED',
  gateway: 'mock',
  createdAt: '2026-08-03T10:00:00.000Z',
};

const PENDING_REFUND_APP: RefundApplicationItem = {
  id: 'ra1',
  orderId: 'o2',
  userId: 'u2',
  amount: 3000,
  reason: '买错了，想退款',
  status: 'PENDING',
  createdAt: '2026-08-04T10:00:00.000Z',
  user: { id: 'u2', email: 'bob@example.com', username: 'bob' },
  order: {
    orderNo: 'O20260801002',
    description: '标准会员 1个月',
    status: 'SUCCEEDED',
    gateway: 'wechat',
  },
};

const APPROVED_REFUND_APP: RefundApplicationItem = {
  id: 'ra2',
  orderId: 'o4',
  userId: 'u4',
  amount: 9850,
  reason: '重复购买',
  status: 'APPROVED',
  reviewNote: '同意退款',
  reviewedAt: '2026-08-05T10:00:00.000Z',
  createdAt: '2026-08-04T11:00:00.000Z',
  user: { id: 'u4', email: 'carol@example.com' },
  order: {
    orderNo: 'O20260801004',
    description: '高级会员 3个月',
    status: 'REFUNDED',
    gateway: 'wechat',
  },
};

// ── MSW 覆盖（自动生成 handler 之上按测试覆盖确定数据） ───────────────────

let ordersStore: AdminOrder[] = [];
let ordersTotal = 0;
let orderPageRequests: string[] = [];
let manualCompleteCalls: Array<Record<string, unknown>> = [];
let refundCalls: Array<Record<string, unknown>> = [];
let refundAppsStore: RefundApplicationItem[] = [];
let approveCalls: Array<{ id: string; body: Record<string, unknown> }> = [];
let rejectCalls: Array<{ id: string; body: Record<string, unknown> }> = [];

/** 默认成功路径：tiers/durations/registry/orders + manual-complete/refund 成功翻转订单状态 */
function stubBillingApi(overrides: { orders?: AdminOrder[] } = {}) {
  if (overrides.orders) {
    ordersStore = overrides.orders;
    ordersTotal = overrides.orders.length;
  }
  server.use(
    http.get('/api/v1/admin/vip/tiers', () =>
      HttpResponse.json({ code: 0, data: TIERS })
    ),
    http.get('/api/v1/admin/vip/durations', () =>
      HttpResponse.json({ code: 0, data: DURATIONS })
    ),
    http.get('/api/v1/vip/tiers/registry', () =>
      HttpResponse.json({ code: 0, data: REGISTRY_ENTRIES })
    ),
    http.get('/api/v1/admin/billing/orders', ({ request }) => {
      const page = Number(
        new URL(request.url).searchParams.get('page') ?? '1'
      );
      orderPageRequests.push(String(page));
      // 模拟后端分页：每页 PAGE_SIZE 条
      const items = ordersStore.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE
      );
      return HttpResponse.json({
        code: 0,
        data: { items, total: ordersTotal },
      });
    }),
    http.post('/api/v1/admin/billing/manual-complete', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      manualCompleteCalls.push(body);
      const orderNo = String(body.orderNo ?? '');
      ordersStore = ordersStore.map((o) =>
        o.orderNo === orderNo ? { ...o, status: 'SUCCEEDED' } : o
      );
      return HttpResponse.json({ code: 0, data: { success: true } });
    }),
    http.post('/api/v1/admin/billing/refund', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      refundCalls.push(body);
      const orderNo = String(body.orderNo ?? '');
      ordersStore = ordersStore.map((o) =>
        o.orderNo === orderNo ? { ...o, status: 'REFUNDED' } : o
      );
      return HttpResponse.json({ code: 0, data: { success: true } });
    }),
    http.get('/api/v1/admin/billing/refund-applications', ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get('page') ?? '1');
      const status = url.searchParams.get('status') ?? '';
      const filtered = status
        ? refundAppsStore.filter((a) => a.status === status)
        : refundAppsStore;
      const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return HttpResponse.json({
        code: 0,
        data: { items, total: filtered.length },
      });
    }),
    http.post(
      '/api/v1/admin/billing/refund-applications/:id/approve',
      async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        approveCalls.push({ id: String(params.id), body });
        refundAppsStore = refundAppsStore.map((a) =>
          a.id === params.id
            ? {
                ...a,
                status: 'APPROVED',
                reviewNote: String(body.note ?? ''),
                reviewedAt: '2026-08-06T10:00:00.000Z',
              }
            : a
        );
        return HttpResponse.json({ code: 0, data: { success: true } });
      }
    ),
    http.post(
      '/api/v1/admin/billing/refund-applications/:id/reject',
      async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        rejectCalls.push({ id: String(params.id), body });
        refundAppsStore = refundAppsStore.map((a) =>
          a.id === params.id
            ? {
                ...a,
                status: 'REJECTED',
                reviewNote: String(body.note ?? ''),
                reviewedAt: '2026-08-06T10:00:00.000Z',
              }
            : a
        );
        return HttpResponse.json({ code: 0, data: { success: true } });
      }
    )
  );
}

/** toast 事件监听：收集页面与全局拦截器派发的提示 */
function collectToastMessages(listener: ReturnType<typeof vi.fn>): string[] {
  return listener.mock.calls
    .map(([e]) => (e as CustomEvent<{ message: string }>)?.detail?.message)
    .filter(Boolean) as string[];
}

// ── 渲染辅助 ─────────────────────────────────────────────────────────────

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminBillingPage />
    </QueryClientProvider>
  );
}

describe('AdminBillingPage', () => {
  let toastListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    ordersStore = [PENDING_ORDER, SUCCEEDED_ORDER, FAILED_ORDER];
    ordersTotal = ordersStore.length;
    orderPageRequests = [];
    manualCompleteCalls = [];
    refundCalls = [];
    refundAppsStore = [PENDING_REFUND_APP, APPROVED_REFUND_APP];
    approveCalls = [];
    rejectCalls = [];
    stubBillingApi();
    toastListener = vi.fn();
    window.addEventListener(TOAST_EVENT, toastListener);
  });

  afterEach(() => {
    window.removeEventListener(TOAST_EVENT, toastListener);
  });

  // ── 1. 定价/时长套餐渲染与价格计算（页面集成验证） ──

  it('渲染支付管理标题与三个 Tab（VIP等级/时长定价/订单管理）', async () => {
    renderPage();

    expect(await screen.findByText(t('支付管理'))).toBeInTheDocument();
    for (const label of [t('VIP等级'), t('时长定价'), t('订单管理')]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('tiers Tab 渲染等级卡片：名称/VIP等级/月基础价（分→元）/上架标签', async () => {
    renderPage();

    expect(await screen.findByText('标准会员 (VIP1)')).toBeInTheDocument();
    expect(screen.getByText('高级会员 (VIP2)')).toBeInTheDocument();
    expect(screen.getByText('免费版 (VIP0)')).toBeInTheDocument();

    // baseMonthlyPrice 1500 分 → ¥15.00（formatYuan 集成）
    expect(
      screen.getByText((content) =>
        content.includes(`${t('月基础价')}: ¥15.00`)
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes(`${t('月基础价')}: ¥30.00`)
      )
    ).toBeInTheDocument();
  });

  it('tiers Tab 区分上架/已下架等级：下架等级无下架按钮、有删除按钮', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    expect(screen.getAllByText(t('上架')).length).toBeGreaterThan(0);
    expect(screen.getByText(t('已下架'))).toBeInTheDocument();
    // 系统默认等级（VIP0）显示「系统默认」标签，不参与上下架
    expect(screen.getByText(t('系统默认'))).toBeInTheDocument();

    // 上架等级中仅标准会员有下架按钮（系统默认等级不可下架）
    expect(screen.getAllByRole('button', { name: t('下架') })).toHaveLength(1);
    // 仅下架等级（高级会员）有删除按钮
    const delBtns = screen.getAllByRole('button', { name: t('删除') });
    expect(
      delBtns.map((b) => `${b.textContent}`).join(',')
    ).toBe('删除');
  });

  it('durations Tab 渲染倍率换算与折扣（bps→小数、省X%、排序）', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('时长定价') }));

    expect(await screen.findByText('3个月 (3个月)')).toBeInTheDocument();
    expect(screen.getByText('12个月 (12个月)')).toBeInTheDocument();

    // multiplierBps 9500 → 0.95x，省 5%
    expect(
      screen.getByText((content) =>
        content.includes('0.95x') && content.includes('5%')
      )
    ).toBeInTheDocument();
    // multiplierBps 7000 → 0.70x，省 30%
    expect(
      screen.getByText((content) =>
        content.includes('0.70x') && content.includes('30%')
      )
    ).toBeInTheDocument();
    // 排序展示
    expect(
      screen.getByText((content) => content.includes(t('排序')) && content.includes('1'))
    ).toBeInTheDocument();
  });

  it('编辑等级弹窗回填价格（分→元）并提示内部以分存储', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    // 等级卡片顺序与 TIERS 数组一致：index 1 = 标准会员（VIP1）
    fireEvent.click(screen.getAllByRole('button', { name: t('编辑') })[1]);

    expect(await screen.findByText(t('编辑 VIP 等级'))).toBeInTheDocument();
    expect(screen.getByDisplayValue('标准会员')).toBeInTheDocument();
    // 1500 分 → 15 元回填
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('1500'))
    ).toBeInTheDocument();
    // registry 权益配置项渲染
    expect(screen.getByText('个人存储空间')).toBeInTheDocument();
    expect(screen.getByText('转换优先')).toBeInTheDocument();
  });

  it('编辑时长弹窗回填倍率（bps→小数）并提示折扣', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('时长定价') }));
    await screen.findByText('3个月 (3个月)');

    fireEvent.click(screen.getAllByRole('button', { name: t('编辑') })[0]);

    expect(await screen.findByText(t('编辑时长定价'))).toBeInTheDocument();
    // 9500 bps → 0.95 回填
    expect(screen.getByDisplayValue('0.95')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3个月')).toBeInTheDocument();
    // 相当于 5% 折扣
    expect(screen.getByText(t('相当于 {discount}% 折扣', { discount: '5' }))).toBeInTheDocument();
  });

  // ── 2. 发起支付 → 回调 → 状态更新（管理端模拟回调全流程） ──

  it('订单 Tab 按状态渲染操作：PENDING 模拟回调 / SUCCEEDED 退款 / FAILED 无操作', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));

    expect(await screen.findByText('O20260801001')).toBeInTheDocument();
    // 金额分→元
    expect(screen.getByText('¥98.50')).toBeInTheDocument();
    expect(screen.getByText('¥30.00')).toBeInTheDocument();
    // 状态标签（select 的筛选项与表格 Tag 同文案，用 getAllByText 排除 option 后断言 Tag 存在）
    expect(
      screen.getAllByText(t('待支付')).filter((el) => el.tagName === 'SPAN')
        .length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(t('已支付')).filter((el) => el.tagName === 'SPAN')
        .length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(t('支付失败')).filter((el) => el.tagName === 'SPAN')
        .length
    ).toBeGreaterThanOrEqual(1);

    expect(
      screen.getAllByRole('button', { name: t('模拟回调') })
    ).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: t('退款') })).toHaveLength(1);
  });

  it('模拟回调全流程：确认 → 请求携带订单号 → 成功提示 → 列表刷新为已支付', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));
    await screen.findByText('O20260801001');

    fireEvent.click(screen.getByRole('button', { name: t('模拟回调') }));

    // 确认弹窗
    expect(await screen.findByText(t('模拟支付回调'))).toBeInTheDocument();
    expect(
      screen.getByText(
        t('将订单 {orderNo} 标记为已支付', { orderNo: 'O20260801001' })
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('确认') }));

    await waitFor(() => {
      expect(manualCompleteCalls).toEqual([
        { orderNo: 'O20260801001' },
      ]);
    });
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(
        t('模拟回调成功')
      );
    });

    // 列表刷新：订单变为已支付，操作按钮切换为退款（select 筛选项仍保留「待支付」文案）
    await waitFor(() => {
      expect(
        screen
          .getAllByText(t('已支付'))
          .some((el) => el.tagName === 'SPAN')
      ).toBe(true);
    });
    expect(
      screen.getAllByText(t('待支付')).filter((el) => el.tagName === 'SPAN')
    ).toHaveLength(0);
    // 原 PENDING 订单回调后 + 原 SUCCEEDED 订单，共 2 个已支付订单 → 2 个退款按钮
    expect(
      screen.getAllByRole('button', { name: t('退款') })
    ).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: t('模拟回调') })
    ).not.toBeInTheDocument();
  });

  it('模拟回调弹窗取消不发起请求', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));
    await screen.findByText('O20260801001');

    fireEvent.click(screen.getByRole('button', { name: t('模拟回调') }));
    await screen.findByText(t('模拟支付回调'));

    fireEvent.click(screen.getByRole('button', { name: t('取消') }));

    await waitFor(() => {
      expect(screen.queryByText(t('模拟支付回调'))).not.toBeInTheDocument();
    });
    expect(manualCompleteCalls).toHaveLength(0);
  });

  it('退款流程：确认 → 请求携带订单号与原因 → 成功提示 → 列表刷新为已退款', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));
    await screen.findByText('O20260801002');

    fireEvent.click(screen.getByRole('button', { name: t('退款') }));

    // 以确认按钮出现作为退款弹窗打开的标志（弹窗标题与行内按钮同文案「退款」）
    expect(
      await screen.findByRole('button', { name: t('确认退款') })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        t('订单 {orderNo} 退款 {amount}', {
          orderNo: 'O20260801002',
          amount: '¥30.00',
        })
      )
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(t('退款原因(可选)')), {
      target: { value: '用户申请' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('确认退款') }));

    await waitFor(() => {
      expect(refundCalls).toEqual([
        { orderNo: 'O20260801002', reason: '用户申请' },
      ]);
    });
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(t('退款成功'));
    });

    // 列表刷新：订单变为已退款，退款按钮消失
    await waitFor(() => {
      expect(
        screen
          .getAllByText(t('已退款'))
          .some((el) => el.tagName === 'SPAN')
      ).toBe(true);
    });
    expect(screen.queryByRole('button', { name: t('退款') })).not.toBeInTheDocument();
  });

  // ── 3. 会员状态展示切换（管理端等级/订单状态维度） ──

  it('分页：订单超过一页时显示分页器，切页携带 page 参数', async () => {
    // 订单号从 00100 起，避免与 PENDING_ORDER（...001）冲突
    const extra = Array.from({ length: 22 }, (_, i) => ({
      id: `extra-${i}`,
      orderNo: `O20260801${String(i + 100).padStart(3, '0')}`,
      userId: `u${i}`,
      amount: 1000 + i,
      status: 'SUCCEEDED',
      gateway: 'wechat',
      createdAt: '2026-08-04T10:00:00.000Z',
    }));
    ordersStore = [PENDING_ORDER, SUCCEEDED_ORDER, FAILED_ORDER, ...extra];
    ordersTotal = ordersStore.length;

    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));
    await screen.findByText('O20260801001');

    // 25 条 → 3 页（PAGE_SIZE=10）
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('下一页') }));

    await waitFor(() => {
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });
    expect(orderPageRequests).toEqual(['1', '2']);
  });

  it('空态：无等级与无订单时展示空文案', async () => {
    ordersStore = [];
    ordersTotal = 0;
    server.use(
      http.get('/api/v1/admin/vip/tiers', () =>
        HttpResponse.json({ code: 0, data: [] })
      ),
      http.get('/api/v1/admin/vip/durations', () =>
        HttpResponse.json({ code: 0, data: [] })
      )
    );

    renderPage();
    expect(await screen.findByText(t('暂无数据'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));
    expect(await screen.findByText(t('暂无订单'))).toBeInTheDocument();
  });

  // ── 4. 错误路径：加载/回调/退款失败提示 ──

  it('错误路径：初始加载 500 → hook catch 提示「加载数据失败」+ 等级列表空态', async () => {
    server.use(
      http.get('/api/v1/admin/vip/tiers', () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
      ),
      http.get('/api/v1/admin/vip/durations', () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
      )
    );

    renderPage();

    // 500 的 body message（'Internal Server Error'）只能通过 hook catch 里的
    // getErrorMessage 透出 → 证明 throwOnError: true 后 catch 分支真实可达
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(
        'Internal Server Error'
      );
    });
    expect(await screen.findByText(t('暂无数据'))).toBeInTheDocument();
  });

  it('错误路径：模拟回调 500 → hook catch 提示「模拟回调失败」，订单保持待支付', async () => {
    server.use(
      http.post('/api/v1/admin/billing/manual-complete', () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
      )
    );

    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));
    await screen.findByText('O20260801001');

    fireEvent.click(screen.getByRole('button', { name: t('模拟回调') }));
    await screen.findByText(t('模拟支付回调'));
    fireEvent.click(screen.getByRole('button', { name: t('确认') }));

    // 500 的 body message 只能通过 handleMockCallback 的 catch 透出
    // （throwOnError: true 后真实触发）
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(
        'Internal Server Error'
      );
    });
    // 后端订单未被标记为已支付 → 列表刷新后仍为待支付（表格 Tag，select 筛选项不计）
    expect(
      screen
        .getAllByText(t('待支付'))
        .filter((el) => el.tagName === 'SPAN').length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: t('模拟回调') })
    ).toBeInTheDocument();
  });

  it('错误路径：退款 500 → hook catch 提示「退款失败」，订单保持已支付', async () => {
    server.use(
      http.post('/api/v1/admin/billing/refund', () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
      )
    );

    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('订单管理') }));
    await screen.findByText('O20260801002');

    fireEvent.click(screen.getByRole('button', { name: t('退款') }));
    await screen.findByText(t('确认退款'));
    fireEvent.click(screen.getByRole('button', { name: t('确认退款') }));

    // 500 的 body message 只能通过 handleRefund 的 catch 透出
    // （throwOnError: true 后真实触发）
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(
        'Internal Server Error'
      );
    });
    expect(
      screen
        .getAllByText(t('已支付'))
        .filter((el) => el.tagName === 'SPAN').length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: t('退款') })
    ).toBeInTheDocument();
  });

  // ── 4. 退款申请 Tab：渲染 / 审核通过 / 驳回 / 错误路径 ──

  it('渲染退款申请 Tab：用户/订单号/金额/原因/状态/审核操作', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('退款申请') }));

    expect(await screen.findByText('O20260801002')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('买错了，想退款')).toBeInTheDocument();
    expect(screen.getByText('¥30.00')).toBeInTheDocument();
    // 待审核 / 已通过 Tag（select 筛选项同文案，排除 option 后断言 SPAN Tag）
    expect(
      screen
        .getAllByText(t('待审核'))
        .filter((el) => el.tagName === 'SPAN').length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen
        .getAllByText(t('已通过'))
        .filter((el) => el.tagName === 'SPAN').length
    ).toBeGreaterThanOrEqual(1);
    // 只有待审核行有通过/驳回按钮；已通过行无操作按钮
    expect(screen.getByRole('button', { name: t('通过') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('驳回') })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: t('通过') })).toHaveLength(1);
  });

  it('审核通过全流程：确认 → 携带审核意见调 approve → 提示「退款已执行」→ 状态变已通过', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('退款申请') }));
    await screen.findByText('买错了，想退款');

    fireEvent.click(screen.getByRole('button', { name: t('通过') }));

    // 审核弹窗展示申请详情
    expect(
      await screen.findByText(t('审核通过退款申请'))
    ).toBeInTheDocument();
    expect(screen.getByText('O20260801002')).toBeInTheDocument();

    // 填写审核意见并确认
    fireEvent.change(screen.getByPlaceholderText(t('审核意见(可选)')), {
      target: { value: '同意退款' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('确认通过并退款') }));

    await waitFor(() => {
      expect(approveCalls).toEqual([
        { id: 'ra1', body: { note: '同意退款' } },
      ]);
    });
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(
        t('审核通过，退款已执行')
      );
    });
    // 列表刷新：该申请变为已通过（弹窗关闭后重新加载）
    await waitFor(() => {
      expect(
        screen
          .getAllByText(t('已通过'))
          .filter((el) => el.tagName === 'SPAN').length
      ).toBeGreaterThanOrEqual(2);
    });
    expect(
      screen.queryByRole('button', { name: t('通过') })
    ).not.toBeInTheDocument();
  });

  it('驳回全流程：确认 → 携带意见调 reject → 提示已驳回 → 订单状态不变', async () => {
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('退款申请') }));
    await screen.findByText('买错了，想退款');

    fireEvent.click(screen.getByRole('button', { name: t('驳回') }));

    expect(await screen.findByText(t('驳回退款申请'))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(t('审核意见(可选)')), {
      target: { value: '不符合退款条件' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('确认驳回') }));

    await waitFor(() => {
      expect(rejectCalls).toEqual([
        { id: 'ra1', body: { note: '不符合退款条件' } },
      ]);
    });
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(
        t('已驳回退款申请')
      );
    });
    await waitFor(() => {
      expect(
        screen
          .getAllByText(t('已驳回'))
          .filter((el) => el.tagName === 'SPAN').length
      ).toBeGreaterThanOrEqual(1);
    });
    expect(
      screen.queryByRole('button', { name: t('通过') })
    ).not.toBeInTheDocument();
  });

  it('错误路径：审核通过 500 → hook catch 提示失败，申请保持待审核', async () => {
    server.use(
      http.post(
        '/api/v1/admin/billing/refund-applications/:id/approve',
        () =>
          HttpResponse.json(
            { code: 1, message: '网关退款失败' },
            { status: 500 }
          )
      )
    );
    renderPage();
    await screen.findByText('标准会员 (VIP1)');

    fireEvent.click(screen.getByRole('button', { name: t('退款申请') }));
    await screen.findByText('买错了，想退款');

    fireEvent.click(screen.getByRole('button', { name: t('通过') }));
    await screen.findByText(t('确认通过并退款'));
    fireEvent.click(screen.getByRole('button', { name: t('确认通过并退款') }));

    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain('网关退款失败');
    });
    // 申请保持待审核（通过按钮仍在）
    expect(screen.getByRole('button', { name: t('通过') })).toBeInTheDocument();
  });
});
