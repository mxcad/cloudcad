import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from '../ShareManagePage.module.css';

interface ShareStateViewProps {
  loading: boolean;
  error: string | null;
  search: string;
  onRetry: () => void;
  onClearSearch: () => void;
  onCreate: () => void;
}

export const ShareStateView: React.FC<ShareStateViewProps> = ({
  loading,
  error,
  search,
  onRetry,
  onClearSearch,
  onCreate,
}) => {
  if (loading) {
    return (
      <div className={styles.loading}>
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: 'var(--primary-500)' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.tableContainer}>
        <div className={styles.tableEmpty}>
          <p style={{ marginBottom: '8px' }}>{error}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('重试')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <div className={styles.tableEmpty}>
        <p className={styles.emptyTitle}>
          {search ? t('没有找到匹配的分享') : t('还没有分享过图纸')}
        </p>
        <p className={styles.emptyDesc}>
          {search
            ? t('尝试其他搜索词')
            : t('去文件管理器选择图纸，右键即可分享')}
        </p>
        {search && (
          <Button
            variant="secondary"
            size="sm"
            style={{ marginTop: '12px' }}
            onClick={onClearSearch}
          >
            {t('清除搜索')}
          </Button>
        )}
        {!search && (
          <Button
            variant="primary"
            size="sm"
            style={{ marginTop: '16px' }}
            onClick={onCreate}
          >
            {t('新建分享')}
          </Button>
        )}
      </div>
    </div>
  );
};
