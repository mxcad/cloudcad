///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import IpAccessControlPage from './index';

// ── hoisted mocks ──────────────────────────────────────────────
const permState = vi.hoisted(() => ({ set: new Set<string>() }));
const permissionMock = vi.hoisted(() => ({
  hasPermission: (perm: string) => permState.set.has(perm),
}));
const childProps = vi.hoisted(() => ({
  blacklist: null as { embedded?: boolean } | null,
  whitelist: null as { embedded?: boolean } | null,
  attempts: null as { embedded?: boolean } | null,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionMock,
}));
vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => undefined,
}));
vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars
      ? m.replace(/\{(\w+)\}/g, (_match: string, key: string) =>
          vars[key] !== undefined ? vars[key] : ''
        )
      : m,
}));
vi.mock('@/components/ui', () => ({
  Tabs: ({ children }: { className?: string; children: ReactNode }) => (
    <div data-testid="tabs">{children}</div>
  ),
  TabButton: ({
    active,
    onClick,
    children,
  }: {
    active?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }) => (
    <button type="button" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  ),
}));
// 子页面替换为标记节点：只验证容器的 Tab 门控与路由行为，不触发真实 API
vi.mock('../IpBlacklistPage', () => ({
  default: (props: { embedded?: boolean }) => {
    childProps.blacklist = props;
    return <div>BLACKLIST_TAB</div>;
  },
}));
vi.mock('../IpWhitelistPage', () => ({
  default: (props: { embedded?: boolean }) => {
    childProps.whitelist = props;
    return <div>WHITELIST_TAB</div>;
  },
}));
vi.mock('../SecurityAccessAttemptPage', () => ({
  default: (props: { embedded?: boolean }) => {
    childProps.attempts = props;
    return <div>ATTEMPTS_TAB</div>;
  },
}));

// 读取当前 URL，验证 Tab 切换写回查询参数
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname + location.search}</span>;
}

function renderPage(initialPath = '/admin/ip-access') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <IpAccessControlPage />
      <LocationProbe />
    </MemoryRouter>
  );
}

const BLACKLIST = 'SYSTEM_IP_BLACKLIST_MANAGE';
const WHITELIST = 'SYSTEM_IP_WHITELIST_MANAGE';

describe('IpAccessControlPage', () => {
  beforeEach(() => {
    permState.set.clear();
    childProps.blacklist = null;
    childProps.whitelist = null;
    childProps.attempts = null;
  });

  it('两项权限齐全时渲染三个 Tab，默认落在白名单（与登录落点一致）', () => {
    permState.set.add(BLACKLIST);
    permState.set.add(WHITELIST);

    renderPage();

    expect(screen.getByText('IP 访问控制')).toBeInTheDocument();
    expect(screen.getByText('IP 黑名单')).toBeInTheDocument();
    expect(screen.getByText('管理员 IP 白名单')).toBeInTheDocument();
    expect(screen.getByText('高危访问尝试')).toBeInTheDocument();
    expect(screen.getByText('WHITELIST_TAB')).toBeInTheDocument();
    expect(screen.queryByText('BLACKLIST_TAB')).not.toBeInTheDocument();
    expect(screen.queryByText('ATTEMPTS_TAB')).not.toBeInTheDocument();
  });

  it('URL 查询参数指定 Tab 时按其渲染', () => {
    permState.set.add(BLACKLIST);
    permState.set.add(WHITELIST);

    renderPage('/admin/ip-access?tab=attempts');

    expect(screen.getByText('ATTEMPTS_TAB')).toBeInTheDocument();
    expect(screen.queryByText('WHITELIST_TAB')).not.toBeInTheDocument();
  });

  it('点击 Tab 写回 URL 查询参数', () => {
    permState.set.add(BLACKLIST);
    permState.set.add(WHITELIST);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '高危访问尝试' }));

    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/admin/ip-access?tab=attempts'
    );
    expect(screen.getByText('ATTEMPTS_TAB')).toBeInTheDocument();
  });

  it('无黑名单权限时不渲染该 Tab，指定非法 Tab 回退到默认 Tab', () => {
    permState.set.add(WHITELIST);

    renderPage('/admin/ip-access?tab=blacklist');

    expect(screen.queryByText('IP 黑名单')).not.toBeInTheDocument();
    expect(screen.getByText('管理员 IP 白名单')).toBeInTheDocument();
    expect(screen.getByText('WHITELIST_TAB')).toBeInTheDocument();
  });

  it('只有黑名单权限时仅渲染黑名单 Tab 并默认选中', () => {
    permState.set.add(BLACKLIST);

    renderPage();

    expect(screen.queryByText('管理员 IP 白名单')).not.toBeInTheDocument();
    expect(screen.queryByText('高危访问尝试')).not.toBeInTheDocument();
    expect(screen.getByText('BLACKLIST_TAB')).toBeInTheDocument();
  });

  it('只渲染激活的 Tab 内容并以 embedded 模式传给子页面', () => {
    permState.set.add(BLACKLIST);
    permState.set.add(WHITELIST);

    renderPage();

    expect(childProps.whitelist).toEqual({ embedded: true });
    expect(childProps.blacklist).toBeNull();
    expect(childProps.attempts).toBeNull();
  });
});
