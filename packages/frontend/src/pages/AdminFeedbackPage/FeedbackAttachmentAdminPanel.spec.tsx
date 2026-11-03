import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockList = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const mockBatchRemove = vi.hoisted(() => vi.fn());
vi.mock('@/api-sdk', () => ({
  feedbackAttachmentAdminControllerList: (...args: unknown[]) => mockList(...args),
  feedbackAttachmentAdminControllerRemove: (...args: unknown[]) => mockRemove(...args),
  feedbackAttachmentAdminControllerBatchRemove: (...args: unknown[]) => mockBatchRemove(...args),
}));

const mockShowConfirm = vi.hoisted(() => vi.fn());
const mockShowToast = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: mockShowToast, showConfirm: mockShowConfirm }),
}));

vi.mock('@/languages', () => ({
  t: (k: string, params?: Record<string, unknown>) =>
    k.replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? '')),
}));

vi.mock('@/components/feedback/attachmentActions', () => ({
  canViewAttachment: () => true,
  canDownloadAttachment: () => true,
  useAttachmentActions: () => ({
    handleView: vi.fn(),
    handleDownload: vi.fn(),
    previewModal: null,
  }),
}));

vi.mock('@/components/feedback/FeedbackAttachmentList', () => ({
  FeedbackAttachmentList: ({ attachments }: { attachments: { fileName: string | null }[] }) => (
    <span data-testid="att-name">{attachments[0]?.fileName ?? ''}</span>
  ),
}));

// SelectableTable 简化为受控多选容器（真实组件依赖框选/滚动分页，单测覆盖选择内核即可）
vi.mock('@/components/common/SelectableTable', () => ({
  SelectableTable: ({
    rows,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    renderRow,
    renderHeader,
    bottomBar,
    paginationMeta,
    onPageChange,
  }: {
    rows: { id: string }[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string, ctrl?: boolean, shift?: boolean) => void;
    onToggleSelectAll: () => void;
    renderRow: (row: { id: string }, ctx: unknown) => ReactNode;
    renderHeader: () => ReactNode;
    bottomBar?: ReactNode;
    paginationMeta?: { page: number; totalPages: number };
    onPageChange?: (p: number) => void;
  }) => (
    <div>
      <table>
        <thead>
          <tr>
            {renderHeader()}
            <th>
              <button data-testid="toggle-all" onClick={onToggleSelectAll}>
                all
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-testid={`row-${r.id}`}
              onClick={(e) => onToggleSelect(r.id, e.ctrlKey, e.shiftKey)}
            >
              {renderRow(r, { isRubberBanding: false, rubberBandJustEndedRef: { current: false } })}
              <td>
                <span data-testid={`sel-${r.id}`}>
                  {selectedIds.has(r.id) ? 'sel' : ''}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bottomBar}
      {paginationMeta && onPageChange && (
        <button
          data-testid="page-next"
          onClick={() => onPageChange(paginationMeta.page + 1)}
        >
          next
        </button>
      )}
    </div>
  ),
}));

