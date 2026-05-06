import { useQuery } from '@tanstack/react-query';
import {
  auditLogControllerFindAll,
  auditLogControllerGetStatistics,
} from '@/api-sdk';
import type { AuditLogControllerFindAllData } from '@/api-sdk';

type AuditLogQueryParams = NonNullable<
  AuditLogControllerFindAllData['query']
>;

// 审计日志接口
interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId: string;
  user: {
    id: string;
    email: string;
    username: string;
    nickname: string | null;
  };
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

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

// --- Hooks ---

const AUDIT_LOG_LIST_KEY = 'auditLogList' as const;
const AUDIT_LOG_STATS_KEY = 'auditLogStats' as const;

/**
 * 查询审计日志列表（分页 + 筛选）
 */
export function useAuditLogList(params: AuditLogQueryParams) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [AUDIT_LOG_LIST_KEY, params],
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
    loading: isLoading,
    error: error ? '加载审计日志失败' : null,
    refetch,
  };
}

/**
 * 查询审计统计信息
 */
export function useAuditLogStats() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: AUDIT_LOG_STATS_KEY,
    queryFn: async () => {
      const result = await auditLogControllerGetStatistics();
      if (result.error) throw result.error;
      return (result.data ?? {}) as Partial<AuditLogStatistics>;
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
    error: error ? '加载统计信息失败' : null,
    refetch,
  };
}

export type { AuditLog, AuditLogStatistics, AuditLogQueryParams };
