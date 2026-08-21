import React, { useMemo, useState } from 'react';
import { usePermission } from '../../hooks/usePermission';
import { useNotification } from '@/contexts/NotificationContext';
import { SystemPermission } from '../../constants/permissions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFileBrowserSelection } from '@/hooks/file-browser';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { t } from '@/languages';
import {
  useAuditLogList,
  useAuditLogStats,
  useAuditProjectOptions,
} from './hooks/useAuditLog';
import { DEFAULT_FILTERS } from './constants';
import type { AuditFilters } from './types';
import styles from './AuditLogPage.module.css';
import { AuditStatsGrid } from './components/AuditStatsGrid';
import { AuditFilterSection } from './components/AuditFilterSection';
import { AuditLogTable } from './components/AuditLogTable';
import { exportAuditLogsCsv } from './utils/exportAuditCsv';

export const AuditLogPage: React.FC = () => {
  useDocumentTitle(t('审计日志'));
  const { hasPermission } = usePermission();
  const { showToast } = useNotification();

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);

  const queryParams = {
    page: String(page),
    limit: String(limit),
    ...(filters.userId && { userId: filters.userId }),
    // 多选值逗号分隔传给后端（后端按 in 查询）
    ...(filters.action.length > 0 && { action: filters.action.join(',') }),
    ...(filters.resourceType.length > 0 && {
      resourceType: filters.resourceType.join(','),
    }),
    ...(filters.resourceId && { resourceId: filters.resourceId }),
    // #207 阶段 3：项目维度过滤。后端已支持 projectId（@ApiQuery），
    // 待 api-sdk 重新生成（generate:swagger + generate:api-types）后启用：
    // ...(filters.projectId && { projectId: filters.projectId }),
    ...(filters.startDate && { startDate: filters.startDate }),
    ...(filters.endDate && { endDate: filters.endDate }),
    ...(filters.success !== '' && {
      success: filters.success === 'true' ? 'true' : 'false',
    }),
  };

  const hasAdminPermission = hasPermission(SystemPermission.SYSTEM_ADMIN);

  const {
    logs,
    total,
    loading,
    refetch: refetchLogs,
  } = useAuditLogList(queryParams);

  const { statistics, refetch: refetchStats } = useAuditLogStats();

  const { projects, loading: projectsLoading } = useAuditProjectOptions();

  // ── 滚动分页数据合并（筛选变化时整体替换；审计日志只读不绑 Delete 快捷键）──
  const {
    viewNodes: viewLogs,
    handleScrollPageChange,
    minLoadedPage,
  } = useAccumulatedPagination({
    displayNodes: logs,
    currentPage: page,
    handlePageChange: setPage,
    resetKey: JSON.stringify(filters),
  });

  // ── 多选（ADR-0052 统一机制：选择内核 + 快捷键 + 滚动分页合并）──
  // 内核 nodes 与渲染 rows（viewLogs 累积列表）保持一致：
  // 跨页滚动后表头全选/Ctrl+A 作用于全部已加载页，勾选状态与行为不脱节
  const selectableLogs = useMemo(
    () => viewLogs.map((l) => ({ id: l.id })),
    [viewLogs]
  );
  const {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  } = useFileBrowserSelection({ nodes: selectableLogs, multiple: 'always' });
  const selectedCount = selectedNodes.size;

  // 多选快捷键：ESC 清空 / Ctrl+A 全选（审计日志只读，无 Delete 语义）
  useSelectionShortcuts({
    enabled: !loading,
    onClearSelection: clearSelection,
    onSelectAll: handleSelectAll,
    enabledKeys: ['clear', 'select-all'],
  });

  if (!hasAdminPermission) {
    return (
      <div className={styles.permissionDenied}>
        <div className="text-center">
          <p>{t('您没有访问审计日志的权限')}</p>
        </div>
      </div>
    );
  }

  const handleFilterChange = (key: string, value: string | string[]) => {
    // 日期校验：开始日期不能晚于结束日期（YYYY-MM-DD 字符串可直接比较）
    if (key === 'startDate' || key === 'endDate') {
      const nextStart =
        key === 'startDate' ? (value as string) : filters.startDate;
      const nextEnd = key === 'endDate' ? (value as string) : filters.endDate;
      if (nextStart && nextEnd && nextStart > nextEnd) {
        showToast(t('开始日期不能晚于结束日期'), 'warning');
        return;
      }
    }
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    // 查询身份变更，历史选择不再指向当前列表
    clearSelection();
  };

  const handleResetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setPage(1);
    clearSelection();
  };

  const handleRefresh = () => {
    refetchLogs();
    refetchStats();
  };

  // 批量导出 CSV：仅导出当前页选中行（前端生成，零后端改动）
  const handleExportSelected = () => {
    const selectedLogs = viewLogs.filter((l) => selectedNodes.has(l.id));
    if (selectedLogs.length === 0) {
      showToast(t('请先选择要导出的日志'), 'warning');
      return;
    }
    exportAuditLogsCsv(selectedLogs);
    showToast(t('已导出 {count} 条日志', { count: String(selectedLogs.length) }), 'success');
  };

  // 空态提示区分：无筛选 → 暂无数据；仅时间筛选无结果 → 提示调整时间；
  // 时间+其他筛选叠加时无法归因 → 用通用提示（避免"请调整时间"误导）
  const hasDateFilters = Boolean(filters.startDate || filters.endDate);
  const hasNonDateFilters = Boolean(
    filters.userId ||
    filters.action.length > 0 ||
    filters.resourceType.length > 0 ||
    filters.resourceId ||
    filters.projectId ||
    filters.success !== ''
  );
  const hasFilters = hasDateFilters || hasNonDateFilters;
  const onlyDateFilters = hasDateFilters && !hasNonDateFilters;

  const totalPages = Math.ceil((total || 0) / limit);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('审计日志')}</h1>
        <p className={styles.pageSubtitle}>{t('查看系统操作审计日志')}</p>
      </div>

      <AuditStatsGrid statistics={statistics} />

      <AuditFilterSection
        filters={filters}
        loading={loading}
        projects={projects}
        projectsLoading={projectsLoading}
        onFilterChange={handleFilterChange}
        onReset={handleResetFilters}
        onRefresh={handleRefresh}
      />

      <AuditLogTable
        logs={viewLogs}
        loading={loading}
        page={page}
        limit={limit}
        total={total}
        totalPages={totalPages}
        selectedIds={selectedNodes}
        onToggleSelect={handleNodeSelect}
        onToggleSelectAll={handleSelectAll}
        onRubberBandSelect={selectMany}
        onPageChange={(next) => {
          clearSelection();
          setPage(next);
        }}
        onScrollPageChange={handleScrollPageChange}
        minLoadedPage={minLoadedPage}
        hasFilters={hasFilters}
        onlyDateFilters={onlyDateFilters}
        // 底部悬浮操作栏：列表滚动容器内 sticky 吸底（列表撑满一屏，不遮分页栏）
        bottomBar={
          selectedCount > 0 ? (
            <BatchActionBar
              count={selectedCount}
              onClear={clearSelection}
              actions={[
                {
                  key: 'export',
                  label: t('导出 CSV'),
                  onClick: handleExportSelected,
                },
              ]}
            />
          ) : undefined
        }
      />
    </div>
  );
};

export default AuditLogPage;
