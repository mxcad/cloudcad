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
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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
  cacheMonitorControllerGetKeyCatalog: vi.fn(),
}));

// 后端目录的精简样本：一条业务缓存 + 一条基础设施键（会话）
const CATALOG = [
  {
    id: 'user_permissions',
    name: '用户系统权限集合',
    pattern: 'user:permissions:*',
    description: '某用户的系统权限列表',
    scope: 'cache',
    removalEffect: '回源数据库重建',
    ttl: '5 分钟',
    example: 'user:permissions:12',
  },
  {
    id: 'project_permissions',
    name: '项目权限',
    pattern: 'project:permissions:*',
    description: '某项目的权限集合',
    scope: 'cache',
    removalEffect: '回源数据库重建',
    ttl: '5 分钟',
    example: 'project:permissions:34',
  },
  {
    id: 'session',
    name: '登录会话',
    pattern: 'mxcad:sess:*',
    description: 'express-session 会话存储',
    scope: 'infra',
    removalEffect: '⚠️ 删除后对应用户立即登出',
    ttl: '24 小时',
    example: 'mxcad:sess:sXyz',
  },
] as const;

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
    apiMocks.cacheMonitorControllerGetKeyCatalog.mockResolvedValue({
      data: { entries: [...CATALOG] },
    });
  });

  describe('when user is not SYSTEM_ADMIN', () => {
    it('只显示查询按钮，不显示任何写操作', () => {
      render(
        <CacheKeyOperations isAdmin={false} onChanged={() => undefined} />
      );

      expect(screen.getByRole('button', { name: '查询' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '设置' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '删除' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '刷新' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '按模式删除' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '重置监控统计' })
      ).not.toBeInTheDocument();
    });
  });

  describe('when user is SYSTEM_ADMIN', () => {
    it('查询 Key 并展示结果', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）'),
        {
          target: { value: 'user:1' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: '查询' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerGetValue).toHaveBeenCalledWith({
          throwOnError: true,
          query: { key: 'user:1' },
        });
      });
      await waitFor(() => {
        expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
      });
    });

    it('删除 Key 前弹出确认，确认后调用删除并 toast', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）'),
        {
          target: { value: 'user:1' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: '删除' }));

      await waitFor(() => {
        expect(notificationMock.showConfirm).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerDeleteValue).toHaveBeenCalledWith(
          {
            throwOnError: true,
            query: { key: 'user:1' },
          }
        );
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

      fireEvent.change(
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）'),
        {
          target: { value: 'user:1' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: '删除' }));

      await waitFor(() => {
        expect(notificationMock.showConfirm).toHaveBeenCalled();
      });
      expect(apiMocks.cacheMonitorControllerDeleteValue).not.toHaveBeenCalled();
    });

    it('设置缓存调用 setValue 并触发刷新回调', async () => {
      const onChanged = vi.fn();
      render(<CacheKeyOperations isAdmin onChanged={onChanged} />);

      fireEvent.change(
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）'),
        {
          target: { value: 'config:theme' },
        }
      );
      fireEvent.change(screen.getByPlaceholderText('缓存值'), {
        target: { value: 'dark' },
      });
      fireEvent.change(screen.getByPlaceholderText('TTL（秒）'), {
        target: { value: '60' },
      });
      fireEvent.click(screen.getByRole('button', { name: '设置' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerSetValue).toHaveBeenCalledWith({
          throwOnError: true,
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

      fireEvent.change(
        screen.getByPlaceholderText('匹配模式（点击选择或输入筛选）'),
        {
          target: { value: 'user:permissions:*' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: '按模式删除' }));

      await waitFor(() => {
        expect(
          apiMocks.cacheMonitorControllerDeleteByPattern
        ).toHaveBeenCalledWith({
          throwOnError: true,
          query: { pattern: 'user:permissions:*' },
        });
      });
    });

    it('命中删除条数上限时提示仍有键未删除，不谎报成功', async () => {
      apiMocks.cacheMonitorControllerDeleteByPattern.mockResolvedValueOnce({
        data: { truncated: true },
      });
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(
        screen.getByPlaceholderText('匹配模式（点击选择或输入筛选）'),
        {
          target: { value: 'user:permissions:*' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: '按模式删除' }));

      await waitFor(() => {
        expect(notificationMock.showToast).toHaveBeenCalledWith(
          '已删除部分缓存，但已达单次删除条数上限，可能仍有匹配键未删除',
          'warning'
        );
      });
    });

    it('重置监控统计确认后调用 cleanup', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.click(screen.getByRole('button', { name: '重置监控统计' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerCleanup).toHaveBeenCalledWith({
          throwOnError: true,
          body: { level: 'ALL' },
        });
      });
      await waitFor(() => {
        expect(notificationMock.showToast).toHaveBeenCalledWith(
          '已重置 L1 内存缓存与监控统计',
          'success'
        );
      });
    });

    it('刷新 Key 调用 refresh 并 toast 成功', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      fireEvent.change(
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）'),
        {
          target: { value: 'user:1' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: '刷新' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerRefresh).toHaveBeenCalledWith({
          throwOnError: true,
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

  describe('缓存键目录驱动自动筛选', () => {
    it('加载目录并支持按输入内容过滤候选项', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      const input =
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'project' } });

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerGetKeyCatalog).toHaveBeenCalled();
      });
      // 只命中 project 前缀的条目，其余被过滤掉
      expect(screen.getByText('project:permissions:*')).toBeInTheDocument();
      expect(screen.queryByText('user:permissions:*')).not.toBeInTheDocument();
    });

    it('选择目录条目后填入真实示例 key', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      const input =
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'project' } });

      await waitFor(() => {
        expect(screen.getByText('project:permissions:*')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('project:permissions:*'));

      expect(input).toHaveValue('project:permissions:34');
    });

    it('基础设施键只展示不填充，选择时提示不可删除', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      const input =
        screen.getByPlaceholderText('匹配模式（点击选择或输入筛选）');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'sess' } });

      await waitFor(() => {
        expect(screen.getByText('mxcad:sess:*')).toBeInTheDocument();
      });
      // infra 条目带不可删除标记
      expect(screen.getByText('不可删除')).toBeInTheDocument();

      fireEvent.click(screen.getByText('mxcad:sess:*'));

      expect(notificationMock.showToast).toHaveBeenCalledWith(
        expect.stringContaining('该键属于基础设施，不允许删除'),
        'warning'
      );
      // 不填充输入框，避免误删会话
      expect(input).toHaveValue('sess');
    });

    it('聚焦另一个输入框时先前的下拉收起，不会两个菜单同时展开', async () => {
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      const keyInput = screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）');
      const patternInput = screen.getByPlaceholderText('匹配模式（点击选择或输入筛选）');

      fireEvent.focus(keyInput);
      await waitFor(() => {
        expect(screen.getAllByText('user:permissions:*')).toHaveLength(1);
      });

      fireEvent.blur(keyInput);
      fireEvent.focus(patternInput);

      // 两个下拉渲染同一份目录；先前的菜单没收起时这里是 2
      expect(screen.getAllByText('user:permissions:*')).toHaveLength(1);

      // 在匹配模式里筛选，剩余下拉随之过滤，证明开着的是模式菜单
      fireEvent.change(patternInput, { target: { value: 'sess' } });
      expect(screen.getByText('mxcad:sess:*')).toBeInTheDocument();
      expect(screen.queryByText('user:permissions:*')).not.toBeInTheDocument();

      // 先前那次 blur 的延迟收起到期后，后聚焦的菜单仍开着（不被误关）
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      expect(screen.getByText('mxcad:sess:*')).toBeInTheDocument();
    });

    it('目录拉取失败时退回纯手输，不阻塞操作', async () => {      apiMocks.cacheMonitorControllerGetKeyCatalog.mockRejectedValue(
        new Error('boom')
      );
      render(<CacheKeyOperations isAdmin onChanged={() => undefined} />);

      const input =
        screen.getByPlaceholderText('缓存 Key（点击选择或输入筛选）');
      fireEvent.change(input, { target: { value: 'user:1' } });
      fireEvent.click(screen.getByRole('button', { name: '查询' }));

      await waitFor(() => {
        expect(apiMocks.cacheMonitorControllerGetValue).toHaveBeenCalledWith({
          throwOnError: true,
          query: { key: 'user:1' },
        });
      });
    });
  });
});
