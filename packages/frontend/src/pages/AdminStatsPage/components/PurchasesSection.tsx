import React from 'react';
import { ShoppingBag } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { DailyPurchasesStatsDto } from '@/api-sdk';
import { t } from '@/languages';
import { centsToYuan } from '@/utils/priceUtils';
import styles from '../AdminStatsPage.module.css';

export interface PurchasesSectionProps {
  stats: DailyPurchasesStatsDto | undefined;
  loading: boolean;
}

/**
 * 每日会员购买区块：KPI 卡片 + 订单/用户折线与金额柱状组合图 + 档位细分表
 */
export const PurchasesSection: React.FC<PurchasesSectionProps> = ({
  stats,
  loading,
}) => {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <ShoppingBag size={18} className={styles.sectionIcon} />
        <div>
          <h2>{t('每日会员购买')}</h2>
          <p>
            {t('仅统计成功支付订单（按支付完成时间归日），退款单单列不扣减')}
          </p>
        </div>
      </div>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{t('成功支付订单')}</span>
          <span className={styles.kpiValue}>
            {loading ? '…' : (stats?.totals.orderCount ?? 0)}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{t('付费用户数（去重）')}</span>
          <span className={styles.kpiValue}>
            {loading ? '…' : (stats?.totals.userCount ?? 0)}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{t('支付金额合计')}</span>
          <span className={styles.kpiValue}>
            ¥{loading ? '…' : centsToYuan(stats?.totals.amount ?? 0)}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{t('退款单数')}</span>
          <span className={styles.kpiValue}>
            {loading ? '…' : (stats?.totals.refundedCount ?? 0)}
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
            <ComposedChart
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
                yAxisId="count"
                allowDecimals={false}
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <YAxis
                yAxisId="amount"
                orientation="right"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) => `¥${centsToYuan(value)}`}
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
                formatter={(value, name) =>
                  name === t('支付金额')
                    ? [`¥${centsToYuan(Number(value))}`, name]
                    : [String(value), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="amount"
                dataKey="amount"
                name={t('支付金额')}
                fill="var(--primary-100)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="orderCount"
                name={t('订单笔数')}
                stroke="var(--primary-500)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="userCount"
                name={t('付费用户数')}
                stroke="var(--accent-500)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {!loading && stats && stats.byTier.length > 0 && (
        <table className={styles.tierTable}>
          <thead>
            <tr>
              <th>{t('会员档位')}</th>
              <th>{t('订单笔数')}</th>
              <th>{t('付费用户数')}</th>
              <th>{t('金额合计')}</th>
            </tr>
          </thead>
          <tbody>
            {stats.byTier.map((tier) => (
              <tr key={tier.tierId ?? `level-${tier.tierLevel}`}>
                <td>{tier.tierName ?? t('未知档位')}</td>
                <td>{tier.orderCount}</td>
                <td>{tier.userCount}</td>
                <td>¥{centsToYuan(tier.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};
