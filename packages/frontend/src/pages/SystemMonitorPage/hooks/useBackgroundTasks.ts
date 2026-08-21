import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  runtimeConfigControllerGetAllConfigs,
  runtimeConfigControllerUpdateConfig,
  taskRunControllerListRuns,
  taskRunControllerRunTask,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { useNotification } from '@/contexts/NotificationContext';
import { TASK_ENABLED_KEY_BY_NAME, parseTaskRunList } from '../types';
import type { TaskRunRecord } from '../types';

const REFRESH_INTERVAL_SECONDS = 30;
export const TASK_RUNS_LIMIT = 50;
const TASK_RUNS_KEY = 'taskRunsList' as const;
const TASK_ENABLED_KEYS_KEY = 'taskEnabledKeys' as const;

export interface BackgroundTasksState {
  records: TaskRunRecord[];
  loading: boolean;
  error: string | null;
  refreshCountdown: number;
  refresh: () => void;
  /** taskName → runtime-config 开关状态；配置不可读时为 null */
  enabledByName: Record<string, boolean> | null;
  configUnavailable: boolean;
  /** 手动触发权限（SYSTEM_ADMIN） */
  canTrigger: boolean;
  /** 启用/禁用开关权限（SYSTEM_CONFIG_WRITE） */
  canToggle: boolean;
  /** 触发中（记录 taskName） */
  triggering: string | null;
  /** 切换中（记录 enabled key） */
  togglingKey: string | null;
  triggerTask: (taskName: string) => Promise<void>;
  toggleTask: (taskName: string, enabled: boolean) => Promise<void>;
}

/**
 * 后台任务数据（#211）
 * 仅 active（后台任务 Tab 激活）时轮询，30s 一次，复用 refreshCountdown 模式；
 * 列表由 taskRunControllerListRuns 驱动，开关状态由 runtime-config（GetAllConfigs）驱动，
 * 开关读写仅对具备 SYSTEM_CONFIG_WRITE 的用户启用
 */
export function useBackgroundTasks(active: boolean): BackgroundTasksState {
  const { hasPermission } = usePermission();
  const { showToast, showConfirm } = useNotification();

  const canToggle = hasPermission(SystemPermission.SYSTEM_CONFIG_WRITE);
  const canTrigger = hasPermission(SystemPermission.SYSTEM_ADMIN);

  const [refreshCountdown, setRefreshCountdown] = useState(
    REFRESH_INTERVAL_SECONDS
  );
  const [triggering, setTriggering] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: [TASK_RUNS_KEY],
    queryFn: async () => {
      const res = await taskRunControllerListRuns({
        query: { page: 1, limit: TASK_RUNS_LIMIT },
      });
      if (res.error) throw res.error;
      return parseTaskRunList(res.data);
    },
    placeholderData: (prev) => prev,
    enabled: active,
  });

  const configQuery = useQuery({
    queryKey: [TASK_ENABLED_KEYS_KEY],
    queryFn: async () => {
      const res = await runtimeConfigControllerGetAllConfigs();
      if (res.error) throw res.error;
      const items = Array.isArray(res.data) ? res.data : [];
      const map: Record<string, boolean> = {};
      for (const item of items) {
        if (typeof item.value === 'boolean') map[item.key] = item.value;
      }
      return map;
    },
    placeholderData: (prev) => prev,
    enabled: active && canToggle,
  });

  const { refetch: refetchRuns } = runsQuery;

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          refetchRuns();
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active, refetchRuns]);

  const refresh = useCallback(() => {
    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
    refetchRuns();
  }, [refetchRuns]);

  const triggerTask = useCallback(
    async (taskName: string) => {
      const confirmed = await showConfirm({
        title: t('手动触发任务'),
        message: t('确定要手动触发任务 {taskName} 吗？', { taskName }),
        confirmText: t('立即执行'),
        cancelText: t('取消'),
        type: 'warning',
      });
      if (!confirmed) return;

      try {
        setTriggering(taskName);
        const res = await taskRunControllerRunTask({
          body: { taskName },
        });
        if (res.error) throw res.error;
        showToast(t('任务已触发'), 'success');
        refetchRuns();
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t('触发任务失败'),
          'error'
        );
      } finally {
        setTriggering(null);
      }
    },
    [refetchRuns, showConfirm, showToast]
  );

  const toggleTask = useCallback(
    async (taskName: string, enabled: boolean) => {
      const enabledKey = TASK_ENABLED_KEY_BY_NAME[taskName];
      if (!enabledKey) return;

      try {
        setTogglingKey(enabledKey);
        const res = await runtimeConfigControllerUpdateConfig({
          path: { key: enabledKey },
          body: { val: enabled as never },
        });
        if (res.error) throw res.error;
        showToast(enabled ? t('任务已启用') : t('任务已禁用'), 'success');
        configQuery.refetch();
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t('切换任务开关失败'),
          'error'
        );
      } finally {
        setTogglingKey(null);
      }
    },
    [configQuery, showToast]
  );

  const enabledByName =
    canToggle && !configQuery.isError ? (configQuery.data ?? null) : null;

  return {
    records: runsQuery.data ?? [],
    loading: runsQuery.isFetching,
    error: runsQuery.isError
      ? getErrorMessage(runsQuery.error) || t('获取后台任务失败')
      : null,
    refreshCountdown,
    refresh,
    enabledByName,
    configUnavailable: canToggle && configQuery.isError,
    canTrigger,
    canToggle,
    triggering,
    togglingKey,
    triggerTask,
    toggleTask,
  };
}
