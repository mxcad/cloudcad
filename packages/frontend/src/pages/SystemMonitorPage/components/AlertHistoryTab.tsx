import React from 'react';
import { RefreshCw } from 'lucide-react';
import { t } from '@/languages';
import { Button, Tag } from '@/components/ui';
import { Pagination } from '@/components/ui/Pagination';
import { DescriptionText } from '@/components/ui/TruncateText';
import type { AlertRecordDto } from '@/api-sdk';
import type { AlertHistoryState } from '../hooks/useAlertHistory';
import { ALERT_PAGE_SIZE } from '../hooks/useAlertHistory';
import { formatDateTimeWithSeconds } from '@/utils/dateUtils';
import styles from '../SystemMonitorPage.module.css';

export interface AlertHistoryTabProps {
  state: AlertHistoryState;
  page: number;
  onPageChange: (page: number) => void;
}

/**
 * 系统监控中心「告警历史」Tab（#248）
 * 分页列表 + 状态标签 + 空态；open 状态告警高亮（warning 黄 / critical 红）
 */
export const AlertHistoryTab: React.FC<AlertHistoryTabProps> = ({
  state,
  page,
  onPageChange,
}) => {
  const { data, loading, error, refreshCountdown, refresh } = state;

  const items = data?.items ?? [];
  const pagination = data?.pagination ?? {
    page: 1,
    limit: ALERT_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  };

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('告警历史')}</h2>
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

        <div className={styles.tableContainer}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('时间')}</th>
                  <th>{t('级别')}</th>
                  <th>{t('来源')}</th>
                  <th>{t('消息')}</th>
                  <th>{t('状态')}</th>
                </tr>
              </thead>
              <tbody>
                {loading && !items.length ? (
                  <tr>
                    <td colSpan={5} className={styles.tableEmpty}>
                      <span className={styles.loadingText}>
                        {t('正在获取数据')}
                      </span>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.tableEmpty}>
                      {t('暂无告警记录')}
                    </td>
                  </tr>
                ) : (
                  items.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <Pagination meta={pagination} onPageChange={onPageChange} />
          )}
        </div>
      </section>
    </>
  );
};

const AlertRow: React.FC<{ alert: AlertRecordDto }> = ({ alert }) => {
  const isOpen = alert.status === 'OPEN';
  return (
    <tr
      data-status={alert.status}
      data-level={alert.level}
      className={isOpen ? styles.alertRowOpen : undefined}
    >
      <td>{formatDateTimeWithSeconds(alert.createdAt)}</td>
      <td>
        {alert.level === 'P0' ? (
          <Tag variant="error">{t('严重')}</Tag>
        ) : alert.level === 'P1' ? (
          <Tag variant="warning">{t('警告')}</Tag>
        ) : (
          <Tag variant="neutral">{t('提示')}</Tag>
        )}
      </td>
      <td>
        <span className={styles.alertSource}>{alert.source}</span>
      </td>
      <td>
        <DescriptionText maxWidth={40}>{alert.message || '-'}</DescriptionText>
      </td>
      <td>
        {isOpen ? (
          <Tag variant={alert.level === 'P0' ? 'error' : 'warning'} dot>
            {t('未解决')}
          </Tag>
        ) : (
          <Tag variant="neutral">{t('已解决')}</Tag>
        )}
      </td>
    </tr>
  );
};
