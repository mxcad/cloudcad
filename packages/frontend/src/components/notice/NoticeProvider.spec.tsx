///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';

import { ackEntryKey, ackStorageKey } from './noticeAck';
import {
  filterUnacknowledged,
  WARNING_TOAST_DURATION_MS,
} from './NoticeProvider';
import type { Notice } from './noticeTypes';
import { t } from '@/languages';

// 通知流为 SSE 推送 + 30s 轮询兜底；本文件只关心簿记与分级分流，
// 故 stub 掉整表拉取与 ticket 签发（无 token 时不会走签发）
const mockGetCurrent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ error: undefined, data: [] })
);
vi.mock('@/api-sdk', () => ({
  noticeCenterControllerGetCurrent: (...args: unknown[]) =>
    mockGetCurrent(...args),
  noticeCenterControllerIssueTicket: vi.fn().mockResolvedValue({
    error: undefined,
    data: { ticket: 'tk_test' },
  }),
}));

// 已读簿记按账号隔离，stub 当前登录账号；默认未登录
const authState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authState.userId ? { id: authState.userId } : null,
  }),
}));

// stub CAD 编辑器激活态：默认普通页面（有 header，warning 提示走 bell 下拉）。
// mock 不订阅 store，cadState.active 必须在 render 之前设定。
const cadState = vi.hoisted(() => ({ active: false }));
vi.mock('@/stores/useCADEditorStore', () => ({
  useCADEditorStore: (selector: (s: { isActive: boolean }) => unknown) =>
    selector({ isActive: cadState.active }),
}));

// warning 提示是分级分流的唯一可见动作，stub 掉 toast 调用后直接断言参数
const mockShowToast = vi.hoisted(() => vi.fn());
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { useNotice, NoticeProvider } from './NoticeProvider';

/** 夹具的默认内容版本：已读簿记键里编入的就是它 */
const UPDATED_AT = '2026-09-17T00:00:00.000Z';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n_1',
    kind: 'system',
    level: 'info',
    title: '系统维护',
    body: '将于 22:00 停机',
    autoExpire: false,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function Probe() {
  const { active, unread, notices, acknowledge, bellOpen, listModalOpen } =
    useNotice();
  return (
    <div>
      <span data-testid="active-id">{active?.id ?? 'none'}</span>
      <span data-testid="unread-count">{unread.length}</span>
      <span data-testid="notice-count">{notices.length}</span>
      <span data-testid="bell-open">{String(bellOpen)}</span>
      <span data-testid="list-modal-open">{String(listModalOpen)}</span>
      <button onClick={() => acknowledge(active!)}>ack</button>
    </div>
  );
}

function renderProvider(list: Notice[] = []) {
  mockGetCurrent.mockResolvedValue({ error: undefined, data: list });
  return render(
    <NoticeProvider>
      <Probe />
    </NoticeProvider>
  );
}

// active-id 在首帧就存在（值为 'none'），findByTestId 不会等到异步拉取完成，
// 所以断言队列内容必须用 waitFor 重试。
async function expectActive(id: string) {
  await waitFor(() =>
    expect(screen.getByTestId('active-id')).toHaveTextContent(id)
  );
}

async function expectUnread(count: number) {
  await waitFor(() =>
    expect(screen.getByTestId('unread-count')).toHaveTextContent(String(count))
  );
}

function lastToast() {
  const calls = mockShowToast.mock.calls;
  return calls[calls.length - 1] as [
    string,
    string,
    { duration?: number; forceOverlay?: boolean; onClick?: () => void }
  ];
}

