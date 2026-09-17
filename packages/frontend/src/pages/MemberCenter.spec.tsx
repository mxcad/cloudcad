///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { t } from '@/languages';
import { TOAST_EVENT } from '@/utils/notificationEvents';
import '@/config/clientSetup';

vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => undefined,
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({
    isVip: true,
    tierLevel: 1,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    daysRemaining: 30,
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ loading: false, refreshUser: vi.fn() }),
}));
vi.mock('@/hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    data: { usedBytes: 0, totalBytes: 1024 * 1024 * 1024 },
    loading: false,
  }),
}));
vi.mock('@/hooks/useTierConfigRegistry', () => ({
  useTierConfigRegistry: () => ({
    registry: new Map(),
  }),
}));
vi.mock('@/stores/planSelectStore', () => ({
  usePlanSelectStore: () => ({ open: vi.fn() }),
}));

import MemberCenter from './MemberCenter';

interface OrderShape {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  gateway: string;
  createdAt: string;
  description?: string;
  refundApplications?: Array<{
    id: string;
    status: string;
    reason: string;
    createdAt: string;
    reviewNote?: string | null;
    reviewedAt?: string | null;
  }>;
}

// ── MSW 覆盖 ─────────────────────────────────────────────────────────────

let ordersStore: OrderShape[] = [];
let applyRefundCalls: Array<{ orderNo: string; body: Record<string, unknown> }> =
  [];

