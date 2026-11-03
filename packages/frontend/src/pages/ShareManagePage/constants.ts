import { t } from '@/languages';
import type { SortField } from './types';

export const SORTABLE_COLUMNS: { field: SortField; label: string }[] = [
  { field: 'createdAt', label: t('创建时间') },
  { field: 'expiresAt', label: t('有效期') },
  { field: 'usedCount', label: t('次数') },
];

/** 分享列表每页条数（前端默认值，前端恒显式传 pageSize） */
export const PAGE_SIZE = 30;
