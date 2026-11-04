import { t } from '@/languages';
import type { SortField } from './types';

/** 函数式取值：模块级 t() 会在 en-US pack 未就绪时烘焙成中文且切语言后不刷新 */
export function getSortableColumns(): { field: SortField; label: string }[] {
  return [
    { field: 'createdAt', label: t('创建时间') },
    { field: 'expiresAt', label: t('有效期') },
    { field: 'usedCount', label: t('次数') },
  ];
}

/** 分享列表每页条数（前端默认值，前端恒显式传 pageSize） */
export const PAGE_SIZE = 30;
