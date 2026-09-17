import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  ListChecks,
  TrendingUp,
  CloudOff,
  AlertTriangle,
  Gauge,
  Clock,
  XCircle,
  ListOrdered,
} from 'lucide-react';
import { t } from '@/languages';
import { Button, Tag } from '@/components/ui';
import type { MonitorTaskItemDto, KnownBadItemDto } from '@/api-sdk';
import type {
  ConversionQueueState,
  ConversionWorkerLevel,
  ConversionHistoryPoint,
} from '../types';
import styles from '../SystemMonitorPage.module.css';

export interface ConversionQueueTabProps {
  state: ConversionQueueState | null;
  loading: boolean;
  error: string | null;
  /** 永久失败负缓存条目（#478）；非 conversion-service 模式恒为空 */
  knownBad: KnownBadItemDto[];
  onRefresh: () => void;
  /** 永久失败复位权限（SYSTEM_ADMIN，#477 合并自独立转换任务页） */
  canReset: boolean;
  /** 复位进行中（'all' 或 contentKey） */
  resetting: string | null;
  /** 复位永久失败（contentKey 缺省=全部） */
  onReset: (contentKey?: string) => void;
  /** 转换任务明细（#478 监控 Tab 逐任务明细）；非 conversion-service 模式恒为空 */
  tasks: MonitorTaskItemDto[];
  /** 任务明细加载中 */
  tasksLoading: boolean;
  /** 任务明细拉取失败 */
  tasksError: string | null;
}

const MODE_LABELS: Record<string, string> = {
  'process-pool': t('进程内执行'),
  'conversion-service': t('独立转换服务'),
  'cloud-faas': t('云函数'),
};

/** 趋势图降采样：24h × 30s = 2880 点，图表最多保留 ~300 点 */
function downsample<T>(points: T[], maxPoints = 300): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < points.length; i += step) {
    const point = points[i];
    if (point !== undefined) result.push(point);
  }
  return result;
}

