import React from 'react';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { t } from '@/languages';
import styles from '../ShareManagePage.module.css';

interface ShareToolbarProps {
  search: string;
  hasItems: boolean;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onCreate: () => void;
}

export const ShareToolbar: React.FC<ShareToolbarProps> = ({
  search,
  hasItems,
  onSearchChange,
  onSearch,
  onCreate,
}) => {
  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) =>
            (e as unknown as React.KeyboardEvent<HTMLInputElement>).key ===
              'Enter' && onSearch()
          }
          placeholder={t('搜索文件名...')}
          leftIcon={Search}
          size="md"
        />
        <Button variant="secondary" size="sm" onClick={onSearch}>
          {t('搜索')}
        </Button>
      </div>
      <div className={styles.toolbarActions}>
        {hasItems && (
          <Button variant="primary" size="sm" onClick={onCreate}>
            <Plus size={14} />
            {t('新建分享')}
          </Button>
        )}
      </div>
    </div>
  );
};
