///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright notice.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { sessionTransferControllerConsume } from '@/api-sdk';
import { setAccessToken, setRefreshToken } from '@/utils/tokenUtils';
import { cancelProactiveRefresh } from '@/config/tokenRefresh';
import { useBrandConfig } from '../../contexts/BrandContext';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { SessionTransfer } from './index';

vi.mock('@/api-sdk', () => ({
  sessionTransferControllerConsume: vi.fn(),
}));
vi.mock('@/utils/tokenUtils', () => ({
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
}));
vi.mock('@/config/tokenRefresh', () => ({
  cancelProactiveRefresh: vi.fn(),
}));
vi.mock('../../contexts/BrandContext', () => ({
  useBrandConfig: () => ({ config: { title: 'TestApp', logo: '/logo.png' } }),
}));
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));
vi.mock('@/utils/errorHandler', () => ({
  getErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));
vi.mock('../DeviceAuthorize.module.css', () => ({
  default: new Proxy(
    {},
    { get: (_target, key) => String(key) },
  ),
}));

const renderPage = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/session-transfer${search}`]}>
      <SessionTransfer />
    </MemoryRouter>,
  );

describe('SessionTransfer', () => {
  let replaceSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    replaceSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    replaceSpy?.mockRestore();
  });

  it('clears old credentials, writes new tokens, and navigates on success', async () => {
    // 预置旧凭证，验证「清旧」
    localStorage.setItem('accessToken', 'old-access');
    localStorage.setItem('refreshToken', 'old-refresh');
    localStorage.setItem('personalSpaceId', 'old-space');
    vi.mocked(sessionTransferControllerConsume).mockResolvedValue({
      data: {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: { id: 'u1', username: 'newuser' },
      },
    } as never);

    renderPage('?token=abc123');

    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalled();
    });

    // ① 清旧：五键被清除（setAccessToken/setRefreshToken 被 mock，不会真正写回）
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('personalSpaceId')).toBeNull();
    expect(cancelProactiveRefresh).toHaveBeenCalled();
    // ② 消费一次性凭证
    expect(sessionTransferControllerConsume).toHaveBeenCalledWith({
      body: { token: 'abc123' },
    });
    // ③ 写新：新 token + user
    expect(setAccessToken).toHaveBeenCalledWith('new-access');
    expect(setRefreshToken).toHaveBeenCalledWith('new-refresh');
    expect(localStorage.getItem('user')).toBe(
      JSON.stringify({ id: 'u1', username: 'newuser' }),
    );
    // ④ 缺省跳转 /profile
    expect(window.location.replace).toHaveBeenCalledWith('/profile');
  });

  it('sanitizes redirect: drops host of cross-origin URL, keeps only path', async () => {
    vi.mocked(sessionTransferControllerConsume).mockResolvedValue({
      data: {
        accessToken: 'a',
        refreshToken: 'r',
        user: { id: 'u1' },
      },
    } as never);

    renderPage('?token=abc&redirect=https%3A%2F%2Fevil.com%2Fpath');

    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalled();
    });

    // 开放重定向消毒：https://evil.com/path → 只保留同源路径 /path（丢弃 host）
    expect(window.location.replace).toHaveBeenCalledWith('/path');
    expect(window.location.replace).not.toHaveBeenCalledWith(
      'https://evil.com/path',
    );
  });

  it('shows error page when consume fails (credential invalid/expired)', async () => {
    vi.mocked(sessionTransferControllerConsume).mockResolvedValue({
      error: new Error('转移凭证无效或已过期'),
      data: undefined,
    } as never);

    renderPage('?token=expired');

    await waitFor(() => {
      expect(screen.getByText('会话转移失败')).toBeInTheDocument();
    });
    // 失败不跳转
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('shows error page when token is missing and does not call consume', () => {
    renderPage('');

    expect(screen.getByText('缺少转移凭证')).toBeInTheDocument();
    expect(sessionTransferControllerConsume).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
