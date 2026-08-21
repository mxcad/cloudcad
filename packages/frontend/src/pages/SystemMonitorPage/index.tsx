import React, { useEffect, useState } from 'react';
import { usePermission } from '../../hooks/usePermission';
import { SystemPermission } from '../../constants/permissions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { t } from '@/languages';
import { useTheme } from '../../contexts/ThemeContext';
import { Activity } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Shield } from 'lucide-react';
import { Button, Tag, Tabs, TabButton } from '@/components/ui';
import { useCoreServices } from './hooks/useCoreServices';
import { useCacheMonitor } from './hooks/useCacheMonitor';
import { useAlertHistory } from './hooks/useAlertHistory';
import { useBackgroundTasks } from './hooks/useBackgroundTasks';
import { CoreServicesTab } from './components/CoreServicesTab';
import { CacheMonitorTab } from './components/CacheMonitorTab';
import { AlertHistoryTab } from './components/AlertHistoryTab';
import { BackgroundTasksTab } from './components/BackgroundTasksTab';
import { MONITOR_TABS } from './types';
import type { MonitorTab } from './types';
import styles from './SystemMonitorPage.module.css';

/** 已实现内容的 Tab（其余为预留占位，见 MONITOR_TABS 注释） */
const AVAILABLE_TABS: MonitorTab[] = [
  'core',
  'cache',
  'backgroundTasks',
  'alertHistory',
];

const TAB_LABELS: Record<MonitorTab, string> = {
  core: t('核心服务'),
  cache: t('缓存监控'),
  backgroundTasks: t('后台任务'),
  conversionQueue: t('转换队列'),
  alertHistory: t('告警历史'),
};

export const SystemMonitorPage: React.FC = () => {
  useDocumentTitle(t('系统监控'));
  const { hasPermission } = usePermission();
  const { isDark } = useTheme();

  const [permissionChecked, setPermissionChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [activeTab, setActiveTab] = useState<MonitorTab>('core');
  const [alertPage, setAlertPage] = useState(1);

  const coreServices = useCoreServices();
  const cacheMonitor = useCacheMonitor(activeTab === 'cache');
  const alertHistory = useAlertHistory(activeTab === 'alertHistory', alertPage);
  const backgroundTasks = useBackgroundTasks(activeTab === 'backgroundTasks');

  useEffect(() => {
    const canAccess = hasPermission(SystemPermission.SYSTEM_MONITOR);
    setHasAccess(canAccess);
    setPermissionChecked(true);
  }, [hasPermission]);

  if (!permissionChecked) {
    return (
      <div
        className={styles.monitorPage}
        data-theme={isDark ? 'dark' : 'light'}
      >
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <p>{t('加载中...')}</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div
        className={styles.monitorPage}
        data-theme={isDark ? 'dark' : 'light'}
      >
        <div className={styles.noAccessCard}>
          <div className={styles.noAccessIcon}>
            <Shield size={48} />
          </div>
          <h2>{t('访问受限')}</h2>
          <p>{t('您需要系统监控权限才能访问此页面')}</p>
        </div>
      </div>
    );
  }

  const isAdmin = hasPermission(SystemPermission.SYSTEM_ADMIN);
  const overallStatus = coreServices.overallStatus;

  return (
    <div className={styles.monitorPage} data-theme={isDark ? 'dark' : 'light'}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.titleSection}>
            <div className={styles.titleIcon}>
              <Activity size={24} />
            </div>
            <div className={styles.titleText}>
              <h1>{t('系统监控')}</h1>
              <p>{t('实时监控系统运行状态与性能指标')}</p>
            </div>
          </div>
        </div>

        <div className={styles.headerRight}>
          <Tag
            dot
            variant={
              overallStatus === 'healthy'
                ? 'success'
                : overallStatus === 'degraded'
                  ? 'warning'
                  : 'neutral'
            }
            className="px-3 py-1.5 text-sm"
          >
            {overallStatus === 'healthy'
              ? t('系统正常')
              : overallStatus === 'degraded'
                ? t('系统降级')
                : t('检测中')}
          </Tag>

          {activeTab === 'core' && (
            <Button
              variant="primary"
              className={styles.refreshButton}
              onClick={coreServices.refresh}
              loading={coreServices.loading}
              icon={RefreshCw}
            >
              {coreServices.loading ? t('刷新中...') : t('立即刷新')}
            </Button>
          )}
        </div>
      </header>

      <div className={styles.tabsRow}>
        <Tabs>
          {MONITOR_TABS.map((tabKey) => {
            const available = AVAILABLE_TABS.includes(tabKey);
            return (
              <TabButton
                key={tabKey}
                active={activeTab === tabKey}
                disabled={!available}
                onClick={() => available && setActiveTab(tabKey)}
                title={available ? undefined : t('该功能即将上线')}
              >
                {TAB_LABELS[tabKey]}
              </TabButton>
            );
          })}
        </Tabs>
      </div>

      {coreServices.error && activeTab === 'core' && (
        <div className={styles.errorBanner}>
          <Shield size={20} />
          <span>{coreServices.error}</span>
          <Button variant="secondary" onClick={coreServices.refresh}>
            {t('重试')}
          </Button>
        </div>
      )}

      <main className={styles.mainContent}>
        {activeTab === 'core' && (
          <CoreServicesTab
            systemHealth={coreServices.systemHealth}
            loading={coreServices.loading}
          />
        )}
        {activeTab === 'cache' && (
          <CacheMonitorTab state={cacheMonitor} isAdmin={isAdmin} />
        )}
        {activeTab === 'alertHistory' && (
          <AlertHistoryTab
            state={alertHistory}
            page={alertPage}
            onPageChange={setAlertPage}
          />
        )}
        {activeTab === 'backgroundTasks' && (
          <BackgroundTasksTab state={backgroundTasks} />
        )}
      </main>
    </div>
  );
};

export default SystemMonitorPage;
