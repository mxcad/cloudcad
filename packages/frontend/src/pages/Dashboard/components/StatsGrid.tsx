import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Upload } from 'lucide-react';
import { HardDrive } from 'lucide-react';
import { formatFileSize } from '@/utils/fileUtils';
import { t } from '@/languages';
import { StatCard } from './StatCard';

interface DashboardStats {
  projects: number;
  files: number;
  todayUploads: number;
  dwgFiles: number;
  dxfFiles: number;
  otherFiles: number;
}

interface StorageQuota {
  used: number;
  total: number;
  usagePercent?: number;
}

interface StatsGridProps {
  stats: DashboardStats;
  fileTypeSubtitle?: string;
  quotaStorage?: StorageQuota;
  quotaLoading: boolean;
  loading: boolean;
  onNavigateProjects: () => void;
  onNavigatePersonalSpace: () => void;
}

export const StatsGrid: React.FC<StatsGridProps> = ({
  stats,
  fileTypeSubtitle,
  quotaStorage,
  quotaLoading,
  loading,
  onNavigateProjects,
  onNavigatePersonalSpace,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
    <StatCard
      title={t('我的项目')}
      value={stats.projects}
      subtitle={t('活跃项目')}
      icon={FolderOpen}
      color="var(--primary-500)"
      onClick={onNavigateProjects}
      loading={loading}
    />
    <StatCard
      title={t('图纸文件')}
      value={stats.files}
      subtitle={fileTypeSubtitle}
      icon={FileText}
      color="var(--accent-500)"
      onClick={onNavigatePersonalSpace}
      loading={loading}
    />
    <StatCard
      title={t('今日上传')}
      value={stats.todayUploads}
      subtitle={t('个文件')}
      icon={Upload}
      color="#8b5cf6"
      onClick={onNavigatePersonalSpace}
      loading={loading}
    />
    <StatCard
      title={t('存储使用')}
      value={quotaStorage ? formatFileSize(quotaStorage.used) : '-'}
      subtitle={
        quotaStorage ? t('共 ') + formatFileSize(quotaStorage.total) : ''
      }
      icon={HardDrive}
      color={(quotaStorage?.usagePercent ?? 0) > 90 ? '#ef4444' : '#22c55e'}
      loading={quotaLoading}
    />
  </div>
);
