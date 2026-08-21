import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionAssignment } from './PermissionAssignment';

const showConfirmMock = vi.fn();
const showToastMock = vi.fn();

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showToast: showToastMock,
    showConfirm: showConfirmMock,
  }),
}));

vi.mock('@/languages', () => ({
  t: (key: string, args?: Record<string, string>) =>
    args
      ? key.replace(/\{(\w+)\}/g, (_, name: string) => args[name] ?? '')
      : key,
}));

/**
 * 权限配置交互测试（PermissionAssignment）
 *
 * 覆盖三条机制：
 * 1. 勾选带前置的权限 → 自动补全前置（如勾"创建角色"自动带上"查看角色"）
 * 2. 取消前置权限且存在已勾选的下游 → 弹确认，确认后级联取消
 * 3. 取消无下游的权限 → 直接取消，不弹确认
 */
describe('PermissionAssignment 权限依赖交互', () => {
  beforeEach(() => {
    showConfirmMock.mockReset();
  });

  it('勾选"创建角色"自动补上"查看角色"', async () => {
    const onChange = vi.fn();
    render(
      <PermissionAssignment
        permissions={[]}
        onPermissionsChange={onChange}
        permissionType="system"
      />
    );

    // 找到"创建角色"复选框（hidden-checkbox 通过 label 文本定位）
    const createRoleCheckbox = screen.getByLabelText('创建角色');
    fireEvent.click(createRoleCheckbox);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
    const result = onChange.mock.calls[0][0] as string[];
    expect(result).toEqual(
      expect.arrayContaining(['SYSTEM_ROLE_CREATE', 'SYSTEM_ROLE_READ'])
    );
  });

  it('取消无下游的权限不弹确认，直接取消', async () => {
    const onChange = vi.fn();
    render(
      <PermissionAssignment
        permissions={['SYSTEM_ROLE_READ']}
        onPermissionsChange={onChange}
        permissionType="system"
      />
    );

    fireEvent.click(screen.getByLabelText('查看角色'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([]);
    });
    expect(showConfirmMock).not.toHaveBeenCalled();
  });

  it('取消"查看角色"时弹确认，确认后级联取消所有下游权限', async () => {
    showConfirmMock.mockResolvedValue(true);
    const onChange = vi.fn();
    render(
      <PermissionAssignment
        permissions={[
          'SYSTEM_ROLE_READ',
          'SYSTEM_ROLE_CREATE',
          'SYSTEM_ROLE_UPDATE',
        ]}
        onPermissionsChange={onChange}
        permissionType="system"
      />
    );

    fireEvent.click(screen.getByLabelText('查看角色'));

    await waitFor(() => {
      expect(showConfirmMock).toHaveBeenCalledTimes(1);
    });
    // 确认文案应列出受影响的下游权限
    const confirmOptions = showConfirmMock.mock.calls[0][0];
    expect(confirmOptions.message).toContain('创建角色');
    expect(confirmOptions.message).toContain('编辑角色');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  it('取消确认被拒绝时保持原权限不变', async () => {
    showConfirmMock.mockResolvedValue(false);
    const onChange = vi.fn();
    render(
      <PermissionAssignment
        permissions={['SYSTEM_ROLE_READ', 'SYSTEM_ROLE_CREATE']}
        onPermissionsChange={onChange}
        permissionType="system"
      />
    );

    fireEvent.click(screen.getByLabelText('查看角色'));

    await waitFor(() => {
      expect(showConfirmMock).toHaveBeenCalledTimes(1);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('项目权限：勾选"编辑文件"自动补上"查看文件"', async () => {
    const onChange = vi.fn();
    render(
      <PermissionAssignment
        permissions={[]}
        onPermissionsChange={onChange}
        permissionType="project"
      />
    );

    fireEvent.click(screen.getByLabelText('编辑文件'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
    const result = onChange.mock.calls[0][0] as string[];
    expect(result).toEqual(
      expect.arrayContaining(['FILE_EDIT', 'FILE_OPEN'])
    );
  });
});
