///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { t } from '@/languages';
import { NotificationProvider } from '@/contexts/NotificationContext';
import '@/config/clientSetup';
import FontLibrary from './index';
import type { FontInfo } from '@/types/filesystem';

// ── hoisted mocks ──────────────────────────────────────────────

const permissionMock = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionMock,
}));
vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => undefined,
}));

// ── 数据工厂 ────────────────────────────────────────────────────

function makeFont(overrides: Partial<FontInfo> = {}): FontInfo {
  return {
    name: '宋体.ttf',
    size: 1024 * 1024,
    extension: 'ttf',
    existsInBackend: true,
    existsInFrontend: false,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    creator: 'admin',
    ...overrides,
  };
}

// ── MSW 覆盖（自动生成 handler 之上按测试覆盖确定数据） ───────────────────

let fontStore: FontInfo[] = [];
let getCalls: string[] = [];
let batchDeleteCalls: Array<{ fileNames: string[]; target?: string }> = [];
let deleteCalls: string[] = [];

/** 默认成功路径：字体列表 / 批量删除 / 单个删除 */
function stubFontApi(overrides: { items?: FontInfo[] } = {}) {
  if (overrides.items) {
    fontStore = overrides.items;
  }
  server.use(
    http.get('/api/v1/font-management', ({ request }) => {
      const url = new URL(request.url);
      getCalls.push(url.searchParams.get('location') ?? '');
      return HttpResponse.json({ code: 0, data: fontStore });
    }),
    http.post('/api/v1/font-management/batch-delete', async ({ request }) => {
      const body = (await request.json()) as {
        fileNames: string[];
        target?: string;
      };
      batchDeleteCalls.push(body);
      const names = new Set(body.fileNames);
      fontStore = fontStore.filter((f) => !names.has(f.name));
      return HttpResponse.json({
        code: 0,
        data: { successCount: body.fileNames.length, failedCount: 0 },
      });
    }),
    http.delete('/api/v1/font-management/:fileName', ({ params }) => {
      const name = String(params.fileName);
      deleteCalls.push(name);
      fontStore = fontStore.filter((f) => f.name !== name);
      return HttpResponse.json({ code: 0, data: {} });
    })
  );
}

// ── 渲染辅助 ─────────────────────────────────────────────────────

function renderPage() {
  return render(
    <NotificationProvider>
      <FontLibrary />
    </NotificationProvider>
  );
}

/** 定位字体卡片：h3 带 title={font.name}（FileNameText 会把文件名拆成 base/extension 两个 span，getByText 匹配不到完整文本，title 是稳定锚点） */
function getFontCard(name: string): HTMLElement {
  return screen.getByTitle(name).closest('[data-node-id]') as HTMLElement;
}

/** 等待字体卡片出现 */
async function findByFontCard(name: string): Promise<HTMLElement> {
  return screen.findByTitle(name);
}

const defaultFonts = [
  makeFont({ name: '宋体.ttf', extension: 'ttf' }),
  makeFont({ name: '黑体.otf', extension: 'otf' }),
  makeFont({ name: 'Arial.woff2', extension: 'woff2' }),
];

