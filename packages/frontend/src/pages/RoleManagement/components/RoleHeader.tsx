import { Shield, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { SearchInput } from '@/components/search/SearchInput';
import { t } from '@/languages';
import styles from '../RoleManagement.module.css';

interface RoleHeaderProps {
  searchQuery: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
}

export function RoleHeader({
  searchQuery,
  loading,
  onSearchChange,
  onRefresh,
}: RoleHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageTitleSection}>
        <div className={styles.pageTitleIcon}>
          <Shield size={24} />
        </div>
        <div>
          <h1 className={styles.pageTitle}>{t('角色与权限')}</h1>
          <p className={styles.pageSubtitle}>
            {t('管理系统角色和项目角色及其操作权限')}
          </p>
        </div>
      </div>

      <SearchInput
        placeholder={t('搜索角色...')}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <Button
        variant="secondary"
        onClick={onRefresh}
        loading={loading}
        icon={RefreshCw}
        className="refresh-button"
        tooltip={t('刷新角色数据')}
      />
    </div>
  );
}