// BatchActionBar 简化为批量操作栏（显示计数 + 动作按钮）
vi.mock('@/components/common/BatchActionBar', () => ({
  BatchActionBar: ({
    count,
    onClear,
    actions,
  }: {
    count: number;
    onClear: () => void;
    actions: { key: string; label: ReactNode; onClick: () => void }[];
  }) => (
    <div data-testid="batch-bar">
      <span>已选 {count} 项</span>
      {actions.map((a) => (
        <button key={a.key} data-testid={`batch-${a.key}`} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
      <button onClick={onClear}>取消选择</button>
    </div>
  ),
}));

import { FeedbackAttachmentAdminPanel } from './FeedbackAttachmentAdminPanel';
import type { FeedbackAttachmentDto } from '@/api-sdk';

function baseAtt(id: string, over: Partial<FeedbackAttachmentDto> = {}): FeedbackAttachmentDto {
  return {
    id,
    feedbackId: 'fb-1',
    type: 'IMAGE',
    kind: 'FILE',
    fileName: `${id}.png`,
    mimeType: 'image/png',
    size: 1024,
    nodeId: null,
    fileHash: null,
    region: null,
    thumbnailUrl: null,
    viewUrl: null,
    downloadUrl: null,
    uploadedByName: null,
    createdAt: '2026-11-02T00:00:00Z',
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={qc}>
      <FeedbackAttachmentAdminPanel />
    </QueryClientProvider>
  );
  return { qc, ...view };
}

function mockListResponse(items: FeedbackAttachmentDto[], total = items.length) {
  mockList.mockResolvedValue({
    data: { items, total },
  });
}

describe('FeedbackAttachmentAdminPanel 多选 + 批量删除（SelectableTable 体系）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShowConfirm.mockResolvedValue(true);
    mockBatchRemove.mockResolvedValue({ data: { deleted: 2, notFoundIds: [] } });
    // total=25 触发分页渲染（翻页清空选择用例需要 page-next）
    mockListResponse(
      [baseAtt('a1'), baseAtt('a2', { type: 'DRAWING', kind: 'REFERENCE' })],
      25
    );
  });

  afterEach(() => cleanup());

  it('渲染列表行为每一行提供行（renderRow 输出）', async () => {
    renderPanel();
    expect(await screen.findByText('a1.png')).toBeTruthy();
    expect(screen.getByText('a2.png')).toBeTruthy();
  });

  it('点击一行选中 → 批量操作栏显示「已选 1 项」', async () => {
    renderPanel();
    const row = await screen.findByTestId('row-a1');
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('已选 1 项')).toBeTruthy());
    expect(screen.getByTestId('batch-delete')).toBeTruthy();
  });

  it('全选 → 批量栏显示「已选 2 项」', async () => {
    renderPanel();
    await screen.findByTestId('row-a1');
    fireEvent.click(screen.getByTestId('toggle-all'));
    await waitFor(() => expect(screen.getByText('已选 2 项')).toBeTruthy());
  });

  it('批量删除确认 → 调 batchRemove 并清空选择', async () => {
    renderPanel();
    await screen.findByTestId('row-a1');
    fireEvent.click(screen.getByTestId('toggle-all'));
    await screen.findByText('已选 2 项');
    fireEvent.click(screen.getByTestId('batch-delete'));
    await waitFor(() =>
      expect(mockBatchRemove).toHaveBeenCalledWith(
        expect.objectContaining({ body: { ids: ['a1', 'a2'] } })
      )
    );
    // 成功后选择清空
    await waitFor(() => expect(screen.queryByText('已选 2 项')).toBeNull());
    expect(mockShowToast).toHaveBeenCalledWith('已删除 2 个附件', 'success');
  });

  it('批量删除取消 → 不调 batchRemove', async () => {
    mockShowConfirm.mockResolvedValue(false);
    renderPanel();
    await screen.findByTestId('row-a1');
    fireEvent.click(screen.getByTestId('toggle-all'));
    await screen.findByText('已选 2 项');
    fireEvent.click(screen.getByTestId('batch-delete'));
    await waitFor(() => expect(mockBatchRemove).not.toHaveBeenCalled());
  });

  it('翻页 → 清空选择', async () => {
    renderPanel();
    await screen.findByTestId('row-a1');
    fireEvent.click(screen.getByTestId('toggle-all'));
    await screen.findByText('已选 2 项');
    fireEvent.click(screen.getByTestId('page-next'));
    await waitFor(() => expect(screen.queryByText('已选 2 项')).toBeNull());
  });

  it('Delete 快捷键 → 触发批量删除确认', async () => {
    renderPanel();
    await screen.findByTestId('row-a1');
    fireEvent.click(screen.getByTestId('toggle-all'));
    await screen.findByText('已选 2 项');
    fireEvent.keyDown(document, { key: 'Delete' });
    await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled());
  });

  it('ESC 快捷键 → 清空选择', async () => {
    renderPanel();
    await screen.findByTestId('row-a1');
    fireEvent.click(screen.getByTestId('toggle-all'));
    await screen.findByText('已选 2 项');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('已选 2 项')).toBeNull());
  });
});
