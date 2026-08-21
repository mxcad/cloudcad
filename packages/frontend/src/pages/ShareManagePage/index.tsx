import React from 'react';
import { Trash2 } from 'lucide-react';
import { t } from '@/languages';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import styles from './ShareManagePage.module.css';
import { useShareData } from './hooks/useShareData';
import { useShareActions } from './hooks/useShareActions';
import { ShareToolbar } from './components/ShareToolbar';
import { ShareStateView } from './components/ShareStateView';
import { ShareTable } from './components/ShareTable';
import { ShareModals } from './components/ShareModals';

export const ShareManagePage: React.FC = () => {
  const data = useShareData();
  const actions = useShareActions({
    fetchShares: data.fetchShares,
    setItems: data.setItems,
    setTotal: data.setTotal,
    page: data.page,
    search: data.search,
    sort: data.sort,
    selectedTokens: data.selectedTokens,
  });

  // 多选快捷键：ESC 清空 / Ctrl+A 全选 / Delete 批量撤销
  const selectedCount = data.selectedTokens.size;
  useSelectionShortcuts({
    enabled: !data.loading,
    onClearSelection: data.clearSelection,
    onSelectAll: data.handleSelectAll,
    onDeleteSelected: actions.openBatchRevokeConfirm,
    canDelete: selectedCount > 0,
  });

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('分享管理')}</h1>
        <p className={styles.pageSubtitle}>{t('查看和管理所有分享链接')}</p>
      </div>

      <ShareToolbar
        search={data.search}
        hasItems={data.items.length > 0}
        onSearchChange={data.setSearch}
        onSearch={data.handleSearch}
        onCreate={actions.openFileSelector}
      />

      {/* 列表为空时显示三态（加载/错误/空）；已有内容时翻页失败由表格底部失败条提示 */}
      {data.items.length === 0 ? (
        <ShareStateView
          loading={data.loading}
          error={data.error}
          search={data.search}
          onRetry={data.fetchShares}
          onClearSearch={data.handleClearSearch}
          onCreate={actions.openFileSelector}
        />
      ) : (
        <ShareTable
          items={data.items}
          selectedTokens={data.selectedTokens}
          sort={data.sort}
          copiedToken={actions.copiedToken}
          showPagination={data.total > data.pageSize}
          paginationMeta={data.paginationMeta}
          onToggleSelect={data.handleNodeSelect}
          onToggleSelectAll={data.handleSelectAll}
          onRubberBandSelect={data.selectMany}
          onSort={data.handleSort}
          onCopy={actions.handleCopy}
          onEditExpiry={actions.handleEditExpiry}
          onRevoke={actions.confirmRevoke}
          onPageChange={data.handlePageChange}
          onScrollPageChange={data.handleScrollPageChange}
          minLoadedPage={data.minLoadedPage}
          loadError={data.error}
          onRetryLoadMore={data.fetchShares}
          loading={data.loading}
          // 底部悬浮操作栏：列表滚动容器内 sticky 吸底（列表撑满一屏，不遮分页栏）
          bottomBar={
            selectedCount > 0 ? (
              <BatchActionBar
                count={selectedCount}
                onClear={data.clearSelection}
                actions={[
                  {
                    key: 'revoke',
                    label: t('批量撤销'),
                    icon: Trash2,
                    variant: 'danger',
                    onClick: actions.openBatchRevokeConfirm,
                  },
                ]}
              />
            ) : undefined
          }
        />
      )}

      <ShareModals
        showFileSelector={actions.showFileSelector}
        shareFiles={actions.shareFiles}
        showShareDialog={actions.showShareDialog}
        editTarget={actions.editTarget}
        showEditModal={actions.showEditModal}
        showRevokeConfirm={actions.showRevokeConfirm}
        revoking={actions.revoking}
        showBatchRevokeConfirm={actions.showBatchRevokeConfirm}
        batchRevoking={actions.batchRevoking}
        batchCount={data.selectedTokens.size}
        onCloseFileSelector={actions.closeFileSelector}
        onSelectFiles={actions.handleSelectFiles}
        onCloseShareDialog={actions.closeShareDialog}
        onCloseEditModal={actions.closeEditModal}
        onSaveEdit={actions.handleSaveEdit}
        onCloseRevokeConfirm={actions.closeRevokeConfirm}
        onConfirmRevoke={actions.handleRevoke}
        onCloseBatchRevokeConfirm={actions.closeBatchRevokeConfirm}
        onConfirmBatchRevoke={actions.handleBatchRevoke}
      />
    </div>
  );
};

export default ShareManagePage;
