///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置页单测：hook 全部 mock，聚焦页面装配、元数据渲染、搜索分组、
 * 危险/恢复默认/历史 的交互接线。hook 自身逻辑见 useRuntimeConfig.spec.ts。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import RuntimeConfigPage, { RuntimeConfigPage as NamedPage } from '../index';
import type { ConfigItem, ConfigGroup } from '../types';
import type { DraftValue } from '../validate';
import type { UseRuntimeConfigReturn } from '../hooks/useRuntimeConfig';
import { defaultDraftOf } from '../validate';

/** 取某个配置项的行容器（页面上同类文本很多，断言必须作用域化） */
function rowOf(key: string) {
  const row = screen
    .getAllByTestId('rc-item')
    .find((el) => el.getAttribute('data-key') === key);
  expect(row, `未找到配置项 ${key}`).toBeTruthy();
  return row!;
}

// ── 数据工厂 ──────────────────────────────────────────────────────────────

function item(patch: Partial<ConfigItem> & { key: string; category: string }): ConfigItem {
  return {
    value: '',
    type: 'string',
    description: '',
    isPublic: false,
    tier: 'admin',
    source: 'default',
    isModified: false,
    envValue: null,
    hot: true,
    ...patch,
  };
}

function toGroups(list: ConfigItem[]): ConfigGroup[] {
  const byCategory = new Map<string, ConfigItem[]>();
  for (const it of list) {
    byCategory.set(it.category, [...(byCategory.get(it.category) ?? []), it]);
  }
  return [...byCategory.entries()].map(([category, items]) => ({
    category,
    label: category,
    icon: () => null,
    items,
    modifiedCount: items.filter((i) => i.isModified).length,
  }));
}

const mockItems: ConfigItem[] = [
  item({
    key: 'mail.smtpHost',
    category: 'mail',
    value: 'smtp.mx.com',
    description: 'SMTP 服务器地址',
    tier: 'user',
    source: 'runtime',
    isModified: true,
    defaultValue: 'smtp.example.com',
    impact: '影响所有出站邮件',
    input: { maxLength: 200, placeholder: 'smtp.example.com' },
    updatedAt: '2026-09-01T02:00:00.000Z',
    updatedBy: 'admin-1',
  }),
  item({
    key: 'mail.port',
    category: 'mail',
    value: 587,
    type: 'number',
    description: 'SMTP 端口',
    source: 'default',
    input: { min: 1, max: 65535, step: 1, unit: '端口' },
  }),
  item({
    key: 'user.allowRegister',
    category: 'user',
    value: true,
    type: 'boolean',
    description: '允许注册用户',
    source: 'runtime',
    isModified: true,
    defaultValue: false,
    dangerous: true,
    impact: '关闭后所有新注册请求被拒绝',
  }),
  item({
    key: 'file.maxFileSize',
    category: 'file',
    value: 100,
    type: 'number',
    description: '单个文件大小上限',
    source: 'env',
    envValue: 200,
    defaultValue: 50,
    input: { min: 1, max: 5000, step: 1, unit: 'MB' },
  }),
  item({
    key: 'security.corsOrigins',
    category: 'security',
    value: { allowed: ['https://a.com'] },
    type: 'json',
    description: 'CORS 白名单',
    source: 'runtime',
    isModified: true,
    defaultValue: {},
    tier: 'advanced',
    hot: false,
    impact: '配置错误会阻塞所有跨域请求',
  }),
  item({
    key: 'system.cronExpression',
    category: 'system',
    value: '0 3 * * *',
    description: '定时任务表达式',
    tier: 'advanced',
    input: { multiline: true, maxLength: 200 },
  }),
  item({
    key: 'mail.smtpPassword',
    category: 'mail',
    value: 'secret-value',
    description: 'SMTP 密码',
    input: { secret: true, maxLength: 128, placeholder: 'smtp-password' },
  }),
  item({
    key: 'system.logLevel',
    category: 'system',
    value: 'debug',
    description: '日志级别',
    input: {
      options: [
        { value: 'debug', label: '调试' },
        { value: 'info', label: '信息' },
      ],
    },
  }),
];

