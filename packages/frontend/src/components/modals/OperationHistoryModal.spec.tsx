import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OperationHistoryModal } from './OperationHistoryModal';
import type { AuditLog } from '@/utils/auditActionTemplates';

vi.mock('../ui/Modal', () => ({
  Modal: ({
    isOpen,
    onClose,
    children,
    title,
  }: {
    isOpen?: boolean;
    onClose?: () => void;
    children?: React.ReactNode;
    title?: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <div data-testid="modal-content">{children}</div>
      </div>
    );
  },
}));

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    variant?: string;
    disabled?: boolean;
  }) => (
    <button data-testid={`button-${variant || 'default'}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../ui/UserAvatar', () => ({
  UserAvatar: ({ name }: { name?: string }) => (
    <span data-testid="user-avatar">{name}</span>
  ),
}));

vi.mock('../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ui/DatePicker', () => ({
  DatePicker: () => <div data-testid="date-picker" />,
}));

vi.mock('../ui/Select', () => ({
  Select: () => <div data-testid="select" />,
}));

vi.mock('../ui/Input', () => ({
  Input: () => <div data-testid="input" />,
}));

vi.mock('../ui/Pagination', () => ({
  Pagination: () => <div data-testid="pagination" />,
}));

vi.mock('lucide-react', () => {
  const icon = () => <span data-testid="icon" />;
  return {
    AlertCircle: icon,
    ArrowLeftRight: icon,
    Copy: icon,
    Crown: icon,
    ExternalLink: icon,
    FileEdit: icon,
    FilePlus: icon,
    FolderOpen: icon,
    FolderPlus: icon,
    FolderX: icon,
    History: icon,
    Loader2: icon,
    MapPin: icon,
    MoveRight: icon,
    PenLine: icon,
    RefreshCw: icon,
    RotateCcw: icon,
    Settings2: icon,
    Share2: icon,
    Shield: icon,
    ShieldPlus: icon,
    ShieldX: icon,
    Trash2: icon,
    UserCog: icon,
    UserMinus: icon,
    UserPlus: icon,
  };
});

vi.mock('@/api-sdk', () => ({
  memberControllerGetProjectMembers: vi.fn().mockResolvedValue({ data: [] }),
  projectAuditLogControllerFindByProject: vi.fn(),
  nodeControllerGetParentContext: vi.fn(),
}));

import {
  memberControllerGetProjectMembers,
  projectAuditLogControllerFindByProject,
  nodeControllerGetParentContext,
} from '@/api-sdk';

const mockLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: 'log-1',
  action: 'FILE_CREATE',
  resourceType: 'FILE',
  resourceId: 'node-1',
  projectId: 'proj-1',
  resourceName: 'drawing.dwg',
  params: { fileName: 'drawing.dwg', nodeId: 'node-1' },
  userId: 'user-1',
  user: { id: 'user-1', email: 'a@b.com', username: 'zhangsan', nickname: '张三' },
  ipAddress: null,
  userAgent: null,
  success: true,
  errorMessage: null,
  createdAt: '2026-08-14T10:00:00.000Z',
  ...overrides,
});

function renderModal(projectName?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OperationHistoryModal
        isOpen
        projectId="proj-1"
        projectName={projectName}
        onClose={() => {}}
      />
    </QueryClientProvider>
  );
}

describe('OperationHistoryModal（项目操作历史）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (memberControllerGetProjectMembers as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
    });
  });

  it('标题展示项目名 + 操作历史', () => {
    renderModal('我的项目');
    expect(screen.getByText('我的项目 · 操作历史')).not.toBeNull();
  });

  it('渲染记录并按时间分组（今天/更早）', async () => {
    // 动态生成时间戳：固定日期会随真实日期漂移导致"今天"分组失败
    const nowIso = (offsetHours: number) =>
      new Date(Date.now() - offsetHours * 3600_000).toISOString();
    (projectAuditLogControllerFindByProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        total: 2,
        logs: [
          mockLog({ createdAt: nowIso(1) }), // 今天（1 小时前）
          mockLog({
            id: 'log-2',
            action: 'FOLDER_CREATE',
            resourceName: '设计图纸',
            params: { fileName: '设计图纸' },
            createdAt: nowIso(4 * 24), // 更早（4 天前）
          }),
        ],
      },
    });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('新增图纸')).not.toBeNull();
    });
    expect(screen.getByText('新建文件夹')).not.toBeNull();
    expect(screen.getByText('今天')).not.toBeNull();
    expect(screen.getByText('更早')).not.toBeNull();
    expect(screen.getAllByText('张三').length).toBeGreaterThan(0);
  });

  it('点击文件记录 → 新标签页打开所在位置（带 highlight 定位）', async () => {
    (projectAuditLogControllerFindByProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { total: 1, logs: [mockLog()] },
    });
    (nodeControllerGetParentContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { parentId: 'folder-1', pageNumber: 2 },
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderModal();
    await waitFor(() => expect(screen.getByText('新增图纸')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /新增图纸/ }));

    await waitFor(() => {
      expect(nodeControllerGetParentContext).toHaveBeenCalledWith({
        path: { nodeId: 'node-1' },
        query: { pageSize: 30 },
      });
    });
    expect(openSpy).toHaveBeenCalledWith(
      '/projects/proj-1/files/folder-1?highlight=node-1&page=2',
      '_blank',
      'noopener'
    );
    openSpy.mockRestore();
  });

  it('定位失败兜底打开项目根目录', async () => {
    (projectAuditLogControllerFindByProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { total: 1, logs: [mockLog()] },
    });
    (nodeControllerGetParentContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: { message: 'boom' },
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderModal();
    await waitFor(() => expect(screen.getByText('新增图纸')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /新增图纸/ }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('/projects/proj-1/files', '_blank', 'noopener');
    });
    openSpy.mockRestore();
  });

  it('无记录时显示空态', async () => {
    (projectAuditLogControllerFindByProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { total: 0, logs: [] },
    });

    renderModal();

    await waitFor(() => expect(screen.getByText('暂无操作记录')).not.toBeNull());
  });
});
