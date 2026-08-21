import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AuditLogPage from './index';
import { usePermission } from '../../hooks/usePermission';

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock('@/languages', () => ({
  t: (
    message: string,
    vars?: Record<string, string | undefined>
  ): string =>
    vars
      ? message.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
      : message,
}));
vi.mock('@/hooks/useDocumentTitle');
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showToast: showToastMock,
    showConfirm: vi.fn(),
  }),
}));
vi.mock('../../hooks/usePermission', () => ({
  usePermission: vi.fn(() => ({ hasPermission: () => true })),
}));
vi.mock('@/components/ui/DatePicker', () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (v: string | undefined) => void;
    placeholder?: string;
  }) => (
    <input
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value || undefined)}
    />
  ),
}));

const mockLogs = [
  {
    id: 'log-1',
    action: 'UPDATE_MEMBER',
    resourceType: 'PROJECT',
    resourceId: 'resource-uuid-1',
    projectId: 'project-uuid-1',
    resourceName: '厂区规划',
    params: {
      targetUserName: '李工',
      oldRoleName: '查看者',
      newRoleName: '编辑者',
    },
    userId: 'user-1',
    user: {
      id: 'user-1',
      email: 'zhang@example.com',
      username: 'zhanggong',
      nickname: '张工',
    },
    ipAddress: null,
    userAgent: null,
    success: true,
    errorMessage: null,
    createdAt: '2026-08-11T08:00:00.000Z',
  },
  {
    id: 'log-2',
    action: 'FILE_DELETE',
    resourceType: 'FILE',
    resourceId: 'file-uuid-2',
    projectId: 'project-uuid-1',
    resourceName: null,
    params: { fileName: '立面图.dwg' },
    userId: 'user-1',
    user: {
      id: 'user-1',
      email: 'zhang@example.com',
      username: 'zhanggong',
      nickname: '张工',
    },
    ipAddress: '127.0.0.1',
    userAgent: null,
    success: false,
    errorMessage: '权限不足',
    createdAt: '2026-08-11T09:00:00.000Z',
  },
];

const listValue = {
  logs: mockLogs,
  total: 2,
  loading: false,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
};

const statsValue = {
  statistics: { total: 2, successCount: 1, failureCount: 1, successRate: 50 },
  loading: false,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
};

const projectsValue = {
  projects: [{ id: 'project-uuid-1', name: '厂区规划' }],
  loading: false,
};

vi.mock('./hooks/useAuditLog', () => ({
  useAuditLogList: () => listValue,
  useAuditLogStats: () => statsValue,
  useAuditProjectOptions: () => projectsValue,
}));

describe('AuditLogPage', () => {
  it('渲染列表：操作列按 action 模板渲染可读文案', () => {
    render(<AuditLogPage />);

    expect(
      screen.getByText('张工 将 李工 的角色从 查看者 改为 编辑者')
    ).toBeTruthy();
    expect(screen.getByText('张工 删除文件 立面图.dwg')).toBeTruthy();
  });

  it('资源列显示 resourceName 快照（不再裸 UUID），ID 作为次要信息', () => {
    render(<AuditLogPage />);

    expect(screen.getByText('厂区规划')).toBeTruthy();
    // 无 resourceName 的日志回退展示 resourceId
    expect(screen.getByText('file-uuid-2')).toBeTruthy();
  });

  it('详情列显示失败原因', () => {
    render(<AuditLogPage />);
    expect(screen.getAllByText('权限不足').length).toBeGreaterThan(0);
  });

  it('项目维度过滤下拉展示项目名称', () => {
    render(<AuditLogPage />);
    // 资源列（resourceName）与项目下拉均展示项目名
    expect(screen.getAllByText('厂区规划').length).toBeGreaterThan(0);
  });

  it('动作枚举过滤跟随精简后清单（含新增高价值动作）', () => {
    render(<AuditLogPage />);
    // 打开「操作类型」下拉（第一个 combobox）验证选项
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]);
    expect(screen.getByText('转让项目')).toBeTruthy();
    expect(screen.getByText('更新项目设置')).toBeTruthy();
    expect(screen.getByText('加入 IP 黑名单')).toBeTruthy();
    expect(screen.getByText('修改密码')).toBeTruthy();
  });
});

