import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// ── 可控 mock ──
const mockQuery = vi.hoisted(() => vi.fn());
const mockListMine = vi.hoisted(() => vi.fn());
vi.mock('@/api-sdk', () => ({
  feedbackControllerQueryByCode: (...a: unknown[]) => mockQuery(...a),
  feedbackControllerListMine: (...a: unknown[]) => mockListMine(...a),
}));

const mockAuth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockAuth.isAuthenticated }),
}));

// 富文本简化：正文直出、strip 去标签
vi.mock('@/components/richtext', () => ({
  RichContentView: ({ html }: { html: string }) => <div data-testid="rich">{html}</div>,
  stripHtmlTags: (html: string) => html.replace(/<[^>]+>/g, ''),
}));

// Button/Input 简化为原生元素，避免图标/样式依赖
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => (
    <button data-testid="query-btn" onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/Input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
  }) => <input value={value} onChange={onChange} placeholder={placeholder} />,
}));

vi.mock('@/languages', () => ({ t: (k: string) => k }));

import { FeedbackQueryPanel } from './FeedbackQueryPanel';
import type { FeedbackResponseDto } from '@/api-sdk';

function seedLocalRecords(records: Array<Record<string, unknown>>) {
  localStorage.setItem('feedback_local_records', JSON.stringify(records));
}

function baseLocalRecord(over: Record<string, unknown> = {}) {
  return {
    code: 'FB-20261102-ABCDEF12',
    title: '本地反馈',
    type: 'BUG',
    contentHtml: '<p>本地内容</p>',
    contact: '',
    createdAt: '2026-11-02T10:00:00.000Z',
    source: 'PC',
    anonymous: true,
    ...over,
  };
}

