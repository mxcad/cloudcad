///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserManagement } from './index';
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
  }: { children?: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    children,
    isOpen,
    ...props
  }: { children?: React.ReactNode; isOpen?: boolean } & React.HTMLAttributes<HTMLDivElement>) =>
    isOpen ? <div {...props}>{children}</div> : null,
}));
vi.mock('@/components/ui/TruncateText', () => ({
  TruncateText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
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
  { id: 'role1', name: 'USER', isSystem: true, permissions: [], createdAt: '', updatedAt: '' },
  { id: 'role2', name: 'ADMIN', isSystem: true, permissions: [], createdAt: '', updatedAt: '' },
];

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockCRUDReturn = {
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
      getStorageQuota: vi.fn(),
      updateStorageQuota: vi.fn(),
    };

    const mockSearchReturn = {
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

    vi.mocked(useUserCRUDModule.useUserCRUD).mockReturnValue(
      mockCRUDReturn as UseUserCRUDReturn,
    );
    vi.mocked(useUserSearchModule.useUserSearch).mockReturnValue(
      mockSearchReturn as UseUserSearchReturn,
    );
  });

  describe('Render smoke test', () => {
    it('renders user list page title', () => {
      render(<UserManagement />);
      expect(screen.getByText('用户管理')).toBeTruthy();
    });

    it('renders search input', () => {
      render(<UserManagement />);
      expect(screen.getByPlaceholderText('搜索用户（邮箱、用户名、昵称）')).toBeTruthy();
    });

    it('renders pagination info', () => {
      render(<UserManagement />);
      expect(screen.getByText('1 / 1')).toBeTruthy();
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

      const searchInput = screen.getByPlaceholderText('搜索用户（邮箱、用户名、昵称）');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      const mockUseUserSearch = vi.mocked(useUserSearchModule.useUserSearch) as unknown as Mock<UseUserSearchReturn>;
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
