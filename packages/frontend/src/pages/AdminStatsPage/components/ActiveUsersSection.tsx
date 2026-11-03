import React from 'react';
import { Activity } from 'lucide-react';
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
import type { ActiveStatsDto } from '@/api-sdk';
import { t } from '@/languages';
import styles from '../AdminStatsPage.module.css';

export interface ActiveUsersSectionProps {
  stats: ActiveStatsDto | undefined;
  loading: boolean;
}

/**
 * 活跃用户区块：DAU/MAU/粘性 KPI 卡（当前实时值，与统计区间无关）
 * + 区间 DAU/MAU 双折线趋势。
 *
 * 口径说明（与后端一致，CONTEXT.md）：活跃 = 任意审计事件（成功登录/
 * 文件/项目/节点操作等）；切日为东八区自然日；MAU 为近 30 天滚动窗口
 * （含锚定日）。指标名 hover 显示完整定义。
 */
export const ActiveUsersSection: React.FC<ActiveUsersSectionProps> = ({
  stats,
  loading,
}) => {
  const stickinessText = loading
    ? '…'
    : stats && stats.stickiness !== null
      ? `${(stats.stickiness * 100).toFixed(1)}%`
      : '—';

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <Activity size={18} className={styles.sectionIcon} />
        <div>
          <h2>{t('活跃用户统计')}</h2>
          <p>
            {t('活跃 = 产生过任意审计记录的操作（登录/文件/项目等）；按东八区自然日切日；MAU 为近 30 天滚动窗口')}
          </p>
        </div>
      </div>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span
            className={styles.kpiLabel}
            title={t('某自然日（东八区）内产生过至少一次活跃行为的去重用户数')}
          >
            {t('日活跃用户（DAU）')}
          </span>
          <span className={styles.kpiValue}>
            {loading ? '…' : (stats?.dau ?? 0)}
          </span>
          <span className={styles.kpiHint}>{t('今日 0 点至现在（实时）')}</span>
        </div>
        <div className={styles.kpiCard}>
          <span
            className={styles.kpiLabel}
            title={t('近 30 天滚动窗口（含今日）内产生过至少一次活跃行为的去重用户数')}
          >
            {t('月活跃用户（MAU）')}
          </span>
          <span className={styles.kpiValue}>
            {loading ? '…' : (stats?.mau ?? 0)}
          </span>
          <span className={styles.kpiHint}>{t('近 30 天滚动窗口（含今日）')}</span>
        </div>
        <div className={styles.kpiCard}>
          <span
            className={styles.kpiLabel}
            title={t('DAU ÷ MAU，衡量用户回访使用的频繁程度，越高代表用户越习惯使用平台')}
          >
            {t('粘性（DAU/MAU）')}
          </span>
          <span className={styles.kpiValue}>{stickinessText}</span>
          <span className={styles.kpiHint}>{t('DAU ÷ MAU')}</span>
        </div>
      </div>

      <div className={styles.chartBody}>
        {loading ? (
          <div className={styles.chartEmpty}>{t('加载中...')}</div>
        ) : !stats || stats.series.length === 0 ? (
          <div className={styles.chartEmpty}>{t('暂无数据')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={stats.series}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-subtle)"
              />
              <XAxis
                dataKey="date"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
              <YAxis
                allowDecimals={false}
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={40}
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
              <Legend />
              <Line
                type="monotone"
                dataKey="dau"
                name={t('日活跃用户（DAU）')}
                stroke="var(--primary-500)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="mau"
                name={t('月活跃用户（MAU）')}
                stroke="var(--primary-300)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};
