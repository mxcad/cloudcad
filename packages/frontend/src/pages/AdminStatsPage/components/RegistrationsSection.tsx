import React from 'react';
import { UserPlus } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { DailyRegistrationsStatsDto } from '@/api-sdk';
import { t } from '@/languages';
import styles from '../AdminStatsPage.module.css';

export interface RegistrationsSectionProps {
  stats: DailyRegistrationsStatsDto | undefined;
  loading: boolean;
}

/**
 * 每日新增用户区块：KPI 汇总卡片 + 零填充日序列折线图
 */
export const RegistrationsSection: React.FC<RegistrationsSectionProps> = ({
  stats,
  loading,
}) => {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <UserPlus size={18} className={styles.sectionIcon} />
        <div>
          <h2>{t('每日新增用户')}</h2>
          <p>{t('按账号创建时间归日，不含已注销/删除账号')}</p>
        </div>
      </div>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{t('区间新增用户总数')}</span>
          <span className={styles.kpiValue}>
            {loading ? '…' : (stats?.total ?? 0)}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{t('日均新增')}</span>
          <span className={styles.kpiValue}>
            {loading
              ? '…'
              : stats && stats.series.length > 0
                ? (stats.total / stats.series.length).toFixed(1)
                : '0'}
          </span>
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
              <Line
                type="monotone"
                dataKey="count"
                name={t('新增用户数')}
                stroke="var(--primary-500)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};
