import React from 'react';
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
import { TrendingUp, BarChart3 } from 'lucide-react';
import type { PerformanceTrendDto, SizeTrendDto } from '@/api-sdk';
import { t } from '@/languages';
import type { CacheLevelKey, CacheTrendPoint } from '../types';
import styles from '../SystemMonitorPage.module.css';

export interface CacheTrendChartsProps {
  sizeTrend: SizeTrendDto | null;
  perfTrend: PerformanceTrendDto | null;
  perfLevel: CacheLevelKey;
  onPerfLevelChange: (level: CacheLevelKey) => void;
  loading: boolean;
  perfError: boolean;
}

function toPoints(timestamps: unknown, values: unknown): CacheTrendPoint[] {
  const ts = Array.isArray(timestamps) ? timestamps : [];
  const vs = Array.isArray(values) ? values : [];
  const length = Math.min(ts.length, vs.length);
  const points: CacheTrendPoint[] = [];
  for (let i = 0; i < length; i += 1) {
    const tRaw = ts[i];
    const vRaw = vs[i];
    const time =
      typeof tRaw === 'number'
        ? tRaw
        : typeof tRaw === 'string'
          ? Number(tRaw)
          : Number.NaN;
    const value =
      typeof vRaw === 'number'
        ? vRaw
        : typeof vRaw === 'string'
          ? Number(vRaw)
          : Number.NaN;
    if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
    points.push({
      label: new Date(time).toLocaleTimeString(),
      value,
    });
  }
  return points;
}

function toNumericArray(values: unknown): number[] {
  const vs = Array.isArray(values) ? values : [];
  return vs
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((n) => Number.isFinite(n));
}

const LEVEL_OPTIONS: CacheLevelKey[] = ['L1', 'L2'];

/**
 * 缓存趋势图表（#217，recharts 首次使用）
 * - 性能趋势：L1/L2 切换（平均响应时间 + 错误率），数据由 useCacheMonitor 轮询注入
 * - 大小趋势：L1/L2 双线
 */
export const CacheTrendCharts: React.FC<CacheTrendChartsProps> = ({
  sizeTrend,
  perfTrend,
  perfLevel,
  onPerfLevelChange,
  loading,
  perfError,
}) => {
  const perfPoints = perfTrend
    ? toPoints(perfTrend.timestamps, perfTrend.avgResponseTimes)
    : [];
  const errorPoints = perfTrend
    ? toPoints(perfTrend.timestamps, perfTrend.errorRates)
    : [];
  const l1Points = sizeTrend
    ? toNumericArray(sizeTrend.L1).map((value, index) => ({
        label: String(index + 1),
        value,
      }))
    : [];
  const l2Points = sizeTrend
    ? toNumericArray(sizeTrend.L2).map((value, index) => ({
        label: String(index + 1),
        value,
      }))
    : [];

  const hasPerfData = perfPoints.length > 0;
  const hasSizeData = l1Points.length > 0 || l2Points.length > 0;

  return (
    <div className={styles.chartsGrid}>
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div className={styles.chartTitleArea}>
            <TrendingUp size={18} className={styles.chartTitleIcon} />
            <div>
              <h3>{t('性能趋势')}</h3>
              <p>{t('近 60 分钟平均响应时间与错误率')}</p>
            </div>
          </div>
          <div className={styles.chartLevelSwitch}>
            {LEVEL_OPTIONS.map((level) => (
              <button
                key={level}
                type="button"
                className={`${styles.chartLevelButton} ${
                  perfLevel === level ? styles.chartLevelButtonActive : ''
                }`}
                onClick={() => onPerfLevelChange(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.chartBody}>
          {perfError ? (
            <div className={styles.chartEmpty}>{t('获取性能趋势失败')}</div>
          ) : loading && !perfTrend ? (
            <div className={styles.chartEmpty}>{t('加载中...')}</div>
          ) : !hasPerfData ? (
            <div className={styles.chartEmpty}>{t('暂无性能数据')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={perfPoints}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  dataKey="label"
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
                  dataKey="value"
                  name={t('平均响应时间 (ms)')}
                  stroke="var(--primary-500)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div className={styles.chartTitleArea}>
            <BarChart3 size={18} className={styles.chartTitleIcon} />
            <div>
              <h3>{t('缓存大小趋势')}</h3>
              <p>{t('L1 / L2 缓存大小采样')}</p>
            </div>
          </div>
        </div>

        <div className={styles.chartBody}>
          {loading && !sizeTrend ? (
            <div className={styles.chartEmpty}>{t('加载中...')}</div>
          ) : !hasSizeData ? (
            <div className={styles.chartEmpty}>{t('暂无大小数据')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={48}
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
                  dataKey="value"
                  data={l1Points}
                  name="L1"
                  stroke="var(--primary-500)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  data={l2Points}
                  name="L2"
                  stroke="var(--accent-500)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
