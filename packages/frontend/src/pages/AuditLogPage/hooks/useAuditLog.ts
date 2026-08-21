import { useQuery } from '@tanstack/react-query';
import {
  auditLogControllerFindAll,
  auditLogControllerGetStatistics,
  projectControllerGetProjects,
} from '@/api-sdk';
import type { AuditLogControllerFindAllData } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import type { AuditLog } from '@/utils/auditActionTemplates';

type AuditLogQueryParams = NonNullable<AuditLogControllerFindAllData['query']>;

interface AuditLogListResponse {
  logs?: AuditLog[];
  total?: number;
}

interface AuditLogStatistics {
  total: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

// --- Hooks ---

/**
 * 查询审计日志列表（分页 + 筛选）
 */
export function useAuditLogList(params: AuditLogQueryParams) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: queryKeys.auditLog.list(params),
    queryFn: async () => {
      const result = await auditLogControllerFindAll({
        query: params,
      });
      if (result.error) throw result.error;
      return (result.data ?? {}) as AuditLogListResponse;
    },
    placeholderData: (prev) => prev,
  });

  return {
    logs: data?.logs ?? ([] as AuditLog[]),
    total: data?.total ?? 0,
    isLoading,
    // 翻页期间 keepPreviousData 占位 isLoading=false，须含 isFetching（滚动控制器
    // loading 恒 false 会使边界阻塞/链式预载/displayedPage 延迟失效）
    loading: isLoading || isFetching,
    isFetching,
    error: error ? getErrorMessage(error) || t('加载审计日志失败') : null,
    refetch,
  };
}

/**
 * 查询审计统计信息
 */
export function useAuditLogStats() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<
    Partial<AuditLogStatistics>
  >({
    queryKey: queryKeys.auditLog.stats,
    queryFn: async () => {
      const result = await auditLogControllerGetStatistics();
      if (result.error) throw result.error;
      return result.data ?? {};
    },
  });

  return {
    statistics: {
      total: data?.total ?? 0,
      successCount: data?.successCount ?? 0,
      failureCount: data?.failureCount ?? 0,
      successRate: data?.successRate ?? 0,
    },
    isLoading,
    loading: isLoading,
    isFetching,
    error: error ? getErrorMessage(error) || t('加载统计信息失败') : null,
    refetch,
  };
}

/**
 * 查询项目列表（审计页项目维度过滤下拉数据源）
 */
export function useAuditProjectOptions() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.projects.all,
    queryFn: async (): Promise<ProjectOption[]> => {
      const result = await projectControllerGetProjects({ query: {} });
      if (result.error) throw result.error;
      return (result.data?.nodes ?? []).map((node) => ({
        id: String(node.id ?? ''),
        name: String(node.name ?? node.id ?? ''),
      }));
    },
  });

  return {
    projects: data ?? ([] as ProjectOption[]),
    loading: isLoading,
  };
}

export type { AuditLog, AuditLogStatistics, AuditLogQueryParams };
