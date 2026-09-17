/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import IpWhitelistPage from './index';
import * as useIpWhitelistModule from './hooks/useIpWhitelist';

type UseListReturn = ReturnType<typeof useIpWhitelistModule.useIpWhitelistList>;
type UseAddReturn = ReturnType<
  typeof useIpWhitelistModule.useAddIpWhitelistEntry
>;
type UseBatchAddReturn = ReturnType<
  typeof useIpWhitelistModule.useBatchAddIpWhitelistPreset
>;

const mockItems = [
  {
    id: 'entry-1',
    ip: '203.0.113.0/24',
    source: 'manual',
    reason: '公司出口 IP',
    createdBy: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: null,
  },
  {
    id: 'entry-2',
    ip: '0.0.0.0/0',
    source: 'auto',
    reason: '首次部署默认放行（全局可访问），可在 IP 访问控制页删除',
    createdBy: 'system',
    createdAt: '2026-09-01T00:00:00.000Z',
    expiresAt: null,
  },
  {
    id: 'file:198.51.100.0/24',
    ip: '198.51.100.0/24',
    source: 'file',
    reason: '服务器本地文件白名单（编辑服务器文件修改）',
    createdBy: 'local-file',
    createdAt: '1970-01-01T00:00:00.000Z',
    expiresAt: null,
  },
];

const listValue: UseListReturn = {
  items: mockItems,
  total: 3,
  loading: false,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
};

const addValue: UseAddReturn = {
  mutate: vi.fn(),
  isPending: false,
} as unknown as UseAddReturn;

const { batchAddValue, removeControllerMock } = vi.hoisted(() => ({
  batchAddValue: {
    mutate: vi.fn(),
    isPending: false,
  },
  removeControllerMock: vi.fn(() =>
    Promise.resolve({ data: undefined, error: undefined })
  ),
}));

vi.mock('@/api-sdk', () => ({
  ipWhitelistControllerRemove: removeControllerMock,
}));

vi.mock('./hooks/useIpWhitelist', () => ({
  useIpWhitelistList: () => listValue,
  useAddIpWhitelistEntry: (onSuccess?: () => void) => ({
    ...addValue,
    mutate: (form: unknown) => {
      addValue.mutate(form);
      onSuccess?.();
    },
  }),
  useBatchAddIpWhitelistPreset: () => batchAddValue,
}));
vi.mock('@/hooks/useDocumentTitle');
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: vi.fn(),
}));

describe('IpWhitelistPage（默认白名单与快速添加）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('展示三种来源：手动添加 / 系统默认 / 本地文件', () => {
    render(<IpWhitelistPage />);

    expect(screen.getByText('203.0.113.0/24')).toBeTruthy();
    expect(screen.getByText('0.0.0.0/0')).toBeTruthy();
    expect(screen.getByText('198.51.100.0/24')).toBeTruthy();
    expect(screen.getByText('手动添加')).toBeTruthy();
    expect(screen.getByText('系统默认')).toBeTruthy();
    expect(screen.getByText('本地文件')).toBeTruthy();
  });

  it('快速添加菜单提供局域网与全网预设，点选后提交对应预设组', async () => {
    render(<IpWhitelistPage />);

    // Radix DropdownMenu 由 pointerup 打开（Popover 才是 click），故派发指针序列
    const trigger = screen.getByText('快速添加');
    fireEvent.pointerDown(trigger);
    fireEvent.pointerUp(trigger);

    expect(await screen.findByText('局域网')).toBeTruthy();
    expect(screen.getByText('全网')).toBeTruthy();

    fireEvent.click(screen.getByText('全网'));
    expect(batchAddValue.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'all',
        ips: ['0.0.0.0/0', '::/0'],
      })
    );

    fireEvent.click(screen.getByText('局域网'));
    expect(batchAddValue.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'lan',
        ips: expect.arrayContaining(['10.0.0.0/8', 'fc00::/7']),
      })
    );
  });

  it('移除确认弹窗提示锁死风险与恢复路径', () => {
    render(<IpWhitelistPage />);

    // 本地文件条目不可移除，选系统默认条目验证提示
    fireEvent.click(screen.getByText('0.0.0.0/0'));
    fireEvent.click(screen.getAllByText('移除')[1]);

    expect(
      screen.getByText(
        '确定要移除 0.0.0.0/0 吗？移除后该 IP 将无法通过管理员登录，请谨慎操作。'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        '删除后若白名单不再包含您的出口 IP 将无法登录，建议先添加新条目再删除。'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        '误删恢复：服务器本机（环回地址恒放行）仍可登录，或编辑服务器文件 config/admin-ip-whitelist.json。'
      )
    ).toBeTruthy();
  });
});
