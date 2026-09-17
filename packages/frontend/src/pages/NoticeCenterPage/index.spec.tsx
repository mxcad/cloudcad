///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import type React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NoticeCenterPage from './index';
import type { NoticeResponseDto } from '@/api-sdk';

const { listAllMock, createMock, updateMock, retractMock, confirmMock } =
  vi.hoisted(() => ({
    listAllMock: vi.fn(),
    createMock: vi.fn(async () => ({ data: null, error: undefined })),
    updateMock: vi.fn(async () => ({ data: null, error: undefined })),
    retractMock: vi.fn(async () => ({ data: null, error: undefined })),
    confirmMock: vi.fn(async () => true),
  }));

vi.mock('@/api-sdk', () => ({
  noticeCenterControllerListAll: listAllMock,
  noticeCenterControllerCreate: createMock,
  noticeCenterControllerUpdate: updateMock,
  noticeCenterControllerRetract: retractMock,
}));

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn(), showConfirm: confirmMock }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true }),
}));
vi.mock('@/hooks/useDocumentTitle');

/** 真实 hook + react-query 需要 QueryClient；关掉重试避免测试里的失败被自动重放 */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NoticeCenterPage />
    </QueryClientProvider>
  );
}

function makeNotice(
  overrides: Partial<NoticeResponseDto> = {}
): NoticeResponseDto {
  return {
    id: 'n-1',
    kind: 'system',
    level: 'info',
    title: '系统升级通知',
    body: '今晚 23:00 停机 1 小时',
    autoExpire: false,
    publishedAt: '2026-08-06T08:00:00.000Z',
    createdAt: '2026-08-06T08:00:00.000Z',
    updatedAt: '2026-08-06T08:00:00.000Z',
    ...overrides,
  };
}

function openPublishModal() {
  fireEvent.click(screen.getByRole('button', { name: '发布公告' }));
}

describe('NoticeCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('渲染列表：类型/级别/状态标签齐全（状态由时间窗客户端派生）', async () => {
    listAllMock.mockResolvedValueOnce({
      data: [
        makeNotice({
          title: '系统升级通知',
          kind: 'download',
          level: 'warning',
        }),
        // endAt 已过期 → 派生为「已过期」
        makeNotice({
          id: 'n-2',
          title: '上周公告',
          level: 'danger',
          endAt: '2026-08-01T00:00:00.000Z',
        }),
      ],
      error: undefined,
    });

    renderPage();

    expect(await screen.findByText('系统升级通知')).toBeTruthy();
    expect(screen.getByText('上周公告')).toBeTruthy();
    // kind/level 走中文标签映射
    expect(screen.getByText('下载公告')).toBeTruthy();
    expect(screen.getByText('警告')).toBeTruthy();
    expect(screen.getByText('紧急')).toBeTruthy();
    // 两条状态各不相同：一条生效中、一条已过期
    expect(screen.getByText('生效中')).toBeTruthy();
    expect(screen.getByText('已过期')).toBeTruthy();
  });

  it('草稿行「下线」按钮禁用（后端对草稿抛「草稿不能下线」）', async () => {
    listAllMock.mockResolvedValueOnce({
      data: [makeNotice({ id: 'n-draft', publishedAt: undefined })],
      error: undefined,
    });

    renderPage();

    const retractButton = (await screen.findByText('下线')).closest('button')!;
    expect(retractButton).toHaveAttribute('disabled');
  });

  it('发布公告：空标题/空正文被前置校验拦下，不发请求', async () => {
    listAllMock.mockResolvedValueOnce({ data: [], error: undefined });

    renderPage();
    openPublishModal();

    fireEvent.click(screen.getByRole('button', { name: '立即发布' }));

    expect(screen.getByText('请输入标题')).toBeTruthy();
    expect(screen.getByText('请输入正文')).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('发布公告：提交体恒含 publishNow:true 且不含 userId（仅广播）', async () => {
    listAllMock.mockResolvedValueOnce({ data: [], error: undefined });

    renderPage();
    openPublishModal();

    fireEvent.change(
      screen.getByPlaceholderText('如：系统将于 30 分钟后停机维护'),
      { target: { value: '计划停机维护' } }
    );
    fireEvent.change(screen.getByPlaceholderText('公告正文，支持换行'), {
      target: { value: '今晚 23:00 停机 1 小时' },
    });
    fireEvent.click(screen.getByRole('button', { name: '立即发布' }));

    // mutationFn 在 react-query 内部异步调度，须 waitFor 等 API 调用落定
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        body: {
          kind: 'system',
          level: 'info',
          title: '计划停机维护',
          body: '今晚 23:00 停机 1 小时',
          publishNow: true,
          autoExpire: false,
        },
      })
    );
    const sentBody = createMock.mock.calls[0][0].body;
    expect(sentBody).not.toHaveProperty('userId');
  });

  it('启用自动过期但未填失效时间被拦下（对齐后端 autoExpire 校验）', async () => {
    listAllMock.mockResolvedValueOnce({ data: [], error: undefined });

    renderPage();
    openPublishModal();

    fireEvent.change(
      screen.getByPlaceholderText('如：系统将于 30 分钟后停机维护'),
      { target: { value: '计划停机维护' } }
    );
    fireEvent.change(screen.getByPlaceholderText('公告正文，支持换行'), {
      target: { value: '今晚 23:00 停机 1 小时' },
    });
    fireEvent.click(screen.getByText('到期自动下线（需填写失效时间）'));
    fireEvent.click(screen.getByRole('button', { name: '立即发布' }));

    expect(screen.getByText('启用自动过期必须填写失效时间')).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('编辑：只提交 level/title/body（多传时间窗后端 forbidNonWhitelisted 会 400）', async () => {
    listAllMock.mockResolvedValueOnce({ data: [makeNotice()], error: undefined });

    renderPage();

    fireEvent.click(
      (await screen.findByText('编辑')).closest('button')!
    );
    // 编辑态：类型禁用、时间窗只读、提交按钮文案切换
    expect(screen.getByText('编辑公告')).toBeTruthy();
    expect(screen.getByText('需要调整时间窗，请下线后重新发布。')).toBeTruthy();
    expect(screen.queryByText('立即发布')).toBeNull();

    fireEvent.change(
      screen.getByPlaceholderText('如：系统将于 30 分钟后停机维护'),
      { target: { value: '计划停机维护（已延期）' } }
    );
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        path: { id: 'n-1' },
        body: {
          level: 'info',
          title: '计划停机维护（已延期）',
          body: '今晚 23:00 停机 1 小时',
        },
      })
    );
    expect(Object.keys(updateMock.mock.calls[0][0].body)).toHaveLength(3);
  });

  it('下线：确认弹窗通过后调用 retract 接口', async () => {
    listAllMock.mockResolvedValueOnce({ data: [makeNotice()], error: undefined });

    renderPage();

    fireEvent.click((await screen.findByText('下线')).closest('button')!);
    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '下线公告', type: 'warning' })
      );
    });
    await waitFor(() => {
      expect(retractMock).toHaveBeenCalledWith({ path: { id: 'n-1' } });
    });
  });

  it('下线：取消确认则不发请求', async () => {
    confirmMock.mockResolvedValueOnce(false);
    listAllMock.mockResolvedValueOnce({ data: [makeNotice()], error: undefined });

    renderPage();

    fireEvent.click((await screen.findByText('下线')).closest('button')!);
    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
    });
    expect(retractMock).not.toHaveBeenCalled();
  });
});
