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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import RuntimeConfigPage, { RuntimeConfigPage as NamedPage } from '../index';
import type { ChannelStatus, ConfigItem, ConfigGroup } from '../types';
import type { DraftValue } from '../validate';
import type { UseRuntimeConfigReturn } from '../hooks/useRuntimeConfig';
import { defaultDraftOf } from '../validate';
import { buildSubgroupSections, channelTestMeta } from '../meta';

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
    subgroups: buildSubgroupSections(category, items),
    modifiedCount: items.filter((i) => i.isModified).length,
  }));
}

const mockItems: ConfigItem[] = [
  item({
    key: 'mail.smtpHost',
    category: 'mail',
    subgroup: 'mail-channel',
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
    subgroup: 'mail-channel',
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
    subgroup: 'mail-channel',
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
  item({
    // 后端定义的 key 不带分类前缀（`brandProfile`），表单分支按此精确匹配
    key: 'brandProfile',
    category: 'brand',
    // title/logo/docsUrl 是 #499/#501 拆出的独立键的旧值：表单不渲染但草稿原样保留；
    // legal.identities 是表单唯一渲染的固定结构之一
    value: {
      title: '品牌名',
      logo: '/logo.png',
      docsUrl: 'https://docs.mx.com/',
      legal: { identities: { 'zh-CN': { entityName: '主体A' } } },
    },
    type: 'json',
    description: '品牌档案',
    source: 'runtime',
    tier: 'user',
    impact: '保存后 PC 与移动端即刻生效',
  }),
  item({
    // #499：Logo 拆为独立配置项，上传入口随项保留
    key: 'brandLogo',
    category: 'brand',
    value: '/logo.png',
    type: 'string',
    description: 'Logo URL',
    tier: 'user',
    input: { maxLength: 200, placeholder: '/logo.png' },
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
vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({ config: { securityMode: 'normal' }, loading: false }),
}));

function makeReturn(
  overrides: Partial<UseRuntimeConfigReturn> = {}
): UseRuntimeConfigReturn {
  const configs = overrides.configs ?? mockItems;
  const groups = overrides.groups ?? toGroups(configs);
  return {
    configs,
    configsByKey:
      overrides.configsByKey ?? new Map(configs.map((c) => [c.key, c])),
    dependencyStatus:
      overrides.dependencyStatus ??
      new Map(
        configs
          .filter((c) => c.requires?.length)
          .map((c) => [
            c.key,
            c.requires!.map((depKey) => {
              const dep = configs.find((d) => d.key === depKey);
              return {
                key: depKey,
                label: dep?.description || depKey,
                satisfied: dep?.value === true,
              };
            }),
          ]),
      ),
    groups,
    loading: false,
    configsError: null,
    retryFetch: vi.fn().mockResolvedValue(undefined),
    drafts: {},
    fieldErrors: {},
    saving: new Set(),
    savingCategory: false,
    modeSwitchTarget: null,
    modePreviewing: false,
    modePreviewTarget: 'secure',
    modePreview: [],
    modeSaving: false,
    resetPreviewCategory: null,
    resetPreviewItems: [],
    historyKey: null,
    history: [],
    historyLoading: false,
    historyError: null,
    collapsed: new Set(),
    keyword: '',
    onlyModified: false,
    advancedCount: configs.filter((c) => c.tier === 'advanced').length,
    showAdvanced: false,
    secretVisible: new Set(),
    canManageConfig: true,
    stats: {
      total: configs.length,
      modified: configs.filter((c) => c.isModified).length,
      envDriven: configs.filter((c) => c.envValue != null).length,
      pendingSave: 0,
      modeManaged: 0,
    },
    setKeyword: vi.fn(),
    setOnlyModified: vi.fn(),
    setShowAdvanced: vi.fn(),
    toggleCollapsed: vi.fn(),
    setAllCollapsed: vi.fn(),
    highlightKey: null,
    focusConfigItem: vi.fn(),
    draftOf: (it) => defaultDraftOf(it),
    isDirty: (it) => it.isModified,
    handleDraftChange: vi.fn(),
    handleFormatJson: vi.fn(),
    handleSave: vi.fn().mockResolvedValue(true),
    handleReset: vi.fn().mockResolvedValue(undefined),
    toggleSecretVisibility: vi.fn(),
    channelStatuses: [],
    channelTesting: new Set(),
    channelTestTarget: null,
    channelTestRecipient: '',
    channelTestResult: null,
    openChannelTest: vi.fn(),
    closeChannelTest: vi.fn(),
    setChannelTestRecipient: vi.fn(),
    confirmChannelTest: vi.fn().mockResolvedValue(undefined),
    requestResetCategory: vi.fn(),
    confirmResetCategory: vi.fn().mockResolvedValue(undefined),
    cancelResetCategory: vi.fn(),
    requestModeSwitch: vi.fn().mockResolvedValue(undefined),
    confirmModeSwitch: vi.fn().mockResolvedValue(undefined),
    cancelModeSwitch: vi.fn(),
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
    // 保存即可生效的说明面向非技术用户，不出现「取值优先级」这类术语
    expect(screen.getByText(/这里保存的值优先于系统预置值/)).toBeTruthy();
    expect(screen.getByTestId('rc-stats')).toBeTruthy();
    const stats = within(screen.getByTestId('rc-stats'));
    expect(stats.getByText('配置项')).toBeTruthy();
    expect(stats.getByText('系统预置')).toBeTruthy();
  });

  it('分类卡片可折叠，折叠后隐藏配置项', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText('mail.smtpHost')).toBeTruthy();

    fireEvent.click(screen.getAllByTestId('rc-card-toggle')[0]);
    expect(mockState.return.toggleCollapsed).toHaveBeenCalledWith('mail');
  });

  it('有子分组的分类渲染小节标题（文案走 i18n），无子分组的分类平铺无标题', () => {
    render(<RuntimeConfigPage />);
    // mock 数据里只有 mail 分类声明了子分组（mail-channel）→ 全页仅一个小节标题
    const titles = screen
      .getAllByTestId('rc-subgroup-title')
      .map((el) => el.textContent);
    expect(titles).toEqual(['邮件通道']);

    const cardOf = (category: string) =>
      screen
        .getAllByTestId('rc-card')
        .find((el) => el.getAttribute('data-category') === category)!;
    expect(within(cardOf('mail')).getByText('邮件通道')).toBeTruthy();
    // brand 分类无子分组：平铺渲染，不出现小节标题
    expect(within(cardOf('brand')).queryAllByTestId('rc-subgroup-title')).toEqual([]);
  });

  it('「折叠全部 / 展开全部」按当前状态切换文案', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getByText('折叠全部')).toBeTruthy();

    mockState.return = makeReturn({
      collapsed: new Set(['mail', 'user', 'file', 'security', 'system', 'brand']),
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('展开全部')).toBeTruthy();
  });

  it('渲染徽标：档位 / 来源 / 危险 / 已修改', () => {
    render(<RuntimeConfigPage />);
    expect(screen.getAllByText('管理项').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('高级项').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('已修改').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('出厂默认').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('即时生效')).toBeNull();
    expect(screen.queryByText('需重启服务')).toBeNull();
    expect(screen.getAllByText('危险').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('已修改').length).toBeGreaterThanOrEqual(3);
  });

  it('配置项标题显示中文说明，JSON 键名作副标题', () => {
    render(<RuntimeConfigPage />);
    const row = rowOf('mail.smtpHost');
    expect(within(row).getByText('SMTP 服务器地址')).toBeTruthy();
    expect(within(row).getByText('mail.smtpHost')).toBeTruthy();
  });

  it('「显示高级项」开关接线：文案含隐藏条数，点击后上报 setShowAdvanced', () => {
    render(<RuntimeConfigPage />);
    // 点中文标签即勾选（label 关联 input，Checkbox 把 data-testid 放在 input 上）
    fireEvent.click(screen.getByText(/显示高级项（2 项）/));
    expect(mockState.return.setShowAdvanced).toHaveBeenCalledWith(true);
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
      within(row).getByText(/此项由系统预置为 200，你在这里保存后会覆盖它/)
    ).toBeTruthy();
    expect(within(row).getByText('恢复出厂后这一项会改由系统预置值接管。')).toBeTruthy();
  });

  it('环境变量项未修改时不出现「恢复默认将改由环境变量生效」提示', () => {
    render(<RuntimeConfigPage />);
    expect(screen.queryByText('恢复出厂后这一项会改由系统预置值接管。')).toBeNull();
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

describe('RuntimeConfigPage 开关依赖状态（检查手段②）', () => {
  const dependentItem = item({
    key: 'requireEmailVerification',
    category: 'mail',
    type: 'boolean',
    value: false,
    description: '强制邮箱验证',
    requires: ['mailEnabled'],
  });

  it('依赖项未满足：渲染依赖项名称与「未满足」', () => {
    mockState.return = makeReturn({
      configs: [
        item({
          key: 'mailEnabled',
          category: 'mail',
          type: 'boolean',
          value: false,
          description: '邮件服务开关',
        }),
        dependentItem,
      ],
    });
    render(<RuntimeConfigPage />);

    const dep = within(rowOf('requireEmailVerification')).getByTestId(
      'rc-dependency',
    );
    expect(dep.textContent).toContain('邮件服务开关');
    expect(dep.textContent).toContain('未满足');
  });

  it('依赖项已满足：渲染「已满足」', () => {
    mockState.return = makeReturn({
      configs: [
        item({
          key: 'mailEnabled',
          category: 'mail',
          type: 'boolean',
          value: true,
          description: '邮件服务开关',
        }),
        dependentItem,
      ],
    });
    render(<RuntimeConfigPage />);

    const dep = within(rowOf('requireEmailVerification')).getByTestId(
      'rc-dependency',
    );
    expect(dep.textContent).toContain('已满足');
  });

  it('未声明依赖的开关不渲染依赖行', () => {
    mockState.return = makeReturn({
      configs: [
        item({
          key: 'mailEnabled',
          category: 'mail',
          type: 'boolean',
          value: true,
          description: '邮件服务开关',
        }),
      ],
    });
    render(<RuntimeConfigPage />);

    expect(
      within(rowOf('mailEnabled')).queryByTestId('rc-dependency'),
    ).toBeNull();
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

  it('brandProfile 渲染为字段级表单而不是 JSON 文本框，编辑走通用草稿链路', () => {
    render(<RuntimeConfigPage />);
    const row = rowOf('brandProfile');

    expect(within(row).getByTestId('rc-brand-profile-form')).toBeTruthy();
    expect(row.querySelectorAll('textarea')).toHaveLength(0);
    // #499/#501：13 个固定路径键拆为独立项后，表单不再渲染它们（含 Logo 上传入口），
    // 只剩 legal.identities 与 apps 两个动态结构
    expect(within(row).queryByTestId('rc-brand-upload-logo')).toBeNull();
    expect(within(row).queryByDisplayValue('https://docs.mx.com/')).toBeNull();

    fireEvent.change(within(row).getByDisplayValue('主体A'), {
      target: { value: '主体B' },
    });
    expect(mockState.return.handleDraftChange).toHaveBeenCalledWith(
      'brandProfile',
      expect.any(String)
    );
  });

  it('brandLogo 渲染为文本输入 + Logo 上传（#499 拆为独立项后保留上传入口）', () => {
    render(<RuntimeConfigPage />);
    const row = rowOf('brandLogo');

    expect(within(row).getByTestId('rc-brand-upload-logo')).toBeTruthy();
    expect(within(row).getByDisplayValue('/logo.png')).toBeTruthy();
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
      screen.getByText(
        /由系统预置：恢复出厂后取值会退回预置值，而不是出厂默认值/
      )
    ).toBeTruthy();
    // 引导语不得再声称「恢复后取值回到代码默认值」——与 env 提示自相矛盾
    expect(
      screen.queryByText(/恢复后取值回到代码默认值/)
    ).toBeNull();
  });

  it('批量恢复预览里标注危险项（分类级一次确认会连危险项一起还原）', () => {
    mockState.return = makeReturn({
      resetPreviewCategory: 'user',
      resetPreviewItems: mockItems.filter((i) => i.category === 'user'),
    });
    render(<RuntimeConfigPage />);
    const preview = screen.getByTestId('rc-reset-preview');
    expect(within(preview).getByText('危险项')).toBeTruthy();
  });

  it('只读权限下分类重置按钮禁用', () => {
    mockState.return = makeReturn({ canManageConfig: false });
    render(<RuntimeConfigPage />);
    const buttons = screen.getAllByTestId('rc-reset-category');
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });
});

describe('RuntimeConfigPage 安全模式切换预览', () => {
  const previewEntry = (
    key: string,
    currentValue: unknown,
    targetValue: unknown,
    willChange = true
  ) => ({
    key,
    type: 'boolean' as const,
    category: 'security',
    currentValue: currentValue as never,
    source: 'runtime' as const,
    targetValue: targetValue as never,
    willChange,
    isModified: false,
    envValue: null,
  });

  it('预览行显示配置项说明，原始 key 降为副标签', () => {
    mockState.return = makeReturn({
      modeSwitchTarget: 'normal',
      modePreview: [
        previewEntry('mail.smtpHost', 'a', 'b'),
        previewEntry('file.maxFileSize', 100, 500),
      ],
    });
    render(<RuntimeConfigPage />);
    const preview = screen.getByTestId('rc-mode-preview');
    // 说明作主标题
    expect(within(preview).getByText('SMTP 服务器地址')).toBeTruthy();
    expect(within(preview).getByText('单个文件大小上限')).toBeTruthy();
    // key 仍保留（.env 排查按 key 找）
    expect(within(preview).getByText('mail.smtpHost')).toBeTruthy();
    expect(within(preview).getByText('file.maxFileSize')).toBeTruthy();
  });

  it('configsByKey 查不到该键时回退显示 key 本身', () => {
    mockState.return = makeReturn({
      modeSwitchTarget: 'normal',
      modePreview: [previewEntry('unknown.key', false, true)],
    });
    render(<RuntimeConfigPage />);
    const preview = screen.getByTestId('rc-mode-preview');
    expect(within(preview).getByText('unknown.key')).toBeTruthy();
    expect(within(preview).getByText('false → true')).toBeTruthy();
  });

  it('无改动的项标注「不变动」', () => {
    mockState.return = makeReturn({
      modeSwitchTarget: 'normal',
      modePreview: [previewEntry('mail.smtpHost', 'a', 'a', false)],
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('不变动')).toBeTruthy();
  });
});

describe('RuntimeConfigPage 首次加载错误态', () => {
  it('拉取失败显示错误与重试，而不是「暂无配置项」', () => {
    mockState.return = makeReturn({
      configs: [],
      groups: [],
      configsError: '网络异常',
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByTestId('rc-error-state')).toBeTruthy();
    expect(screen.getByText('获取配置失败')).toBeTruthy();
    expect(screen.getByText('网络异常')).toBeTruthy();
    expect(screen.queryByText('暂无配置项')).toBeNull();
    fireEvent.click(screen.getByTestId('rc-retry'));
    expect(mockState.return.retryFetch).toHaveBeenCalled();
  });

  it('正常空态仍显示「暂无配置项」', () => {
    mockState.return = makeReturn({ configs: [], groups: [] });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('暂无配置项')).toBeTruthy();
    expect(screen.queryByTestId('rc-error-state')).toBeNull();
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
      screen.getByText(/项配置由系统预置。在这里保存会覆盖预置值/)
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
      screen.queryByText(/项配置由系统预置/)
    ).toBeNull();
  });
});

describe('RuntimeConfigPage 通道测试对话框（按通道能力渲染）', () => {
  /** 回归背景：对话框曾对所有通道套邮件口径（收件人 + 客服邮箱占位），
   * 短信是手机号、微信/支付/Webhook 根本不读接收方 */
  function statusOf(channel: string): ChannelStatus {
    return {
      channel,
      configComplete: true,
      missingKeys: [],
      verified: false,
      verifiedAt: null,
      testedBy: null,
    };
  }

  function cardOf(channel: string) {
    const card = screen
      .getAllByTestId('rc-channel-card')
      .find((el) => el.getAttribute('data-channel') === channel);
    expect(card, `未找到通道卡片 ${channel}`).toBeTruthy();
    return card!;
  }

  it('邮件通道：显示接收方输入框，占位说明留空只校验连接不发信', () => {
    mockState.return = makeReturn({
      channelStatuses: [statusOf('mail')],
      channelTestTarget: 'mail',
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByTestId('rc-channel-test-recipient')).toBeTruthy();
    expect(screen.getByPlaceholderText(/不发送邮件/)).toBeTruthy();
    // 留空不再回落客服邮箱（ADR-0082 D4 修订：留空 = 无副作用验证）
    expect(screen.queryByPlaceholderText(/客服邮箱/)).toBeNull();
  });

  it('短信通道：接收方标签是手机号，占位说明留空只探测不发短信', () => {
    mockState.return = makeReturn({
      channelStatuses: [statusOf('sms')],
      channelTestTarget: 'sms',
    });
    render(<RuntimeConfigPage />);
    expect(screen.getByText('手机号（可选）')).toBeTruthy();
    expect(screen.getByPlaceholderText(/不发送短信/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/客服邮箱/)).toBeNull();
  });

  it('微信/支付/Webhook：不渲染接收方输入框，说明各自探测行为', () => {
    const probes: Array<[string, RegExp]> = [
      ['wechat', /微信凭据探测/],
      ['payment', /不产生订单/],
      ['webhook', /Webhook URL 发送一次 POST/],
    ];
    for (const [channel, note] of probes) {
      mockState.return = makeReturn({
        channelStatuses: [statusOf(channel)],
        channelTestTarget: channel,
      });
      render(<RuntimeConfigPage />);
      expect(
        screen.queryByTestId('rc-channel-test-recipient'),
        `${channel} 通道测试不应出现接收方输入框`
      ).toBeNull();
      expect(
        screen.queryByPlaceholderText(/客服邮箱/),
        `${channel} 通道测试不应出现邮件口径占位`
      ).toBeNull();
      expect(
        screen.getByText(note),
        `${channel} 通道未渲染各自的探测说明`
      ).toBeTruthy();
      cleanup();
    }
  });

  it('每个通道有各自图标，非邮件通道不再共用 Plug 兜底', () => {
    const channels = ['mail', 'sms', 'wechat', 'payment', 'webhook'];
    mockState.return = makeReturn({ channelStatuses: channels.map(statusOf) });
    render(<RuntimeConfigPage />);
    const icons = channels.map(
      (channel) =>
        cardOf(channel).querySelector('svg[class*="lucide-"]')?.getAttribute('class') ?? ''
    );
    expect(icons.length).toBe(5);
    expect(new Set(icons).size, '五张通道卡片的图标应互不相同').toBe(5);
    expect(
      icons.every((cls) => cls.includes('lucide-') && !cls.includes('lucide-plug'))
    ).toBe(true);
  });
});

describe('RuntimeConfigPage 通道缺失键清单（定位 + 格式示例）', () => {
  /** 回归背景：缺失键曾只渲染一串裸键名（smtpHost），用户既找不到对应的
   * 配置项也不知道该填什么格式，补全入口断在「配置不完整」这五个字上 */
  function statusOf(missing: string[]): ChannelStatus {
    return {
      channel: 'mail',
      configComplete: missing.length === 0,
      missingKeys: missing,
      verified: false,
      verifiedAt: null,
      testedBy: null,
    };
  }

  const smtpHostItem: ConfigItem = {
    key: 'smtpHost',
    value: '',
    type: 'string',
    category: 'alert',
    isPublic: false,
    description: 'SMTP 服务器主机',
    tier: 'admin',
    input: { maxLength: 200, placeholder: 'smtp.example.com' },
  };

  it('缺失键渲染中文说明、键名与格式示例，而非只给裸键名', () => {
    mockState.return = makeReturn({
      configs: [smtpHostItem],
      channelStatuses: [statusOf(['smtpHost'])],
    });
    render(<RuntimeConfigPage />);
    const list = screen.getByTestId('rc-missing-keys');
    expect(list.textContent).toContain('SMTP 服务器主机');
    expect(list.textContent).toContain('smtpHost');
    expect(list.textContent).toContain('smtp.example.com');
  });

  it('点击缺失键定位到对应配置项', () => {
    const focusConfigItem = vi.fn();
    mockState.return = makeReturn({
      configs: [smtpHostItem],
      channelStatuses: [statusOf(['smtpHost'])],
      focusConfigItem,
    });
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getByTestId('rc-missing-key'));
    expect(focusConfigItem).toHaveBeenCalledWith('smtpHost');
  });

  it('配置完整时不渲染缺失键清单', () => {
    mockState.return = makeReturn({ channelStatuses: [statusOf([])] });
    render(<RuntimeConfigPage />);
    expect(screen.queryByTestId('rc-missing-keys')).toBeNull();
  });

  it('配置列表查不到该键时回落显示键名，不猜格式示例', () => {
    mockState.return = makeReturn({
      channelStatuses: [statusOf(['smtpHost'])],
    });
    render(<RuntimeConfigPage />);
    const list = screen.getByTestId('rc-missing-keys');
    expect(list.textContent).toContain('smtpHost');
    expect(list.textContent).not.toContain('smtp.example.com');
  });

  it('测试对话框的缺失提示用中文说明而非裸键名', () => {
    mockState.return = makeReturn({
      configs: [smtpHostItem],
      channelStatuses: [statusOf(['smtpHost'])],
      channelTestTarget: 'mail',
    });
    render(<RuntimeConfigPage />);
    expect(
      screen.getByText(/通道配置不完整/).textContent
    ).toContain('SMTP 服务器主机');
  });
});

describe('RuntimeConfigPage 通道测试失败结果（错误文案 + 出错配置项定位）', () => {
  /** 回归背景：测试失败曾只 toast 后端原始文案（如「errcode 40013: invalid
   * appid」），用户看不懂是什么错，也没有到对应配置项的入口；现在对话框
   * 保留错误文案，后端归因的出错配置键渲染为可点击定位的条目 */
  function statusOf(channel: string): ChannelStatus {
    return {
      channel,
      configComplete: true,
      missingKeys: [],
      verified: false,
      verifiedAt: null,
      testedBy: null,
    };
  }

  const wechatAppIdItem: ConfigItem = {
    key: 'wechatAppId',
    value: 'wx_wrong',
    type: 'string',
    category: 'alert',
    isPublic: false,
    description: '微信 AppID',
    tier: 'admin',
    input: { maxLength: 100, placeholder: 'wx1234567890abcdef' },
  };

  it('测试失败：对话框展示错误文案与后端归因的出错配置项（中文说明 + 键名 + 示例）', () => {
    mockState.return = makeReturn({
      configs: [wechatAppIdItem],
      channelStatuses: [statusOf('wechat')],
      channelTestTarget: 'wechat',
      channelTestResult: {
        ok: false,
        message:
          '微信凭据探测失败（errcode 40013：invalid appid rid: xxx）——AppID 不正确：请核对填写的 AppID 与微信公众平台后台一致',
        problemKeys: ['wechatAppId'],
      },
    });
    render(<RuntimeConfigPage />);
    expect(
      screen.getByTestId('rc-test-failure-message').textContent
    ).toContain('errcode 40013');
    const block = screen.getByTestId('rc-test-failure');
    expect(block.textContent).toContain('微信 AppID');
    expect(block.textContent).toContain('wechatAppId');
    expect(block.textContent).toContain('wx1234567890abcdef');
  });

  it('点击出错配置项定位到对应配置项并关闭对话框', () => {
    const focusConfigItem = vi.fn();
    const closeChannelTest = vi.fn();
    mockState.return = makeReturn({
      configs: [wechatAppIdItem],
      channelStatuses: [statusOf('wechat')],
      channelTestTarget: 'wechat',
      channelTestResult: {
        ok: false,
        message: '微信凭据探测失败（errcode 40013）——AppID 不正确',
        problemKeys: ['wechatAppId'],
      },
      focusConfigItem,
      closeChannelTest,
    });
    render(<RuntimeConfigPage />);
    fireEvent.click(screen.getByTestId('rc-test-problem-key'));
    expect(focusConfigItem).toHaveBeenCalledWith('wechatAppId');
    expect(closeChannelTest).toHaveBeenCalled();
  });

  it('后端无法归因出错配置键（problemKeys 为空）：只展示错误文案，不渲染清单', () => {
    mockState.return = makeReturn({
      channelStatuses: [statusOf('wechat')],
      channelTestTarget: 'wechat',
      channelTestResult: {
        ok: false,
        message: '微信 gettoken 探测失败：fetch failed',
        problemKeys: [],
      },
    });
    render(<RuntimeConfigPage />);
    expect(
      screen.getByTestId('rc-test-failure-message').textContent
    ).toContain('fetch failed');
    expect(screen.queryByTestId('rc-test-problem-key')).toBeNull();
  });
});

describe('CHANNEL_TEST_META 通道测试能力表', () => {
  it('接收方能力与后端各通道测试动作一致', () => {
    expect(channelTestMeta('mail').acceptsRecipient).toBe(true);
    expect(channelTestMeta('mail').recipientLabel).toBe('收件人（可选）');
    expect(channelTestMeta('sms').recipientLabel).toBe('手机号（可选）');
    for (const channel of ['wechat', 'payment', 'webhook']) {
      expect(channelTestMeta(channel).acceptsRecipient, channel).toBe(false);
    }
  });

  it('说明文案覆盖后端测试动作的实际行为', () => {
    expect(channelTestMeta('mail').description).toContain('收件人');
    expect(channelTestMeta('sms').description).toContain('短信费用');
    expect(channelTestMeta('wechat').description).toContain('不会向任何人发送消息');
    expect(channelTestMeta('payment').description).toContain('不扣费');
    expect(channelTestMeta('webhook').description).toContain('POST');
  });

  it('未登记通道回落兜底：不渲染接收方输入框且有说明', () => {
    const meta = channelTestMeta('unknown-channel');
    expect(meta.acceptsRecipient).toBe(false);
    expect(meta.description.length).toBeGreaterThan(0);
  });
});
