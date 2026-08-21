import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  globalShowConfirm: vi.fn(),
}));

vi.mock('@/utils/authCheck', () => ({ isAuthenticated: mocks.isAuthenticated }));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowConfirm: mocks.globalShowConfirm,
}));
vi.mock('@/languages', () => ({ t: (key: string) => key }));

import {
  VIP_FEATURE_REQUIRED_CODE,
  isVipFeatureRequiredError,
  canExportDownload,
  handleVipFeatureRequiredError,
} from './vipFeatureGuide';

describe('vipFeatureGuide', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(sessionStorage, 'setItem');
    vi.spyOn(sessionStorage, 'removeItem');
    // mock window.location
    delete (window as Record<string, unknown>).location;
    window.location = { ...originalLocation, href: '' } as Location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  describe('isVipFeatureRequiredError', () => {
    it('识别 VIP_FEATURE_REQUIRED 业务码', () => {
      expect(
        isVipFeatureRequiredError({ code: VIP_FEATURE_REQUIRED_CODE })
      ).toBe(true);
    });

    it('不识别其他错误', () => {
      expect(isVipFeatureRequiredError({ code: 'QUOTA_EXCEEDED' })).toBe(false);
      expect(isVipFeatureRequiredError(new Error('boom'))).toBe(false);
      expect(isVipFeatureRequiredError(null)).toBe(false);
    });
  });

  describe('canExportDownload', () => {
    it('VIP 或开关开放即可导出', () => {
      expect(canExportDownload(true, false)).toBe(true);
      expect(canExportDownload(false, true)).toBe(true);
      expect(canExportDownload(true, true)).toBe(true);
    });

    it('非 VIP 且开关关闭不可导出', () => {
      expect(canExportDownload(false, false)).toBe(false);
    });
  });

  describe('handleVipFeatureRequiredError', () => {
    it('游客：弹 confirm 引导登录，确认后存储购买意图并跳转登录页', async () => {
      mocks.isAuthenticated.mockReturnValue(false);
      mocks.globalShowConfirm.mockResolvedValue(true);

      await handleVipFeatureRequiredError(undefined, '会员专属功能');

      expect(mocks.globalShowConfirm).toHaveBeenCalledWith({
        title: '需要登录',
        message: '此功能需要VIP会员，是否前往登录并购买？',
        confirmText: '前往登录',
        cancelText: '取消',
      });
      expect(sessionStorage.setItem).toHaveBeenCalledWith(
        'pendingVipPurchase',
        expect.stringContaining('export_download')
      );
      expect(window.location.href).toContain('/login?redirect=');
    });

    it('游客取消：不跳转不存储', async () => {
      mocks.isAuthenticated.mockReturnValue(false);
      mocks.globalShowConfirm.mockResolvedValue(false);

      await handleVipFeatureRequiredError(undefined, '会员专属功能');

      expect(mocks.globalShowConfirm).toHaveBeenCalled();
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
    });

    it('登录用户确认后派发购买弹窗事件', async () => {
      mocks.isAuthenticated.mockReturnValue(true);
      mocks.globalShowConfirm.mockResolvedValue(true);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      await handleVipFeatureRequiredError(undefined, '会员专属功能');

      expect(mocks.globalShowConfirm).toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cloudcad:quota-guide' })
      );
    });

    it('登录用户取消：不派发事件', async () => {
      mocks.isAuthenticated.mockReturnValue(true);
      mocks.globalShowConfirm.mockResolvedValue(false);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      await handleVipFeatureRequiredError();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
