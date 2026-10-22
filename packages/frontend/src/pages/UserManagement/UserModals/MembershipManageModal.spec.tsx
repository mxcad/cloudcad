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

describe('MembershipManageModal tierLevel 归一（真值陷阱回归）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vipControllerGetActiveTiers).mockResolvedValue({
      data: [
        { id: 't0', level: 0, name: 'VIP0', isActive: true },
        { id: 't2', level: 2, name: 'VIP2', isActive: true },
      ],
    } as never);
  });

  const selectTier = (value: string) => {
    fireEvent.change(screen.getByLabelText('VIP 等级'), { target: { value } });
  };

  it('回归：tierLevel 为字符串 "0" 时不渲染移除提示', async () => {
    // "0" 是 JS 真值且 "0" > 0 为 true，裸判会让移除提示渲染成「当前 VIP0」
    renderModal({
      tierLevel: '0' as unknown as number,
      expiresAt: null,
    });

    await screen.findByRole('button', { name: '保存' });
    selectTier('0');
    expect(screen.queryByText(/将移除该用户/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VIP0/)).not.toBeInTheDocument();
  });

  it('数值 0 与字符串 "0" 行为一致', async () => {
    renderModal({ tierLevel: 0, expiresAt: null });

    await screen.findByRole('button', { name: '保存' });
    selectTier('0');
    expect(screen.queryByText(/将移除该用户/)).not.toBeInTheDocument();
  });

  it('字符串等级的 VIP 用户降级到免费时仍正常提示当前等级', async () => {
    renderModal({
      tierLevel: '2' as unknown as number,
      expiresAt: EXPIRY_IN_2_DAYS,
    });

    await screen.findByRole('button', { name: '保存' });
    selectTier('0');
    expect(screen.getByText(/当前 VIP2/)).toBeInTheDocument();
  });
});

describe('MembershipManageModal 默认等级选项不依赖接口返回', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getTierSelect = () =>
    screen.getByLabelText('VIP 等级') as HTMLSelectElement;

  it('回归：等级列表请求未返回时下拉已含当前等级（否则 Select 回退显示占位符）', () => {
    vi.mocked(vipControllerGetActiveTiers).mockReturnValue(
      new Promise(() => {}) as never
    );
    renderModal({ tierLevel: 2, expiresAt: EXPIRY_IN_2_DAYS });

    const select = getTierSelect();
    expect(select.value).toBe('2');
    expect(Array.from(select.options).map((o) => o.value)).toContain('2');
  });

  it('等级列表返回后不重复添加当前等级选项', async () => {
    vi.mocked(vipControllerGetActiveTiers).mockResolvedValue({
      data: [
        { id: 't0', level: 0, name: 'VIP0', isActive: true },
        { id: 't2', level: 2, name: 'VIP2', isActive: true },
      ],
    } as never);
    renderModal({ tierLevel: 2, expiresAt: EXPIRY_IN_2_DAYS });

    await waitFor(() => {
      expect(Array.from(getTierSelect().options).map((o) => o.value)).toEqual([
        '0',
        '2',
      ]);
    });
  });

  it('当前等级已下架时以「已下架」标签呈现且无重复项', async () => {
    vi.mocked(vipControllerGetActiveTiers).mockResolvedValue({
      data: [{ id: 't0', level: 0, name: 'VIP0', isActive: true }],
    } as never);
    renderModal({ tierLevel: 2, expiresAt: EXPIRY_IN_2_DAYS });

    await waitFor(() => {
      const select = getTierSelect();
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['0', '2']);
      expect(select.options[1]?.textContent).toContain('已下架');
    });
  });
});
