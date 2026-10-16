import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MembersModal } from './MembersModal';
import { ProjectPermission } from '@/constants/permissions';
import { globalPermissionCache } from '@/utils/projectPermissionCache';

// 注意：故意不 mock @/hooks/useProjectPermissions —— 必须走真实 hook，
// 否则覆盖不到「hook 按白名单过滤权限位」这一层，也守不住本次回归的根因。
vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
  $t: (msg: string) => msg,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-owner', name: '所有者', email: 'owner@mx.com' },
  }),
}));

const mocks = vi.hoisted(() => ({
  getProjectPermissions: vi.fn(),
  getProjectMembers: vi.fn(),
  getProjectRoles: vi.fn(),
}));

vi.mock('@/api-sdk', () => ({
  memberControllerGetUserProjectPermissions: mocks.getProjectPermissions,
  memberControllerGetProjectMembers: mocks.getProjectMembers,
  memberControllerAddProjectMember: vi.fn(),
  memberControllerRemoveProjectMember: vi.fn(),
  memberControllerUpdateProjectMember: vi.fn(),
  memberControllerTransferProject: vi.fn(),
  usersControllerSearchUsers: vi.fn(),
  rolesControllerGetProjectRolesByProject: mocks.getProjectRoles,
}));

const OWNER_PERMISSIONS = [
  ProjectPermission.PROJECT_MEMBER_MANAGE,
  ProjectPermission.PROJECT_MEMBER_ASSIGN,
  ProjectPermission.PROJECT_ROLE_MANAGE,
  ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
  ProjectPermission.FILE_EDIT,
];

// 普通成员角色：有文件权限，无成员管理/分配权限
const MEMBER_PERMISSIONS = [ProjectPermission.FILE_EDIT, ProjectPermission.FILE_OPEN];

function mockPermissions(perms: readonly ProjectPermission[]) {
  mocks.getProjectPermissions.mockResolvedValue({
    data: { permissions: [...perms], role: 'PROJECT_OWNER' },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  globalPermissionCache.clearAll();
  mockPermissions(OWNER_PERMISSIONS);
  mocks.getProjectMembers.mockResolvedValue({ data: [] } as never);
  mocks.getProjectRoles.mockResolvedValue({
    data: [
      {
        id: 'role-owner',
        name: '项目所有者',
        isSystem: true,
        isOwnerRole: true,
        permissions: [],
      },
      {
        id: 'role-member',
        name: 'PROJECT_MEMBER',
        isSystem: true,
        isOwnerRole: false,
        permissions: [],
      },
    ],
  } as never);
});

/** 取「添加成员」按钮：等权限加载完（loadingPermissions=false）后才渲染出按钮 */
async function getInviteButton(): Promise<HTMLButtonElement> {
  const text = await screen.findByText('添加成员');
  return text.closest('button') as HTMLButtonElement;
}

describe('MembersModal — 成员管理权限门控', () => {
  it('项目所有者（后端授予 PROJECT_MEMBER_MANAGE）：「添加成员」按钮可用', async () => {
    render(<MembersModal isOpen projectId="p1" onClose={vi.fn()} />);

    const button = await getInviteButton();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('点击「添加成员」后可展开添加表单（权限链路真正放行，而非仅 UI 解锁）', async () => {
    render(<MembersModal isOpen projectId="p1" onClose={vi.fn()} />);

    const button = await getInviteButton();
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);

    expect(screen.queryByText('添加成员')).toBeNull();
    expect(screen.getByText('添加新成员')).toBeTruthy();
  });

  it('普通成员角色（无成员管理权限）：「添加成员」按钮仍禁用（不过度放权）', async () => {
    mockPermissions(MEMBER_PERMISSIONS);
    render(<MembersModal isOpen projectId="p1" onClose={vi.fn()} />);

    const button = await getInviteButton();
    await waitFor(() => expect(button.disabled).toBe(true));
  });
});
