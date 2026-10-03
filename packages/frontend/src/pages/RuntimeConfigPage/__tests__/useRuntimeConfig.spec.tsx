///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useRuntimeConfig } from '../hooks/useRuntimeConfig';

/**
 * 数据层单测：拉取归一化、本地校验拦截（不发请求）、危险项二次确认、
 * 单键/分类恢复默认、修改历史、搜索分组与折叠。
 *
 * 断言必须持续读 `hook.result.current`：hook 每次渲染返回新对象，
 * 把返回值冻在局部变量上会读到旧 state。
 */

const {
  getAllConfigs,
  updateConfig,
  resetConfig,
  getConfigHistory,
  resetCategory,
  showToast,
  showConfirm,
} = vi.hoisted(() => ({
  getAllConfigs: vi.fn(),
  updateConfig: vi.fn(),
  resetConfig: vi.fn(),
  getConfigHistory: vi.fn(),
  resetCategory: vi.fn(),
  showToast: vi.fn(),
  showConfirm: vi.fn(),
}));

vi.mock('@/api-sdk', () => ({
  runtimeConfigControllerGetAllConfigs: getAllConfigs,
  runtimeConfigControllerUpdateConfig: updateConfig,
  runtimeConfigControllerResetConfig: resetConfig,
  runtimeConfigControllerGetConfigHistory: getConfigHistory,
  runtimeConfigControllerResetCategory: resetCategory,
}));
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast, showConfirm }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true }),
}));

const ok = (data: unknown) => ({ data, error: undefined });

const DANGEROUS_IMPACT = '关闭后新用户将无法自助注册，已有账号不受影响。';

/** 覆盖全部控件形态的配置项，字段形态与后端 RuntimeConfigResponseDto 一致 */
const rawConfigs = [
  {
    key: 'mail.smtpHost',
    value: 'smtp.example.com',
    type: 'string',
    category: 'mail',
    description: 'SMTP 服务器地址',
    isPublic: false,
    defaultValue: '',
    source: 'default',
    isModified: false,
    envValue: null,
    tier: 'admin',
    input: { maxLength: 100, placeholder: '如 smtp.example.com' },
    dangerous: false,
    hot: true,
  },
  {
    key: 'mail.port',
    value: 2525,
    type: 'number',
    category: 'mail',
    description: 'SMTP 端口',
    isPublic: false,
    defaultValue: 25,
    source: 'runtime',
    isModified: true,
    envValue: null,
    tier: 'admin',
    input: { min: 1, max: 65535, step: 1, unit: '端口' },
    dangerous: false,
    hot: true,
    updatedBy: 'u-1',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    key: 'maxFileSize',
    value: 500,
    type: 'number',
    category: 'file',
    description: '单文件大小上限（MB）',
    isPublic: true,
    defaultValue: 100,
    source: 'env',
    isModified: false,
    envValue: 100,
    tier: 'admin',
    input: { min: 1, max: 5000, step: 10, unit: 'MB' },
    dangerous: false,
    hot: true,
  },
  {
    key: 'user.allowRegister',
    value: false,
    type: 'boolean',
    category: 'user',
    description: '是否开放注册',
    isPublic: true,
    defaultValue: true,
    source: 'runtime',
    isModified: true,
    envValue: null,
    tier: 'user',
    dangerous: true,
    impact: DANGEROUS_IMPACT,
    hot: true,
  },
  {
    key: 'system.logLevel',
    value: 'info',
    type: 'string',
    category: 'system',
    description: '日志级别',
    isPublic: false,
    defaultValue: 'info',
    source: 'default',
    isModified: false,
    envValue: null,
    tier: 'admin',
    input: {
      options: [
        { value: 'debug', label: '调试' },
        { value: 'info', label: '信息' },
      ],
    },
    dangerous: false,
    hot: true,
  },
  {
    key: 'security.corsOrigins',
    value: { allow: ['https://a.example.com'] },
    type: 'json',
    category: 'security',
    description: '允许的跨域来源',
    isPublic: false,
    defaultValue: {},
    source: 'default',
    isModified: false,
    envValue: null,
    tier: 'advanced',
    input: { placeholder: '{"allow":[]}' },
    impact: '配置错误会阻塞所有跨域请求',
    dangerous: false,
    hot: false,
  },
  {
    key: 'experimental.featureFlags',
    value: {},
    type: 'json',
    category: 'experimental',
    description: '未在元数据里登记的分类',
    isPublic: false,
    defaultValue: {},
    source: 'default',
    isModified: false,
    envValue: null,
    tier: 'admin',
    input: {},
    dangerous: false,
    hot: true,
  },
];

