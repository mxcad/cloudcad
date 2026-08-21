import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { getActionDescription } from '@/utils/auditActionTemplates';
import type { AuditLog } from '@/utils/auditActionTemplates';

vi.mock('@/languages', () => ({
  t: (
    message: string,
    vars?: Record<string, string | undefined>
  ): string =>
    vars
      ? message.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
      : message,
}));

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    action: 'UPDATE_MEMBER',
    resourceType: 'PROJECT',
    resourceId: 'resource-uuid-1',
    projectId: 'project-uuid-1',
    resourceName: null,
    params: null,
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
    ...overrides,
  };
}

describe('getActionDescription（action 模板渲染）', () => {
  it('UPDATE_MEMBER 渲染成员角色变更文案（issue 示例）', () => {
    const log = makeLog({
      action: 'UPDATE_MEMBER',
      params: {
        targetUserName: '李工',
        oldRoleName: '查看者',
        newRoleName: '编辑者',
      },
    });
    expect(getActionDescription(log)).toBe('张工 将 李工 的角色从 查看者 改为 编辑者');
  });

  it('操作者名称优先级：昵称 > 用户名 > email', () => {
    const noNickname = makeLog({
      params: { targetUserName: '李工', oldRoleName: '查看者', newRoleName: '编辑者' },
      user: { id: 'user-1', email: 'zhang@example.com', username: 'zhanggong', nickname: null },
    });
    expect(getActionDescription(noNickname)).toBe('zhanggong 将 李工 的角色从 查看者 改为 编辑者');

    const onlyEmail = makeLog({
      params: { targetUserName: '李工', oldRoleName: '查看者', newRoleName: '编辑者' },
      user: { id: 'user-1', email: 'zhang@example.com', username: '', nickname: null },
    });
    expect(getActionDescription(onlyEmail)).toBe('zhang@example.com 将 李工 的角色从 查看者 改为 编辑者');
  });

  it('params 字段缺失时防御性回退（- 占位）', () => {
    const log = makeLog({ action: 'UPDATE_MEMBER', params: null });
    expect(getActionDescription(log)).toBe('张工 将 - 的角色从 - 改为 -');
  });

  it('FILE_DELETE 优先 params.fileName，缺失时回退 resourceName 快照', () => {
    const withFileName = makeLog({
      action: 'FILE_DELETE',
      params: { fileName: '平面图.dwg' },
    });
    expect(getActionDescription(withFileName)).toBe('张工 删除文件 平面图.dwg');

    const withResourceName = makeLog({
      action: 'FILE_DELETE',
      resourceName: '立面图.dwg',
      params: null,
    });
    expect(getActionDescription(withResourceName)).toBe('张工 删除文件 立面图.dwg');

    const withResourceId = makeLog({
      action: 'FILE_DELETE',
      resourceName: null,
      params: null,
    });
    expect(getActionDescription(withResourceId)).toBe('张工 删除文件 resource-uuid-1');
  });

  it('PERMISSION_GRANT / REMOVE_MEMBER / PROJECT_CREATE 模板', () => {
    expect(
      getActionDescription(
        makeLog({
          action: 'PERMISSION_GRANT',
          params: { targetUserName: '李工', permissionName: 'CAD_SAVE' },
        })
      )
    ).toBe('张工 授予 李工 权限 CAD_SAVE');

    expect(
      getActionDescription(
        makeLog({ action: 'REMOVE_MEMBER', params: { targetUserName: '李工' } })
      )
    ).toBe('张工 移除成员 李工');

    expect(
      getActionDescription(
        makeLog({ action: 'PROJECT_CREATE', params: { projectName: '厂区规划' } })
      )
    ).toBe('张工 创建项目 厂区规划');
  });

  it('FILE_CREATE / FILE_UPDATE 新增图纸动作模板', () => {
    expect(
      getActionDescription(
        makeLog({ action: 'FILE_CREATE', params: { fileName: '平面图.dwg' } })
      )
    ).toBe('张工 新增图纸 平面图.dwg');

    expect(
      getActionDescription(
        makeLog({
          action: 'FILE_UPDATE',
          resourceName: '立面图.dwg',
          params: null,
        })
      )
    ).toBe('张工 修改图纸 立面图.dwg');
  });

  it('FILE_SHARE 区分分享与取消分享（params.shareAction=revoke）', () => {
    expect(
      getActionDescription(
        makeLog({ action: 'FILE_SHARE', params: { fileName: '平面图.dwg' } })
      )
    ).toBe('张工 分享文件 平面图.dwg');

    expect(
      getActionDescription(
        makeLog({
          action: 'FILE_SHARE',
          params: { fileName: '平面图.dwg', shareAction: 'revoke' },
        })
      )
    ).toBe('张工 取消分享文件 平面图.dwg');
  });

  it('未覆盖的 action 回退为「动作名（资源名）」', () => {
    const log = makeLog({ action: 'UNKNOWN_ACTION', resourceName: '未知资源' });
    expect(getActionDescription(log)).toBe('UNKNOWN_ACTION（未知资源）');
  });

  it('高频读失败动作渲染失败语义', () => {
    const login = makeLog({ action: 'USER_LOGIN', success: false });
    expect(getActionDescription(login)).toBe('张工 登录失败');

    const upload = makeLog({
      action: 'FILE_UPLOAD',
      success: false,
      params: { fileName: '大图.dwg' },
    });
    expect(getActionDescription(upload)).toBe('张工 上传文件 大图.dwg 失败');
  });
});
