import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { Tag } from '@/components/ui';
import { t } from '@/languages';
import styles from './SystemMonitorPage.module.css';

export interface ServiceCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  status: 'up' | 'down';
  message: string;
  loading?: boolean;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  icon: Icon,
  status,
  message,
  loading,
}) => {
  const isUp = status === 'up';

  return (
    <div
      className={`${styles.serviceCard} ${loading ? styles.serviceCardLoading : ''}`}
      data-status={status}
    >
      <div className={styles.serviceHeader}>
        <div
          className={`${styles.serviceIcon} ${isUp ? styles.serviceIconHealthy : styles.serviceIconUnhealthy}`}
        >
          <Icon size={22} />
        </div>
        <div className={styles.serviceTitleArea}>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Tag
          variant={isUp ? 'success' : 'error'}
          icon={isUp ? CheckCircle : XCircle}
          size="sm"
        >
          {isUp ? t('正常') : t('异常')}
        </Tag>
      </div>

      <div className={styles.serviceDetails}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('状态消息')}</span>
          <span className={styles.detailValue}>{message}</span>
        </div>
      </div>

      <div className={styles.cardBgPattern} />
    </div>
  );
};
