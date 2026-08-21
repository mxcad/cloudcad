import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProjectPermissions, PROJECT_FILE_PERMISSIONS } from './useProjectPermissions';
import {
  memberControllerGetUserProjectPermissions,
} from '@/api-sdk';
import { globalPermissionCache } from '../utils/projectPermissionCache';

vi.mock('@/api-sdk', () => ({
  memberControllerGetUserProjectPermissions: vi.fn(),
}));

const GRANTED = [
  'FILE_READ' as const,
  'FILE_EDIT' as const,
  'CAD_SAVE' as const,
];

function mockPermissions(perms: readonly string[] = GRANTED) {
  vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
    data: { permissions: [...perms], role: 'EDITOR' },
  } as any);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useProjectPermissions（唯一入口：悲观语义 + loading 门控）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalPermissionCache.clearAll();
  });

  describe('loading 态与悲观语义', () => {
    it('首次渲染（权限加载中）：loading=true 且 check 全部为 false（悲观）', () => {
      mockPermissions();
      const { result } = renderHook(() =>
        useProjectPermissions('project-1')
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(result.current.check('FILE_UPLOAD')).toBe(false);
      expect(result.current.check('UNKNOWN_PERM')).toBe(false);
    });

    it('无 projectId：不发请求，loading=false，check 恒为 false', async () => {
      mockPermissions();
      const { result } = renderHook(() =>
        useProjectPermissions(null)
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(memberControllerGetUserProjectPermissions).not.toHaveBeenCalled();
    });

    it('加载完成后：被授予的权限为 true，其余为 false（check 恒 boolean）', async () => {
      mockPermissions();
      const { result } = renderHook(() =>
        useProjectPermissions('project-1')
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.check('FILE_EDIT')).toBe(true);
      expect(result.current.check('CAD_SAVE')).toBe(true);
      expect(result.current.check('FILE_UPLOAD')).toBe(false);
      expect(result.current.check('FILE_DELETE')).toBe(false);
      expect(result.current.check('NOT_IN_LIST')).toBe(false);
      expect(result.current.hasAny(['FILE_UPLOAD', 'CAD_SAVE'])).toBe(true);
      expect(result.current.hasAll(['FILE_EDIT', 'FILE_UPLOAD'])).toBe(false);
    });

    it('加载失败（API 错误）：loading=false，check 全部 false（悲观拒绝）', async () => {
      vi.mocked(memberControllerGetUserProjectPermissions).mockRejectedValue(
        new Error('API error')
      );
      const { result } = renderHook(() =>
        useProjectPermissions('project-1')
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(result.current.check('FILE_UPLOAD')).toBe(false);
    });
  });

  describe('缓存与项目切换', () => {
    it('同一项目重复挂载命中缓存，不再发请求', async () => {
      mockPermissions();
      const first = renderHook(() => useProjectPermissions('project-1'));
      await waitFor(() => expect(first.result.current.loading).toBe(false));
      first.unmount();

      const second = renderHook(() => useProjectPermissions('project-1'));
      await waitFor(() => expect(second.result.current.loading).toBe(false));

      expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(1);
    });

    it('项目切换：重新请求新项目；期间权限为悲观 false，完成后渲染新项目权限', async () => {
      mockPermissions(['FILE_EDIT']);
      const { result, rerender } = renderHook(
        ({ projectId }: { projectId: string | null }) =>
          useProjectPermissions(projectId),
        { initialProps: { projectId: 'project-1' } }
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.check('FILE_EDIT')).toBe(true);

      mockPermissions(['FILE_UPLOAD']);
      rerender({ projectId: 'project-2' });

      // 切换瞬间：新项目权限未加载，必须悲观为 false（不得残留旧项目权限）
      expect(result.current.loading).toBe(true);
      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(result.current.check('FILE_UPLOAD')).toBe(false);

      await waitFor(() =>
        expect(result.current.check('FILE_UPLOAD')).toBe(true)
      );
      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(2);
    });

    it('切回已缓存项目：命中缓存，不发请求，loading 恒 false 且权限立即可用（无闪隐帧）', async () => {
      mockPermissions(['FILE_EDIT']);
      const { result, rerender } = renderHook(
        ({ projectId }: { projectId: string | null }) =>
          useProjectPermissions(projectId),
        { initialProps: { projectId: 'project-1' } }
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockPermissions(['FILE_UPLOAD']);
      rerender({ projectId: 'project-2' });
      await waitFor(() =>
        expect(result.current.check('FILE_UPLOAD')).toBe(true)
      );

      // 切回已缓存项目：切换瞬间 loading 即为 false，权限立即可用（不经过 loading=true 帧）
      rerender({ projectId: 'project-1' });
      expect(result.current.loading).toBe(false);
      expect(result.current.check('FILE_EDIT')).toBe(true);
      expect(result.current.check('FILE_UPLOAD')).toBe(false);

      expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(2);
    });

    it('缓存命中路径同样递增竞态序号：在途新项目响应不覆盖已缓存项目状态', async () => {
      // project-1 先成功加载并写入缓存
      mockPermissions(['FILE_EDIT']);
      const { result, rerender } = renderHook(
        ({ projectId }: { projectId: string | null }) =>
          useProjectPermissions(projectId),
        { initialProps: { projectId: 'project-1' } }
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      // 切到 project-2：请求挂起（在途）
      const d = deferred<{ data: { permissions: string[]; role: string | null } }>();
      vi.mocked(memberControllerGetUserProjectPermissions).mockReturnValueOnce(
        d.promise as any
      );
      rerender({ projectId: 'project-2' });
      expect(result.current.loading).toBe(true);

      // 切回 project-1：命中缓存立即渲染，loading 恒 false（命中路径递增了竞态序号）
      rerender({ projectId: 'project-1' });
      expect(result.current.loading).toBe(false);
      expect(result.current.check('FILE_EDIT')).toBe(true);

      // project-2 在途响应晚到：必须被丢弃，不得覆盖 project-1 缓存渲染结果
      await act(async () => {
        d.resolve({
          data: { permissions: ['FILE_UPLOAD'], role: 'EDITOR' },
        });
      });
      expect(result.current.check('FILE_EDIT')).toBe(true);
      expect(result.current.check('FILE_UPLOAD')).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it('快速切换项目：在途旧项目响应不覆盖新项目状态（竞态防护）', async () => {
      const d = deferred<{ data: { permissions: string[]; role: string | null } }>();
      vi.mocked(memberControllerGetUserProjectPermissions).mockReturnValueOnce(
        d.promise as any
      );
      const { result, rerender } = renderHook(
        ({ projectId }: { projectId: string | null }) =>
          useProjectPermissions(projectId),
        { initialProps: { projectId: 'project-1' } }
      );

      // project-1 请求在途时切到 project-2，project-2 立即完成
      mockPermissions(['FILE_UPLOAD']);
      rerender({ projectId: 'project-2' });
      await waitFor(() =>
        expect(result.current.check('FILE_UPLOAD')).toBe(true)
      );

      // 旧项目在途响应晚到：必须被丢弃，不覆盖 project-2 状态
      await act(async () => {
        d.resolve({
          data: { permissions: ['FILE_EDIT'], role: 'EDITOR' },
        });
      });

      expect(result.current.check('FILE_UPLOAD')).toBe(true);
      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it('refresh：清缓存后重新请求（clearProject 生效）', async () => {
      mockPermissions(['FILE_EDIT']);
      const { result } = renderHook(() =>
        useProjectPermissions('project-1')
      );
      await waitFor(() =>
        expect(result.current.check('FILE_EDIT')).toBe(true)
      );

      mockPermissions(['FILE_UPLOAD']);
      act(() => {
        result.current.refresh();
      });

      expect(result.current.loading).toBe(true);
      await waitFor(() =>
        expect(result.current.check('FILE_UPLOAD')).toBe(true)
      );
      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(2);
    });
  });

  describe('autoLoad / 自定义权限列表', () => {
    it('autoLoad=false：不自动加载，check 全部 false', async () => {
      mockPermissions();
      const { result } = renderHook(() =>
        useProjectPermissions('project-1', { autoLoad: false })
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.check('FILE_EDIT')).toBe(false);
      expect(memberControllerGetUserProjectPermissions).not.toHaveBeenCalled();
    });

    it('自定义权限列表：只加载指定权限位', async () => {
      mockPermissions(['CAD_SAVE']);
      const { result } = renderHook(() =>
        useProjectPermissions('project-1', {
          permissions: [PROJECT_FILE_PERMISSIONS[0], 'CAD_SAVE'],
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.check('CAD_SAVE')).toBe(true);
      // 不在列表内的权限位悲观为 false（即使服务端已授予）
      expect(result.current.check('FILE_EDIT')).toBe(false);
    });

    it('加载期间挂起：loading=true 直到请求返回', async () => {
      const d = deferred<{ data: { permissions: string[]; role: string | null } }>();
      vi.mocked(memberControllerGetUserProjectPermissions).mockReturnValue(
        d.promise as any
      );
      const { result } = renderHook(() =>
        useProjectPermissions('project-1')
      );

      expect(result.current.loading).toBe(true);

      await act(async () => {
        d.resolve({
          data: { permissions: ['FILE_EDIT'], role: 'EDITOR' },
        });
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.check('FILE_EDIT')).toBe(true);
    });
  });
});
