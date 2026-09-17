import React from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { t } from '@/languages';
import { Button, Tag } from '@/components/ui';
import { TASK_ENABLED_KEY_BY_NAME } from '../types';
import type { TaskRunRecord, TaskInfo } from '../types';
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
 * 拆分为两段，区分「任务级控件」与「记录级历史」：
 * - 任务清单（任务级）：任务名 + 描述 + 定时 + 启用开关 + 手动触发
 *   - 描述列解决"看不懂任务是什么"
 *   - 定时列：只读展示人类可读描述（hover 显示原始 cron 表达式）；无独立定时的任务置灰显示「—」
 *   - 开关：SYSTEM_CONFIG_WRITE，写 runtime-config（TASK_ENABLED_KEY_BY_NAME 映射；无映射任务置灰显示「—」）
 *   - 手动触发：SYSTEM_ADMIN，带操作确认，结果 toast
 * - 执行历史（记录级）：最近执行记录（任务名/时间/结果/耗时/触发方式）+ 失败红色高亮
 */
export const BackgroundTasksTab: React.FC<BackgroundTasksTabProps> = ({
  state,
}) => {
  const {
    records,
    loading,
    error,
    taskList,
    taskListLoading,
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

  const registryColSpan =
    3 + (canToggle ? 1 : 0) + (canTrigger ? 1 : 0);

  return (
    <section className={styles.section}>
      {/* 任务清单（任务级控件） */}
      <div className={styles.sectionHeader}>
        <h2>{t('任务清单')}</h2>
      </div>
      <div className={styles.tableContainer}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('任务名')}</th>
                <th>{t('描述')}</th>
                <th>{t('定时')}</th>
                {canToggle && <th>{t('启用')}</th>}
                {canTrigger && <th>{t('操作')}</th>}
              </tr>
            </thead>
            <tbody>
              {taskListLoading && taskList.length === 0 ? (
                <tr>
                  <td colSpan={registryColSpan} className={styles.tableEmpty}>
                    <span className={styles.loadingText}>
                      {t('正在获取数据')}
                    </span>
                  </td>
                </tr>
              ) : taskList.length === 0 ? (
                <tr>
                  <td colSpan={registryColSpan} className={styles.tableEmpty}>
                    {t('暂无已注册任务')}
                  </td>
                </tr>
              ) : (
                taskList.map((task) => (
                  <TaskRegistryRow
                    key={task.taskName}
                    task={task}
                    enabled={
                      enabledByName
                        ? (enabledByName[
                            TASK_ENABLED_KEY_BY_NAME[task.taskName] ?? ''
                          ] ?? true)
                        : true
                    }
                    canToggle={canToggle}
                    canTrigger={canTrigger}
                    triggering={triggering}
                    togglingKey={togglingKey}
                    onTrigger={triggerTask}
                    onToggle={toggleTask}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 执行历史（记录级） */}
      <div className={styles.sectionHeader}>
        <h2>{t('执行历史')}</h2>
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
              </tr>
            </thead>
            <tbody>
              {loading && !records.length ? (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
                    <span className={styles.loadingText}>
                      {t('正在获取数据')}
                    </span>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
                    {t('暂无任务执行记录')}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <HistoryRow key={record.id} record={record} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

interface TaskRegistryRowProps {
  task: TaskInfo;
  enabled: boolean;
  canToggle: boolean;
  canTrigger: boolean;
  triggering: string | null;
  togglingKey: string | null;
  onTrigger: (taskName: string) => Promise<void>;
  onToggle: (taskName: string, enabled: boolean) => Promise<void>;
}

/**
 * 任务清单行：任务名 + 描述 + 定时（人类可读描述，hover 显示 cron，无独立定时显示「—」）+ 启用开关（无映射任务显示「—」）+ 手动触发
 */
const TaskRegistryRow: React.FC<TaskRegistryRowProps> = ({
  task,
  enabled,
  canToggle,
  canTrigger,
  triggering,
  togglingKey,
  onTrigger,
  onToggle,
}) => {
  const enabledKey = TASK_ENABLED_KEY_BY_NAME[task.taskName];
  const toggleBusy = togglingKey === enabledKey;

  return (
    <tr>
      <td>
        <span className={styles.taskNameCell}>{task.taskName}</span>
      </td>
      <td>
        <span className={styles.taskDescriptionCell}>{task.description}</span>
      </td>
      <td>
        {task.scheduleLabel ? (
          <span
            className={styles.taskScheduleCell}
            title={task.schedule ?? undefined}
          >
            {task.scheduleLabel}
          </span>
        ) : task.schedule ? (
          <span className={styles.taskScheduleCell}>{task.schedule}</span>
        ) : (
          <span
            className={styles.taskNoToggle}
            title={t('该任务无独立定时')}
          >
            {t('—')}
          </span>
        )}
      </td>
      {canToggle &&
        (enabledKey ? (
          <td>
            <label className={styles.taskToggleLabel}>
              <input
                type="checkbox"
                className={styles.taskToggleInput}
                checked={enabled}
                disabled={toggleBusy}
                onChange={(e) => onToggle(task.taskName, e.target.checked)}
              />
            </label>
          </td>
        ) : (
          <td>
            <span className={styles.taskNoToggle} title={t('该任务无独立开关')}>
              {t('—')}
            </span>
          </td>
        ))}
      {canTrigger && (
        <td>
          <Button
            variant="outline"
            size="sm"
            icon={Play}
            loading={triggering === task.taskName}
            disabled={triggering !== null}
            onClick={() => onTrigger(task.taskName)}
          >
            {t('手动触发')}
          </Button>
        </td>
      )}
    </tr>
  );
};

/**
 * 执行历史行：纯记录展示（无操作列），失败红色高亮
 */
const HistoryRow: React.FC<{ record: TaskRunRecord }> = ({ record }) => {
  const isFailed = record.status === 'FAILED';
  return (
    <tr
      data-status={record.status}
      className={isFailed ? styles.taskRunFailed : undefined}
    >
      <td>
        <span className={styles.taskNameCell}>{record.taskName}</span>
        {isFailed && record.errorSummary && (
          <span
            className={styles.taskErrorSummary}
            title={record.errorSummary}
          >
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
    </tr>
  );
};
