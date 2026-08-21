import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import type { RoleDto } from '@/api-sdk';
import { RoleManagement } from './index';

// ── 依赖 mock（页面只读依赖，行为由 MSW 覆盖真实 API 链路）──
const permissionMock = vi.hoisted(() => ({
  hasPermission: vi.fn((p: string) => p === 'SYSTEM_ROLE_READ'),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionMock,
}));
vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => undefined,
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
  }),
}));
vi.mock('@/languages', () => ({
  t: (message: string, vars?: Record<string, string>) =>
    vars
      ? message.replace(/\{(\w+)\}/g, (_match: string, key: string) =>
          vars[key] !== undefined ? vars[key] : ''
        )
      : message,
}));

// ── 数据工厂（与后端 RoleDto 形状一致）──
function makeSystemRole(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: 'role-sys',
    name: 'ROLE',
    description: '角色描述',
    category: 'CUSTOM',
    level: 0,
    isSystem: false,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// 项目角色模板（ADR-00XX：isSystem=true, projectId=null）
function makeTemplateRole(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: 'tpl-role',
    name: 'PROJECT_MEMBER',
    description: '项目成员',
    projectId: null,
    isSystem: true,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── 可变"后端"状态：handler 共享，模拟真实后端持久化后列表刷新 ──
let systemRoles: RoleDto[] = [];
let projectRoleTemplates: RoleDto[] = [];
let getSystemRolesCount = 0;
let projectRolesEndpointCount = 0;
let createBodies: Array<Record<string, unknown>> = [];
let updateBodies: Array<Record<string, unknown>> = [];
let deleteIds: string[] = [];
let createErrorBody: Record<string, unknown> | null = null;
let deleteErrorBody: Record<string, unknown> | null = null;

function seedDefaultRoles() {
  systemRoles = [
    makeSystemRole({
      id: 'role-admin',
      name: 'ADMIN',
      description: '系统管理员角色',
      category: 'SYSTEM',
      level: 1,
      isSystem: true,
      permissions: ['SYSTEM_ADMIN', 'SYSTEM_USER_READ'],
    }),
    makeSystemRole({
      id: 'role-audit',
      name: '审计员',
      description: '负责审计系统操作',
      permissions: ['SYSTEM_ROLE_READ'],
    }),
  ];
}

function seedTemplateRoles() {
  projectRoleTemplates = [
    makeTemplateRole({
      id: 'tpl-owner',
      name: 'PROJECT_OWNER',
      description: '拥有项目全部权限',
      permissions: [{ id: 'p1', projectRoleId: 'tpl-owner', permission: 'PROJECT_UPDATE' as never, createdAt: '' }],
    }),
    makeTemplateRole({
      id: 'tpl-admin',
      name: 'PROJECT_ADMIN',
      description: '管理项目成员与设置',
    }),
    makeTemplateRole({
      id: 'tpl-editor',
      name: 'PROJECT_EDITOR',
      description: '可编辑项目文件',
    }),
    makeTemplateRole({
      id: 'tpl-member',
      name: 'PROJECT_MEMBER',
      description: '项目基础操作',
    }),
    makeTemplateRole({
      id: 'tpl-viewer',
      name: 'PROJECT_VIEWER',
      description: '仅可查看项目文件',
    }),
  ];
}

function setupMswHandlers() {
  server.use(
    http.get('/api/v1/roles', () => {
      getSystemRolesCount += 1;
      return HttpResponse.json([...systemRoles]);
    }),
    // ADR-00XX：项目角色模板区块（系统管理员维护"创建项目时的默认角色"）
    http.get('/api/v1/roles/project-roles/system', () => {
      projectRolesEndpointCount += 1;
      return HttpResponse.json(projectRoleTemplates);
    }),
    http.post('/api/v1/roles', async ({ request }) => {
      if (createErrorBody) {
        return HttpResponse.json(createErrorBody, { status: 400 });
      }
      const body = (await request.json()) as Record<string, unknown>;
      createBodies.push(body);
      const created = makeSystemRole({
        id: `role-new-${createBodies.length}`,
        name: String(body.name ?? ''),
        description: String(body.description ?? ''),
        category: 'CUSTOM',
        isSystem: false,
        permissions: (body.permissions ?? []) as RoleDto['permissions'],
      });
      systemRoles = [...systemRoles, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch('/api/v1/roles/:id', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      updateBodies.push(body);
      const role = systemRoles.find((r) => r.id === params.id);
      if (role) {
        if (typeof body.name === 'string') role.name = body.name;
        if (typeof body.description === 'string') {
          role.description = body.description;
        }
        if (body.permissions) {
          role.permissions = body.permissions as RoleDto['permissions'];
        }
      }
      return HttpResponse.json({ ...role });
    }),
    http.delete('/api/v1/roles/:id', ({ params }) => {
      if (deleteErrorBody) {
        return HttpResponse.json(deleteErrorBody, { status: 400 });
      }
      deleteIds.push(String(params.id));
      systemRoles = systemRoles.filter((r) => r.id !== params.id);
      return HttpResponse.json({ success: true });
    })
  );
}

// ── 测试辅助 ──
function grantAllPermissions() {
  permissionMock.hasPermission.mockImplementation(() => true);
}

function getRoleCard(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 3, name: new RegExp(name) });
  const card = heading.closest('[style*="animation-delay"]');
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

function permissionInput(labelText: string): HTMLInputElement {
  const items = Array.from(
    document.querySelectorAll<HTMLLabelElement>('.permission-item')
  );
  const item = items.find(
    (i) => i.querySelector('.permission-label')?.textContent === labelText
  );
  expect(item).not.toBeNull();
  const input = item!.querySelector('input[type="checkbox"]');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

describe('RoleManagement 系统角色管理（#299：自定义角色管理已移除）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(
      (p: string) => p === 'SYSTEM_ROLE_READ'
    );
    seedDefaultRoles();
    seedTemplateRoles();
    getSystemRolesCount = 0;
    projectRolesEndpointCount = 0;
    createBodies = [];
    updateBodies = [];
    deleteIds = [];
    createErrorBody = null;
    deleteErrorBody = null;
    setupMswHandlers();
  });

  describe('列表渲染与项目角色模板区块', () => {
    it('默认渲染系统角色列表，并加载项目角色模板区块（ADR-00XX）', async () => {
      render(<RoleManagement />);

      expect(await screen.findByText('系统管理员')).toBeInTheDocument();
      expect(screen.getByText('审计员')).toBeInTheDocument();
      // "系统"标记：ADMIN（isSystem）+ 5 个模板角色
      expect(screen.getAllByText('系统').length).toBe(6);
      // 权限标签渲染
      expect(screen.getAllByText('查看用户').length).toBe(1);
      expect(screen.getAllByText('查看角色').length).toBe(1);

      // ADR-00XX：项目角色模板区块（系统管理员维护"创建项目时的默认角色"）
      expect(screen.getByText('项目角色模板')).toBeInTheDocument();
      expect(
        screen.getByText('创建项目时的默认角色，不影响已有项目')
      ).toBeInTheDocument();
      // 模板列表请求一次
      expect(projectRolesEndpointCount).toBe(1);
      expect(getSystemRolesCount).toBe(1);
    });

    it('项目角色模板区块：渲染 5 个模板，OWNER 模板无删除按钮（数据驱动+按名保底）', async () => {
      // 需要 SYSTEM_ROLE_DELETE 才渲染删除按钮（验证 OWNER 保底隐藏）
      permissionMock.hasPermission.mockImplementation(
        (p: string) =>
          p === 'SYSTEM_ROLE_READ' || p === 'SYSTEM_ROLE_DELETE'
      );
      render(<RoleManagement />);

      // 等数据加载完成（卡片在 loading 结束后渲染）
      expect(await screen.findByText('项目所有者')).toBeInTheDocument();
      expect(screen.getByText('项目管理员')).toBeInTheDocument();
      expect(screen.getByText('项目编辑者')).toBeInTheDocument();
      expect(screen.getByText('项目成员')).toBeInTheDocument();
      expect(screen.getByText('项目查看者')).toBeInTheDocument();

      // OWNER 模板保底不可删：无删除按钮；其他模板可删
      const ownerCard = getRoleCard('项目所有者');
      expect(
        within(ownerCard).queryByTitle('删除角色')
      ).not.toBeInTheDocument();
      const adminCard = getRoleCard('项目管理员');
      expect(within(adminCard).getByTitle('删除角色')).toBeInTheDocument();
    });

    it('项目角色模板区块：有 SYSTEM_ROLE_CREATE 权限时显示新建模板按钮', async () => {
      permissionMock.hasPermission.mockImplementation(
        (p: string) =>
          p === 'SYSTEM_ROLE_READ' || p === 'SYSTEM_ROLE_CREATE'
      );

      render(<RoleManagement />);

      expect(await screen.findByText('项目角色模板')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '新建模板' })).toBeInTheDocument();
    });

    it('无 SYSTEM_ROLE_READ 权限时显示访问被拒绝', async () => {
      permissionMock.hasPermission.mockImplementation(() => false);

      render(<RoleManagement />);

      expect(await screen.findByText('访问被拒绝')).toBeInTheDocument();
      expect(
        screen.getByText('您没有权限访问此页面。')
      ).toBeInTheDocument();
      expect(
        screen.getByText('请联系管理员获取角色管理权限。')
      ).toBeInTheDocument();
    });

    it('搜索框按名称过滤角色卡片', async () => {
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      const search = screen.getByPlaceholderText('搜索角色...');
      fireEvent.change(search, { target: { value: '审计' } });

      expect(screen.getByText('审计员')).toBeInTheDocument();
      expect(screen.queryByText('系统管理员')).not.toBeInTheDocument();

      fireEvent.change(search, { target: { value: '' } });
      expect(screen.getByText('系统管理员')).toBeInTheDocument();
    });
  });

  describe('权限按钮可见性（SYSTEM_ROLE_* 规则）', () => {
    it('仅有 SYSTEM_ROLE_READ 时隐藏新建/删除/配置权限操作', async () => {
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      expect(
        screen.queryByRole('button', { name: '新建角色' })
      ).not.toBeInTheDocument();
      expect(screen.queryAllByTitle('删除角色')).toHaveLength(0);
      expect(
        screen.queryByRole('button', { name: '配置权限' })
      ).not.toBeInTheDocument();
    });

    it('具备 SYSTEM_ROLE_CREATE/DELETE/PERMISSION_MANAGE 时显示操作按钮', async () => {
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      expect(
        screen.getByRole('button', { name: '新建角色' })
      ).toBeInTheDocument();
      // 配置权限按钮：2 个系统角色卡片 + 5 个模板卡片（canManagePermissions 全开）
      expect(screen.getAllByRole('button', { name: '配置权限' })).toHaveLength(
        7
      );
      // 删除按钮：系统角色仅自定义 1 个 + 模板区 4 个（OWNER 模板保底无删除）
      expect(screen.getAllByTitle('删除角色')).toHaveLength(5);
    });
  });

  describe('新建系统角色（权限勾选 → 保存 → 后端同步）', () => {
    it('勾选权限后保存：POST 携带变更集，toast 提示并刷新列表显示新角色', async () => {
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      fireEvent.click(screen.getByRole('button', { name: '新建角色' }));
      expect(await screen.findByText('新建系统角色')).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('请输入角色名称'), {
        target: { value: '测试角色' },
      });
      fireEvent.click(permissionInput('查看用户'));
      expect(permissionInput('查看用户').checked).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

      await waitFor(() => {
        expect(createBodies).toEqual([
          {
            name: '测试角色',
            description: '',
            permissions: ['SYSTEM_USER_READ'],
            category: 'CUSTOM',
            level: 0,
          },
        ]);
      });
      expect(await screen.findByText('角色创建成功')).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: '保存配置' })
        ).not.toBeInTheDocument();
      });
      expect(getSystemRolesCount).toBe(2);
      expect(await screen.findByText('测试角色')).toBeInTheDocument();
      expect(
        within(getRoleCard('测试角色')).getByText('查看用户')
      ).toBeInTheDocument();
    });

    it('角色名称为空时不发送请求并提示', async () => {
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      fireEvent.click(screen.getByRole('button', { name: '新建角色' }));
      await screen.findByText('新建系统角色');

      fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

      expect(await screen.findByText('请输入角色名称')).toBeInTheDocument();
      expect(createBodies).toHaveLength(0);
      expect(
        screen.getByRole('button', { name: '保存配置' })
      ).toBeInTheDocument();
    });
  });

  describe('编辑系统角色权限', () => {
    it('编辑自定义角色：PATCH 携带变更集，toast 并刷新列表', async () => {
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('审计员');

      fireEvent.click(
        within(getRoleCard('审计员')).getByRole('button', {
          name: '配置权限',
        })
      );
      expect(await screen.findByText('配置系统角色权限')).toBeInTheDocument();

      const nameInput = screen.getByPlaceholderText(
        '请输入角色名称'
      ) as HTMLInputElement;
      expect(nameInput.value).toBe('审计员');
      fireEvent.change(nameInput, { target: { value: '审计组长' } });

      fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

      await waitFor(() => {
        expect(updateBodies).toEqual([
          {
            name: '审计组长',
            description: '负责审计系统操作',
            permissions: ['SYSTEM_ROLE_READ'],
          },
        ]);
      });
      expect(await screen.findByText('角色更新成功')).toBeInTheDocument();
      expect(await screen.findByText('审计组长')).toBeInTheDocument();
    });

    it('编辑系统角色（isSystem）时名称/描述禁用，仅可修改权限', async () => {
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      fireEvent.click(
        within(getRoleCard('系统管理员')).getByRole('button', {
          name: '配置权限',
        })
      );
      expect(await screen.findByText('配置系统角色权限')).toBeInTheDocument();

      expect(
        (screen.getByPlaceholderText('请输入角色名称') as HTMLInputElement)
          .disabled
      ).toBe(true);
      expect(
        (
          screen.getByPlaceholderText(
            '请输入角色描述（可选）'
          ) as HTMLInputElement
        ).disabled
      ).toBe(true);
      expect(
        screen.getByText('系统角色不允许修改名称和描述，但可以修改权限')
      ).toBeInTheDocument();
    });
  });

  describe('删除系统角色', () => {
    it('删除自定义系统角色：确认 → DELETE → toast → 列表移除', async () => {
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('审计员');

      fireEvent.click(within(getRoleCard('审计员')).getByTitle('删除角色'));
      expect(await screen.findByText('确认删除角色')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

      await waitFor(() => {
        expect(deleteIds).toEqual(['role-audit']);
      });
      expect(await screen.findByText('角色删除成功')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText('审计员')).not.toBeInTheDocument();
      });
      expect(getSystemRolesCount).toBe(2);
    });

    it('系统角色（isSystem）无删除按钮；无 SYSTEM_ROLE_DELETE 时全部无删除按钮', async () => {
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      expect(
        within(getRoleCard('系统管理员')).queryByTitle('删除角色')
      ).not.toBeInTheDocument();
      expect(screen.queryAllByTitle('删除角色')).toHaveLength(0);
    });

    it('删除失败：ErrorModal 展示后端 message', async () => {
      deleteErrorBody = { message: '该角色下存在用户，无法删除' };
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('审计员');

      fireEvent.click(within(getRoleCard('审计员')).getByTitle('删除角色'));
      await screen.findByText('确认删除角色');
      fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

      expect(
        await screen.findByText('该角色下存在用户，无法删除')
      ).toBeInTheDocument();
      expect(screen.getByText('审计员')).toBeInTheDocument();
    });
  });

  describe('错误路径提示', () => {
    it('创建失败：ErrorModal 展示后端 message，弹窗保持打开', async () => {
      createErrorBody = { message: '角色名称已存在' };
      grantAllPermissions();
      render(<RoleManagement />);
      await screen.findByText('系统管理员');

      fireEvent.click(screen.getByRole('button', { name: '新建角色' }));
      await screen.findByText('新建系统角色');
      fireEvent.change(screen.getByPlaceholderText('请输入角色名称'), {
        target: { value: '重复角色' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

      expect(await screen.findByText('角色名称已存在')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '保存配置' })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '确定' }));
      await waitFor(() => {
        expect(
          screen.queryByText('角色名称已存在')
        ).not.toBeInTheDocument();
      });
    });
  });
});