function stubOrdersApi() {
  server.use(
    http.get('/api/v1/billing/orders', () =>
      HttpResponse.json({
        code: 0,
        data: { items: ordersStore, total: ordersStore.length },
      })
    ),
    http.get('/api/v1/vip/tiers', () => HttpResponse.json({ code: 0, data: [] })),
    http.get('/api/v1/vip/durations', () =>
      HttpResponse.json({ code: 0, data: [] })
    ),
    http.post('/api/v1/billing/orders/auto', () =>
      HttpResponse.json({
        code: 0,
        data: {
          orderNo: 'PAYAUTO001',
          status: 'PENDING',
          amount: 2400,
          codeUrl: 'http://mock.qr/auto',
          payParams: null,
          redirectUrl: null,
          vipTierName: 'VIP1',
          durationLabel: '1个月',
        },
      })
    ),
    http.post(
      '/api/v1/billing/orders/:orderNo/refund-apply',
      async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        applyRefundCalls.push({ orderNo: String(params.orderNo), body });
        // 申请成功后：该订单挂上 PENDING 申请
        ordersStore = ordersStore.map((o) =>
          o.orderNo === params.orderNo
            ? {
                ...o,
                refundApplications: [
                  {
                    id: 'ra-new',
                    status: 'PENDING',
                    reason: String(body.reason ?? ''),
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : o
        );
        return HttpResponse.json({ code: 0, data: { success: true } });
      }
    )
  );
}

function renderPage(initialEntries: string[] = ['/member-center']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <MemberCenter />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('MemberCenter 订单历史 — 申请退款', () => {
  let toastListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    ordersStore = [
      {
        id: 'o1',
        orderNo: 'PAY20260801001',
        amount: 2400,
        status: 'SUCCEEDED',
        gateway: 'mock',
        createdAt: '2026-08-01T10:00:00.000Z',
        description: '标准会员 1个月',
      },
      {
        id: 'o2',
        orderNo: 'PAY20260801002',
        amount: 1200,
        status: 'PENDING',
        gateway: 'mock',
        createdAt: '2026-08-02T10:00:00.000Z',
      },
    ];
    applyRefundCalls = [];
    stubOrdersApi();
    toastListener = vi.fn();
    window.addEventListener(TOAST_EVENT, toastListener);
  });

  afterEach(() => {
    window.removeEventListener(TOAST_EVENT, toastListener);
  });

  it('SUCCEEDED 订单显示「申请退款」按钮，提交后调 refund-apply 并刷新为审核中', async () => {
    renderPage();

    // 订单列表加载完成（订单号在订单行描述/订单号 span 中重复出现，用 findAllByText）
    expect(
      (await screen.findAllByText('PAY20260801001')).length
    ).toBeGreaterThanOrEqual(1);

    // 只有 SUCCEEDED 订单可申请退款（PENDING 订单无按钮）
    expect(screen.getByRole('button', { name: t('申请退款') })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: t('申请退款') })
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: t('申请退款') }));

    // 弹窗打开：原因输入框出现（标题「申请退款」与按钮文案重复，用输入框断言）
    expect(
      await screen.findByPlaceholderText(t('请填写退款原因（必填）'))
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/PAY20260801001/).length
    ).toBeGreaterThanOrEqual(1);

    // 原因必填：空提交提示
    fireEvent.click(screen.getByRole('button', { name: t('提交申请') }));
    expect(await screen.findByText(t('请填写退款原因'))).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(t('请填写退款原因（必填）')), {
      target: { value: '买错了' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('提交申请') }));

    await waitFor(() => {
      expect(applyRefundCalls).toEqual([
        { orderNo: 'PAY20260801001', body: { reason: '买错了' } },
      ]);
    });
    await waitFor(() => {
      expect(collectToastMessages(toastListener)).toContain(
        t('退款申请已提交，请等待审核')
      );
    });

    // 刷新后：订单变为「退款审核中」Tag，申请退款按钮消失
    await waitFor(() => {
      expect(
        screen
          .getAllByText(t('退款审核中'))
          .some((el) => el.tagName === 'SPAN')
      ).toBe(true);
    });
    expect(
      screen.queryByRole('button', { name: t('申请退款') })
    ).not.toBeInTheDocument();
  });

  it('已有 PENDING 退款申请的订单不显示申请按钮', async () => {
    ordersStore = [
      {
        id: 'o1',
        orderNo: 'PAY20260801003',
        amount: 3000,
        status: 'SUCCEEDED',
        gateway: 'mock',
        createdAt: '2026-08-01T10:00:00.000Z',
        refundApplications: [
          {
            id: 'ra-1',
            status: 'PENDING',
            reason: '在途申请',
            createdAt: '2026-08-03T10:00:00.000Z',
          },
        ],
      },
    ];
    renderPage();

    expect(
      (await screen.findAllByText('PAY20260801003')).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: t('申请退款') })).not.toBeInTheDocument();
    expect(
      screen
        .getAllByText(t('退款审核中'))
        .some((el) => el.tagName === 'SPAN')
    ).toBe(true);
  });

  it('REJECTED 申请展示「退款已驳回」Tag 与驳回原因，可重新申请', async () => {
    ordersStore = [
      {
        id: 'o1',
        orderNo: 'PAY20260801004',
        amount: 3000,
        status: 'SUCCEEDED',
        gateway: 'mock',
        createdAt: '2026-08-01T10:00:00.000Z',
        refundApplications: [
          {
            id: 'ra-2',
            status: 'REJECTED',
            reason: '不想要了',
            createdAt: '2026-08-03T10:00:00.000Z',
            reviewNote: '已超过可退款期',
            reviewedAt: '2026-08-04T10:00:00.000Z',
          },
        ],
      },
    ];
    renderPage();

    expect(
      (await screen.findAllByText('PAY20260801004')).length
    ).toBeGreaterThanOrEqual(1);
    // Tag 状态为「退款已驳回」，驳回原因展示在订单行
    expect(
      screen
        .getAllByText(t('退款已驳回'))
        .some((el) => el.tagName === 'SPAN')
    ).toBe(true);
    expect(
      screen.getByText(t('驳回原因：{note}', { note: '已超过可退款期' }))
    ).toBeInTheDocument();
    // 仍可重新申请
    expect(screen.getByRole('button', { name: t('申请退款') })).toBeInTheDocument();

    // 打开申请弹窗：展示上次驳回意见提示
    fireEvent.click(screen.getByRole('button', { name: t('申请退款') }));
    expect(
      await screen.findByText(
        t('上次退款申请被驳回：{note}', { note: '已超过可退款期' })
      )
    ).toBeInTheDocument();
  });
});

describe('MemberCenter ?auto=1 自动下单', () => {
  beforeEach(() => {
    stubOrdersApi();
  });

  it('mount 时自动建单并展示支付弹窗', async () => {
    renderPage(['/member-center?auto=1']);
    // 自动建单成功 → 弹出微信支付弹窗，展示「档位 · 时长」订单标签
    expect(await screen.findByText(t('微信支付'))).toBeInTheDocument();
    expect(screen.getByText('VIP1 · 1个月')).toBeInTheDocument();
  });
});

function collectToastMessages(
  listener: ReturnType<typeof vi.fn>
): string[] {
  return listener.mock.calls
    .map(([e]) => (e as CustomEvent<{ message: string }>)?.detail?.message)
    .filter(Boolean) as string[];
}