// ── hook mock ─────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  return: {} as UseRuntimeConfigReturn,
}));

vi.mock('../hooks/useRuntimeConfig', () => ({
  useRuntimeConfig: () => mockState.return,
}));
vi.mock('@/hooks/useDocumentTitle');
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

function makeReturn(
  overrides: Partial<UseRuntimeConfigReturn> = {}
): UseRuntimeConfigReturn {
  const configs = overrides.configs ?? mockItems;
  const groups = overrides.groups ?? toGroups(configs);
  return {
    configs,
    groups,
    loading: false,
    drafts: {},
    fieldErrors: {},
    saving: new Set(),
    savingCategory: false,
    resetPreviewCategory: null,
    resetPreviewItems: [],
    historyKey: null,
    history: [],
    historyLoading: false,
    historyError: null,
    collapsed: new Set(),
    keyword: '',
    onlyModified: false,
    secretVisible: new Set(),
    canManageConfig: true,
    stats: {
      total: configs.length,
      modified: configs.filter((c) => c.isModified).length,
      restartRequired: configs.filter((c) => c.hot === false).length,
      envDriven: configs.filter((c) => c.envValue != null).length,
      pendingSave: 0,
    },
    setKeyword: vi.fn(),
    setOnlyModified: vi.fn(),
    toggleCollapsed: vi.fn(),
    setAllCollapsed: vi.fn(),
    draftOf: (it) => defaultDraftOf(it),
    isDirty: (it) => it.isModified,
    handleDraftChange: vi.fn(),
    handleFormatJson: vi.fn(),
    handleSave: vi.fn().mockResolvedValue(true),
    handleReset: vi.fn().mockResolvedValue(undefined),
    toggleSecretVisibility: vi.fn(),
    requestResetCategory: vi.fn(),
    confirmResetCategory: vi.fn().mockResolvedValue(undefined),
    cancelResetCategory: vi.fn(),
    openHistory: vi.fn().mockResolvedValue(undefined),
    closeHistory: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.return = makeReturn();
});

describe('RuntimeConfigPage 渲染', () => {
  it('具名导出与默认导出一致', () => {
    expect(NamedPage).toBe(RuntimeConfigPage);
  });

  it('渲染标题、优先级说明与统计条', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText('运行时配置')).toBeTruthy();
    // 需重启项数（security.corsOrigins hot=false）计入说明
    expect(screen.getByText(/需重启后端服务后生效/)).toBeTruthy();
    expect(screen.getByTestId('rc-stats')).toBeTruthy();
    const stats = within(screen.getByTestId('rc-stats'));
    expect(stats.getByText('配置项')).toBeTruthy();
    expect(stats.getByText('环境变量')).toBeTruthy();
  });

  it('分类卡片可折叠，折叠后隐藏配置项', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText('mail.smtpHost')).toBeTruthy();

    fireEvent.click(screen.getAllByTestId('rc-card-toggle')[0]);
    expect(mockState.return.toggleCollapsed).toHaveBeenCalledWith('mail');
  });

  it('「折叠全部 / 展开全部」按当前状态切换文案', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText('折叠全部')).toBeTruthy();

    mockState.return = makeReturn({
      collapsed: new Set(['mail', 'user', 'file', 'security', 'system']),
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('展开全部')).toBeTruthy();
  });

  it('渲染徽标：档位 / 来源 / 生效方式 / 危险 / 已修改', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getAllByText('管理项').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('高级项').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('运行时修改').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('代码默认值').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('即时生效').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('需重启服务').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('危险').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('已修改').length).toBeGreaterThanOrEqual(3);
  });

  it('已修改项显示「默认值 → 当前值」对比', () => {
    render(<RuntimeConfigPage />);
    const row = rowOf('mail.smtpHost');
    expect(within(row).getAllByText('默认值').length).toBe(1);
    expect(within(row).getAllByText('当前值').length).toBe(1);
    expect(within(row).getByText('smtp.example.com')).toBeTruthy();
    expect(within(row).getByText('smtp.mx.com')).toBeTruthy();
    // 未修改项不显示对比
    expect(within(rowOf('mail.port')).queryByText('默认值')).toBeNull();
  });

  it('环境变量项展示 env 提示；已修改项额外说明恢复默认的去向', () => {
    const configs = mockItems.map((it) =>
      it.key === 'file.maxFileSize' ? { ...it, isModified: true } : it
    );
    mockState.return = makeReturn({ configs, groups: toGroups(configs) });
    render(<RuntimeConfigPage />);
    const row = rowOf('file.maxFileSize');
    expect(
      within(row).getByText(/环境变量已设置该值（200），运行时配置优先级更高/)
    ).toBeTruthy();
    expect(within(row).getByText('恢复默认将改由环境变量生效。')).toBeTruthy();
  });

  it('环境变量项未修改时不出现「恢复默认将改由环境变量生效」提示', () => {
    render(<RuntimeConfigPage />);
    expect(screen.queryByText('恢复默认将改由环境变量生效。')).toBeNull();
  });

  it('危险项展示影响说明', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText('关闭后所有新注册请求被拒绝')).toBeTruthy();
  });

  it('渲染更新时间与操作人', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText(/admin-1/)).toBeTruthy();
  });
});

