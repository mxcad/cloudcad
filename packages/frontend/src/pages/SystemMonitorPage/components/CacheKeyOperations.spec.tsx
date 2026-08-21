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

const notificationMock = vi.hoisted(() => ({
  showToast: vi.fn(),
  showConfirm: vi.fn().mockResolvedValue(true),
}));
const apiMocks = vi.hoisted(() => ({
  cacheMonitorControllerGetValue: vi.fn(() =>
    Promise.resolve({ data: { foo: 'bar' } })
  ),
  cacheMonitorControllerSetValue: vi.fn(() => Promise.resolve({ data: {} })),
  cacheMonitorControllerDeleteValue: vi.fn(() => Promise.resolve({ data: {} })),
  cacheMonitorControllerDeleteByPattern: vi.fn(() =>
    Promise.resolve({ data: {} })
  ),
  cacheMonitorControllerRefresh: vi.fn(() =>
    Promise.resolve({ data: { success: true } })
  ),
  cacheMonitorControllerCleanup: vi.fn(() => Promise.resolve({ data: {} })),
}));

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => notificationMock,
}));
vi.mock('@/languages', () => ({ t: (m: string) => m }));
vi.mock('@/api-sdk', () => apiMocks);

import { CacheKeyOperations } from './CacheKeyOperations';

describe('CacheKeyOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationMock.showConfirm.mockResolvedValue(true);
  });

  describe('when user is not SYSTEM_ADMIN', () => {
    it('只显示查询按钮，不显示任何写操作', () => {
      render(<CacheKeyOperations isAdmin={false} onChanged={() => undefined} />);

      expect(screen.getByRole('button', { name: '查询' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '按模式删除' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '清空所有缓存' })
      ).not.toBeInTheDocument();
    });
  });

  describe('when user is SYSTEM_ADMIN', () => {
    it('查询 Key 并展示结果', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(screen.getByPlaceholderText('缓存 Key'), {
        target: { value: 'user:1' },
      });
      fireEvent.click(screen.getByRole('button', { name: '查询' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerGetValue).toHaveBeenCalledWith({
          query: { key: 'user:1' },
        });
      });
      await waitFor(() => {
        expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
      });
    });

    it('删除 Key 前弹出确认，确认后调用删除并 toast', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(screen.getByPlaceholderText('缓存 Key'), {
        target: { value: 'user:1' },
      });
      fireEvent.click(screen.getByRole('button', { name: '删除' }));

      await waitFor(() => {
        expect(notificationMock.showConfirm).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerDeleteValue).toHaveBeenCalledWith({
          query: { key: 'user:1' },
        });
      });
      await waitFor(() => {
        expect(notificationMock.showToast).toHaveBeenCalledWith(
          '缓存删除成功',
          'success'
        );
      });
    });

    it('取消确认时不调用删除 API', async () => {
      notificationMock.showConfirm.mockResolvedValue(false);

      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(screen.getByPlaceholderText('缓存 Key'), {
        target: { value: 'user:1' },
      });
      fireEvent.click(screen.getByRole('button', { name: '删除' }));

      await waitFor(() => {
        expect(notificationMock.showConfirm).toHaveBeenCalled();
      });
      expect(apiMocks.cacheMonitorControllerDeleteValue).not.toHaveBeenCalled();
    });

    it('设置缓存调用 setValue 并触发刷新回调', async () => {
      const onChanged = vi.fn();
      render(<CacheKeyOperations isAdmin onChanged={onChanged} />);

      fireEvent.change(screen.getByPlaceholderText('缓存 Key'), {
        target: { value: 'config:theme' },
      });
      fireEvent.change(screen.getByPlaceholderText('缓存值'), {
        target: { value: 'dark' },
      });
      fireEvent.change(screen.getByPlaceholderText('TTL（秒）'), {
        target: { value: '60' },
      });
      fireEvent.click(screen.getByRole('button', { name: '设置' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerSetValue).toHaveBeenCalledWith({
          body: { key: 'config:theme', value: 'dark', ttl: 60 },
        });
      });
      await waitFor(() => {
        expect(notificationMock.showToast).toHaveBeenCalledWith(
          '缓存设置成功',
          'success'
        );
        expect(onChanged).toHaveBeenCalled();
      });
    });

    it('按模式删除确认后调用 deleteByPattern', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(screen.getByPlaceholderText('匹配模式（如 user:*）'), {
        target: { value: 'user:*' },
      });
      fireEvent.click(screen.getByRole('button', { name: '按模式删除' }));

      await waitFor(() => {
        expect(
          apiMocks.cacheMonitorControllerDeleteByPattern
        ).toHaveBeenCalledWith({ query: { pattern: 'user:*' } });
      });
    });

    it('清空所有缓存确认后调用 cleanup', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.click(screen.getByRole('button', { name: '清空所有缓存' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerCleanup).toHaveBeenCalledWith({
          body: { level: 'ALL' },
        });
      });
      await waitFor(() => {
        expect(notificationMock.showToast).toHaveBeenCalledWith(
          '缓存已清空',
          'success'
        );
      });
    });

    it('刷新 Key 调用 refresh 并 toast 成功', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(screen.getByPlaceholderText('缓存 Key'), {
        target: { value: 'user:1' },
      });
      fireEvent.click(screen.getByRole('button', { name: '刷新' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerRefresh).toHaveBeenCalledWith({
          body: { key: 'user:1' },
        });
      });
      await waitFor(() => {
        expect(notificationMock.showToast).toHaveBeenCalledWith(
          '缓存刷新成功',
          'success'
        );
      });
    });
  });
});
