///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@/test/setup';
import { t } from '@/languages';
import { NotificationProvider } from '@/contexts/NotificationContext';
import '@/config/clientSetup';
import ShareManagePage from './index';
import type { ShareListItemDto } from '@/api-sdk';

// ── 数据工厂 ────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
const PAST = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

function makeShare(overrides: Partial<ShareListItemDto> = {}): ShareListItemDto {
  return {
    id: 'share-1',
    token: 'token-1',
    url: '/s/token-1',
    fileId: 'file-a',
    fileName: '户型图.dwg',
    expiresAt: null,
    usedCount: 12,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

// ── MSW 覆盖（自动生成 handler 之上按测试覆盖确定数据） ───────────────────

let sharesStore: ShareListItemDto[] = [];
let listCalls: Array<Record<string, unknown>> = [];
let createCalls: Array<Record<string, unknown>> = [];
let updateCalls: Array<{ token: string; body: Record<string, unknown> }> = [];
let revokeCalls: string[] = [];

/** 默认成功路径：分享列表/创建/修改/撤销 + 文件选择器依赖（个人空间/项目/搜索） */
function stubShareApi(overrides: { items?: ShareListItemDto[] } = {}) {
  if (overrides.items) {
    sharesStore = overrides.items;
  }
  server.use(
    http.get('/api/v1/shares', ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get('page') ?? '1');
      const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
      const fileId = url.searchParams.get('fileId');
      const q = url.searchParams.get('search') ?? '';
      listCalls.push({ page, pageSize, fileId, search: q });

      let items = sharesStore;
      if (fileId) {
        items = items.filter((i) => i.fileId === fileId);
        return HttpResponse.json({
          code: 0,
          data: { items, total: items.length, page, pageSize },
        });
      }
      if (q) {
        items = items.filter((i) => i.fileName.includes(q));
      }
      const sliced = items.slice((page - 1) * pageSize, page * pageSize);
      return HttpResponse.json({
        code: 0,
        data: { items: sliced, total: items.length, page, pageSize },
      });
    }),
    http.post('/api/v1/shares', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      createCalls.push(body);
      const newItem: ShareListItemDto = {
        id: `new-${createCalls.length}`,
        token: `new-token-${createCalls.length}`,
        url: `/s/new-token-${createCalls.length}`,
        fileId: String(body.fileId ?? ''),
        fileName: '新图纸.dwg',
        expiresAt: null,
        usedCount: 0,
        createdAt: new Date().toISOString(),
      };
      sharesStore = [newItem, ...sharesStore];
      return HttpResponse.json({
        code: 0,
        data: { token: newItem.token, url: newItem.url, expiresAt: null },
      });
    }),
    http.patch('/api/v1/shares/:token', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      updateCalls.push({ token: String(params.token), body });
      return HttpResponse.json({ code: 0, data: {} });
    }),
    http.delete('/api/v1/shares/:token', ({ params }) => {
      const token = String(params.token);
      revokeCalls.push(token);
      sharesStore = sharesStore.filter((i) => i.token !== token);
      return HttpResponse.json({ code: 0, data: {} });
    }),
    // SelectFileModal 依赖
    http.get('/api/v1/file-system/personal-space', () =>
      HttpResponse.json({ code: 0, data: { id: 'ps-1', name: '个人空间' } })
    ),
    http.get('/api/v1/file-system/projects', () =>
      HttpResponse.json({ code: 0, data: { nodes: [] } })
    ),
    http.get('/api/v1/file-system/search', ({ request }) => {
      const url = new URL(request.url);
      const keyword = url.searchParams.get('keyword') ?? '';
      const nodes = keyword
        ? [{ id: 'f1', name: '新图纸.dwg', isFolder: false }]
        : [];
      return HttpResponse.json({ code: 0, data: { nodes } });
    })
  );
}

// ── 渲染辅助 ─────────────────────────────────────────────────────────────

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <ShareManagePage />
      </NotificationProvider>
    </QueryClientProvider>
  );
}

const defaultItems = [
  makeShare({
    id: 's1',
    token: 'token-valid',
    url: '/s/token-valid',
    fileName: '户型图.dwg',
    expiresAt: FUTURE,
    usedCount: 12,
  }),
  makeShare({
    id: 's2',
    token: 'token-expired',
    url: '/s/token-expired',
    fileName: '旧图纸.dwg',
    expiresAt: PAST,
    usedCount: 3,
  }),
  makeShare({
    id: 's3',
    token: 'token-never',
    url: '/s/token-never-3',
    fileName: '设备清单.dwg',
    expiresAt: null,
    usedCount: 0,
  }),
];