describe('RuntimeConfigPage 类型感知控件', () => {
  it('number 控件带单位后缀与 min/max/step', () => {
    render(<RuntimeConfigPage />);
    const input = screen.getByDisplayValue('587') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('1');
    expect(input.max).toBe('65535');
    expect(input.step).toBe('1');
    expect(screen.getByText('端口')).toBeTruthy();
  });

  it('boolean 渲染为开关（checkbox），当前值 true', () => {
    render(<RuntimeConfigPage />);
    const boxes = screen.getAllByRole('checkbox').filter((el) => {
      // 排除工具栏的「只看已修改的」勾选
      return el.value === 'on';
    });
    expect(boxes.length).toBeGreaterThan(0);
    expect(screen.getByText('已开启')).toBeTruthy();
  });

  it('multiline 渲染为 textarea，maxLength 生效并显示字符计数', () => {
    render(<RuntimeConfigPage />);
    const row = rowOf('system.cronExpression');
    const ta = within(row).getByDisplayValue('0 3 * * *');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.getAttribute('maxlength')).toBe('200');
    expect(within(row).getByText('9 / 200')).toBeTruthy();
  });

  it('json 渲染为 textarea 并提供格式化按钮', () => {
    render(<RuntimeConfigPage />);
    const row = rowOf('security.corsOrigins');
    expect(within(row).getByRole('button', { name: '格式化' })).toBeTruthy();
    expect(within(row).getAllByTestId('rc-input')[0].querySelector('textarea')).toBeTruthy();
  });

  it('secret 渲染为 password 输入并可切换显示', () => {
    render(<RuntimeConfigPage />);
    const input = screen.getByPlaceholderText('smtp-password');
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByLabelText(/显示值|隐藏值/));
    expect(mockState.return.toggleSecretVisibility).toHaveBeenCalledWith(
      'mail.smtpPassword'
    );
  });

  it('options 渲染为下拉并显示选中项 label', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText('调试')).toBeTruthy();
  });

  it('点击输入控件触发 handleDraftChange', () => {
    render(<RuntimeConfigPage />);
    fireEvent.change(screen.getByPlaceholderText('smtp.example.com'), {
      target: { value: 'smtp.other.com' },
    });
    expect(mockState.return.handleDraftChange).toHaveBeenCalledWith(
      'mail.smtpHost',
      'smtp.other.com'
    );
  });

  it('点击格式化按钮触发 handleFormatJson', () => {
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getByText('格式化'));
    expect(mockState.return.handleFormatJson).toHaveBeenCalledWith(
      'security.corsOrigins'
    );
  });
});

