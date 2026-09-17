/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { describe, expect, it } from 'vitest';
import { ADMIN_LOGIN_PATH } from '@/constants/adminLoginConfig';
import { isConversionPanelRoute } from './conversionPanelRoute';

describe('isConversionPanelRoute', () => {
  it('CAD 编辑器路由显示面板（/ 重定向入口 + /cad-editor + /cad-editor/:fileId）', () => {
    expect(isConversionPanelRoute('/')).toBe(true);
    expect(isConversionPanelRoute('/cad-editor')).toBe(true);
    expect(isConversionPanelRoute('/cad-editor/node-123')).toBe(true);
  });

  it('需登录的后台页显示面板', () => {
    expect(isConversionPanelRoute('/dashboard')).toBe(true);
    expect(isConversionPanelRoute('/projects')).toBe(true);
    expect(isConversionPanelRoute('/admin/ip-access')).toBe(true);
  });

  it('认证公开页不显示面板', () => {
    for (const path of [
      '/login',
      ADMIN_LOGIN_PATH,
      '/logo',
      '/register',
      '/verify-email',
      '/verify-phone',
      '/forgot-password',
      '/reset-password',
    ]) {
      expect(isConversionPanelRoute(path)).toBe(false, path);
    }
  });

  it('合规与设备授权公开页不显示面板', () => {
    for (const path of ['/privacy', '/terms', '/device', '/session-transfer']) {
      expect(isConversionPanelRoute(path)).toBe(false, path);
    }
  });

  it('默认取当前 location.pathname', () => {
    const original = window.location.pathname;
    try {
      window.history.replaceState(null, '', '/forgot-password');
      expect(isConversionPanelRoute()).toBe(false);
      window.history.replaceState(null, '', '/cad-editor');
      expect(isConversionPanelRoute()).toBe(true);
    } finally {
      window.history.replaceState(null, '', original);
    }
  });
});
