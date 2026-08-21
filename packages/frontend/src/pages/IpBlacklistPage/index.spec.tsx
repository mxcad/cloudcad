///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import IpBlacklistPage from './index';
import * as useIpBlacklistModule from './hooks/useIpBlacklist';

type UseListReturn = ReturnType<typeof useIpBlacklistModule.useIpBlacklistList>;
type UseAddReturn = ReturnType<typeof useIpBlacklistModule.useAddIpBlacklistEntry>;

const mockItems = [
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

const listValue: UseListReturn = {
  items: mockItems,
  total: 2,
  loading: false,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
};

const addValue: UseAddReturn = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null,
  data: undefined,
  status: 'idle',
  isIdle: true,
  reset: vi.fn(),
  variables: undefined,
  submittedAt: undefined,
  failureCount: 0,
  failureReason: null,
  context: undefined,
} as unknown as UseAddReturn;

const { removeControllerMock } = vi.hoisted(() => ({
  removeControllerMock: vi.fn(() =>
    Promise.resolve({ data: undefined, error: undefined })
  ),
}));

vi.mock('@/api-sdk', () => ({
  ipBlacklistControllerRemove: removeControllerMock,
}));

vi.mock('./hooks/useIpBlacklist', () => ({
  useIpBlacklistList: () => listValue,
  // mutate 触发成功后同步调用 onSuccess（模拟真实 hook 关闭弹窗）
  useAddIpBlacklistEntry: (onSuccess?: () => void) => ({
    ...addValue,
    mutate: (form: unknown) => {
      addValue.mutate(form);
      onSuccess?.();
    },
  }),
}));
vi.mock('@/hooks/useDocumentTitle');
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