function baseCloudRecord(over: Partial<FeedbackResponseDto> = {}): FeedbackResponseDto {
  return {
    id: 'fb-1',
    type: 'SUGGESTION',
    status: 'ADOPTED',
    title: '云端反馈',
    content: '<p>云端内容</p>',
    source: 'PC',
    submitterId: 'u-1',
    submitterName: 'user',
    contact: null,
    pageUrl: null,
    feedbackCode: 'FB-20261102-CLOUD01',
    reviewedById: null,
    reviewedAt: null,
    adoptNote: null,
    rejectReason: null,
    rewardStatus: 'ISSUED',
    claimRequired: false,
    reward: null,
    attachments: [],
    createdAt: '2026-11-02T09:00:00.000Z',
    updatedAt: '2026-11-02T09:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.isAuthenticated = false;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('FeedbackQueryPanel 我的反馈记录列表（查询码非必填）', () => {
  it('未登录 + 有本地记录 → 打开即展示列表，不请求云端', () => {
    seedLocalRecords([baseLocalRecord()]);
    render(<FeedbackQueryPanel />);
    expect(screen.getByText('本地反馈')).toBeTruthy();
    expect(screen.getByText('本地')).toBeTruthy();
    expect(mockListMine).not.toHaveBeenCalled();
  });

  it('已登录 → 挂载即拉取云端列表（page 1 size 50）', async () => {
    mockAuth.isAuthenticated = true;
    mockListMine.mockResolvedValue({ data: { items: [baseCloudRecord()], total: 1 } });
    render(<FeedbackQueryPanel />);
    await waitFor(() => expect(mockListMine).toHaveBeenCalledTimes(1));
    const call = mockListMine.mock.calls[0][0] as { query: { page: number; pageSize: number } };
    expect(call.query.page).toBe(1);
    expect(call.query.pageSize).toBe(50);
  });

  it('点击本地记录 → 凭码+已存联系方式查询云端进度', async () => {
    seedLocalRecords([baseLocalRecord({ contact: '13800000000' })]);
    mockQuery.mockResolvedValue({
      data: {
        feedbackCode: 'FB-20261102-ABCDEF12',
        status: 'REVIEWING',
        type: 'BUG',
        title: '本地反馈',
        content: '<p>本地内容</p>',
        rewardStatus: 'NONE',
        claimRequired: false,
        createdAt: '2026-11-02T10:00:00.000Z',
        attachments: [],
      },
    });
    render(<FeedbackQueryPanel />);
    fireEvent.click(screen.getByText('本地反馈'));
    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
    const call = mockQuery.mock.calls[0][0] as {
      path: { code: string };
      query: { contact?: string };
    };
    expect(call.path.code).toBe('FB-20261102-ABCDEF12');
    expect(call.query.contact).toBe('13800000000');
    // 渲染云端进度卡片
    await waitFor(() => expect(screen.getByText('处理中')).toBeTruthy());
  });

  it('点击本地记录查询失败 → 降级本地预览（含提示）', async () => {
    seedLocalRecords([baseLocalRecord()]);
    mockQuery.mockRejectedValue(new Error('not found'));
    render(<FeedbackQueryPanel />);
    fireEvent.click(screen.getByText('本地反馈'));
    await waitFor(() => expect(screen.getByText('本地记录仅保存在本设备，登录后可查看云端完整记录')).toBeTruthy());
    // 列表项 + 本地预览标题各一处
    expect(screen.getAllByText('本地反馈').length).toBeGreaterThanOrEqual(1);
  });

  it('手动查询命中 NOT_FOUND + 码匹配本机记录 → 降级本地预览（不报错）', async () => {
    seedLocalRecords([baseLocalRecord({ code: 'FB-20261102-AGDNB8PN' })]);
    // 模拟后端 404 响应体（GlobalExceptionFilter getErrorCode(404) → code NOT_FOUND）
    mockQuery.mockRejectedValue({ code: 'NOT_FOUND', message: '反馈不存在或查询码无效' });
    render(<FeedbackQueryPanel />);
    const codeInput = screen.getByPlaceholderText('请输入提交时获得的查询码') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: 'FB-20261102-AGDNB8PN' } });
    fireEvent.click(screen.getByTestId('query-btn'));
    // 降级为本地预览弹窗（标题+本地快照提示），不显示错误
    await waitFor(() => expect(screen.getByText('反馈详情')).toBeTruthy());
    expect(screen.getByText('本地记录仅保存在本设备，登录后可查看云端完整记录')).toBeTruthy();
    expect(screen.queryByText('反馈不存在或查询码无效')).toBeNull();
  });

  it('手动查询命中 NOT_FOUND + 已填联系方式 → 保留报错（可能是联系方式不匹配）', async () => {
    seedLocalRecords([baseLocalRecord({ code: 'FB-20261102-AGDNB8PN' })]);
    mockQuery.mockRejectedValue({ code: 'NOT_FOUND', message: '反馈不存在或查询码无效' });
    render(<FeedbackQueryPanel />);
    const codeInput = screen.getByPlaceholderText('请输入提交时获得的查询码') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: 'FB-20261102-AGDNB8PN' } });
    const contactInput = screen.getByPlaceholderText('提交时填写过联系方式则需匹配') as HTMLInputElement;
    fireEvent.change(contactInput, { target: { value: 'wrong@x.com' } });
    fireEvent.click(screen.getByTestId('query-btn'));
    await waitFor(() => expect(screen.getByText('反馈不存在或查询码无效')).toBeTruthy());
    expect(screen.queryByText('反馈详情')).toBeNull();
  });

  it('点击云端记录 → 直接渲染详情，不再走 queryByCode', async () => {
    mockAuth.isAuthenticated = true;
    mockListMine.mockResolvedValue({ data: { items: [baseCloudRecord()], total: 1 } });
    render(<FeedbackQueryPanel />);
    await waitFor(() => expect(screen.getByText('云端反馈')).toBeTruthy());
    fireEvent.click(screen.getByText('云端反馈'));
    expect(mockQuery).not.toHaveBeenCalled();
    // 列表徽标 + 结果卡片各一处「已采纳」
    await waitFor(() => expect(screen.getAllByText('已采纳').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText('已发放')).toBeTruthy();
  });

  it('点击记录 → 详情在独立弹窗呈现（列表仍在，无需滚动面板底部）', async () => {
    mockAuth.isAuthenticated = true;
    mockListMine.mockResolvedValue({ data: { items: [baseCloudRecord()], total: 1 } });
    render(<FeedbackQueryPanel />);
    await waitFor(() => expect(screen.getByText('云端反馈')).toBeTruthy());
    fireEvent.click(screen.getByText('云端反馈'));
    // 详情弹窗标题出现
    await waitFor(() => expect(screen.getByText('反馈详情')).toBeTruthy());
    // 详情内容（奖励状态）与列表项同时可见——详情不再只渲染在面板底部
    expect(screen.getByText('已发放')).toBeTruthy();
    expect(screen.getAllByText('云端反馈').length).toBeGreaterThanOrEqual(2);
  });

  it('关闭详情弹窗 → 回到查询面板（列表保留）', async () => {
    mockAuth.isAuthenticated = true;
    mockListMine.mockResolvedValue({ data: { items: [baseCloudRecord()], total: 1 } });
    render(<FeedbackQueryPanel />);
    await waitFor(() => expect(screen.getByText('云端反馈')).toBeTruthy());
    fireEvent.click(screen.getByText('云端反馈'));
    await waitFor(() => expect(screen.getByText('反馈详情')).toBeTruthy());
    const closeBtn = document.querySelector(
      '[data-tour="modal-close-btn"]'
    ) as HTMLButtonElement | null;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    await waitFor(() => expect(screen.queryByText('反馈详情')).toBeNull());
    // 关闭后列表项仍在
    expect(screen.getByText('云端反馈')).toBeTruthy();
  });
});
