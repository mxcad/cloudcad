import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectRolesModal } from './ProjectRolesModal';
import type { ProjectRoleDto } from '@/api-sdk';

vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
}));

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
const crudMock = vi.hoisted(() => ({ roles: [] as unknown[] }));

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast, showConfirm: vi.fn() }),
}));

vi.mock('@/components/modals/hooks/useProjectRoleCRUD', () => ({
  useProjectRoleCRUD: () => ({
    roles: crudMock.roles,
    loading: false,
    error: null,
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
  }),
}));

vi.mock('@/hooks/useProjectPermissions', () => ({
  useProjectPermissions: () => ({
    permissions: {},
    loading: false,
    refresh: vi.fn(),
    check: () => true,
    hasAny: () => true,
    hasAll: () => true,
  }),
}));

vi.mock('@/components/permission/PermissionAssignment', () => ({
  PermissionConfigModal: () => null,
}));

const baseRole = (overrides: Partial<ProjectRoleDto> = {}): ProjectRoleDto =>
  ({
    id: 'role-1',
    name: '角色',
    description: '',
    isSystem: true,
    isOwnerRole: false,
    permissions: [],
    ...overrides,
  }) as ProjectRoleDto;

const ownerRole = baseRole({
  id: 'owner',
  name: '项目所有者',
  isOwnerRole: true,
});
const memberRole = baseRole({ id: 'member', name: '项目成员' });
const editorRole = baseRole({ id: 'editor', name: '项目编辑' });

function getDeleteButtons(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((btn) => btn.querySelector('svg.lucide-trash-2'));
}

describe('ProjectRolesModal 删除角色', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('仅剩一个非所有者角色时也可打开删除确认弹框（ADR-0051 删除自愈修订，后端自动补建默认成员角色）', () => {
    crudMock.roles = [ownerRole, memberRole] as unknown as ProjectRoleDto[];
    render(<ProjectRolesModal isOpen onClose={vi.fn()} projectId="p1" />);

    const deleteButtons = getDeleteButtons();
    expect(deleteButtons).toHaveLength(1);
    fireEvent.click(deleteButtons[0]);

    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getAllByText('确认删除').length).toBeGreaterThan(0);
  });

  it('存在多个非所有者角色时可正常打开删除确认弹框', () => {
    crudMock.roles = [
      ownerRole,
      editorRole,
      memberRole,
    ] as unknown as ProjectRoleDto[];
    render(<ProjectRolesModal isOpen onClose={vi.fn()} projectId="p1" />);

    const deleteButtons = getDeleteButtons();
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]);

    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getAllByText('确认删除').length).toBeGreaterThan(0);
  });
});