async function expectToastShown() {
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  localStorage.clear();
  authState.userId = null;
  cadState.active = false;
  mockShowToast.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NoticeProvider 分级分流', () => {
  it('无通知时不弹框、不提示', async () => {
    renderProvider([]);
    await expectActive('none');
    expect(screen.queryByText(t('知道了'))).not.toBeInTheDocument();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('danger 弹框，低级别不进弹框', async () => {
    renderProvider([
      notice({ id: 'info', level: 'info', title: '一条提示', body: '提示正文' }),
      notice({
        id: 'danger',
        level: 'danger',
        title: '即将停机维护',
        body: '将于 22:00 停机维护 30 分钟',
      }),
    ]);

    await expectActive('danger');
    expect(screen.getByText('即将停机维护')).toBeInTheDocument();
    expect(screen.getByText('将于 22:00 停机维护 30 分钟')).toBeInTheDocument();
    // 低优先级那条不进弹框
    expect(screen.queryByText('一条提示')).not.toBeInTheDocument();
  });

  it('info 不主动呈现：不弹框、不提示，只在列表（徽标计数）里可见', async () => {
    renderProvider([
      notice({ id: 'info', level: 'info', title: '一条提示', body: '提示正文' }),
    ]);

    await expectActive('none');
    expect(screen.queryByText(t('知道了'))).not.toBeInTheDocument();
    expect(screen.queryByText('一条提示')).not.toBeInTheDocument();
    expect(mockShowToast).not.toHaveBeenCalled();
    // 仍计入未读徽标，铃铛仍是查看入口
    await expectUnread(1);
  });

  it('warning 走可点击提示，展示即写 ack（TTL 内不重复提醒）', async () => {
    renderProvider([
      notice({ id: 'warn', level: 'warning', title: '今晚维护', body: '详情' }),
    ]);

    await waitFor(() =>
      expect(
        localStorage.getItem(ackStorageKey(authState.userId))
      ).toContain('warn')
    );

    expect(lastToast()).toMatchObject([
      '今晚维护',
      'warning',
      expect.objectContaining({
        duration: WARNING_TOAST_DURATION_MS,
        forceOverlay: true,
        onClick: expect.any(Function),
      }),
    ]);
  });

  it('warning 一次只展示一条，前一条消失后才轮到下一条', async () => {
    vi.useFakeTimers();
    renderProvider([
      notice({ id: 'w1', level: 'warning', title: '警告一' }),
      notice({ id: 'w2', level: 'warning', title: '警告二' }),
    ]);

    // waitFor 依赖真实定时器，故用 act + advanceTimersByTimeAsync 手推微任务
    const flush = async (ms = 0) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    await flush();
    await flush(50);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast.mock.calls[0]?.[0]).toBe('警告一');

    await flush(WARNING_TOAST_DURATION_MS + 100);
    expect(mockShowToast).toHaveBeenCalledTimes(2);
    expect(mockShowToast.mock.calls[1]?.[0]).toBe('警告二');
  });

  it('发布者的公告不主动打断自己（豁免弹框与提示），但仍在列表里', async () => {
    const own = [
      notice({
        id: 'own',
        level: 'danger',
        title: '我发的公告',
        publishedById: 'u_pub',
      }),
    ];

    // 未登录时无发布者可豁免：先确认危险级别确实会弹
    renderProvider(own);
    await expectActive('own');
    cleanup();

    authState.userId = 'u_pub';
    renderProvider(own);

    await expectActive('none');
    expect(mockShowToast).not.toHaveBeenCalled();
    await expectUnread(1);
  });

  it('提示点击展开入口：普通页面展开 bell 下拉', async () => {
    renderProvider([notice({ id: 'w', level: 'warning', title: '警告' })]);
    await expectToastShown();

    act(() => lastToast()[2].onClick?.());

    await waitFor(() =>
      expect(screen.getByTestId('bell-open')).toHaveTextContent('true')
    );
    expect(screen.getByTestId('list-modal-open')).toHaveTextContent('false');
  });

  it('提示点击展开入口：CAD 编辑器没有 header，改走列表弹框', async () => {
    cadState.active = true;
    renderProvider([notice({ id: 'w', level: 'warning', title: '警告' })]);
    await expectToastShown();

    act(() => lastToast()[2].onClick?.());

    await waitFor(() =>
      expect(screen.getByTestId('list-modal-open')).toHaveTextContent('true')
    );
    expect(screen.getByTestId('bell-open')).toHaveTextContent('false');
  });
});