describe('AuditLogPage 筛选行为', () => {
  beforeEach(() => {
    showToastMock.mockClear();
  });

  afterEach(() => {
    // 恢复列表数据，避免影响后续用例
    listValue.logs = mockLogs;
    listValue.total = 2;
  });

  it('开始日期晚于结束日期时提示且不更新筛选', () => {
    render(<AuditLogPage />);
    const startInput = screen.getByPlaceholderText(
      '开始日期'
    ) as HTMLInputElement;
    const endInput = screen.getByPlaceholderText(
      '结束日期'
    ) as HTMLInputElement;
    // 先设结束日期，再设更晚的开始日期 → 触发校验提示
    fireEvent.change(endInput, { target: { value: '2026-08-10' } });
    fireEvent.change(startInput, { target: { value: '2026-08-11' } });
    expect(showToastMock).toHaveBeenCalledWith(
      '开始日期不能晚于结束日期',
      'warning'
    );
    // 非法值被拒绝写入：开始日期输入框回弹为空（未更新筛选）
    expect(startInput.value).toBe('');
  });

  it('仅时间筛选无结果时显示时间范围提示', () => {
    listValue.logs = [];
    listValue.total = 0;
    render(<AuditLogPage />);
    const startInput = screen.getByPlaceholderText(
      '开始日期'
    ) as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-08-01' } });
    expect(
      screen.getByText('所选时间范围内暂无记录，请调整时间范围')
    ).toBeTruthy();
  });

  it('时间与操作类型叠加筛选无结果时显示通用提示（不误导归因于时间）', () => {
    listValue.logs = [];
    listValue.total = 0;
    render(<AuditLogPage />);
    const startInput = screen.getByPlaceholderText(
      '开始日期'
    ) as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-08-01' } });
    // 叠加一个操作类型筛选（打开操作类型下拉并选择一项）
    fireEvent.click(screen.getAllByRole('combobox')[0]);
    fireEvent.click(screen.getByRole('option', { name: '删除文件' }));
    expect(screen.getByText('没有找到符合筛选条件的记录')).toBeTruthy();
  });

  it('非时间筛选无结果时显示通用提示', () => {
    listValue.logs = [];
    listValue.total = 0;
    const { container } = render(<AuditLogPage />);
    const textInputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="text"]'
    );
    fireEvent.change(textInputs[0], { target: { value: 'user-1' } });
    expect(screen.getByText('没有找到符合筛选条件的记录')).toBeTruthy();
  });
});

describe('AuditLogPage 权限', () => {
  it('无 SYSTEM_ADMIN 权限时显示无权限提示', () => {
    vi.mocked(usePermission).mockReturnValue({
      hasPermission: () => false,
    });
    render(<AuditLogPage />);
    expect(screen.getByText('您没有访问审计日志的权限')).toBeTruthy();
  });
});

describe('AuditLogPage 多选与批量导出（ADR-0052 统一机制）', () => {
  const createObjectURLMock = vi.hoisted(() => vi.fn(() => 'blob:mock'));

  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectURLMock,
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    showToastMock.mockClear();
    // 权限 describe 的 mockReturnValue 会持续生效，此处重置回管理员
    vi.mocked(usePermission).mockReturnValue({
      hasPermission: () => true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    createObjectURLMock.mockClear();
    listValue.logs = mockLogs;
    listValue.total = 2;
  });

  it('行点击选中后出现批量操作条（已选计数 + 导出 CSV）', () => {
    render(<AuditLogPage />);
    fireEvent.click(screen.getByText('张工 删除文件 立面图.dwg'));
    expect(screen.getByText('已选 1 项')).toBeTruthy();
    expect(screen.getByText('导出 CSV')).toBeTruthy();
  });

  it('Ctrl+A 全选后导出：逐行生成 CSV 并提示导出数量', () => {
    render(<AuditLogPage />);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    expect(screen.getByText('已选 2 项')).toBeTruthy();

    fireEvent.click(screen.getByText('导出 CSV'));
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith(
      '已导出 2 条日志',
      'success'
    );
  });

  it('审计日志只读：Delete 快捷键不产生任何动作', () => {
    render(<AuditLogPage />);
    fireEvent.click(screen.getByText('张工 删除文件 立面图.dwg'));
    fireEvent.keyDown(document.body, { key: 'Delete' });
    // 选择保持、无确认弹窗、无导出
    expect(screen.getByText('已选 1 项')).toBeTruthy();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('筛选变化后清空选择', () => {
    render(<AuditLogPage />);
    fireEvent.click(screen.getByText('张工 删除文件 立面图.dwg'));
    expect(screen.getByText('已选 1 项')).toBeTruthy();

    const startInput = screen.getByPlaceholderText(
      '开始日期'
    ) as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-08-01' } });
    expect(screen.queryByText(/已选/)).toBeNull();
  });
});