describe('IpBlacklistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('渲染列表：IP/CIDR、原因、来源、操作人、创建时间、过期时间', () => {
    render(<IpBlacklistPage />);

    expect(screen.getByText('IP 黑名单')).toBeTruthy();
    expect(screen.getByText('203.0.113.0/24')).toBeTruthy();
    expect(screen.getByText('198.51.100.7')).toBeTruthy();
    expect(screen.getByText('撞库扫描')).toBeTruthy();
    expect(screen.getByText('暴力破解')).toBeTruthy();
    // 来源 manual 展示「手动添加」
    expect(screen.getAllByText('手动添加').length).toBe(2);
    // 空过期时间展示「永久」Tag
    expect(screen.getAllByText('永久').length).toBe(1);
  });

  it('点击移除打开确认弹窗，确认后调用移除接口', async () => {
    render(<IpBlacklistPage />);

    const removeButtons = screen.getAllByText('移除');
    fireEvent.click(removeButtons[0]);

    expect(screen.getByText('移除 IP 黑名单条目')).toBeTruthy();
    expect(
      screen.getByText(
        '确定要移除 203.0.113.0/24 吗？移除操作不可撤销。'
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByText('确认移除'));
    expect(removeControllerMock).toHaveBeenCalledWith({
      path: { id: 'entry-1' },
    });
    // 成功后弹窗关闭
    await vi.waitFor(() => {
      expect(screen.queryByText('移除 IP 黑名单条目')).toBeNull();
    });
  });

  it('行点击选中后出现批量操作条，支持全选', () => {
    render(<IpBlacklistPage />);

    // 行点击选中一条
    fireEvent.click(screen.getByText('203.0.113.0/24'));
    expect(screen.getByText(/已选 1 项/)).toBeTruthy();

    // 表头全选
    const headerCheckbox = document.querySelector('thead input[type="checkbox"]')!;
    fireEvent.click(headerCheckbox);
    expect(screen.getByText(/已选 2 项/)).toBeTruthy();

    // 取消选择
    fireEvent.click(screen.getByText('取消选择'));
    expect(screen.queryByText(/已选/)).toBeNull();
  });

  it('批量移除：选中多条 → 批量移除 → 逐条调用接口并清空选择', async () => {
    render(<IpBlacklistPage />);

    fireEvent.click(screen.getByText('203.0.113.0/24'));
    // 单选语义：无 Ctrl 点击会替换选择，多选需 Ctrl/勾选
    fireEvent.click(screen.getByText('198.51.100.7'), { ctrlKey: true });
    fireEvent.click(screen.getByText('批量移除'));

    expect(
      screen.getByText('确定要移除选中的 2 条记录吗？移除操作不可撤销。')
    ).toBeTruthy();

    fireEvent.click(screen.getByText('确认移除'));
    await vi.waitFor(() => {
      expect(removeControllerMock).toHaveBeenCalledTimes(2);
      expect(removeControllerMock).toHaveBeenCalledWith({
        path: { id: 'entry-1' },
      });
      expect(removeControllerMock).toHaveBeenCalledWith({
        path: { id: 'entry-2' },
      });
    });
    // 成功后清空选择
    await vi.waitFor(() => {
      expect(screen.queryByText(/已选/)).toBeNull();
    });
  });

  it('Delete 快捷键触发批量移除确认（有选中时）', () => {
    render(<IpBlacklistPage />);
    fireEvent.click(screen.getByText('203.0.113.0/24'));
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.getByText('移除 IP 黑名单条目')).toBeTruthy();
  });

  it('无选中时 Delete 快捷键不触发', () => {
    render(<IpBlacklistPage />);
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.queryByText('移除 IP 黑名单条目')).toBeNull();
  });

  it('点击添加打开弹窗；非法 CIDR 被拒；合法输入提交', () => {
    render(<IpBlacklistPage />);

    fireEvent.click(screen.getByText('添加'));
    expect(screen.getByText('添加 IP 黑名单')).toBeTruthy();

    // 非法 CIDR：网络位不对齐
    fireEvent.click(screen.getByText('确认添加'));
    expect(screen.getByText('请输入 IP 或 CIDR')).toBeTruthy();

    // 输入非法值
    const ipInput = screen.getByPlaceholderText('如 203.0.113.7 或 203.0.113.0/24');
    fireEvent.change(ipInput, { target: { value: '203.0.113.7/24' } });
    fireEvent.click(screen.getByText('确认添加'));
    expect(screen.getByText('IP/CIDR 格式非法')).toBeTruthy();
    expect(addValue.mutate).not.toHaveBeenCalled();

    // 修正为合法 CIDR + 原因
    fireEvent.change(ipInput, { target: { value: '203.0.113.0/24' } });
    const reasonInput = screen.getByPlaceholderText('如：撞库扫描攻击');
    fireEvent.change(reasonInput, { target: { value: '撞库扫描' } });
    fireEvent.click(screen.getByText('确认添加'));
    expect(addValue.mutate).toHaveBeenCalledWith({
      ip: '203.0.113.0/24',
      reason: '撞库扫描',
    });
  });

  it('添加成功后再次打开弹窗，表单已重置（不留上次输入）', () => {
    render(<IpBlacklistPage />);

    fireEvent.click(screen.getByText('添加'));
    fireEvent.change(
      screen.getByPlaceholderText('如 203.0.113.7 或 203.0.113.0/24'),
      { target: { value: '203.0.113.7' } }
    );
    fireEvent.change(screen.getByPlaceholderText('如：撞库扫描攻击'), {
      target: { value: '扫描攻击' },
    });
    // 限期选「今天」
    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    fireEvent.click(screen.getByText('今天'));
    fireEvent.click(screen.getByText('确认添加'));

    // 成功回调关闭弹窗
    expect(screen.queryByText('添加 IP 黑名单')).toBeNull();

    // 再次打开：IP、原因、限期均已清空、无残留错误
    fireEvent.click(screen.getByText('添加'));
    expect(
      screen.getByPlaceholderText('如 203.0.113.7 或 203.0.113.0/24')
    ).toHaveValue('');
    expect(screen.getByPlaceholderText('如：撞库扫描攻击')).toHaveValue('');
    expect(screen.getByPlaceholderText('选择日期')).toHaveValue('');
    expect(screen.queryByText('请输入 IP 或 CIDR')).toBeNull();
  });

  it('限期选择今天可正常提交（expiresAt 传当天日期）', () => {
    render(<IpBlacklistPage />);

    fireEvent.click(screen.getByText('添加'));
    fireEvent.change(
      screen.getByPlaceholderText('如 203.0.113.7 或 203.0.113.0/24'),
      { target: { value: '203.0.113.7' } }
    );
    fireEvent.change(screen.getByPlaceholderText('如：撞库扫描攻击'), {
      target: { value: '扫描攻击' },
    });

    // 打开日历点「今天」快捷选择（当天可选，早于今天的被禁用）
    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    fireEvent.click(screen.getByText('今天'));
    fireEvent.click(screen.getByText('确认添加'));

    expect(addValue.mutate).toHaveBeenCalledWith({
      ip: '203.0.113.7',
      reason: '扫描攻击',
      expiresAt: expect.any(String),
    });
  });

  it('限期日历中早于今天的日期被禁用（minDate 接线）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 6));
    try {
      render(<IpBlacklistPage />);
      fireEvent.click(screen.getByText('添加'));
      fireEvent.click(screen.getByPlaceholderText('选择日期'));

      // 首个 '5' 为 8月5日（今天前一天）→ 禁用；首个 '6' 为当天 8月6日 → 可选
      expect(
        screen.getAllByText('5')[0].closest('button')
      ).toHaveAttribute('disabled');
      expect(
        screen.getAllByText('6')[0].closest('button')
      ).not.toHaveAttribute('disabled');
    } finally {
      vi.useRealTimers();
    }
  });
});
