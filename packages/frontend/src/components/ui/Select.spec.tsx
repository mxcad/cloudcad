///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { Select, MultiSelect } from './Select';

vi.mock('@voerkai18n/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@voerkai18n/react')>()),
  useVoerkaI18n: () => ({ activeLanguage: 'zh-CN' }),
}));

describe('Select (SimpleSelect)', () => {
  // 回归：value: '' 的空值选项（"所有角色/全部/不限"）曾被 filter 掉，
  // 导致用户筛选后无法通过下拉回到无筛选状态，只能刷新页面
  it('renders empty-value option in dropdown and allows re-selecting it', () => {
    const onChange = vi.fn();
    render(
      <Select
        value="r1"
        onChange={onChange}
        options={[
          { value: '', label: '所有角色' },
          { value: 'r1', label: '管理员' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const emptyOption = screen.getByText('所有角色');
    expect(emptyOption).toBeTruthy();

    fireEvent.click(emptyOption);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('selects a normal option value', () => {
    const onChange = vi.fn();
    render(
      <Select
        value=""
        onChange={onChange}
        options={[
          { value: 'r1', label: '管理员' },
          { value: 'r2', label: '普通用户' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('普通用户'));
    expect(onChange).toHaveBeenCalledWith('r2');
  });

  // 回归：清除按钮（X）此前嵌套在 Radix Trigger 内，pointerdown 被 Radix
  // preventDefault 后 click 不再派发，handleClear 永不执行 → 无法清除
  it('clears value when clicking the clear (X) button', () => {
    const onChange = vi.fn();
    render(
      <Select
        value="r1"
        onChange={onChange}
        options={[
          { value: 'r1', label: '管理员' },
          { value: 'r2', label: '普通用户' },
        ]}
        clearable
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  // 回归：弹层从未打开时，Radix 为表单兼容渲染的隐藏原生 <select> 里没有任何
  // <option>（选项由 Content 内的 SelectItemText 注册）；受控 value 从 "0" 改成 "1"
  // 时它 setValue 失败会把值改写成 '' 并冒泡 change，把外部状态清空
  // （实例：会员管理弹窗回填 VIP1 却恒显示「请选择等级」）
  it('回归：外部异步切换受控值且弹层未打开时，值不被隐藏原生 select 清空', async () => {
    const onChange = vi.fn();
    // 与会员管理弹窗同形：等级列表加载期下拉禁用，加载完成后解除，
    // 期间外部把受控值从免费档回填为当前会员等级
    function Harness() {
      const [v, setV] = useState('0');
      const [loading, setLoading] = useState(true);
      useEffect(() => {
        setV('1');
        const timer = setTimeout(() => setLoading(false), 10);
        return () => clearTimeout(timer);
      }, []);
      return (
        <form>
          <Select
            value={v}
            onChange={(next) => {
              onChange(next);
              setV(next);
            }}
            options={[
              { value: '0', label: '免费用户' },
              { value: '1', label: 'VIP1' },
            ]}
            placeholder="请选择等级"
            loading={loading}
            disabled={loading}
          />
        </form>
      );
    }
    render(<Harness />);

    // Radix 的冒泡是 layout effect 内 dispatch 的 change，需等事件派发完成再断言
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveTextContent('VIP1');
  });
});

describe('MultiSelect', () => {
  const options = [
    { value: 'A', label: '操作 A' },
    { value: 'B', label: '操作 B' },
    { value: 'C', label: '操作 C' },
  ];

  it('toggles options in dropdown without closing it', () => {
    const onChange = vi.fn();
    render(<MultiSelect value={[]} onChange={onChange} options={options} />);

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('操作 A'));
    expect(onChange).toHaveBeenCalledWith(['A']);

    // 下拉保持打开，可继续勾选
    fireEvent.click(screen.getByText('操作 B'));
    expect(onChange).toHaveBeenLastCalledWith(['B']);
  });

  it('unchecks an already selected option', () => {
    const onChange = vi.fn();
    render(<MultiSelect value={['A', 'B']} onChange={onChange} options={options} />);

    fireEvent.click(screen.getByRole('combobox'));
    // trigger 中已选 tag 与下拉项文本重复，用 role="option" 精确命中下拉项
    fireEvent.click(screen.getByRole('option', { name: '操作 A' }));
    expect(onChange).toHaveBeenCalledWith(['B']);
  });

  it('removes a single selected tag via its X button', () => {
    const onChange = vi.fn();
    render(<MultiSelect value={['A', 'B']} onChange={onChange} options={options} />);

    fireEvent.click(screen.getByRole('button', { name: '移除 操作 A' }));
    expect(onChange).toHaveBeenCalledWith(['B']);
  });

  it('clears all values via the clear button', () => {
    const onChange = vi.fn();
    render(
      <MultiSelect
        value={['A', 'B']}
        onChange={onChange}
        options={options}
        clearable
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows placeholder when nothing is selected', () => {
    render(<MultiSelect value={[]} onChange={vi.fn()} options={options} placeholder="全部" />);
    expect(screen.getByText('全部')).toBeTruthy();
  });
});
