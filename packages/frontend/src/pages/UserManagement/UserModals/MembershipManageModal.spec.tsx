import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MembershipManageModal } from './MembershipManageModal';

// ---- mock API SDK ----
vi.mock('@/api-sdk', () => ({
  vipControllerGetActiveTiers: vi.fn(),
}));

import { vipControllerGetActiveTiers } from '@/api-sdk';

// ---- mock UI 组件 ----
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    children,
    footer,
  }: {
    isOpen?: boolean;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    );
  },
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children?: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({
    value,
    onChange,
    options,
  }: {
    value?: string;
    onChange?: (v: string) => void;
    options?: { value: string; label: string }[];
  }) => (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      aria-label="VIP 等级"
    >
      {(options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@/components/ui/DatePicker', () => ({
  DatePicker: () => null,
}));

vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params
      ? key.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '')
      : key,
}));

const DAY_MS = 86400000;
const NOW = new Date('2026-08-25T10:00:00.000Z');
const EXPIRY_IN_2_DAYS = new Date(NOW.getTime() + 2 * DAY_MS).toISOString();

function renderModal(currentMembership?: {
  tierLevel?: number;
  expiresAt?: string | null;
}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <MembershipManageModal
      isOpen
      onClose={vi.fn()}
      onSubmit={onSubmit}
      loading={false}
      userName="tester"
      currentMembership={currentMembership}
    />
  );
  return { onSubmit };
}

/** 打开弹窗（VIP2 用户）并切入「调整时长」模式 */
async function openInAdjustMode(expiresAt: string | null) {
  const { onSubmit } = renderModal({ tierLevel: 2, expiresAt });
  fireEvent.click(await screen.findByRole('button', { name: '调整时长' }));
  return { onSubmit };
}

const getDaysInput = () =>
  screen.getByLabelText('调整天数') as HTMLInputElement;
const getMinusBtn = () =>
  screen.getByRole('button', { name: '减少一天' }) as HTMLButtonElement;
const getPlusBtn = () =>
  screen.getByRole('button', { name: '增加一天' }) as HTMLButtonElement;

describe('MembershipManageModal 调整时长计数器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.mocked(vipControllerGetActiveTiers).mockResolvedValue({
      data: [
        { id: 't0', level: 0, name: 'VIP0', isActive: true },
        { id: 't2', level: 2, name: 'VIP2', isActive: true },
      ],
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('回归：加减按钮每次点击立即 ±1 天，无需先切换方向', async () => {
    await openInAdjustMode(EXPIRY_IN_2_DAYS);

    expect(getDaysInput().value).toBe('30');
    fireEvent.click(getMinusBtn());
    expect(getDaysInput().value).toBe('29');
    fireEvent.click(getMinusBtn());
    expect(getDaysInput().value).toBe('28');
    fireEvent.click(getPlusBtn());
    expect(getDaysInput().value).toBe('29');
  });

  it('快捷天数按钮绝对赋值调整量', async () => {
    await openInAdjustMode(EXPIRY_IN_2_DAYS);

    fireEvent.click(screen.getByRole('button', { name: '7 天' }));
    expect(getDaysInput().value).toBe('7');
    fireEvent.click(getPlusBtn());
    expect(getDaysInput().value).toBe('8');
  });

  it('允许负数输入（缩短会员）并按有符号天数提交', async () => {
    const { onSubmit } = await openInAdjustMode(EXPIRY_IN_2_DAYS);

    fireEvent.change(getDaysInput(), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ tierLevel: 2, adjustDays: -1 });
    });
  });

  it('下限钳制：剩余 2 天的用户最多回拨 2 天，到底后减少按钮禁用', async () => {
    await openInAdjustMode(EXPIRY_IN_2_DAYS);

    fireEvent.change(getDaysInput(), { target: { value: '-999' } });
    fireEvent.blur(getDaysInput());
    expect(getDaysInput().value).toBe('-2');
    expect(getMinusBtn()).toBeDisabled();

    // 提交的是钳制后的合法值
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(screen.getByText(/新到期时间/)).toBeInTheDocument();
    });
  });

  it('无到期用户以下一时刻为基准：调整量不允许为负', async () => {
    await openInAdjustMode(null);

    fireEvent.change(getDaysInput(), { target: { value: '-5' } });
    fireEvent.blur(getDaysInput());
    expect(getDaysInput().value).toBe('0');
    expect(getMinusBtn()).toBeDisabled();
  });

  it('调整量为 0 时保存禁用', async () => {
    await openInAdjustMode(EXPIRY_IN_2_DAYS);

    fireEvent.change(getDaysInput(), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('新到期时间预览永不早于今天（钳制后恒合法）', async () => {
    await openInAdjustMode(EXPIRY_IN_2_DAYS);
    expect(screen.getByText(/新到期时间/)).toBeInTheDocument();

    // 回拨到下限：新到期 ≈ 当前时刻（今天），不是更早日期
    fireEvent.change(getDaysInput(), { target: { value: '-2' } });
    const expected = `新到期时间：${NOW.toLocaleDateString()}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