describe('NoticeProvider 已读簿记', () => {
  it('点「知道了」标记已读并推进到下一条 danger', async () => {
    renderProvider([
      notice({ id: 'first', level: 'danger', title: '第一条' }),
      notice({ id: 'second', level: 'danger', title: '第二条' }),
    ]);

    await expectActive('first');
    fireEvent.click(screen.getByText(t('知道了')));

    await expectActive('second');

    // 已读状态落盘（键含内容版本），刷新后不重复弹
    const acks = JSON.parse(
      localStorage.getItem(ackStorageKey(authState.userId)) ?? '{}'
    );
    expect(acks[ackEntryKey('first', UPDATED_AT)]).toBeTypeOf('number');

    fireEvent.click(screen.getByText(t('知道了')));
    await expectActive('none');
  });

  it('TTL 内已读的通知不再弹（localStorage 预置）', async () => {
    localStorage.setItem(
      ackStorageKey(authState.userId),
      JSON.stringify({ [ackEntryKey('n_1', UPDATED_AT)]: Date.now() })
    );
    renderProvider([notice({ id: 'n_1', level: 'danger' })]);

    await expectActive('none');
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('内容更新后重新弹：改级别/改文案/下线重发都会换 updatedAt，旧 ack 失配', async () => {
    localStorage.setItem(
      ackStorageKey(authState.userId),
      JSON.stringify({ [ackEntryKey('n_1', UPDATED_AT)]: Date.now() })
    );
    renderProvider([notice({ id: 'n_1', level: 'danger' })]);
    await expectActive('none');
    cleanup();

    // 同一条通知换了一个内容版本（级别升级或下线后重新上线），必须再提醒一次
    renderProvider([
      notice({
        id: 'n_1',
        level: 'danger',
        updatedAt: '2026-09-18T00:00:00.000Z',
      }),
    ]);
    await expectActive('n_1');
  });

  it('A 账号已读不掩盖 B 账号的未读（簿记按账号分键）', async () => {
    authState.userId = 'u_a';
    localStorage.setItem(
      ackStorageKey('u_a'),
      JSON.stringify({ [ackEntryKey('n_1', UPDATED_AT)]: Date.now() })
    );
    renderProvider([notice({ id: 'n_1', level: 'danger' })]);
    await expectActive('none');
    cleanup();

    // 同一浏览器换 B 账号：同一条公告对 B 仍是未读
    authState.userId = 'u_b';
    renderProvider([notice({ id: 'n_1', level: 'danger' })]);
    await expectActive('n_1');

    fireEvent.click(screen.getByText(t('知道了')));
    const acksB = JSON.parse(localStorage.getItem(ackStorageKey('u_b')) ?? '{}');
    expect(acksB[ackEntryKey('n_1', UPDATED_AT)]).toBeTypeOf('number');
    // A 账号的簿记未被 B 账号的确认污染
    const acksA = JSON.parse(localStorage.getItem(ackStorageKey('u_a')) ?? '{}');
    expect(acksA[ackEntryKey('n_1', UPDATED_AT)]).toBeTypeOf('number');
  });
});

describe('NoticeProvider 数据源与容错', () => {
  it('接口报错时保持空队列（不弹框、不提示、不崩）', async () => {
    mockGetCurrent.mockResolvedValue({
      error: new Error('network'),
      data: undefined,
    });
    renderProvider();

    await expectActive('none');
    await expectUnread(0);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('页面变可见时补拉一次公告（visibilitychange）', async () => {
    renderProvider([notice({ id: 'n_1' })]);
    // 挂载即拉已发生一次
    await waitFor(() => expect(mockGetCurrent).toHaveBeenCalled());
    const callsAfterMount = mockGetCurrent.mock.calls.length;
    // 模拟页面从隐藏变可见：应补拉一次
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() =>
      expect(mockGetCurrent.mock.calls.length).toBeGreaterThan(callsAfterMount)
    );
  });
});

describe('filterUnacknowledged', () => {
  const now = 1_800_000_000_000;

  it('过滤掉 TTL 内已读的，保持原有顺序', () => {
    const list = [
      notice({ id: 'a', level: 'danger' }),
      notice({ id: 'b', level: 'info' }),
    ];
    const filtered = filterUnacknowledged(
      list,
      { [ackEntryKey('b', UPDATED_AT)]: now - 1000 },
      now
    );
    expect(filtered.map((n) => n.id)).toEqual(['a']);
  });

  it('全部已读返回空数组', () => {
    expect(
      filterUnacknowledged(
        [notice({ id: 'a' })],
        { [ackEntryKey('a', UPDATED_AT)]: now - 1000 },
        now
      )
    ).toEqual([]);
  });

  it('updatedAt 变化后旧 ack 不再命中（内容被改过就该重新提醒）', () => {
    const staleAcks = { [ackEntryKey('a', UPDATED_AT)]: now - 1000 };
    expect(filterUnacknowledged([notice({ id: 'a' })], staleAcks, now)).toEqual(
      []
    );
    expect(
      filterUnacknowledged(
        [notice({ id: 'a', updatedAt: '2026-09-18T00:00:00.000Z' })],
        staleAcks,
        now
      ).map((n) => n.id)
    ).toEqual(['a']);
  });

  it('全部未读原样返回', () => {
    const list = [notice({ id: 'a' }), notice({ id: 'b' })];
    expect(filterUnacknowledged(list, {}, now).map((n) => n.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
