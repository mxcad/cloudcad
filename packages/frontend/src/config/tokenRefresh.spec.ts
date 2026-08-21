///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/api-sdk', () => ({
  authControllerRefreshToken: vi.fn(),
}));

import {
  handleTokenRefreshFailure,
  setSpaNavigate,
  setAuthFailureCallback,
  cancelLoginRedirect,
} from './tokenRefresh';

const spyNavigate = vi.fn();
const spyAuthFailure = vi.fn();

function setPath(path: string) {
  window.history.pushState({}, '', path);
}

describe('handleTokenRefreshFailure', () => {
  beforeEach(() => {
    localStorage.clear();
    setPath('/');
    cancelLoginRedirect();
    spyNavigate.mockClear();
    spyAuthFailure.mockClear();
    setSpaNavigate(spyNavigate);
    setAuthFailureCallback(spyAuthFailure);
  });

  afterEach(() => {
    setPath('/');
    cancelLoginRedirect();
  });

  it('从未登录（无任何 token）时不跳转登录', () => {
    setPath('/cad-editor');
    handleTokenRefreshFailure();
    expect(spyNavigate).not.toHaveBeenCalled();
  });

  it('CAD 公开路由（/cad-editor）上 token 失效时：清除 token 且不跳转登录', () => {
    localStorage.setItem('accessToken', 'expired-access');
    localStorage.setItem('refreshToken', 'expired-refresh');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    localStorage.setItem('personalSpaceId', 'ps-1');
    localStorage.setItem('mxcad-personal-space-id', 'ps-2');
    setPath('/cad-editor');

    handleTokenRefreshFailure();

    expect(spyNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('personalSpaceId')).toBeNull();
    expect(localStorage.getItem('mxcad-personal-space-id')).toBeNull();
    expect(spyAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('CAD 子路由（/cad-editor/:fileId）上 token 失效时：同样不跳转登录', () => {
    localStorage.setItem('accessToken', 'expired-access');
    setPath('/cad-editor/abc-123');

    handleTokenRefreshFailure();

    expect(spyNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('受保护页失败触发跳转后，CAD 路由上的后续失败仍降级为游客模式（不被 isRedirecting 拦截）', () => {
    localStorage.setItem('accessToken', 'expired-access');
    setPath('/projects');
    handleTokenRefreshFailure();
    expect(spyNavigate).toHaveBeenCalled();

    spyNavigate.mockClear();
    localStorage.setItem('accessToken', 'another-expired');
    setPath('/cad-editor');

    handleTokenRefreshFailure();

    expect(spyNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(spyAuthFailure).toHaveBeenCalledTimes(2);
  });

  it('首页路由（/）上 token 失效时：清除 token 且不跳转登录', () => {
    localStorage.setItem('accessToken', 'expired-access');
    setPath('/');

    handleTokenRefreshFailure();

    expect(spyNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(spyAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('公开认证页（/login）上 token 失效时：不跳转也不清 token（保留原行为）', () => {
    localStorage.setItem('accessToken', 'expired-access');
    setPath('/login');

    handleTokenRefreshFailure();

    expect(spyNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBe('expired-access');
    expect(spyAuthFailure).not.toHaveBeenCalled();
  });

  it('受保护路由上 token 失效时：仍然跳转登录（保留原行为）', () => {
    localStorage.setItem('accessToken', 'expired-access');
    setPath('/projects');

    handleTokenRefreshFailure();

    expect(spyNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/login?redirect=')
    );
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(spyAuthFailure).toHaveBeenCalledTimes(1);
  });
});