function formatMs(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatClock(epochMs: number | null): string {
  if (epochMs === null) return '-';
  return new Date(epochMs).toLocaleTimeString();
}

function formatMarkedAt(epochMs: number): string {
  if (!epochMs) return '-';
  return new Date(epochMs).toLocaleString();
}

function formatTaskTime(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

/**
 * 排队清空 ETA（#478）：pending 任务按「并发数 × P50 耗时」估算剩余时间。
 * 无排队 / 无耗时样本时返回 null（不展示）。
 */
function estimateDrainMs(
  pending: number | null,
  processing: number | null,
  p50Ms: number | null
): number | null {
  if (pending == null || pending <= 0) return null;
  if (p50Ms == null || p50Ms <= 0) return null;
  const parallelism = Math.max(processing ?? 0, 1);
  return (pending / parallelism) * p50Ms;
}

function truncateKey(key: string, max = 32): string {
  if (key.length <= max) return key;
  return `${key.slice(0, max)}…`;
}

/** ETA 展示：秒/分钟/小时自适应 */
function formatDrain(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min}min` : `${min}min ${sec}s`;
}

function toChartPoints(
  history: ConversionHistoryPoint[]
): Array<{ time: string; queueDepth: number | null; running: number | null }> {
  return downsample(history).map((p) => ({
    time: formatClock(p.t),
    queueDepth: p.queueDepth,
    running: p.running,
  }));
}

/** 单级工作池卡片（conversion-service 模式，含自动扩容状态） */
const WorkerLevelCard: React.FC<{ worker: ConversionWorkerLevel }> = ({
  worker,
}) => {
  const scaledUp = worker.currentMax > worker.maxConcurrent;
  return (
    <div className={styles.queueCard}>
      <div className={styles.serviceHeader}>
        <div className={styles.serviceTitleArea}>
          <h3>{worker.label}</h3>
          <p>
            {t('并发 {current}/{baseline}', {
              current: String(worker.currentMax),
              baseline: String(worker.maxConcurrent),
            })}
          </p>
        </div>
        {scaledUp ? (
          <Tag variant="warning" size="sm">
            {t('已自动扩容')}
          </Tag>
        ) : (
          <Tag variant="neutral" size="sm">
            {t('基准容量')}
          </Tag>
        )}
      </div>
      <div className={styles.queueStatsGrid}>
        <div className={styles.queueStatItem}>
          <span className={styles.queueStatValue}>{worker.running}</span>
          <span className={styles.queueStatLabel}>{t('运行中')}</span>
        </div>
        <div className={styles.queueStatItem}>
          <span className={styles.queueStatValue}>{worker.waiting}</span>
          <span className={styles.queueStatLabel}>{t('等待中')}</span>
        </div>
        <div className={styles.queueStatItem}>
          <span className={styles.queueStatValue}>
            {worker.autoScale ? t('开启') : t('关闭')}
          </span>
          <span className={styles.queueStatLabel}>{t('自动扩容')}</span>
        </div>
        <div className={styles.queueStatItem}>
          <span className={styles.queueStatValue}>
            {formatClock(worker.backlogSince)}
          </span>
          <span className={styles.queueStatLabel}>{t('积压起始')}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * 系统监控中心「转换队列」Tab（#406 / ADR-0058）
 * 按执行器模式渲染：
 * - process-pool：队列深度/并发/耗时 + 24h 趋势
 * - conversion-service：任务计数/三级工作池（含自动扩容）/耗时 + 24h 趋势
 * - cloud-faas：无队列概念，展示说明
 */
export const ConversionQueueTab: React.FC<ConversionQueueTabProps> = ({
  state,
  loading,
  error,
  knownBad,
  onRefresh,
  canReset,
  resetting,
  onReset,
  tasks,
  tasksLoading,
  tasksError,
}) => {
  const chartPoints = useMemo(
    () => (state ? toChartPoints(state.history) : []),
    [state]
  );

  if (error) {
    return (
      <div className={styles.errorBanner}>
        <AlertTriangle size={20} />
        <span>{error}</span>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={onRefresh}
        >
          {t('重试')}
        </button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className={styles.chartEmpty}>
        {loading ? t('加载中...') : t('暂无数据')}
      </div>
    );
  }

  const modeLabel = MODE_LABELS[state.mode] ?? state.mode;

  // 状态判定：拉取失败 > 队列积压 > 有排队 > 正常
  const backlogged =
    state.mode === 'process-pool'
      ? state.queueLength !== null &&
        state.maxConcurrent !== null &&
        state.queueLength >= state.maxConcurrent
      : state.mode === 'conversion-service'
        ? (state.tasksPending ?? 0) > 0
        : false;
  const statusTag = state.conversionServiceError ? (
    <Tag variant="error" size="sm">
      {t('服务不可用')}
    </Tag>
  ) : backlogged ? (
    <Tag variant="warning" size="sm">
      {t('队列积压')}
    </Tag>
  ) : (
    <Tag variant="success" size="sm">
      {t('正常')}
    </Tag>
  );

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('转换队列状态')}</h2>
          <div className={styles.sectionHeaderRight}>
            <Tag variant="neutral" size="sm">
              {modeLabel}
            </Tag>
            {statusTag}
          </div>
        </div>

        {state.conversionServiceError && (
          <div className={styles.configUnavailableBanner}>
            <AlertTriangle size={18} />
            <span>
              {t('转换服务统计拉取失败')}: {state.conversionServiceError}
            </span>
          </div>
        )}

        {state.mode === 'process-pool' && (
          <div className={styles.queueCard}>
            <div className={styles.serviceHeader}>
              <div
                className={`${styles.serviceIcon} ${styles.serviceIconHealthy}`}
              >
                <ListChecks size={22} />
              </div>
              <div className={styles.serviceTitleArea}>
                <h3>{t('进程内转换队列')}</h3>
                <p>{t('后端进程内限流器实时状态')}</p>
              </div>
            </div>
            <div className={styles.queueStatsGrid}>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {state.queueLength ?? '-'}
                </span>
                <span className={styles.queueStatLabel}>{t('队列深度')}</span>
              </div>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {state.runningCount ?? '-'}
                  {' / '}
                  {state.maxConcurrent ?? '-'}
                </span>
                <span className={styles.queueStatLabel}>
                  {t('运行中 / 并发上限')}
                </span>
              </div>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {t('{n} 分钟', {
                    n: String(
                      state.timeoutMs !== null
                        ? Math.round(state.timeoutMs / 60000)
                        : '-'
                    ),
                  })}
                </span>
                <span className={styles.queueStatLabel}>{t('超时阈值')}</span>
              </div>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {formatMs(state.p50DurationMs)}
                </span>
                <span className={styles.queueStatLabel}>{t('耗时 P50')}</span>
              </div>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {formatMs(state.p95DurationMs)}
                </span>
                <span className={styles.queueStatLabel}>{t('耗时 P95')}</span>
              </div>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {formatMs(state.p50WaitMs)}
                </span>
                <span className={styles.queueStatLabel}>
                  {t('排队等待 P50')}
                </span>
              </div>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {formatMs(state.p95WaitMs)}
                </span>
                <span className={styles.queueStatLabel}>
                  {t('排队等待 P95')}
                </span>
              </div>
              <div className={styles.queueStatItem}>
                <span className={styles.queueStatValue}>
                  {state.durationSampleCount}
                </span>
                <span className={styles.queueStatLabel}>{t('耗时样本数')}</span>
              </div>
            </div>
          </div>
        )}

        {state.mode === 'conversion-service' && (
          <>
            <div className={styles.queueCard}>
              <div className={styles.serviceHeader}>
                <div
                  className={`${styles.serviceIcon} ${styles.serviceIconHealthy}`}
                >
                  <ListChecks size={22} />
                </div>
                <div className={styles.serviceTitleArea}>
                  <h3>{t('转换服务任务')}</h3>
                  <p>{t('独立转换服务实时状态')}</p>
                </div>
              </div>
              <div className={styles.queueStatsGrid}>
                <div className={styles.queueStatItem}>
                  <span className={styles.queueStatValue}>
                    {state.tasksPending ?? '-'}
                  </span>
                  <span className={styles.queueStatLabel}>{t('排队中')}</span>
                </div>
                <div className={styles.queueStatItem}>
                  <span className={styles.queueStatValue}>
                    {state.tasksProcessing ?? '-'}
                  </span>
                  <span className={styles.queueStatLabel}>{t('运行中')}</span>
                </div>
                <div className={styles.queueStatItem}>
                  <span className={styles.queueStatValue}>
                    {state.tasksCompleted ?? '-'}
                  </span>
                  <span className={styles.queueStatLabel}>{t('已完成')}</span>
                </div>
                <div className={styles.queueStatItem}>
                  <span className={styles.queueStatValue}>
                    {state.tasksFailed ?? '-'}
                  </span>
                  <span className={styles.queueStatLabel}>{t('失败')}</span>
                </div>
                <div className={styles.queueStatItem}>
                  <span className={styles.queueStatValue}>
                    {formatMs(state.p50TaskMs)}
                  </span>
                  <span className={styles.queueStatLabel}>{t('耗时 P50')}</span>
                </div>
                <div className={styles.queueStatItem}>
                  <span className={styles.queueStatValue}>
                    {formatMs(state.p95TaskMs)}
                  </span>
                  <span className={styles.queueStatLabel}>{t('耗时 P95')}</span>
                </div>
              </div>
            </div>

            {(() => {
              const drainMs = estimateDrainMs(
                state.tasksPending,
                state.tasksProcessing,
                state.p50TaskMs
              );
              if (drainMs == null) return null;
              return (
                <div className={styles.etaLine}>
                  <Clock size={14} aria-hidden />
                  <span>
                    {t('排队 {n} 个 · 预计约 {eta} 清空（按 P50 耗时 × 并发估算）', {
                      n: String(state.tasksPending ?? 0),
                      eta: formatDrain(drainMs),
                    })}
                  </span>
                </div>
              );
            })()}

            {state.workers.length > 0 && (
              <div className={styles.serviceGrid}>
                {state.workers.map((worker) => (
                  <WorkerLevelCard key={worker.label} worker={worker} />
                ))}
              </div>
            )}
          </>
        )}

        {state.mode === 'cloud-faas' && (
          <div className={styles.infoCard}>
            <CloudOff size={18} />
            <div className={styles.infoContent}>
              <span className={styles.infoLabel}>{t('云函数模式')}</span>
              <span className={styles.infoValue}>
                {t('云函数由云厂商托管调度，无队列概念，本 Tab 不适用')}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('永久失败（内容不可转换）')}</h2>
          <div className={styles.sectionHeaderRight}>
            {canReset && knownBad.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={resetting !== null}
                onClick={() => void onReset()}
              >
                {resetting === 'all' ? t('复位中...') : t('复位全部')}
              </Button>
            )}
            <XCircle size={16} style={{ color: 'var(--danger)' }} aria-hidden />
            <span className={styles.infoLabel}>
              {t('内容不可转换的文件，复位后重新尝试')}
            </span>
          </div>
        </div>

        {knownBad.length === 0 ? (
          <div className={styles.chartEmpty}>{t('暂无永久失败任务')}</div>
        ) : (
          <div className={styles.knownBadList}>
            {knownBad.map((item) => (
              <div key={item.contentKey} className={styles.knownBadItem}>
                <span className={styles.knownBadKey} title={item.contentKey}>
                  <XCircle size={13} aria-hidden />
                  {truncateKey(item.contentKey)}
                </span>
                <span className={styles.knownBadReason}>
                  {item.reason || t('未知原因')}
                </span>
                <span className={styles.knownBadMarked}>
                  {formatMarkedAt(item.markedAt)}
                </span>
                {canReset && (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={resetting !== null}
                    onClick={() => void onReset(item.contentKey)}
                  >
                    {resetting === item.contentKey
                      ? t('复位中...')
                      : t('复位')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('任务明细')}</h2>
          <div className={styles.sectionHeaderRight}>
            <ListOrdered size={16} aria-hidden />
            <span className={styles.infoLabel}>
              {t('conversion-service 模式任务列表（process-pool 模式无明细）')}
            </span>
          </div>
        </div>

        {tasksError ? (
          <div className={styles.errorBanner}>
            <AlertTriangle size={20} />
            <span>{tasksError}</span>
          </div>
        ) : tasksLoading && tasks.length === 0 ? (
          <div className={styles.chartEmpty}>{t('加载中...')}</div>
        ) : tasks.length === 0 ? (
          <div className={styles.chartEmpty}>{t('暂无任务明细')}</div>
        ) : (
          <div className={styles.taskList}>
            {tasks.map((task) => (
              <div key={task.id} className={styles.taskItem}>
                <span className={styles.taskId} title={task.id}>
                  {task.id.slice(0, 8)}
                </span>
                <Tag
                  variant={
                    task.status === 'completed'
                      ? 'success'
                      : task.status === 'failed'
                        ? 'error'
                        : task.status === 'cancelled'
                          ? 'neutral'
                          : 'warning'
                  }
                  size="sm"
                >
                  {task.permanent
                    ? t('永久失败')
                    : task.status === 'completed'
                      ? t('已完成')
                      : task.status === 'failed'
                        ? t('失败')
                        : task.status === 'cancelled'
                          ? t('已取消')
                          : task.status === 'processing'
                            ? t('处理中')
                            : t('排队中')}
                </Tag>
                <span className={styles.taskProgress}>
                  {task.progress}%
                </span>
                {task.error && (
                  <span className={styles.taskError} title={task.error}>
                    {truncateKey(task.error)}
                  </span>
                )}
                <span className={styles.taskTime}>
                  {formatTaskTime(task.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('近 24 小时趋势')}</h2>
          <div className={styles.sectionHeaderRight}>
            <Gauge size={16} />
            <span className={styles.infoLabel}>
              {t('30 秒采样 · 服务重启后重新累积')}
            </span>
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitleArea}>
              <TrendingUp size={18} className={styles.chartTitleIcon} />
              <div>
                <h3>{t('队列深度与运行中任务')}</h3>
                <p>
                  {t(
                    '扩容决策参考：排队持续变长且并发顶到上限时，考虑增加转换实例'
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className={styles.chartBody}>
            {chartPoints.length === 0 ? (
              <div className={styles.chartEmpty}>
                {t('暂无历史数据（服务启动后每 30 秒采样一次）')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={chartPoints}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-subtle)"
                  />
                  <XAxis
                    dataKey="time"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    itemStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="queueDepth"
                    name={t('队列深度')}
                    stroke="var(--primary-500)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="running"
                    name={t('运行中')}
                    stroke="var(--accent-500)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>
    </>
  );
};
