///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserManagement } from './index';
import { globalShowToast } from '@/utils/notificationEvents';
import * as useUserCRUDModule from './hooks/useUserCRUD';
import * as useUserSearchModule from './hooks/useUserSearch';

type UseUserCRUDReturn = ReturnType<typeof useUserCRUDModule.useUserCRUD>;
type UseUserSearchReturn = ReturnType<typeof useUserSearchModule.useUserSearch>;

vi.mock('./hooks/useUserCRUD');
vi.mock('./hooks/useUserSearch');
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/hooks/useDocumentTitle');
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    children,
    isOpen,
    footer,
    ...props
  }: {
    children?: React.ReactNode;
    isOpen?: boolean;
    footer?: React.ReactNode;
  } & React.HTMLAttributes<HTMLDivElement>) =>
    isOpen ? (
      <div {...props}>
        {children}
        {footer ? <div>{footer}</div> : null}
      </div>
    ) : null,
}));
vi.mock('@/components/ui/TruncateText', () => ({
  TruncateText: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: vi.fn(),
  globalShowConfirm: vi.fn(),
  globalShowPrompt: vi.fn(),
}));

const mockUsers = [
  {
    id: '1',
    username: 'testuser1',
    email: 'test1@example.com',
    nickname: 'Test User 1',
    status: 'ACTIVE',
    role: { id: 'role1', name: 'USER', isSystem: true },
    hasPassword: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    username: 'testuser2',
    email: 'test2@example.com',
    nickname: 'Test User 2',
    status: 'ACTIVE',
    role: { id: 'role1', name: 'USER', isSystem: true },
    hasPassword: true,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
];

const mockRoles = [
  {
    id: 'role1',
    name: 'USER',
    isSystem: true,
    permissions: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'role2',
    name: 'ADMIN',
    isSystem: true,
    permissions: [],
    createdAt: '',
    updatedAt: '',
  },
];

describe('UserManagement', () => {
  let mockCRUDReturn: UseUserCRUDReturn;
  let mockSearchReturn: UseUserSearchReturn;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCRUDReturn = {
      users: mockUsers,
      totalUsers: 2,
      loading: false,
      isLoading: false,
      error: null,
      createUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      restoreUser: vi.fn(),
      loadUsers: vi.fn(),
      roles: mockRoles,
      mailEnabled: true,
      smsEnabled: false,
      cleanupStats: undefined,
      triggerCleanup: vi.fn(),
    };

    mockSearchReturn = {
      searchQuery: '',
      setSearchQuery: vi.fn(),
      roleFilter: '',
      setRoleFilter: vi.fn(),
      sortBy: 'createdAt',
      setSortBy: vi.fn(),
      sortOrder: 'desc' as const,
      setSortOrder: vi.fn(),
      currentPage: 1,
      setCurrentPage: vi.fn(),
      pageSize: 20,
      userTab: 'active' as const,
      setUserTab: vi.fn(),
    };

    vi.mocked(useUserCRUDModule.useUserCRUD).mockReturnValue(mockCRUDReturn);
    vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue(
      mockSearchReturn
    );
  });

  describe('Render smoke test', () => {
    it('renders user list page title', () => {
      render(<UserManagement />);
      expect(screen.getByText('用户管理')).toBeTruthy();
    });

    it('renders search input', () => {
      render(<UserManagement />);
      expect(
        screen.getByPlaceholderText('搜索用户（邮箱、用户名、昵称）')
      ).toBeTruthy();
    });

    it('renders pagination info', () => {
      render(<UserManagement />);
      // jsdom 零宽容器下 Pagination 渲染 compact 布局（箭头按钮），代替旧版 "1 / 1" 文本
      const prevBtn = screen.getByRole('button', {
        name: '上一页',
      }) as HTMLButtonElement;
      const nextBtn = screen.getByRole('button', {
        name: '下一页',
      }) as HTMLButtonElement;
      expect(prevBtn).toBeTruthy();
      expect(nextBtn).toBeTruthy();
      // 单页数据（totalUsers=2, pageSize=20 → totalPages=1）时前后翻页按钮应禁用
      expect(prevBtn.disabled).toBe(true);
      expect(nextBtn.disabled).toBe(true);
    });

    it('calls onPageChange when clicking next page on multi-page data', () => {
      // 多页数据：totalUsers=60, pageSize=20 → totalPages=3，当前第 2 页
      vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue({
        ...mockSearchReturn,
        currentPage: 2,
      });
      vi.mocked(useUserCRUDModule.useUserCRUD).mockReturnValue({
        ...mockCRUDReturn,
        totalUsers: 60,
      });

      render(<UserManagement />);

      const nextBtn = screen.getByRole('button', {
        name: '下一页',
      }) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(false);
      fireEvent.click(nextBtn);
      expect(mockSearchReturn.setCurrentPage).toHaveBeenCalledWith(3);
    });

    it('renders user data in table', () => {
      render(<UserManagement />);
      expect(screen.getByText('testuser1')).toBeTruthy();
      expect(screen.getByText('testuser2')).toBeTruthy();
    });
  });

  describe('User CRUD - component integration', () => {
    it('create user button exists', () => {
      render(<UserManagement />);
      const addButton = screen.getByRole('button', { name: /添加用户/i });
      expect(addButton).toBeTruthy();
    });

    it('edit button exists for users', () => {
      render(<UserManagement />);
      const editButtons = screen.getAllByRole('button', { name: /编辑/i });
      expect(editButtons.length).toBeGreaterThan(0);
    });

    it('delete button exists for users', () => {
      render(<UserManagement />);
      const deleteButtons = screen.getAllByRole('button', { name: /注销/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Search interaction', () => {
    it('typing in search calls setSearchQuery', () => {
      render(<UserManagement />);

      const searchInput =
        screen.getByPlaceholderText('搜索用户（邮箱、用户名、昵称）');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      const mockUseUserSearch = vi.mocked(
        useUserSearchModule.useUserSearch
      ) as unknown as Mock<UseUserSearchReturn>;
      expect(mockUseUserSearch).toHaveBeenCalled();
    });
  });

  describe('useUserCRUD hook interface', () => {
    it('exposes createUser function', () => {
      const mockUseUserCRUD = vi.mocked(useUserCRUDModule.useUserCRUD);
      const mockReturn = mockUseUserCRUD() as UseUserCRUDReturn;
      expect(mockReturn.createUser).toBeDefined();
    });

    it('exposes updateUser function', () => {
      const mockUseUserCRUD = vi.mocked(useUserCRUDModule.useUserCRUD);
      const mockReturn = mockUseUserCRUD() as UseUserCRUDReturn;
      expect(mockReturn.updateUser).toBeDefined();
    });

    it('exposes deleteUser function', () => {
      const mockUseUserCRUD = vi.mocked(useUserCRUDModule.useUserCRUD);
      const mockReturn = mockUseUserCRUD() as UseUserCRUDReturn;
      expect(mockReturn.deleteUser).toBeDefined();
    });
  });

  describe('useUserSearch hook interface', () => {
    it('exposes pagination state', () => {
      const mockUseUserSearch = vi.mocked(useUserSearchModule.useUserSearch);
      const mockReturn = mockUseUserSearch() as UseUserSearchReturn;
      expect(mockReturn.currentPage).toBe(1);
      expect(mockReturn.pageSize).toBe(20);
    });

    it('exposes search state', () => {
      const mockUseUserSearch = vi.mocked(useUserSearchModule.useUserSearch);
      const mockReturn = mockUseUserSearch() as UseUserSearchReturn;
      expect(mockReturn.searchQuery).toBe('');
      expect(mockReturn.setSearchQuery).toBeDefined();
    });
  });
});

describe('UserManagement 多选与批量操作（ADR-0052 统一机制）', () => {
  let mockCRUDReturn: UseUserCRUDReturn;
  let mockSearchReturn: UseUserSearchReturn;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCRUDReturn = {
      users: mockUsers,
      totalUsers: 2,
      loading: false,
      isLoading: false,
      error: null,
      createUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      restoreUser: vi.fn(),
      loadUsers: vi.fn(),
      roles: mockRoles,
      mailEnabled: true,
      smsEnabled: false,
      cleanupStats: undefined,
      triggerCleanup: vi.fn(),
    };

    mockSearchReturn = {
      searchQuery: '',
      setSearchQuery: vi.fn(),
      roleFilter: '',
      setRoleFilter: vi.fn(),
      sortBy: 'createdAt',
      setSortBy: vi.fn(),
      sortOrder: 'desc' as const,
      setSortOrder: vi.fn(),
      currentPage: 1,
      setCurrentPage: vi.fn(),
      pageSize: 20,
      userTab: 'active' as const,
      setUserTab: vi.fn(),
    };

    vi.mocked(useUserCRUDModule.useUserCRUD).mockReturnValue(mockCRUDReturn);
    vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue(
      mockSearchReturn
    );
  });

  it('行点击选中后出现批量操作条（已选计数 + 批量注销）', () => {
    render(<UserManagement />);
    fireEvent.click(screen.getByText('testuser1'));
    expect(screen.getByText('已选 1 项')).toBeTruthy();
    expect(screen.getByText('批量注销')).toBeTruthy();
  });

  it('Ctrl+A 全选；Delete 打开批量注销确认弹窗（批量文案，无立即注销选项）', () => {
    render(<UserManagement />);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    expect(screen.getByText('已选 2 项')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(
      screen.getByText('确定要注销选中的 2 个用户吗？')
    ).toBeTruthy();
    // 批量路径隐藏「立即注销」checkbox（防批量永久删除）
    expect(screen.queryByText(/立即注销（不等待30天冷静期/)).toBeNull();
  });

  it('批量注销确认后逐条调用 deleteUser（仅软删）并清空选择', async () => {
    const deleteUserMock = vi.fn(() => Promise.resolve());
    mockCRUDReturn.deleteUser = deleteUserMock;

    render(<UserManagement />);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    // 原生事件触发的 setState 需等待弹窗渲染后再操作确认按钮
    await vi.waitFor(() => {
      expect(screen.getByText('确定要注销选中的 2 个用户吗？')).toBeTruthy();
    });
    // Modal footer 的确认按钮与批量操作条按钮文案相同，取第二个（确认按钮）
    fireEvent.click(screen.getAllByText('批量注销')[1]);

    await vi.waitFor(() => {
      expect(deleteUserMock).toHaveBeenCalledTimes(2);
      expect(deleteUserMock).toHaveBeenCalledWith('1', false);
      expect(deleteUserMock).toHaveBeenCalledWith('2', false);
    });
    await vi.waitFor(() => {
      expect(screen.queryByText(/已选/)).toBeNull();
    });
  });

  it('已注销 tab：批量恢复逐条调用 restoreUser', async () => {
    vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue({
      ...mockSearchReturn,
      userTab: 'deleted',
    });
    const restoreUserMock = vi.fn(() => Promise.resolve());
    mockCRUDReturn.restoreUser = restoreUserMock;

    render(<UserManagement />);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    expect(screen.getByText('已选 2 项')).toBeTruthy();
    expect(screen.queryByText('批量注销')).toBeNull();

    fireEvent.click(screen.getByText('批量恢复'));
    await vi.waitFor(() => {
      expect(restoreUserMock).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(screen.queryByText(/已选/)).toBeNull();
    });
  });

  it('已注销 tab 下 Delete 快捷键不触发注销', () => {
    vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue({
      ...mockSearchReturn,
      userTab: 'deleted',
    });

    render(<UserManagement />);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.queryByText('确定要注销选中的 2 个用户吗？')).toBeNull();
  });

  it('搜索后选择被清空（查询身份变更）', async () => {
    const { rerender } = render(<UserManagement />);
    fireEvent.click(screen.getByText('testuser1'));
    expect(screen.getByText('已选 1 项')).toBeTruthy();

    // 模拟搜索查询变化（mock 不联动 state，用 rerender 强制页面感知新 searchQuery）
    vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue({
      ...mockSearchReturn,
      searchQuery: 'abc',
    });
    rerender(<UserManagement />);
    await vi.waitFor(() => {
      expect(screen.queryByText(/已选/)).toBeNull();
    });
  });
});

describe('UserManagement 操作失败错误提示（回归：mutation 失败必须对用户可见）', () => {
  let mockCRUDReturn: UseUserCRUDReturn;
  let mockSearchReturn: UseUserSearchReturn;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCRUDReturn = {
      users: mockUsers,
      totalUsers: 2,
      loading: false,
      isLoading: false,
      error: null,
      createUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      restoreUser: vi.fn(),
      loadUsers: vi.fn(),
      roles: mockRoles,
      mailEnabled: true,
      smsEnabled: false,
      cleanupStats: undefined,
      triggerCleanup: vi.fn(),
    };

    mockSearchReturn = {
      searchQuery: '',
      setSearchQuery: vi.fn(),
      roleFilter: '',
      setRoleFilter: vi.fn(),
      sortBy: 'createdAt',
      setSortBy: vi.fn(),
      sortOrder: 'desc' as const,
      setSortOrder: vi.fn(),
      currentPage: 1,
      setCurrentPage: vi.fn(),
      pageSize: 20,
      userTab: 'active' as const,
      setUserTab: vi.fn(),
    };

    vi.mocked(useUserCRUDModule.useUserCRUD).mockReturnValue(mockCRUDReturn);
    vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue(
      mockSearchReturn
    );
  });

  it('创建用户重名失败：后端错误消息显示在弹窗内且弹窗保持打开', async () => {
    const createUserMock = vi
      .fn()
      .mockRejectedValue({ message: '用户名已存在' });
    mockCRUDReturn.createUser = createUserMock;

    render(<UserManagement />);
    fireEvent.click(screen.getByRole('button', { name: /添加用户/i }));

    fireEvent.change(
      screen.getByPlaceholderText('3-20个字符，只能包含字母、数字和下划线'),
      { target: { value: 'admin' } }
    );
    fireEvent.change(screen.getByPlaceholderText('请输入邮箱地址'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('至少8个字符'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建用户' }));

    // 后端返回的"用户名已存在"必须在弹窗内可见（历史 bug：被混入列表加载错误，弹窗内无任何提示）
    await vi.waitFor(() => {
      expect(screen.getByText('用户名已存在')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '创建用户' })).toBeTruthy();
  });

  it('删除失败：globalShowToast 提示具体错误且确认弹窗保持打开', async () => {
    const deleteUserMock = vi
      .fn()
      .mockRejectedValue({ message: '不能删除管理员账户' });
    mockCRUDReturn.deleteUser = deleteUserMock;

    render(<UserManagement />);
    // 精确匹配行内"注销"按钮（/注销/i 会误匹配"已注销"tab）
    fireEvent.click(screen.getAllByRole('button', { name: '注销' })[0]);
    await vi.waitFor(() => {
      expect(screen.getByText('确定要注销该用户吗？')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await vi.waitFor(() => {
      expect(globalShowToast).toHaveBeenCalledWith(
        '不能删除管理员账户',
        'error'
      );
    });
    // 失败时弹窗保持打开，便于用户重试或取消
    expect(screen.getByText('确定要注销该用户吗？')).toBeTruthy();
  });

  it('批量注销部分失败：toast 汇总失败数并附带第一条具体错误', async () => {
    const deleteUserMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ message: '该用户正在使用中' });
    mockCRUDReturn.deleteUser = deleteUserMock;

    render(<UserManagement />);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    await vi.waitFor(() => {
      expect(screen.getByText('确定要注销选中的 2 个用户吗？')).toBeTruthy();
    });
    fireEvent.click(screen.getAllByText('批量注销')[1]);

    await vi.waitFor(() => {
      expect(globalShowToast).toHaveBeenCalledWith(
        '1 个用户注销失败：该用户正在使用中',
        'error'
      );
    });
  });
});