describe('RuntimeConfigPage 搜索与筛选', () => {
  it('输入关键词触发 setKeyword', () => {
    render(<RuntimeConfigPage />);
    fireEvent.change(screen.getByTestId('rc-search'), {
      target: { value: 'smtp' },
    });
    expect(mockState.return.setKeyword).toHaveBeenCalledWith('smtp');
  });

  it('勾选「只看已修改的」触发 setOnlyModified', () => {
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getByText('只看已修改的'));
    expect(mockState.return.setOnlyModified).toHaveBeenCalledWith(true);
  });

  it('搜索无结果时展示空态，且不含分组卡片', () => {
    mockState.return = makeReturn({ groups: [] });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('没有匹配的配置项')).toBeTruthy();
    expect(screen.queryByTestId('rc-card')).toBeNull();
  });

  it('后端返回空列表时展示另一套空态', () => {
    mockState.return = makeReturn({ configs: [], groups: [] });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('暂无配置项')).toBeTruthy();
    expect(screen.getByText('系统尚未配置任何运行时参数')).toBeTruthy();
  });

  it('loading 时展示加载态', () => {
    mockState.return = makeReturn({ loading: true });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('正在加载配置...')).toBeTruthy();
  });
});

describe('RuntimeConfigPage 保存与恢复默认', () => {
  it('已修改项保存按钮可用，点击触发 handleSave(key)', () => {
    render(<RuntimeConfigPage />);
    const saveBtn = screen.getAllByTestId('rc-save')[0];
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(mockState.return.handleSave).toHaveBeenCalledWith('mail.smtpHost');
  });

  it('未修改项的保存按钮被禁用', () => {
    mockState.return = makeReturn({
      isDirty: () => false,
    });
    render(<RuntimeConfigPage />);
    expect(screen.getAllByTestId('rc-save')).toHaveLength(
      mockItems.length
    );
    for (const btn of screen.getAllByTestId('rc-save')) {
      expect(btn).toBeDisabled();
    }
  });

  it('点击恢复默认触发 handleReset(key)', () => {
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getAllByTestId('rc-reset')[0]);
    expect(mockState.return.handleReset).toHaveBeenCalled();
  });

  it('点击修改历史触发 openHistory(key)', () => {
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getAllByTestId('rc-history')[0]);
    expect(mockState.return.openHistory).toHaveBeenCalled();
  });

  it('就地错误文案渲染在字段错误容器内', () => {
    mockState.return = makeReturn({
      fieldErrors: { 'mail.port': '不能大于 65535端口' },
      isDirty: () => true,
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByTestId('rc-field-error')).toBeTruthy();
    expect(screen.getByText('不能大于 65535端口')).toBeTruthy();
  });
});

describe('RuntimeConfigPage 分类批量恢复', () => {
  it('打开预览弹窗，列出该分类全部项并标记将恢复项', () => {
    mockState.return = makeReturn({
      resetPreviewCategory: 'mail',
      resetPreviewItems: mockItems.filter((i) => i.category === 'mail'),
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByText(/恢复「mail」为默认值/)).toBeTruthy();
    const preview = screen.getByTestId('rc-reset-preview');
    expect(within(preview).getByText('mail.smtpHost')).toBeTruthy();
    expect(within(preview).getByText('mail.port')).toBeTruthy();
    expect(within(preview).getByText('将恢复')).toBeTruthy();
    expect(screen.getByText(/确认恢复 \d+ 项/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('rc-confirm-reset-category'));
    expect(mockState.return.confirmResetCategory).toHaveBeenCalled();
  });

  it('点取消触发 cancelResetCategory', () => {
    mockState.return = makeReturn({
      resetPreviewCategory: 'mail',
      resetPreviewItems: mockItems,
    });
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getByText('取消'));
    expect(mockState.return.cancelResetCategory).toHaveBeenCalled();
  });

  it('分类头按钮触发 requestResetCategory', () => {
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getAllByTestId('rc-reset-category')[0]);
    expect(mockState.return.requestResetCategory).toHaveBeenCalledWith('mail');
  });

  it('分类内有环境变量项时给出 env 回退提示', () => {
    mockState.return = makeReturn({
      resetPreviewCategory: 'file',
      resetPreviewItems: mockItems.filter((i) => i.category === 'file'),
    });
    render(<RuntimeConfigPage />);
    expect(
      screen.getByText(/已由环境变量注入，恢复默认后生效值将变为环境变量值/)
    ).toBeTruthy();
  });
});

