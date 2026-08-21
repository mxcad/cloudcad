import React from 'react';
import { Filter, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { dateOnlyToIso, isoToDateOnly } from '@/utils/dateUtils';
import { Select, MultiSelect } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from '../AuditLogPage.module.css';
import {
  AUDIT_ACTIONS,
  RESOURCE_TYPES,
  getActionDisplayName,
  getResourceTypeDisplayName,
} from '../constants';
import type { AuditFilters } from '../types';

interface AuditFilterSectionProps {
  filters: AuditFilters;
  loading: boolean;
  /** 项目维度过滤下拉数据源（{ id, name }） */
  projects: Array<{ id: string; name: string }>;
  projectsLoading: boolean;
  onFilterChange: (key: string, value: string | string[]) => void;
  onReset: () => void;
  onRefresh: () => void;
}

export const AuditFilterSection: React.FC<AuditFilterSectionProps> = ({
  filters,
  loading,
  projects,
  projectsLoading,
  onFilterChange,
  onReset,
  onRefresh,
}) => {
  return (
    <div className={styles.filterSection}>
      <div className={styles.filterTitle}>
        <Filter className="w-5 h-5" />
        <h2>{t('筛选条件')}</h2>
      </div>
      <div className={styles.filterGrid}>
        <div>
          <label className={styles.label}>{t('用户 ID')}</label>
          <Input
            type="text"
            placeholder={t('输入用户 ID')}
            value={filters.userId}
            onChange={(e) => onFilterChange('userId', e.target.value)}
          />
        </div>
        <div>
          <label className={styles.label}>{t('操作类型')}</label>
          <MultiSelect
            value={filters.action}
            onChange={(values) => onFilterChange('action', values)}
            options={AUDIT_ACTIONS.map((action) => ({
              value: action,
              label: getActionDisplayName(action),
            }))}
            placeholder={t('全部')}
            clearable
          />
        </div>
        <div>
          <label className={styles.label}>{t('资源类型')}</label>
          <MultiSelect
            value={filters.resourceType}
            onChange={(values) => onFilterChange('resourceType', values)}
            options={RESOURCE_TYPES.map((type) => ({
              value: type,
              label: getResourceTypeDisplayName(type),
            }))}
            placeholder={t('全部')}
            clearable
          />
        </div>
        <div>
          <label className={styles.label}>{t('项目')}</label>
          <Select
            value={filters.projectId}
            onChange={(value) => onFilterChange('projectId', value)}
            options={projects.map((project) => ({
              value: project.id,
              label: project.name,
            }))}
            placeholder={projectsLoading ? t('加载中...') : t('全部')}
            clearable
            disabled={projectsLoading}
          />
        </div>
        <div>
          <label className={styles.label}>{t('资源 ID')}</label>
          <Input
            type="text"
            placeholder={t('输入资源 ID')}
            value={filters.resourceId}
            onChange={(e) => onFilterChange('resourceId', e.target.value)}
          />
        </div>
        <div>
          <label className={styles.label}>{t('开始日期')}</label>
          <DatePicker
            placeholder={t('开始日期')}
            value={dateOnlyToIso(filters.startDate)}
            onChange={(v) => onFilterChange('startDate', isoToDateOnly(v))}
          />
        </div>
        <div>
          <label className={styles.label}>{t('结束日期')}</label>
          <DatePicker
            placeholder={t('结束日期')}
            value={dateOnlyToIso(filters.endDate)}
            onChange={(v) => onFilterChange('endDate', isoToDateOnly(v))}
          />
        </div>
        <div>
          <label className={styles.label}>{t('状态')}</label>
          <Select
            value={filters.success}
            onChange={(value) => onFilterChange('success', value)}
            options={[
              { value: 'true', label: t('成功') },
              { value: 'false', label: t('失败') },
            ]}
            placeholder={t('全部')}
            clearable
          />
        </div>
      </div>
      <div className={styles.filterActions}>
        <Button onClick={onReset} variant="outline" size="sm">
          {t('重置筛选')}
        </Button>
        <Button
          onClick={onRefresh}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}
          />
          {t('刷新')}
        </Button>
      </div>
    </div>
  );
};
