import React, { useMemo } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { t } from '@/languages';
import { Button, Tag } from '@/components/ui';
import { TASK_ENABLED_KEY_BY_NAME } from '../types';
import type { TaskRunRecord } from '../types';
import type { BackgroundTasksState } from '../hooks/useBackgroundTasks';
import { formatDateTimeWithSeconds } from '@/utils/dateUtils';
import styles from '../SystemMonitorPage.module.css';

const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

export interface BackgroundTasksTabProps {
  state: BackgroundTasksState;
}

/**
 * 系统监控中心「后台任务」Tab（#211）
 * 最近执行记录列表（任务名/执行时间/结果/耗时）+ 失败红色高亮；
 * 操作（手动触发 / 启用禁用开关）仅挂在每个任务的最新一条记录上：
 * - 手动触发：SYSTEM_ADMIN，带操作确认，结果 toast
 * - 开关：SYSTEM_CONFIG_WRITE，写 runtime-config（TASK_ENABLED_KEY_BY_NAME 映射）
 */
export const BackgroundTasksTab: React.FC<BackgroundTasksTabProps> = ({
  state,
}) => {
  const {
    records,
    loading,
    error,
    refreshCountdown,
    refresh,
    enabledByName,
    configUnavailable,
    canTrigger,
    canToggle,
    triggering,
    togglingKey,
    triggerTask,
    toggleTask,
  } = state;

  /** 每个任务名最新一条记录的 id（列表已按执行时间倒序，首个出现即最新） */
  const latestIdByTaskName = useMemo(() => {
    const map = new Map<string, string>();
    const seen = new Set<string>();
    for (const record of records) {
      if (!seen.has(record.taskName)) {
        seen.add(record.taskName);
        map.set(record.taskName, record.id);
      }
    }
    return map;
  }, [records]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>{t('后台任务')}</h2>
        <div className={styles.sectionHeaderRight}>
          <span className={styles.refreshCountdown}>
            {t('{seconds}s 后自动刷新', {
              seconds: String(refreshCountdown),
            })}
          </span>
          <Button
            variant="primary"
            className={styles.refreshButton}
            onClick={refresh}
            loading={loading}
            icon={RefreshCw}
          >
            {loading ? t('刷新中...') : t('立即刷新')}
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {configUnavailable && (
        <div className={styles.configUnavailableBanner}>
          {t('无法读取任务启用状态，开关已禁用')}
        </div>
      )}

      <div className={styles.tableContainer}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('任务名')}</th>
                <th>{t('最近执行时间')}</th>
                <th>{t('最近结果')}</th>
                <th>{t('耗时')}</th>
                <th>{t('触发方式')}</th>
                <th>{t('操作')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !records.length ? (
                <tr>
                  <td colSpan={6} className={styles.tableEmpty}>
                    <span className={styles.loadingText}>
                      {t('正在获取数据')}
                    </span>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.tableEmpty}>
                    {t('暂无任务执行记录')}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <TaskRunRow
                    key={record.id}
                    record={record}
                    isLatest={
                      latestIdByTaskName.get(record.taskName) === record.id
                    }
                    enabled={
                      enabledByName
                        ? (enabledByName[
                            TASK_ENABLED_KEY_BY_NAME[record.taskName] ?? ''
                          ] ?? true)
                        : true
                    }
                    triggering={triggering}
                    togglingKey={togglingKey}
                    canTrigger={canTrigger}
                    canToggle={canToggle}
                    onTrigger={triggerTask}
                    onToggle={toggleTask}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

interface TaskRunRowProps {
  record: TaskRunRecord;
  isLatest: boolean;
  enabled: boolean;
  triggering: string | null;
  togglingKey: string | null;
  canTrigger: boolean;
  canToggle: boolean;
  onTrigger: (taskName: string) => Promise<void>;
  onToggle: (taskName: string, enabled: boolean) => Promise<void>;
}

const TaskRunRow: React.FC<TaskRunRowProps> = ({
  record,
  isLatest,
  enabled,
  triggering,
  togglingKey,
  canTrigger,
  canToggle,
  onTrigger,
  onToggle,
}) => {
  const isFailed = record.status === 'FAILED';
  const enabledKey = TASK_ENABLED_KEY_BY_NAME[record.taskName];
  const toggleBusy = togglingKey === enabledKey;

  return (
    <tr
      data-status={record.status}
      className={isFailed ? styles.taskRunFailed : undefined}
    >
      <td>
        <span className={styles.taskNameCell}>{record.taskName}</span>
        {isFailed && record.errorSummary && (
          <span className={styles.taskErrorSummary} title={record.errorSummary}>
            {record.errorSummary}
          </span>
        )}
      </td>
      <td>{formatDateTimeWithSeconds(record.startedAt)}</td>
      <td>
        {isFailed ? (
          <Tag variant="error" dot>
            {t('失败')}
          </Tag>
        ) : (
          <Tag variant="success" dot>
            {t('成功')}
          </Tag>
        )}
      </td>
      <td>{formatDuration(record.durationMs)}</td>
      <td>{record.trigger === 'MANUAL' ? t('手动') : t('定时')}</td>
      <td>
        {isLatest && (
          <div className={styles.taskActions}>
            {canTrigger && (
              <Button
                variant="outline"
                size="sm"
                icon={Play}
                loading={triggering === record.taskName}
                disabled={triggering !== null}
                onClick={() => onTrigger(record.taskName)}
              >
                {t('手动触发')}
              </Button>
            )}
            {canToggle && (
              <label className={styles.taskToggleLabel}>
                <input
                  type="checkbox"
                  className={styles.taskToggleInput}
                  checked={enabled}
                  disabled={toggleBusy || !enabledKey}
                  onChange={(e) => onToggle(record.taskName, e.target.checked)}
                />
              </label>
            )}
          </div>
        )}
      </td>
    </tr>
  );
};
