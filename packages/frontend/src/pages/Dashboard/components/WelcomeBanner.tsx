import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { t } from '@/languages';

interface WelcomeBannerProps {
  greeting: string;
  userName: string;
  appName: string;
  isDark: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({
  greeting,
  userName,
  appName,
  isDark,
  refreshDisabled,
  onRefresh,
}) => (
  <div
    className="relative overflow-hidden rounded-2xl p-4 sm:p-6 mb-6"
    style={{
      background: isDark
        ? 'linear-gradient(135deg, var(--primary-100) 0%, var(--accent-100) 100%)'
        : 'linear-gradient(135deg, var(--primary-50) 0%, var(--accent-50) 100%)',
      border: '1px solid var(--border-default)',
    }}
  >
    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1
          className="text-2xl sm:text-3xl font-bold mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {greeting}
          {t('，')}
          {userName}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {t(`欢迎使用 ${appName}，开始您的设计工作`)}
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          variant="secondary"
          icon={RefreshCw}
          onClick={onRefresh}
          disabled={refreshDisabled}
          title={t('刷新仪表盘数据')}
        >
          {t('刷新')}
        </Button>
      </div>
    </div>
  </div>
);