describe('FontLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockReturnValue(true);
    fontStore = [...defaultFonts];
    getCalls = [];
    batchDeleteCalls = [];
    deleteCalls = [];
    stubFontApi();
  });

  // ── 1. 列表渲染 ──

  it('渲染页面标题、统计与网格卡片', async () => {
    renderPage();

    expect(await screen.findByText(t('字体库管理'))).toBeInTheDocument();
    expect(screen.getByTitle('宋体.ttf')).toBeInTheDocument();
    expect(screen.getByTitle('黑体.otf')).toBeInTheDocument();
    expect(screen.getByTitle('Arial.woff2')).toBeInTheDocument();
    // 初始无批量操作条
    expect(
      screen.queryByRole('button', { name: t('批量删除') })
    ).not.toBeInTheDocument();
  });

  // ── 2. 点击选中 / Ctrl 切换 / Shift 区间 ──

  it('点击卡片选中：高亮 + 批量操作条出现，Ctrl 点击取消', async () => {
    renderPage();
    await findByFontCard('宋体.ttf');

    fireEvent.click(getFontCard('宋体.ttf'));

    // 批量操作条出现（已选 1 项）
    expect(
      await screen.findByRole('button', { name: t('批量删除') })
    ).toBeInTheDocument();
    expect(screen.getByText(t('取消选择'))).toBeInTheDocument();

    // Ctrl 点击取消选中（无修饰键单击是"清空重选"，保持选中）→ 批量条消失
    fireEvent.click(getFontCard('宋体.ttf'), { ctrlKey: true });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: t('批量删除') })
      ).not.toBeInTheDocument();
    });
  });

  it('Ctrl 点击追加/移除，Shift 区间选择', async () => {
    renderPage();
    await findByFontCard('宋体.ttf');

    // 单击选中 A（清空重选）
    fireEvent.click(getFontCard('宋体.ttf'));
    // Ctrl 点击 B → A + B 同时选中
    fireEvent.click(getFontCard('黑体.otf'), { ctrlKey: true });

    // 批量条计数 = 2（胶囊操作栏文案："已选 2 项" + 数字角标）
    const toolbar = screen
      .getByRole('button', { name: t('批量删除') })
      .closest('.rounded-full.shadow-2xl') as HTMLElement;
    expect(toolbar).toBeInTheDocument();
    expect(toolbar.textContent).toContain(t('已选'));
    expect(toolbar.textContent).toContain('2');

    // Shift 点击 C → A/B/C 区间全选
    fireEvent.click(getFontCard('Arial.woff2'), { shiftKey: true });
    expect(
      screen.getByRole('button', { name: t('批量删除') })
    ).toBeInTheDocument();

    // Ctrl 点击 A 移除 → 剩 B + C
    fireEvent.click(getFontCard('宋体.ttf'), { ctrlKey: true });
    expect(toolbar!.textContent).toContain('2');
  });

  it('Shift 区间选择以当前可见列表为序', async () => {
    renderPage();
    await findByFontCard('宋体.ttf');

    fireEvent.click(getFontCard('宋体.ttf'));
    fireEvent.click(getFontCard('Arial.woff2'), { shiftKey: true });

    // 首尾之间的 3 个全部选中
    const toolbar = screen
      .getByRole('button', { name: t('批量删除') })
      .closest('.rounded-full.shadow-2xl') as HTMLElement;
    expect(toolbar.textContent).toContain('3');
  });

  // ── 3. 快捷键：Ctrl+A / ESC / Delete ──

  it('Ctrl+A 全选，再按一次全不选（toggle）', async () => {
    renderPage();
    await findByFontCard('宋体.ttf');

    fireEvent.keyDown(document, { key: 'a', ctrlKey: true });

    const toolbar = screen
      .getByRole('button', { name: t('批量删除') })
      .closest('.rounded-full.shadow-2xl') as HTMLElement;
    expect(toolbar.textContent).toContain('3');

    fireEvent.keyDown(document, { key: 'a', ctrlKey: true });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: t('批量删除') })
      ).not.toBeInTheDocument();
    });
  });

  it('ESC 清空选择', async () => {
    renderPage();
    await findByFontCard('宋体.ttf');

    fireEvent.click(getFontCard('宋体.ttf'));
    expect(
      await screen.findByRole('button', { name: t('批量删除') })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: t('批量删除') })
      ).not.toBeInTheDocument();
    });
  });

  it('Delete 触发批量删除：确认弹窗 → POST batch-delete 携带选中项', async () => {
    renderPage();
    await findByFontCard('宋体.ttf');

    // 选中两个（单击 + Ctrl 追加）
    fireEvent.click(getFontCard('宋体.ttf'));
    fireEvent.click(getFontCard('黑体.otf'), { ctrlKey: true });

    fireEvent.keyDown(document, { key: 'Delete' });

    // 确认弹窗（真 NotificationProvider 渲染，确认按钮默认文案为"确定"）
    expect(
      await screen.findByText(
        t('确定要删除选中的 {count} 个字体吗？', { count: '2' })
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('确定') }));

    await waitFor(() => {
      expect(batchDeleteCalls).toEqual([
        { fileNames: ['宋体.ttf', '黑体.otf'], target: 'backend' },
      ]);
    });
    expect(screen.getByText(t('批量删除成功'))).toBeInTheDocument();

    // 列表刷新后选中清空，批量条消失
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: t('批量删除') })
      ).not.toBeInTheDocument();
    });
  });

  // ── 4. 单个删除 ──

  it('卡片悬浮删除按钮：确认后调用单删接口并移除选中项', async () => {
    renderPage();
    await findByFontCard('宋体.ttf');

    // 先选中 A 与 B，然后删除 A
    fireEvent.click(getFontCard('宋体.ttf'));
    fireEvent.click(getFontCard('黑体.otf'), { ctrlKey: true });

    // 卡片内删除按钮（悬浮层图标按钮，无原生 title，按 lucide 图标类定位）
    const card = getFontCard('宋体.ttf');
    const deleteBtn = card
      .querySelector('.lucide-trash-2')
      ?.closest('button');
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn as HTMLElement);

    expect(
      await screen.findByText(
        t('确定要删除字体 {name} 吗？', { name: '宋体.ttf' })
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('确定') }));

    await waitFor(() => {
      expect(deleteCalls).toEqual(['宋体.ttf']);
    });
    // 其余选中保留（B 仍在选中集）
    const toolbar = screen
      .getByRole('button', { name: t('批量删除') })
      .closest('.rounded-full.shadow-2xl') as HTMLElement;
    expect(toolbar.textContent).toContain('1');
  });
});
