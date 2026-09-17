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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';

import { NOTICE_ACK_STORAGE_KEY } from './noticeAck';
import { filterUnacknowledged } from './NoticeProvider';
import type { Notice } from './noticeTypes';

// 关掉 SSE：游客/无 EventSource 走纯轮询路径，避免测试里起长连接
const mockGetValidToken = vi.hoisted(() =>
  vi.fn<[], string | null>(() => null)
);
vi.mock('@/utils/tokenUtils', () => ({
  getValidToken: (...args: unknown[]) => mockGetValidToken(...args),
}));

// 不引整个 AuthProvider（会拖入登录流程），只 stub 登录态
const mockIsAuthenticated = vi.hoisted(() => vi.fn<[], boolean>(() => false));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated() }),
}));

const mockGetCurrent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ error: undefined, data: [] })
);
vi.mock('@/api-sdk', () => ({
  noticeCenterControllerGetCurrent: (...args: unknown[]) =>
    mockGetCurrent(...args),
  noticeCenterControllerIssueTicket: vi.fn().mockResolvedValue({
    error: undefined,
    data: { ticket: 'ticket-1' },
  }),
}));

import { t } from '@/languages';
import { useNotice, NoticeProvider } from './NoticeProvider';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n_1',
    kind: 'system',
    level: 'info',
    title: '系统维护',
    body: '将于 22:00 停机',
    autoExpire: false,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

function Probe() {
  const { active, pending, notices, acknowledge } = useNotice();
  return (
    <div>
      <span data-testid="active-id">{active?.id ?? 'none'}</span>
      <span data-testid="pending-count">{pending.length}</span>
      <span data-testid="notice-count">{notices.length}</span>
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

async function expectPending(count: number) {
  await waitFor(() =>
    expect(screen.getByTestId('pending-count')).toHaveTextContent(String(count))
  );
}

beforeEach(() => {
  localStorage.clear();
  window.localStorage.removeItem(NOTICE_ACK_STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NoticeProvider', () => {
  it('无通知时不弹框', async () => {
    renderProvider([]);
    await expectActive('none');
    expect(screen.queryByText(t('知道了'))).not.toBeInTheDocument();
  });

  it('取到通知后弹出最优先的一条，title/body 按后端原文渲染', async () => {
    renderProvider([
      notice({ id: 'info', level: 'info', title: '提示', body: '一条提示' }),
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

  it('点「知道了」标记已读并推进到下一条', async () => {
    renderProvider([
      notice({ id: 'first', level: 'danger' }),
      notice({ id: 'second', level: 'info' }),
    ]);

    await expectActive('first');
    await expectPending(2);

    fireEvent.click(screen.getByText(t('知道了')));

    await expectActive('second');
    await expectPending(1);

    // 已读状态落盘，刷新后不重复弹
    const acks = JSON.parse(
      localStorage.getItem(NOTICE_ACK_STORAGE_KEY) ?? '{}'
    );
    expect(acks.first).toBeTypeOf('number');

    fireEvent.click(screen.getByText(t('知道了')));
    await expectActive('none');
    await expectPending(0);
  });

  it('TTL 内已读的通知不再弹（localStorage 预置）', async () => {
    localStorage.setItem(
      NOTICE_ACK_STORAGE_KEY,
      JSON.stringify({ n_1: Date.now() })
    );
    renderProvider([notice({ id: 'n_1' })]);

    await expectActive('none');
    await expectPending(0);
  });

  it('接口报错时保持空队列（不弹框、不崩）', async () => {
    mockGetCurrent.mockResolvedValue({
      error: new Error('network'),
      data: undefined,
    });
    renderProvider();

    await expectActive('none');
    await expectPending(0);
  });
});

describe('filterUnacknowledged', () => {
  const now = 1_800_000_000_000;

  it('过滤掉 TTL 内已读的，保持原有顺序', () => {
    const list = [
      notice({ id: 'a', level: 'danger' }),
      notice({ id: 'b', level: 'info' }),
    ];
    const filtered = filterUnacknowledged(list, { b: now - 1000 }, now);
    expect(filtered.map((n) => n.id)).toEqual(['a']);
  });

  it('全部已读返回空数组', () => {
    expect(
      filterUnacknowledged([notice({ id: 'a' })], { a: now - 1000 }, now)
    ).toEqual([]);
  });

  it('全部未读原样返回', () => {
    const list = [notice({ id: 'a' }), notice({ id: 'b' })];
    expect(filterUnacknowledged(list, {}, now).map((n) => n.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
