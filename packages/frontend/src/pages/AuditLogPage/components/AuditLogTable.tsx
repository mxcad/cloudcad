import React from 'react';
import { Tag } from '@/components/ui/Tag';
import { DescriptionText } from '@/components/ui/TruncateText';
import { SelectableTable } from '@/components/common/SelectableTable';
import { t } from '@/languages';
import styles from '../AuditLogPage.module.css';
import { formatDate, getResourceTypeDisplayName } from '../constants';
import { getActionDescription } from '@/utils/auditActionTemplates';
import type { AuditLog } from '@/utils/auditActionTemplates';

interface AuditLogTableProps {
  logs: AuditLog[];
  loading: boolean;
  page: number;
  total: number;
  limit: number;
  totalPages: number;
  /** 选中 id 集合（受控，页面 useFileBrowserSelection 持有，ADR-0052） */
  selectedIds: Set<string>;
  onToggleSelect: (id: string, ctrlKey?: boolean, shiftKey?: boolean) => void;
  onToggleSelectAll: () => void;
  onRubberBandSelect?: (ids: string[]) => void;
  onPageChange: (page: number) => void;
  /** 滚动分页（滚动加载；提供后启用顶/底 loader 与页脚 visiblePage） */
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  /** 列表第一项所属页码（prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  /** 是否存在筛选条件（决定空态提示文案） */
  hasFilters?: boolean;
  /** 筛选是否仅由时间构成（时间问题导致无结果时给出专门提示；叠加其他筛选时无法归因，用通用提示） */
  onlyDateFilters?: boolean;
  /** 底部悬浮操作栏（透传给 SelectableTable，滚动容器内 sticky 吸底） */
  bottomBar?: React.ReactNode;
}

/** 详情列内容：结构化参数摘要（失败原因由 errorMsg 单独展示） */
function renderDetails(log: AuditLog): string {
  if (log.params && Object.keys(log.params).length > 0) {
    try {
      return JSON.stringify(log.params);
    } catch {
      return '-';
    }
  }
  return '-';
}

export const AuditLogTable: React.FC<AuditLogTableProps> = ({
  logs,
  loading,
  page,
  total,
  limit,
  totalPages,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRubberBandSelect,
  onPageChange,
  onScrollPageChange,
  minLoadedPage,
  hasFilters = false,
  onlyDateFilters = false,
  bottomBar,
}) => {
  // 空态提示：无筛选 → 暂无数据；仅时间筛选无结果 → 提示调整时间；其他 → 通用提示
  const emptyText = !hasFilters
    ? t('暂无数据')
    : onlyDateFilters
      ? t('所选时间范围内暂无记录，请调整时间范围')
      : t('没有找到符合筛选条件的记录');

  return (
    <div className={styles.tableContainer}>
      <SelectableTable<AuditLog>
        rows={logs}
        selectedIds={selectedIds}
        loading={loading}
        bottomBar={bottomBar}
        tableClassName={styles.table}
        loadingView={
          <div className={styles.tableEmpty}>
            <span className={styles.loadingText}>{t('加载中...')}</span>
          </div>
        }
        emptyView={<div className={styles.tableEmpty}>{emptyText}</div>}
        paginationMeta={totalPages > 1 ? { total, page, limit, totalPages } : null}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={onToggleSelectAll}
        onRubberBandSelect={onRubberBandSelect}
        onPageChange={onPageChange}
        onScrollPageChange={onScrollPageChange}
        minLoadedPage={minLoadedPage}
        renderHeader={() => (
          <>
            <th>{t('时间')}</th>
            <th>{t('用户')}</th>
            <th>{t('操作')}</th>
            <th>{t('资源类型')}</th>
            <th>{t('资源')}</th>
            <th>{t('状态')}</th>
            <th>{t('详情')}</th>
          </>
        )}
        renderRow={(log) => (
          <>
            <td>{formatDate(log.createdAt)}</td>
            <td>
              <div className={styles.userCell}>
                <div className={styles.userName}>
                  {log.user.nickname ||
                    log.user.username ||
                    log.user.email ||
                    '-'}
                </div>
                <div className={styles.userEmail}>{log.user.email}</div>
              </div>
            </td>
            <td>{getActionDescription(log)}</td>
            <td>{getResourceTypeDisplayName(log.resourceType)}</td>
            <td>
              {log.resourceName ? (
                <div>
                  <div>{log.resourceName}</div>
                  <div className={styles.userEmail}>
                    {log.resourceId || '-'}
                  </div>
                </div>
              ) : (
                <DescriptionText maxWidth={20}>
                  {log.resourceId || '-'}
                </DescriptionText>
              )}
            </td>
            <td>
              {log.success ? (
                <Tag variant="success">{t('成功')}</Tag>
              ) : (
                <Tag variant="error">{t('失败')}</Tag>
              )}
            </td>
            <td>
              <DescriptionText maxWidth={30}>
                {renderDetails(log)}
              </DescriptionText>
              {log.errorMessage && (
                <div className={styles.errorMsg}>{log.errorMessage}</div>
              )}
            </td>
          </>
        )}
      />
    </div>
  );
};