const rawHistory = [
  {
    id: 'h-1',
    key: 'mail.port',
    oldValue: JSON.stringify(25),
    newValue: JSON.stringify(2525),
    operatorId: 'u-1',
    operatorIp: '10.0.0.2',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

function setup() {
  return renderHook(() => useRuntimeConfig(), { wrapper });
}

/** 等首屏配置拉取结束，返回 hook 句柄 */
async function load() {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAllConfigs.mockResolvedValue(ok(rawConfigs));
  updateConfig.mockResolvedValue(ok({}));
  resetConfig.mockResolvedValue(ok(null));
  getConfigHistory.mockResolvedValue(ok(rawHistory));
  resetCategory.mockResolvedValue(ok({ success: true, keys: [] }));
  showConfirm.mockResolvedValue(true);
});

describe('useRuntimeConfig', () => {
  describe('拉取与归一化', () => {
    it('首屏拉取一次，归一化后按分类顺序分组，已修改项组内置顶', async () => {
      const hook = await load();
      // 默认收起高级项会让 security 组整组消失，先展开再校验完整分类顺序
      await act(async () => {
        hook.result.current.setShowAdvanced(true);
      });
      const rc = hook.result.current;

      expect(getAllConfigs).toHaveBeenCalledTimes(1);
      expect(rc.stats).toEqual({
        total: 7,
        modified: 2,
        restartRequired: 1,
        envDriven: 1,
        pendingSave: 0,
      });
      // 已登记的分类按元数据顺序；未登记的分类追加在最后
      expect(rc.groups.map((g) => g.category)).toEqual([
        'mail',
        'file',
        'user',
        'system',
        'security',
        'experimental',
      ]);
      expect(rc.groups[0].label).toBe('邮件配置');
      expect(rc.groups[0].items.map((i) => i.key)).toEqual([
        'mail.port',
        'mail.smtpHost',
      ]);
      expect(rc.groups[0].modifiedCount).toBe(1);
      expect(rc.canManageConfig).toBe(true);
    });

    it('未登记的分类回落到分类名本身作为显示名', async () => {
      const hook = await load();
      const group = hook.result.current.groups.find(
        (g) => g.category === 'experimental'
      );
      expect(group?.label).toBe('experimental');
    });

    it('响应不是数组时归一化为空列表，页面不崩溃', async () => {
      getAllConfigs.mockResolvedValue(ok(null));
      const hook = await load();
      expect(hook.result.current.configs).toEqual([]);
      expect(hook.result.current.groups).toEqual([]);
      expect(hook.result.current.stats.total).toBe(0);
    });

    it('SDK 返回错误时弹错误提示并清空列表', async () => {
      getAllConfigs.mockResolvedValue({
        data: undefined,
        error: new Error('boom'),
      });
      const hook = await load();
      expect(hook.result.current.configs).toEqual([]);
      expect(showToast).toHaveBeenCalledWith('boom', 'error');
    });
  });

  describe('本地校验拦截（不发起请求）', () => {
    it('数字超出上限：就地报错，不发请求', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '99999');
      });

      const item = hook.result.current.configs.find((c) => c.key === 'mail.port')!;
      expect(hook.result.current.isDirty(item)).toBe(true);
      expect(hook.result.current.stats.pendingSave).toBe(1);

      let saved = true;
      await act(async () => {
        saved = await hook.result.current.handleSave('mail.port');
      });
      expect(saved).toBe(false);
      expect(updateConfig).not.toHaveBeenCalled();
      expect(hook.result.current.fieldErrors['mail.port']).toBe(
        '不能大于 65535端口'
      );
    });

    it('数字超出下限同样被拦', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '0');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.port');
      });
      expect(hook.result.current.fieldErrors['mail.port']).toBe('不能小于 1端口');
    });

    it('数字输入非数字被拦', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', 'abc');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.port');
      });
      expect(hook.result.current.fieldErrors['mail.port']).toBe('必须是数字');
    });

    it('JSON 项留空（未声明 allowNull）被拦', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('security.corsOrigins', '   ');
      });
      await act(async () => {
        await hook.result.current.handleSave('security.corsOrigins');
      });
      expect(updateConfig).not.toHaveBeenCalled();
      expect(hook.result.current.fieldErrors['security.corsOrigins']).toBe(
        '该项不能为空'
      );
    });

    it('字符串留空是合法取值（后端接受空串），照常提交空串', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', '');
      });
      let saved = false;
      await act(async () => {
        saved = await hook.result.current.handleSave('mail.smtpHost');
      });
      expect(saved).toBe(true);
      expect(updateConfig).toHaveBeenCalledWith({
        path: { key: 'mail.smtpHost' },
        body: { val: '' },
      });
    });

    it('字符串超过 maxLength 被拦', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'x'.repeat(101));
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.smtpHost');
      });
      expect(hook.result.current.fieldErrors['mail.smtpHost']).toBe(
        '不能超过 100 个字符'
      );
    });

    it('枚举取值不在 options 内被拦', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('system.logLevel', 'trace');
      });
      await act(async () => {
        await hook.result.current.handleSave('system.logLevel');
      });
      expect(hook.result.current.fieldErrors['system.logLevel']).toBe(
        '仅支持：debug / info'
      );
    });

    it('JSON 草稿非法：就地报错，不发请求', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('security.corsOrigins', '{oops');
      });
      await act(async () => {
        await hook.result.current.handleSave('security.corsOrigins');
      });
      expect(updateConfig).not.toHaveBeenCalled();
      expect(hook.result.current.fieldErrors['security.corsOrigins']).toBe(
        'JSON 格式不合法，或顶层必须是对象'
      );
    });

    it('JSON 顶层为数组同样被拦（后端只接受对象）', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('security.corsOrigins', '[]');
      });
      await act(async () => {
        await hook.result.current.handleSave('security.corsOrigins');
      });
      expect(hook.result.current.fieldErrors['security.corsOrigins']).toContain(
        '顶层必须是对象'
      );
    });

    it('修改草稿即清除该项就地错误', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '99999');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.port');
      });
      expect(hook.result.current.fieldErrors['mail.port']).toBeTruthy();

      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '25');
      });
      expect(hook.result.current.fieldErrors['mail.port']).toBeUndefined();
    });
  });

  describe('保存', () => {
    it('合法数字草稿以 number 提交，成功后清草稿并提示', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '25');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.port');
      });

      expect(updateConfig).toHaveBeenCalledWith({
        path: { key: 'mail.port' },
        body: { val: 25 },
      });
      expect(showToast).toHaveBeenCalledWith('配置已保存', 'success');
      expect(hook.result.current.drafts['mail.port']).toBeUndefined();
      expect(hook.result.current.fieldErrors['mail.port']).toBeUndefined();
    });

    it('JSON 草稿提交前解析为对象', async () => {
      const hook = await load();
      const next = { allow: ['https://b.example.com'] };
      await act(async () => {
        hook.result.current.handleDraftChange(
          'security.corsOrigins',
          JSON.stringify(next, null, 2)
        );
      });
      await act(async () => {
        await hook.result.current.handleSave('security.corsOrigins');
      });
      expect(updateConfig).toHaveBeenCalledWith({
        path: { key: 'security.corsOrigins' },
        body: { val: next },
      });
    });

    it('保存 maxFileSize 后失效公开配置缓存', async () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('maxFileSize', '800');
      });
      await act(async () => {
        await hook.result.current.handleSave('maxFileSize');
      });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['runtimeConfig', 'public'] });
      spy.mockRestore();
    });

    it('保存任意公开配置项（非 maxFileSize）同样失效公开缓存', async () => {
      // 回归：旧实现硬编码 `if (key !== 'maxFileSize') return`，
      // 导致 mailEnabled / allowRegister 等其余公开项改完不刷新公开响应，
      // 普通用户侧（VIP 导出门控、注册开关、品牌客服）一直看到旧值。
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('user.allowRegister', true);
      });
      await act(async () => {
        await hook.result.current.handleSave('user.allowRegister');
      });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['runtimeConfig', 'public'] });
      spy.mockRestore();
    });

    it('保存非公开配置项不失效公开缓存', async () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'smtp.other.com');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.smtpHost');
      });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('保存后回读走静默刷新，不切全页 loading', async () => {
      const hook = await load();
      const before = hook.result.current.loading;
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'smtp.other.com');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.smtpHost');
      });
      // loading 只在首次拉取时置真；保存后的回读必须静默，
      // 否则整页闪成「正在加载配置...」并丢失滚位
      expect(hook.result.current.loading).toBe(before);
    });

    it('保存成功后重新拉取配置（回读服务端真值）', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '25');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.port');
      });
      expect(getAllConfigs).toHaveBeenCalledTimes(2);
    });

    it('非危险项直接提交，不弹二次确认', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'smtp.other.com');
      });
      await act(async () => {
        await hook.result.current.handleSave('mail.smtpHost');
      });
      expect(showConfirm).not.toHaveBeenCalled();
      expect(updateConfig).toHaveBeenCalledTimes(1);
    });

    it('危险项保存前二次确认，文案包含影响说明；取消则不发请求', async () => {
      showConfirm.mockResolvedValueOnce(false);
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('user.allowRegister', true);
      });

      let saved = true;
      await act(async () => {
        saved = await hook.result.current.handleSave('user.allowRegister');
      });

      expect(saved).toBe(false);
      expect(updateConfig).not.toHaveBeenCalled();
      const option = showConfirm.mock.calls[0]![0];
      expect(option.title).toBe('确认修改危险配置');
      expect(option.message).toContain('即将修改「user.allowRegister」');
      expect(option.message).toContain(DANGEROUS_IMPACT);
      expect(option.type).toBe('warning');
    });

    it('危险项确认后正常提交布尔值', async () => {
      showConfirm.mockResolvedValueOnce(true);
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('user.allowRegister', true);
      });
      await act(async () => {
        await hook.result.current.handleSave('user.allowRegister');
      });
      expect(updateConfig).toHaveBeenCalledWith({
        path: { key: 'user.allowRegister' },
        body: { val: true },
      });
    });

    it('后端拒绝（400）时错误落到对应卡片，同时弹 toast，草稿保留供修正', async () => {
      // 该草稿能过本地校验（长度/类型均合法），因此会真正发出请求
      updateConfig.mockResolvedValueOnce({
        data: undefined,
        error: new Error('该主机名已被占用'),
      });
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'smtp.busy.com');
      });

      let saved = true;
      await act(async () => {
        saved = await hook.result.current.handleSave('mail.smtpHost');
      });

      expect(saved).toBe(false);
      expect(hook.result.current.fieldErrors['mail.smtpHost']).toBe('该主机名已被占用');
      expect(showToast).toHaveBeenCalledWith('该主机名已被占用', 'error');
      expect(hook.result.current.drafts['mail.smtpHost']).toBe('smtp.busy.com');
      expect(hook.result.current.stats.pendingSave).toBe(1);
    });
  });

  describe('恢复默认', () => {
    it('单键恢复默认：取消确认不发请求', async () => {
      showConfirm.mockResolvedValueOnce(false);
      const hook = await load();
      await act(async () => {
        await hook.result.current.handleReset('mail.port');
      });
      expect(resetConfig).not.toHaveBeenCalled();
    });

    it('单键恢复默认：确认后调用接口并清除草稿与就地错误', async () => {
      showConfirm.mockResolvedValueOnce(true);
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '8025');
        hook.result.current.handleDraftChange('mail.smtpHost', 'bad');
      });

      await act(async () => {
        await hook.result.current.handleReset('mail.port');
      });

      expect(resetConfig).toHaveBeenCalledWith({ path: { key: 'mail.port' } });
      expect(showToast).toHaveBeenCalledWith('已恢复默认', 'success');
      expect(hook.result.current.drafts['mail.port']).toBeUndefined();
      // 其它项的草稿不受影响
      expect(hook.result.current.drafts['mail.smtpHost']).toBe('bad');
    });

    it('已由环境变量注入的项，确认文案说明恢复后会退回环境变量值', async () => {
      showConfirm.mockResolvedValueOnce(true);
      const hook = await load();
      await act(async () => {
        await hook.result.current.handleReset('maxFileSize');
      });
      const message = showConfirm.mock.calls[0]![0].message;
      expect(message).toContain('环境变量');
      expect(message).toContain('100');
    });

    it('无环境变量时，确认文案说明此操作不可撤销', async () => {
      showConfirm.mockResolvedValueOnce(true);
      const hook = await load();
      await act(async () => {
        await hook.result.current.handleReset('mail.port');
      });
      expect(showConfirm.mock.calls[0]![0].message).toContain('不可撤销');
    });

    it('分类批量恢复：先预览该分类下的项，确认后调用 reset-category', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('mail.port', '25');
        hook.result.current.handleDraftChange('mail.smtpHost', 'x');
        hook.result.current.requestResetCategory('mail');
      });

      expect(hook.result.current.resetPreviewCategory).toBe('mail');
      expect(hook.result.current.resetPreviewItems.map((i) => i.key)).toEqual([
        'mail.smtpHost',
        'mail.port',
      ]);

      await act(async () => {
        await hook.result.current.confirmResetCategory();
      });

      expect(resetCategory).toHaveBeenCalledWith({ body: { category: 'mail' } });
      expect(showToast).toHaveBeenCalledWith('已恢复默认', 'success');
      expect(hook.result.current.resetPreviewCategory).toBeNull();
      // 只清该分类的草稿，其它分类保留
      expect(hook.result.current.drafts).not.toHaveProperty('mail.port');
      expect(hook.result.current.drafts).not.toHaveProperty('mail.smtpHost');
      expect(hook.result.current.fieldErrors).toEqual({});
    });

    it('未请求预览时 confirmResetCategory 直接返回', async () => {
      const hook = await load();
      await act(async () => {
        await hook.result.current.confirmResetCategory();
      });
      expect(resetCategory).not.toHaveBeenCalled();
    });

    it('cancelResetCategory 关闭预览', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.requestResetCategory('mail');
        hook.result.current.cancelResetCategory();
      });
      expect(hook.result.current.resetPreviewCategory).toBeNull();
      expect(hook.result.current.resetPreviewItems).toEqual([]);
    });
  });

  describe('修改历史', () => {
    it('打开历史拉取并归一化，限制条数为 50', async () => {
      const hook = await load();
      await act(async () => {
        await hook.result.current.openHistory('mail.port');
      });

      expect(getConfigHistory).toHaveBeenCalledWith({
        path: { key: 'mail.port' },
        query: { limit: '50' },
      });
      expect(hook.result.current.historyKey).toBe('mail.port');
      expect(hook.result.current.historyLoading).toBe(false);
      expect(hook.result.current.historyError).toBeNull();
      expect(hook.result.current.history).toEqual([
        expect.objectContaining({
          key: 'mail.port',
          oldValue: '25',
          newValue: '2525',
          operatorId: 'u-1',
          operatorIp: '10.0.0.2',
        }),
      ]);
    });

    it('历史接口失败时记录错误信息而非抛出', async () => {
      getConfigHistory.mockResolvedValue({
        data: undefined,
        error: new Error('网络异常'),
      });
      const hook = await load();
      await act(async () => {
        await hook.result.current.openHistory('mail.port');
      });
      expect(hook.result.current.history).toEqual([]);
      expect(hook.result.current.historyError).toBe('网络异常');
      expect(hook.result.current.historyLoading).toBe(false);
    });

    it('关闭历史面板清空历史与错误', async () => {
      const hook = await load();
      await act(async () => {
        await hook.result.current.openHistory('mail.port');
      });
      await act(async () => {
        hook.result.current.closeHistory();
      });
      expect(hook.result.current.historyKey).toBeNull();
      expect(hook.result.current.history).toEqual([]);
      expect(hook.result.current.historyError).toBeNull();
    });
  });

  describe('搜索、筛选与折叠', () => {
    it('关键字可匹配 key 与描述', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.setKeyword('smtp');
      });
      expect(hook.result.current.groups[0].items.map((i) => i.key)).toEqual([
        'mail.port',
        'mail.smtpHost',
      ]);

      await act(async () => {
        hook.result.current.setKeyword('是否开放注册');
      });
      expect(hook.result.current.groups.flatMap((g) => g.items.map((i) => i.key))).toEqual([
        'user.allowRegister',
      ]);

      // 中文分类名可搜（搜英文 category 原值命中不了用户认知）
      await act(async () => {
        hook.result.current.setKeyword('安全配置');
      });
      expect(hook.result.current.groups.flatMap((g) => g.items.map((i) => i.key))).toEqual([
        'security.corsOrigins',
      ]);

      // 影响说明（改了会怎样）可搜
      await act(async () => {
        hook.result.current.setKeyword('跨域请求');
      });
      expect(hook.result.current.groups.flatMap((g) => g.items.map((i) => i.key))).toEqual([
        'security.corsOrigins',
      ]);

      await act(async () => {
        hook.result.current.setKeyword('   ');
      });
      // 默认收起 1 项高级项（security.corsOrigins）
      expect(hook.result.current.stats.total).toBe(7);
      expect(hook.result.current.groups.flatMap((g) => g.items).length).toBe(6);
    });

    it('默认收起高级项，展开后恢复全量；隐藏时仍可被搜索到', async () => {
      const hook = await load();
      expect(hook.result.current.showAdvanced).toBe(false);
      expect(hook.result.current.advancedCount).toBe(1);
      const keys = () =>
        hook.result.current.groups.flatMap((g) => g.items.map((i) => i.key));
      expect(keys()).not.toContain('security.corsOrigins');

      // 搜索时不隐藏高级项，避免「找不到」
      await act(async () => {
        hook.result.current.setKeyword('corsOrigins');
      });
      expect(keys()).toContain('security.corsOrigins');

      await act(async () => {
        hook.result.current.setKeyword('');
        hook.result.current.setShowAdvanced(true);
      });
      expect(keys()).toContain('security.corsOrigins');
      expect(hook.result.current.groups.flatMap((g) => g.items).length).toBe(7);

      await act(async () => {
        hook.result.current.setShowAdvanced(false);
      });
      expect(hook.result.current.groups.flatMap((g) => g.items).length).toBe(6);
    });

    it('只看已修改项时只保留 isModified 的项', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.setOnlyModified(true);
      });
      const keys = hook.result.current.groups.flatMap((g) => g.items.map((i) => i.key));
      expect(keys).toEqual(['mail.port', 'user.allowRegister']);

      await act(async () => {
        hook.result.current.setOnlyModified(false);
      });
      expect(hook.result.current.groups.flatMap((g) => g.items).length).toBe(6);
    });

    it('折叠分类可切换，也可一键全部折叠/展开', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.toggleCollapsed('mail');
        hook.result.current.toggleCollapsed('mail');
      });
      expect(hook.result.current.collapsed.has('mail')).toBe(false);

      // 展开高级项后「折叠全部」覆盖 security 组（默认收起时它不在可见分组内）
      // 分两次提交：setAllCollapsed 读的是分组 memo，需等上一轮状态算完
      await act(async () => {
        hook.result.current.setShowAdvanced(true);
      });
      await act(async () => {
        hook.result.current.setAllCollapsed(true);
      });
      expect([...hook.result.current.collapsed].sort()).toEqual([
        'experimental',
        'file',
        'mail',
        'security',
        'system',
        'user',
      ]);

      await act(async () => {
        hook.result.current.setAllCollapsed(false);
      });
      expect(hook.result.current.collapsed.size).toBe(0);
    });

    it('secret 项的可见性可切换', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.toggleSecretVisibility('mail.smtpHost');
      });
      expect(hook.result.current.secretVisible.has('mail.smtpHost')).toBe(true);
      await act(async () => {
        hook.result.current.toggleSecretVisibility('mail.smtpHost');
      });
      expect(hook.result.current.secretVisible.has('mail.smtpHost')).toBe(false);
    });
  });

  describe('草稿语义', () => {
    it('初始草稿：布尔取当前值，JSON 格式化为两空格缩进', async () => {
      const hook = await load();
      const boolItem = hook.result.current.configs.find(
        (c) => c.key === 'user.allowRegister'
      )!;
      const jsonItem = hook.result.current.configs.find(
        (c) => c.key === 'security.corsOrigins'
      )!;
      expect(hook.result.current.draftOf(boolItem)).toBe(false);
      expect(hook.result.current.draftOf(jsonItem)).toBe(
        '{\n  "allow": [\n    "https://a.example.com"\n  ]\n}'
      );
    });

    it('仅美化 JSON（无语义变化）不视为已修改', async () => {
      const hook = await load();
      const jsonItem = hook.result.current.configs.find(
        (c) => c.key === 'security.corsOrigins'
      )!;
      await act(async () => {
        hook.result.current.handleDraftChange('security.corsOrigins', '{"allow":["https://a.example.com"]}');
        hook.result.current.handleFormatJson('security.corsOrigins');
      });
      expect(hook.result.current.isDirty(jsonItem)).toBe(false);
      expect(hook.result.current.stats.pendingSave).toBe(0);
    });

    it('handleFormatJson 无法解析时原样保留草稿', async () => {
      const hook = await load();
      await act(async () => {
        hook.result.current.handleDraftChange('security.corsOrigins', '{oops');
        hook.result.current.handleFormatJson('security.corsOrigins');
      });
      expect(hook.result.current.drafts['security.corsOrigins']).toBe('{oops');
    });

    it('把草稿改回与当前值相同不算待保存；留空与非法草稿都算待保存', async () => {
      const hook = await load();
      const item = hook.result.current.configs.find(
        (c) => c.key === 'mail.smtpHost'
      )!;

      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'smtp.other.com');
      });
      expect(hook.result.current.isDirty(item)).toBe(true);
      expect(hook.result.current.stats.pendingSave).toBe(1);

      // 改回当前值：不算变化
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'smtp.example.com');
      });
      expect(hook.result.current.isDirty(item)).toBe(false);
      expect(hook.result.current.stats.pendingSave).toBe(0);

      // 留空对字符串是合法取值（后端接受空串），与当前值不同 → 计为待保存
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', '');
      });
      expect(hook.result.current.isDirty(item)).toBe(true);

      // 非法草稿也计入待保存：否则保存按钮被禁用，用户看不到任何报错原因
      await act(async () => {
        hook.result.current.handleDraftChange('mail.smtpHost', 'smtp.example.com');
        hook.result.current.handleDraftChange('mail.port', '99999');
      });
      const portItem = hook.result.current.configs.find(
        (c) => c.key === 'mail.port'
      )!;
      expect(hook.result.current.isDirty(portItem)).toBe(true);
    });
  });
});
