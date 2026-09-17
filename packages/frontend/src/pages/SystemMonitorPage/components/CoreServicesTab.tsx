import React from 'react';
import {
  Database,
  HardDrive,
  Server,
  Info,
  Clock,
  Activity,
} from 'lucide-react';
import { t } from '@/languages';
import { ServiceCard } from '../ServiceCard';
import type { SystemHealth } from '../types';
import styles from '../SystemMonitorPage.module.css';

export interface CoreServicesTabProps {
  systemHealth: SystemHealth | null;
  loading: boolean;
}

/**
 * 系统监控中心「核心服务」Tab（#217 重构：原页面核心服务/转换队列/系统信息）
 */
export const CoreServicesTab: React.FC<CoreServicesTabProps> = ({
  systemHealth,
  loading,
}) => {
  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('核心服务')}</h2>
        </div>

        <div className={styles.serviceGrid}>
          <ServiceCard
            title={t('PostgreSQL 数据库')}
            description={t('主数据库连接状态')}
            icon={Database}
            status={systemHealth?.database.status || 'down'}
            message={String(systemHealth?.database.message || t('检测中...'))}
            loading={loading && !systemHealth}
          />

          <ServiceCard
            title={t('文件存储')}
            description={t('本地文件系统')}
            icon={HardDrive}
            status={systemHealth?.storage.status || 'down'}
            message={String(systemHealth?.storage.message || t('检测中...'))}
            loading={loading && !systemHealth}
          />

          <ServiceCard
            title={t('应用服务')}
            description={t('NestJS 后端服务')}
            icon={Server}
            status="up"
            message={t('服务运行正常')}
            loading={false}
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('系统信息')}</h2>
        </div>

        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <Info size={18} />
            <div className={styles.infoContent}>
              <span className={styles.infoLabel}>{t('系统名称')}</span>
              <span className={styles.infoValue}>CloudCAD Cloud Platform</span>
            </div>
          </div>

          <div className={styles.infoCard}>
            <Server size={18} />
            <div className={styles.infoContent}>
              <span className={styles.infoLabel}>{t('运行环境')}</span>
              <span className={styles.infoValue}>
                {import.meta.env.MODE === 'production'
                  ? t('生产环境')
                  : t('开发环境')}
              </span>
            </div>
          </div>

          <div className={styles.infoCard}>
            <Clock size={18} />
            <div className={styles.infoContent}>
              <span className={styles.infoLabel}>{t('刷新间隔')}</span>
              <span className={styles.infoValue}>{t('30 秒自动刷新')}</span>
            </div>
          </div>

          <div className={styles.infoCard}>
            <Activity size={18} />
            <div className={styles.infoContent}>
              <span className={styles.infoLabel}>{t('版本')}</span>
              <span className={styles.infoValue}>v1.0.0</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
