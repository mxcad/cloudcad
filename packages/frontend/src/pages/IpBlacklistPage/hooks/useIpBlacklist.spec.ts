///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { useAddIpBlacklistEntry, useIpBlacklistList } from './useIpBlacklist';

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

interface MockEntry {
  id: string;
  ip: string;
  source: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

const mockEntries: MockEntry[] = [
  {
    id: 'entry-1',
    ip: '203.0.113.0/24',
    source: 'manual',
    reason: '撞库扫描',
    createdBy: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: null,
  },
  {
    id: 'entry-2',
    ip: '198.51.100.7',
    source: 'manual',
    reason: '暴力破解',
    createdBy: 'user-1',
    createdAt: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
  },
];

describe('useIpBlacklist', () => {
  beforeEach(() => {
    mockEntries.length = 0;
    mockEntries.push(
      {
        id: 'entry-1',
        ip: '203.0.113.0/24',
        source: 'manual',
        reason: '撞库扫描',
        createdBy: 'user-1',
        createdAt: '2026-08-01T00:00:00.000Z',
        expiresAt: null,
      },
      {
        id: 'entry-2',
        ip: '198.51.100.7',
        source: 'manual',
        reason: '暴力破解',
        createdBy: 'user-1',
        createdAt: '2026-08-02T00:00:00.000Z',
        expiresAt: '2026-09-01T00:00:00.000Z',
      }
    );
    server.use(
      http.get('/api/v1/admin/ip-blacklist', () => {
        return HttpResponse.json({
          items: [...mockEntries],
          total: mockEntries.length,
          page: 1,
          pageSize: 20,
        });
      })
    );
  });

  it('查询列表并映射条目字段', async () => {
    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useIpBlacklistList(1), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]).toEqual({
      id: 'entry-1',
      ip: '203.0.113.0/24',
      source: 'manual',
      reason: '撞库扫描',
      createdBy: 'user-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
    });
    expect(result.current.items[1].expiresAt).toBe('2026-09-01T00:00:00.000Z');
    expect(result.current.total).toBe(2);
  });

  it('添加条目后列表自动刷新', async () => {
    const createdBody = vi.fn();
    server.use(
      http.post('/api/v1/admin/ip-blacklist', async ({ request }) => {
        const body = (await request.json()) as { ip: string; reason: string };
        createdBody(body);
        mockEntries.push({
          id: 'entry-new',
          ip: body.ip,
          source: 'manual',
          reason: body.reason,
          createdBy: 'user-1',
          createdAt: '2026-08-03T00:00:00.000Z',
          expiresAt: null,
        });
        return HttpResponse.json(
          {
            ...mockEntries[mockEntries.length - 1],
          },
          { status: 201 }
        );
      })
    );

    const { wrapper } = createTestWrapper();
    const list = renderHook(() => useIpBlacklistList(1), { wrapper });
    const add = renderHook(() => useAddIpBlacklistEntry(), { wrapper });

    await waitFor(() => expect(list.result.current.items).toHaveLength(2));

    add.result.current.mutate({ ip: '192.0.2.10', reason: '爬虫' });

    await waitFor(() => expect(add.result.current.isSuccess).toBe(true));
    expect(createdBody).toHaveBeenCalledWith({
      ip: '192.0.2.10',
      reason: '爬虫',
    });
    await waitFor(() => expect(list.result.current.items).toHaveLength(3));
    expect(list.result.current.items[2].ip).toBe('192.0.2.10');
  });

  it('传 keyword 时查询带上搜索参数并过滤', async () => {
    const capturedUrl = vi.fn();
    server.use(
      http.get('/api/v1/admin/ip-blacklist', ({ request }) => {
        capturedUrl(request.url);
        const url = new URL(request.url);
        const keyword = url.searchParams.get('keyword');
        const filtered = keyword
          ? mockEntries.filter((e) => e.ip.includes(keyword))
          : [...mockEntries];
        return HttpResponse.json({
          items: filtered,
          total: filtered.length,
          page: 1,
          pageSize: 20,
        });
      })
    );

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useIpBlacklistList(1, '203.0.113'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(capturedUrl).toHaveBeenCalledWith(
      expect.stringContaining('keyword=203.0.113')
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].ip).toBe('203.0.113.0/24');
    expect(result.current.total).toBe(1);
  });

  it('keyword 为空时不带搜索参数', async () => {
    const capturedUrl = vi.fn();
    server.use(
      http.get('/api/v1/admin/ip-blacklist', ({ request }) => {
        capturedUrl(request.url);
        return HttpResponse.json({
          items: [...mockEntries],
          total: mockEntries.length,
          page: 1,
          pageSize: 20,
        });
      })
    );

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useIpBlacklistList(1, ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(capturedUrl).toHaveBeenCalledWith(
      expect.not.stringContaining('keyword=')
    );
    expect(result.current.items).toHaveLength(2);
  });
});
