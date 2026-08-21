import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectControllerGetProjects } from '@/api-sdk';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import type { TransferTargetRoot } from '../SelectFolderModal';

/**
 * 跨项目转移目标根列表（个人空间 + 我的项目）
 *
 * 供 SelectFolderModal 根切换器使用：全屏/侧边栏"移动到…/复制到…"
 * 时选择目标项目或本人个人空间（后端按 6 域转移矩阵校验）。
 * 弹窗打开时才拉取（enabled 门控），react-query 缓存复用；
 * useMemo 稳定引用，避免弹窗打开期间父组件重渲染触发选中重置。
 */
export function useTransferTargetRoots(enabled = true): TransferTargetRoot[] {
  const personalSpaceQuery = usePersonalSpaceQuery({ enabled });
  const projectsQuery = useQuery({
    queryKey: ['transfer-target-roots', 'projects'],
    queryFn: async () => {
      // 全量拉取（分页上限放开到 200），保证第 2 页后的项目也可选为目标
      const result = await projectControllerGetProjects({
        query: { page: 1, limit: 200 },
      });
      if (result.error) throw result.error;
      return (result.data?.nodes ?? [])
        .filter((p) => p.fileStatus !== 'DELETED')
        .map(
          (p): TransferTargetRoot => ({
            id: p.id,
            name: p.name,
            kind: 'project',
          })
        );
    },
    enabled,
    staleTime: 60 * 1000,
  });

  return useMemo(() => {
    const roots: TransferTargetRoot[] = [];
    const personalSpaceId = personalSpaceQuery.data?.id;
    if (personalSpaceId) {
      roots.push({ id: personalSpaceId, name: '', kind: 'personal-space' });
    }
    roots.push(...(projectsQuery.data ?? []));
    return roots;
  }, [personalSpaceQuery.data?.id, projectsQuery.data]);
}