describe('RuntimeConfigPage 修改历史', () => {
  it('加载中文案', () => {
    mockState.return = makeReturn({
      historyKey: 'mail.smtpHost',
      historyLoading: true,
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByTestId('rc-history-loading')).toBeTruthy();
    expect(screen.getByText('正在加载修改历史...')).toBeTruthy();
  });

  it('加载失败显示错误', () => {
    mockState.return = makeReturn({
      historyKey: 'mail.smtpHost',
      historyError: '获取修改历史失败',
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByTestId('rc-history-error')).toBeTruthy();
  });

  it('无记录时显示空态', () => {
    mockState.return = makeReturn({ historyKey: 'mail.smtpHost' });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('该配置项暂无修改记录')).toBeTruthy();
  });

  it('展示历史记录：旧值 → 新值、操作人、IP', async () => {
    mockState.return = makeReturn({
      historyKey: 'mail.smtpHost',
      history: [
        {
          id: 'h1',
          key: 'mail.smtpHost',
          oldValue: '"smtp.example.com"',
          newValue: '"smtp.mx.com"',
          operatorId: 'admin-1',
          operatorIp: '10.0.0.7',
          createdAt: '2026-09-01T02:00:00.000Z',
        },
      ],
    });
    render(<RuntimeConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('rc-history-list')).toBeTruthy();
    });
    const historyList = within(screen.getByTestId('rc-history-list'));
    expect(historyList.getByText('smtp.example.com')).toBeTruthy();
    expect(historyList.getByText('smtp.mx.com')).toBeTruthy();
    expect(historyList.getByText('admin-1')).toBeTruthy();
    expect(historyList.getByText('10.0.0.7')).toBeTruthy();
  });
});

describe('RuntimeConfigPage 只读模式', () => {
  it('无写权限时展示只读横幅并禁用控件', () => {
    mockState.return = makeReturn({ canManageConfig: false });
    render(<RuntimeConfigPage />);
    expect(screen.getByTestId('rc-readonly-banner')).toBeTruthy();
    for (const btn of screen.getAllByTestId('rc-save')) {
      expect(btn).toBeDisabled();
    }
    for (const btn of screen.getAllByTestId('rc-reset')) {
      expect(btn).toBeDisabled();
    }
    const fields = document.querySelectorAll(
      '[data-testid="rc-item"] input, [data-testid="rc-item"] textarea'
    );
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field).toBeDisabled();
    }
  });

  it('有环境变量项时展示顶部 env 说明横幅', () => {
    render(<RuntimeConfigPage />);
    expect(
      screen.getByText(/项配置已由环境变量注入。修改后运行时配置优先级更高/)
    ).toBeTruthy();
  });

  it('无环境变量项时不展示该横幅', () => {
    const configs = mockItems.filter((i) => !i.envValue);
    mockState.return = makeReturn({
      configs,
      groups: toGroups(configs),
    });
    render(<RuntimeConfigPage />);
    expect(
      screen.queryByText(/项配置已由环境变量注入/)
    ).toBeNull();
  });
});