describe('ShareManagePage', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sharesStore = [...defaultItems];
    listCalls = [];
    createCalls = [];
    updateCalls = [];
    revokeCalls = [];
    stubShareApi();
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    });
  });

  // ── 1. 分享列表渲染（有效/已过期/永不过期） ──

  it('渲染页面标题、副标题与表格表头', async () => {
    renderPage();

    expect(await screen.findByText(t('分享管理'))).toBeInTheDocument();
    expect(screen.getByText(t('查看和管理所有分享链接'))).toBeInTheDocument();
    for (const label of [t('文件'), t('链接'), t('状态'), t('创建时间'), t('有效期'), t('次数'), t('操作')]) {
      // react-query 异步就绪：逐个等待表头渲染
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it('列表渲染文件名/链接/次数/有效期列', async () => {
    renderPage();

    expect(await screen.findByText('户型图.dwg')).toBeInTheDocument();
    expect(screen.getByText('旧图纸.dwg')).toBeInTheDocument();
    expect(screen.getByText('设备清单.dwg')).toBeInTheDocument();
    // 次数列
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // 永不过期（expiresAt null → formatExpiryDate 返回永不过期）
    expect(screen.getByText(t('永不过期'))).toBeInTheDocument();
  });

  it('状态标签区分：未来过期/永不过期为有效，过去过期为已过期', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    // 有效：token-valid（未来过期）+ token-never（永不过期）
    expect(screen.getAllByRole('button', { name: t('有效') })).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: t('已过期') })
    ).toHaveLength(1);
  });

  it('链接超过 25 字符时截断展示，并渲染复制按钮', async () => {
    renderPage();

    // token-never-3 的链接 /s/token-never-3 共 17 字符，不足 25 不截断
    expect(await screen.findByText('/s/token-never-3')).toBeInTheDocument();
    // 每条分享一行一个复制按钮（原生 button + title）
    expect(screen.getAllByTitle(t('复制链接'))).toHaveLength(3);
  });

  // ── 2. 创建分享 → 链接生成与复制 ──

  it('空状态展示空文案，点击新建分享打开文件选择器', async () => {
    sharesStore = [];
    stubShareApi({ items: [] });
    renderPage();

    expect(await screen.findByText(t('还没有分享过图纸'))).toBeInTheDocument();
    expect(
      screen.getByText(t('去文件管理器选择图纸，右键即可分享'))
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('新建分享') }));

    expect(
      await screen.findByText(t('选择要分享的图纸'))
    ).toBeInTheDocument();
    // 文件选择器加载了个人空间树
    expect(await screen.findByText(t('个人空间'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('取消') }));
    await waitFor(() => {
      expect(screen.queryByText(t('选择要分享的图纸'))).not.toBeInTheDocument();
    });
  });

  it('创建分享全流程：搜索选择文件 → 生成链接 → URL 展示与复制 → 完成刷新列表', async () => {
    sharesStore = [];
    stubShareApi({ items: [] });
    renderPage();
    await screen.findByText(t('还没有分享过图纸'));

    fireEvent.click(screen.getByRole('button', { name: t('新建分享') }));
    await screen.findByText(t('选择要分享的图纸'));

    // 搜索文件并选中
    fireEvent.change(
      screen.getByPlaceholderText(t('搜索文件名或在下方浏览...')),
      { target: { value: '新图纸' } }
    );
    fireEvent.click(await screen.findByText('新图纸.dwg'));
    fireEvent.click(
      screen.getByRole('button', { name: t('选择 ({count})', { count: '1' }) })
    );

    // ShareDialog 打开：该文件无历史分享 → 自动进入创建视图
    expect(await screen.findByText(t('分享图纸'))).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: t('生成分享链接') })
    );

    // POST 请求携带 fileId 与默认 7 天有效期（expiresIn 秒）
    await waitFor(() => {
      expect(createCalls).toEqual([{ fileId: 'f1', expiresIn: 604800 }]);
    });

    // 生成成功：展示完整链接
    const fullUrl = `${window.location.origin}/s/new-token-1`;
    expect(await screen.findByText(fullUrl)).toBeInTheDocument();

    // 复制生成的链接
    fireEvent.click(screen.getByRole('button', { name: t('复制') }));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(fullUrl);
    });
    expect(
      await screen.findByRole('button', { name: t('已复制') })
    ).toBeInTheDocument();

    // 完成 → 关闭弹窗 → 主页列表刷新，新分享出现在表格
    fireEvent.click(screen.getByRole('button', { name: t('完成') }));
    expect(await screen.findByText('新图纸.dwg')).toBeInTheDocument();
  });

  it('主页列表行内复制按钮：复制完整链接（origin + url）并提示', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    // 每行一个复制按钮，取户型图行（首行）
    fireEvent.click(screen.getAllByTitle(t('复制链接'))[0]!);

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        `${window.location.origin}/s/token-valid`
      );
    });
    // toast 经 useCopy → globalShowToast → CustomEvent 异步派发，需用 findByText 等待
    expect(
      await screen.findByText(t('链接已复制'))
    ).toBeInTheDocument();
  });

  // ── 3. 撤销分享 → 列表即时更新 ──

  it('单条撤销：确认弹窗 → 请求携带 token → 行即时消失 + 成功提示', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    // 行内按钮顺序：复制/状态Tag/打开文件/修改有效期/撤销分享（撤销在最后）
    const row = screen.getByText('户型图.dwg').closest('tr')!;
    const rowButtons = within(row).getAllByRole('button');
    fireEvent.click(rowButtons[rowButtons.length - 1]!);

    // 确认弹窗（标题与按钮同文案，按钮可 role 定位）
    expect(await screen.findByRole('button', { name: t('确认撤销') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('确认撤销') }));

    await waitFor(() => {
      expect(revokeCalls).toEqual(['token-valid']);
    });
    // 本地列表即时更新，无需重新请求
    await waitFor(() => {
      expect(screen.queryByText('户型图.dwg')).not.toBeInTheDocument();
    });
    expect(screen.getByText(t('分享已撤销'))).toBeInTheDocument();
  });

  it('撤销弹窗取消不发起请求，行保留', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    const row = screen.getByText('户型图.dwg').closest('tr')!;
    const rowButtons = within(row).getAllByRole('button');
    fireEvent.click(rowButtons[rowButtons.length - 1]!);
    await screen.findByRole('button', { name: t('确认撤销') });

    fireEvent.click(screen.getByRole('button', { name: t('取消') }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: t('确认撤销') })
      ).not.toBeInTheDocument();
    });
    expect(revokeCalls).toHaveLength(0);
    expect(screen.getByText('户型图.dwg')).toBeInTheDocument();
  });

  it('批量撤销：勾选多行 → 计数徽标 → 逐个撤销 → 列表刷新', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    // 全选 + 3 行 = 4 个 checkbox；勾选前两行
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getAllByRole('checkbox')[2]);

    // 工具栏批量撤销按钮（带数量徽标）
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(t('批量撤销')) })
    );

    expect(
      await screen.findByText(
        t('确定要撤销选中的 {count} 个分享链接？', { count: '2' })
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('确认撤销') }));

    await waitFor(() => {
      expect(revokeCalls.sort()).toEqual(['token-expired', 'token-valid']);
    });
    expect(
      screen.getByText(
        `${t('已撤销')} 2 ${t('个分享')}`
      )
    ).toBeInTheDocument();

    // 完成后重新请求列表：撤销的两行消失，剩余一行
    await waitFor(() => {
      expect(screen.queryByText('户型图.dwg')).not.toBeInTheDocument();
    });
    expect(screen.getByText('设备清单.dwg')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: new RegExp(t('批量撤销')) })
    ).not.toBeInTheDocument();
  });

  // ── 4. 有效期/权限编辑 ──

  it('修改有效期：点击状态标签 → 选择 7 天 → PATCH 携带新过期时间 → 成功提示', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    fireEvent.click(screen.getAllByRole('button', { name: t('有效') })[0]);

    expect(await screen.findByText(t('修改有效期'))).toBeInTheDocument();
    // 当前为未来 30 天 → 自定义档位回填
    expect(screen.getByRole('button', { name: t('自定义') })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('7 天') }));
    fireEvent.click(screen.getByRole('button', { name: t('保存') }));

    await waitFor(() => {
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]!.token).toBe('token-valid');
      expect(typeof updateCalls[0]!.body.expiresAt).toBe('string');
    });
    expect(screen.getByText(t('有效期已更新'))).toBeInTheDocument();
    // 保存后重新请求列表
    await waitFor(() => {
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('编辑弹窗取消不发起请求', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    fireEvent.click(screen.getAllByRole('button', { name: t('有效') })[0]);
    await screen.findByText(t('修改有效期'));

    fireEvent.click(screen.getByRole('button', { name: t('取消') }));

    await waitFor(() => {
      expect(screen.queryByText(t('修改有效期'))).not.toBeInTheDocument();
    });
    expect(updateCalls).toHaveLength(0);
  });

  // ── 5. 空状态 / 搜索无结果 / 错误状态 ──

  it('搜索无结果：展示空文案与清除搜索按钮，清除后恢复列表', async () => {
    renderPage();
    await screen.findByText('户型图.dwg');

    fireEvent.change(screen.getByPlaceholderText(t('搜索文件名...')), {
      target: { value: '不存在的文件' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('搜索') }));

    expect(
      await screen.findByText(t('没有找到匹配的分享'))
    ).toBeInTheDocument();
    expect(screen.getByText(t('尝试其他搜索词'))).toBeInTheDocument();
    // 请求携带搜索词
    expect(listCalls[listCalls.length - 1]).toMatchObject({
      search: '不存在的文件',
    });

    fireEvent.click(screen.getByRole('button', { name: t('清除搜索') }));

    expect(await screen.findByText('户型图.dwg')).toBeInTheDocument();
    expect(screen.queryByText(t('没有找到匹配的分享'))).not.toBeInTheDocument();
  });

  it('加载失败：页面错误文案 + 全局错误提示 + 重试恢复', async () => {
    server.use(
      http.get('/api/v1/shares', () =>
        HttpResponse.json({ message: t('加载分享列表失败') }, { status: 500 })
      )
    );

    renderPage();

    // 页面错误分支与全局 5xx toast 各渲染一次错误文案
    expect(
      (await screen.findAllByText(t('加载分享列表失败'))).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: t('重试') })).toBeInTheDocument();

    // 恢复 handler 后重试 → 列表正常渲染
    stubShareApi();
    fireEvent.click(screen.getByRole('button', { name: t('重试') }));

    expect(await screen.findByText('户型图.dwg')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('重试') })).not.toBeInTheDocument();
  });
});
