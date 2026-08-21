import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 被测模块持有模块级状态（lastTriggeredAt / lastToastAt Map），
// 且不导出重置接口（不改生产代码迁就测试）。因此每个用例通过
// vi.resetModules() + 动态 import 获取全新模块实例，避免跨用例状态污染。
const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  globalShowToast: vi.fn(),
  globalShowConfirm: vi.fn(),
}));

vi.mock('@/utils/authCheck', () => ({ isAuthenticated: mocks.isAuthenticated }));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: mocks.globalShowToast,
  globalShowConfirm: mocks.globalShowConfirm,
}));
vi.mock('@/languages', () => ({ t: (key: string) => key }));

type QuotaGuideModule = typeof import('./quotaUpgradeGuide');

async function loadFreshModule(): Promise<QuotaGuideModule> {
  vi.resetModules();
  return await import('./quotaUpgradeGuide');
}

/** 统一时间基准：避免 T0=0 时首触发命中防抖分支（now - last = 0 < DEBOUNCE_MS） */
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

const quotaError = (overrides: Record<string, unknown> = {}) => ({
  code: 'QUOTA_EXCEEDED',
  restrictionKey: 'upload-daily',
  message: '图纸转换过于频繁',
  ...overrides,
});

describe('quotaUpgradeGuide', () => {
  let mod: QuotaGuideModule;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.isAuthenticated.mockReturnValue(false);
    mocks.globalShowConfirm.mockResolvedValue(true);
    vi.spyOn(sessionStorage, 'setItem');
    vi.spyOn(sessionStorage, 'removeItem');
    // mock window.location
    delete (window as Record<string, unknown>).location;
    window.location = { ...originalLocation, href: '' } as Location;
  });

  afterEach(() => {
    vi.useRealTimers();
    window.location = originalLocation;
  });

  describe('isQuotaExceededError', () => {
    it('匹配 QUOTA_EXCEEDED code 返回 true', async () => {
      mod = await loadFreshModule();
      expect(mod.isQuotaExceededError({ code: 'QUOTA_EXCEEDED' })).toBe(true);
    });

    it('其他 code / 非对象 / null / undefined 返回 false', async () => {
      mod = await loadFreshModule();
      expect(mod.isQuotaExceededError({ code: 'FORBIDDEN' })).toBe(false);
      expect(mod.isQuotaExceededError(null)).toBe(false);
      expect(mod.isQuotaExceededError(undefined)).toBe(false);
      expect(mod.isQuotaExceededError('QUOTA_EXCEEDED')).toBe(false);
    });
  });

  describe('handleQuotaExceededError', () => {
    it('非 QUOTA_EXCEEDED code 不提示', async () => {
      mod = await loadFreshModule();
      await mod.handleQuotaExceededError({
        code: 'OTHER_ERROR',
        restrictionKey: 'x',
      });
      expect(mocks.globalShowToast).not.toHaveBeenCalled();
      expect(mocks.globalShowConfirm).not.toHaveBeenCalled();
    });

    it('无 restrictionKey 不提示', async () => {
      mod = await loadFreshModule();
      await mod.handleQuotaExceededError({ code: 'QUOTA_EXCEEDED' });
      expect(mocks.globalShowToast).not.toHaveBeenCalled();
      expect(mocks.globalShowConfirm).not.toHaveBeenCalled();
    });

    it('游客（未登录）→ 弹 confirm 引导登录，确认后存储购买意图并跳转登录页', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(false);
      mocks.globalShowConfirm.mockResolvedValue(true);
      await mod.handleQuotaExceededError(quotaError());
      expect(mocks.globalShowConfirm).toHaveBeenCalledWith({
        title: '需要登录',
        message: '此功能需要VIP会员，是否前往登录并购买？',
        confirmText: '前往登录',
        cancelText: '取消',
      });
      expect(sessionStorage.setItem).toHaveBeenCalledWith(
        'pendingVipPurchase',
        expect.stringContaining('upload-daily')
      );
      expect(window.location.href).toContain('/login?redirect=');
    });

    it('游客取消：不跳转不存储', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(false);
      mocks.globalShowConfirm.mockResolvedValue(false);
      await mod.handleQuotaExceededError(quotaError());
      expect(mocks.globalShowConfirm).toHaveBeenCalled();
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
    });

    it('游客且后端无 message 时使用兜底文案', async () => {
      mod = await loadFreshModule();
      mocks.globalShowConfirm.mockResolvedValue(true);
      await mod.handleQuotaExceededError(quotaError({ message: undefined }));
      expect(mocks.globalShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: '此功能需要VIP会员，是否前往登录并购买？' })
      );
    });

    it('登录用户首次触发 → 弹确认框，确认后派发 QUOTA_GUIDE_EVENT（含详情）', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(true);
      vi.setSystemTime(T0);
      const listener = vi.fn();
      window.addEventListener(mod.QUOTA_GUIDE_EVENT, listener);

      await mod.handleQuotaExceededError(
        quotaError({ current: 10, limit: 5, need: 2 })
      );

      expect(mocks.globalShowConfirm).toHaveBeenCalledTimes(1);
      expect(mocks.globalShowConfirm).toHaveBeenCalledWith({
        title: '需要购买VIP',
        message: '图纸转换过于频繁',
        confirmText: '去购买',
        cancelText: '取消',
      });
      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({
        restrictionKey: 'upload-daily',
        current: 10,
        limit: 5,
        need: 2,
      });
      window.removeEventListener(mod.QUOTA_GUIDE_EVENT, listener);
    });

    it('登录用户确认取消 → 不派发 QUOTA_GUIDE_EVENT', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(true);
      mocks.globalShowConfirm.mockResolvedValue(false);
      vi.setSystemTime(T0);
      const listener = vi.fn();
      window.addEventListener(mod.QUOTA_GUIDE_EVENT, listener);

      await mod.handleQuotaExceededError(quotaError());

      expect(listener).not.toHaveBeenCalled();
      window.removeEventListener(mod.QUOTA_GUIDE_EVENT, listener);
    });

    it('防抖窗口内重复触发 → 降级 warning toast，不再弹确认框', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(true);
      vi.setSystemTime(T0);
      await mod.handleQuotaExceededError(quotaError());
      expect(mocks.globalShowConfirm).toHaveBeenCalledTimes(1);

      vi.setSystemTime(T0 + 2_000); // 2s < DEBOUNCE_MS(5s)，仍在防抖窗口内
      mocks.globalShowConfirm.mockClear();
      await mod.handleQuotaExceededError(quotaError());

      expect(mocks.globalShowConfirm).not.toHaveBeenCalled();
      expect(mocks.globalShowToast).toHaveBeenCalledWith(
        '图纸转换过于频繁',
        'warning'
      );
    });

    it('防抖窗口外再次触发 → 重新弹确认框', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(true);
      vi.setSystemTime(T0);
      await mod.handleQuotaExceededError(quotaError());
      expect(mocks.globalShowConfirm).toHaveBeenCalledTimes(1);

      vi.setSystemTime(T0 + 5_000 + 1); // 超过 DEBOUNCE_MS(5s)
      mocks.globalShowConfirm.mockClear();
      await mod.handleQuotaExceededError(quotaError());
      expect(mocks.globalShowConfirm).toHaveBeenCalledTimes(1);
    });

    it('创建项目（quota.max_projects）防抖窗口内重复触发 → 降级 toast，不再弹确认框', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(true);
      const projectError = () =>
        quotaError({
          restrictionKey: 'quota.max_projects',
          message: '项目数量已达上限',
        });
      vi.setSystemTime(T0);
      await mod.handleQuotaExceededError(projectError());
      expect(mocks.globalShowConfirm).toHaveBeenCalledTimes(1);

      // 5s 防抖窗口内（< DEBOUNCE_MS）重复触发降级为轻提示，避免瞬时刷屏
      vi.setSystemTime(T0 + 2_000);
      mocks.globalShowConfirm.mockClear();
      await mod.handleQuotaExceededError(projectError());
      expect(mocks.globalShowConfirm).not.toHaveBeenCalled();
      expect(mocks.globalShowToast).toHaveBeenCalledWith(
        '项目数量已达上限',
        'warning'
      );
    });

    it('创建项目（quota.max_projects）防抖窗口外再次触发 → 每次都弹确认框', async () => {
      mod = await loadFreshModule();
      mocks.isAuthenticated.mockReturnValue(true);
      const projectError = () =>
        quotaError({
          restrictionKey: 'quota.max_projects',
          message: '项目数量已达上限',
        });
      vi.setSystemTime(T0);
      await mod.handleQuotaExceededError(projectError());
      expect(mocks.globalShowConfirm).toHaveBeenCalledTimes(1);

      // 超过 5s 防抖窗口后再创建项目 → 再次弹升级提醒
      vi.setSystemTime(T0 + 5_000 + 1);
      mocks.globalShowConfirm.mockClear();
      await mod.handleQuotaExceededError(projectError());
      expect(mocks.globalShowConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
