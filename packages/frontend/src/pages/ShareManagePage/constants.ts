import { t } from '@/languages';
import type { SortField } from './types';

export const SORTABLE_COLUMNS: { field: SortField; label: string }[] = [
  { field: 'createdAt', label: t('创建时间') },
  { field: 'expiresAt', label: t('有效期') },
  { field: 'usedCount', label: t('次数') },
];

export const PAGE_SIZE = 20;
