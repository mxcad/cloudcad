///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DatePicker } from './DatePicker';

vi.mock('@voerkai18n/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@voerkai18n/react')>()),
  useVoerkaI18n: () => ({ activeLanguage: 'zh-CN' }),
}));

const isoOf = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();

describe('DatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 6));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('点击输入框打开日历面板，渲染月份标题与周表头', () => {
    const onChange = vi.fn();
    render(<DatePicker value={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByPlaceholderText('选择日期'));

    expect(screen.getByText('2026年8月')).toBeTruthy();
    // 7 列周表头（周日~周六，narrow 单字符）
    expect(screen.getByText('日')).toBeTruthy();
    expect(screen.getByText('六')).toBeTruthy();
  });

  it('受控 open=false 时不显示面板，onOpenChange 在点击输入框时回调', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DatePicker
        value={undefined}
        onChange={onChange}
        open={false}
        onOpenChange={onOpenChange}
      />
    );

    expect(screen.queryByText('2026年8月')).toBeNull();
    fireEvent.click(screen.getByPlaceholderText('选择日期'));

    expect(onOpenChange).toHaveBeenCalledWith(true);
    // 受控模式：面板是否展示由调用方 open 决定，内部不自动打开
    expect(screen.queryByText('2026年8月')).toBeNull();
  });

  it('选择日期后回填当天 23:59:59.999 的 ISO', () => {
    const onChange = vi.fn();
    render(<DatePicker value={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    // 2026-08-15（2026年8月15日是周六；2026-08-01 是周六，15 号同样周六）
    fireEvent.click(screen.getAllByText('15')[0]);

    expect(onChange).toHaveBeenCalledWith(isoOf(2026, 8, 15));
  });

  it('「今天」按钮选择当天', () => {
    const onChange = vi.fn();
    render(<DatePicker value={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    fireEvent.click(screen.getByText('今天'));

    expect(onChange).toHaveBeenCalledWith(isoOf(2026, 8, 6));
  });

  it('「清除」清空选择（undefined = 永久）', () => {
    const onChange = vi.fn();
    render(<DatePicker value={isoOf(2026, 8, 15)} onChange={onChange} />);

    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    fireEvent.click(screen.getByText('清除'));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('minDate 之前的日期禁用（点击无效），当天仍可选', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value={undefined}
        onChange={onChange}
        minDate={isoOf(2026, 8, 6)}
      />
    );

    fireEvent.click(screen.getByPlaceholderText('选择日期'));

    // 8月5日（minDate 前一天）禁用（首个 '5' 为当月 8月5日，末行为 9月5日外出日）
    const pastDay = screen.getAllByText('5')[0].closest('button');
    expect(pastDay).toHaveAttribute('disabled');
    fireEvent.click(pastDay!);
    expect(onChange).not.toHaveBeenCalled();

    // 当天（8月6日）可选（首个 '6' 为当月 8月6日，末行为 9月6日外出日）
    fireEvent.click(screen.getAllByText('6')[0]);
    expect(onChange).toHaveBeenCalledWith(isoOf(2026, 8, 6));
  });

  // 注：点击面板外部关闭由 Radix Popover 保证（组件库既定行为），
  // happy-dom + fake timers 环境无法可靠模拟，E2E 覆盖。

  it('点击面板外部自动关闭（组件级兜底监听）', () => {
    const onChange = vi.fn();
    render(<DatePicker value={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    expect(screen.getByText('2026年8月')).toBeTruthy();

    // 点击输入框/面板以外的区域（document.body）→ 面板关闭
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('2026年8月')).toBeNull();
  });

  it('maxDate 之后的日期禁用（点击无效），当天仍可选', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value={undefined}
        onChange={onChange}
        maxDate={isoOf(2026, 8, 6)}
      />
    );

    fireEvent.click(screen.getByPlaceholderText('选择日期'));

    // 8月7日（maxDate 后一天）禁用（首个 '7' 为当月 8月7日）
    const futureDay = screen.getAllByText('7')[0].closest('button');
    expect(futureDay).toHaveAttribute('disabled');
    fireEvent.click(futureDay!);
    expect(onChange).not.toHaveBeenCalled();

    // 当天（8月6日）可选
    fireEvent.click(screen.getAllByText('6')[0]);
    expect(onChange).toHaveBeenCalledWith(isoOf(2026, 8, 6));
  });

  it('「今天」在 min/max 边界之外时禁用', () => {
    const onChange = vi.fn();
    // minDate 晚于今天（系统时间 2026-08-06）：今天按钮禁用
    const { unmount } = render(
      <DatePicker
        value={undefined}
        onChange={onChange}
        minDate={isoOf(2026, 8, 10)}
      />
    );
    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    expect(screen.getByRole('button', { name: '今天' })).toBeDisabled();
    unmount();

    // maxDate 早于今天：今天按钮同样禁用
    render(
      <DatePicker
        value={undefined}
        onChange={onChange}
        maxDate={isoOf(2026, 8, 1)}
      />
    );
    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    expect(screen.getByRole('button', { name: '今天' })).toBeDisabled();
  });

  it('导航条提供上/下一年快速切换（跨年免连点）', () => {
    const onChange = vi.fn();
    render(<DatePicker value={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByPlaceholderText('选择日期'));
    expect(screen.getByText('2026年8月')).toBeTruthy();

    // 上一年 → 2025年8月
    fireEvent.click(screen.getByLabelText('上一年'));
    expect(screen.getByText('2025年8月')).toBeTruthy();

    // 下一年 → 回到 2026年8月
    fireEvent.click(screen.getByLabelText('下一年'));
    expect(screen.getByText('2026年8月')).toBeTruthy();
  });

  it('显示已选日期（本地格式化）', () => {
    const onChange = vi.fn();
    render(<DatePicker value={isoOf(2026, 8, 15)} onChange={onChange} />);

    expect(screen.getByDisplayValue('2026年8月15日')).toBeTruthy();
  });
});
