import React, { useCallback, useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { t } from '@/languages';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tag } from '@/components/ui/Tag';
import { SelectableTable } from '@/components/common/SelectableTable';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { useFileBrowserSelection } from '@/hooks/file-browser';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import {
  feedbackAttachmentAdminControllerList,
  feedbackAttachmentAdminControllerRemove,
  feedbackAttachmentAdminControllerBatchRemove,
} from '@/api-sdk';
import type { FeedbackAttachmentDto } from '@/api-sdk';
import { FeedbackAttachmentList } from '@/components/feedback/FeedbackAttachmentList';
import {
  canDownloadAttachment,
  canViewAttachment,
  useAttachmentActions,
} from '@/components/feedback/attachmentActions';

const PAGE_SIZE = 30;

const TYPE_LABEL: Record<string, string> = {
  IMAGE: '图片',
  DOCUMENT: '文档',
  DRAWING: '图纸',
};
const KIND_LABEL: Record<string, string> = {
  FILE: '副本',
  REFERENCE: '引用',
};
const TYPE_TAG: Record<string, 'info' | 'warning' | 'success'> = {
  IMAGE: 'info',
  DOCUMENT: 'warning',
  DRAWING: 'success',
};

function formatSize(size: number | null): string {
  if (!size) return '';
  const mb = size / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${(size / 1024).toFixed(0)}KB`;
}

/**
 * 附件资源管理（管理端，ADR-0085 方案 B）——独立于文件系统/项目/个人空间。
 *
 * 聚合反馈附件（图片/文档/图纸，含副本与引用形态）。图纸引用仅存 nodeId、
 * 删除不删图纸本体；副本删除会移除附件存储中的物理文件。删除留审计。
 *
 * 多选：SelectableTable 统一容器（ADR-0052：表头全选/行勾选/框选/Shift 区间）
 * + useFileBrowserSelection 选择内核 + BatchActionBar 批量操作栏
 * + useSelectionShortcuts（ESC 清空 / Ctrl+A 全选 / Delete 批量删除）。
 * 翻页/筛选/搜索变化清空选择（避免误删当前不可见的行）。
 */
export const FeedbackAttachmentAdminPanel: React.FC = () => {
  const { showConfirm, showToast } = useNotification();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [typeFilter, setTypeFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const listQuery = useQuery<{
    items: FeedbackAttachmentDto[];
    total: number;
  }>({
    queryKey: [
      'feedback-attachments-admin',
      page,
      pageSize,
      typeFilter,
      kindFilter,
      searchQuery,
    ],
    queryFn: async () => {
      const res = await feedbackAttachmentAdminControllerList({
        throwOnError: true,
        query: {
          page,
          pageSize,
          type: (typeFilter || undefined) as 'IMAGE' | 'DOCUMENT' | 'DRAWING' | undefined,
          kind: (kindFilter || undefined) as 'FILE' | 'REFERENCE' | undefined,
          search: searchQuery || undefined,
        },
      });
      const d = res.data as
        | { items: FeedbackAttachmentDto[]; total: number }
        | undefined;
      return { items: d?.items ?? [], total: d?.total ?? 0 };
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  // 选择模型：复用文件系统多选内核（ADR-0052），以附件 id 为 id。
  // nodes 为当前页项；全选/Shift 区间作用于当前页 nodes。
  const selectableNodes = useMemo(() => items.map((a) => ({ id: a.id })), [items]);
  const {
    selectedNodes: selectedIds,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
    deselectNode,
  } = useFileBrowserSelection({ nodes: selectableNodes, multiple: 'always' });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await feedbackAttachmentAdminControllerRemove({
        throwOnError: true,
        path: { id },
      });
    },
    onSuccess: (_data, id) => {
      showToast(t('附件已删除'), 'success');
      // 单删后从选中集移除（保留其余选中）
      deselectNode(id);
      void queryClient.invalidateQueries({
        queryKey: ['feedback-attachments-admin'],
      });
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const batchRemoveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await feedbackAttachmentAdminControllerBatchRemove({
        throwOnError: true,
        body: { ids },
      });
      return res.data as { deleted: number; notFoundIds: string[] } | undefined;
    },
    onSuccess: (data) => {
      const deleted = data?.deleted ?? 0;
      const notFound = data?.notFoundIds?.length ?? 0;
      showToast(
        notFound > 0
          ? t('已删除 {n} 个附件，{m} 个不存在', { n: deleted, m: notFound })
          : t('已删除 {n} 个附件', { n: deleted }),
        'success'
      );
      clearSelection();
      void queryClient.invalidateQueries({
        queryKey: ['feedback-attachments-admin'],
      });
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const handleRemove = useCallback(
    async (att: FeedbackAttachmentDto) => {
      const confirmed = await showConfirm({
        title: t('删除附件'),
        message: t('确定删除该附件吗？删除后不可恢复。{kind} 附件不删除图纸本体。', {
          kind: t(KIND_LABEL[att.kind] ?? ''),
        }),
        confirmText: t('删除'),
      });
      if (confirmed) removeMutation.mutate(att.id);
    },
    [showConfirm, removeMutation]
  );

  const handleBatchRemove = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await showConfirm({
      title: t('确认批量删除'),
      message: t('确定要删除选中的 {count} 个附件吗？', {
        count: String(selectedIds.size),
      }),
      confirmText: t('删除'),
    });
    if (confirmed) batchRemoveMutation.mutate(Array.from(selectedIds));
  }, [selectedIds, showConfirm, batchRemoveMutation]);

  // 多选快捷键：ESC 清空 / Ctrl+A 全选 / Delete 批量删除
  useSelectionShortcuts({
    enabled: !listQuery.isLoading,
    onClearSelection: clearSelection,
    onSelectAll: handleSelectAll,
    onDeleteSelected: handleBatchRemove,
    canDelete: selectedIds.size > 0,
  });

  // 查看/下载动作（图片预览 / 引用图纸进编辑器 / 真实下载）；
  // token 临近过期时重取列表拿新 DTO 再动作
  const { handleView, handleDownload, previewModal } = useAttachmentActions({
    onStaleView: useCallback(
      async (attachmentId: string) => {
        const { data } = await listQuery.refetch();
        return data?.items.find((a) => a.id === attachmentId) ?? null;
      },
      [listQuery]
    ),
  });

  // 翻页/筛选/搜索变化清空选择（避免误删当前不可见的行）
  const handlePageChange = useCallback(
    (next: number) => {
      clearSelection();
      setPage(next);
    },
    [clearSelection]
  );
  // 每页条数变化：清空选择并重置到第一页（新条数下深层页码无意义）
  const handlePageSizeChange = useCallback(
    (next: number) => {
      if (next === pageSize) return;
      clearSelection();
      setPageSize(next);
      setPage(1);
    },
    [pageSize, clearSelection]
  );
  const handleTypeChange = useCallback(
    (v: string) => {
      clearSelection();
      setTypeFilter(v);
      setPage(1);
    },
    [clearSelection]
  );
  const handleKindChange = useCallback(
    (v: string) => {
      clearSelection();
      setKindFilter(v);
      setPage(1);
    },
    [clearSelection]
  );
  const handleSearchSubmit = useCallback(() => {
    clearSelection();
    setPage(1);
    setSearchQuery(search.trim());
  }, [clearSelection, search]);

  const batchBar =
    selectedIds.size > 0 ? (
      <BatchActionBar
        count={selectedIds.size}
        onClear={clearSelection}
        actions={[
          {
            key: 'delete',
            label: t('批量删除'),
            icon: Trash2,
            variant: 'danger',
            onClick: () => void handleBatchRemove(),
            loading: batchRemoveMutation.isPending,
          },
        ]}
      />
    ) : undefined;

  return (
    <>
      {/* 筛选栏 */}
      <div className="flex-shrink-0 mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={typeFilter}
          onChange={handleTypeChange}
          options={[
            { value: '', label: t('全部类型') },
            { value: 'IMAGE', label: t('图片') },
            { value: 'DOCUMENT', label: t('文档') },
            { value: 'DRAWING', label: t('图纸') },
          ]}
          className="w-32"
        />
        <Select
          value={kindFilter}
          onChange={handleKindChange}
          options={[
            { value: '', label: t('全部形态') },
            { value: 'FILE', label: t('副本') },
            { value: 'REFERENCE', label: t('引用') },
          ]}
          className="w-32"
        />
        <div className="flex gap-2 ml-auto">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('搜索文件名/查询码/上传者')}
            className="w-56"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearchSubmit();
            }}
          />
          <Button variant="secondary" icon={Search} onClick={handleSearchSubmit}>
            {t('搜索')}
          </Button>
          <div className="text-xs text-[var(--text-tertiary)] self-center">
            {t('共 {n} 个附件', { n: total })}
          </div>
        </div>
      </div>

      <Card
        variant="outlined"
        padding="none"
        radius="xl"
        className="flex-1 min-h-0 flex flex-col"
      >
        <SelectableTable<FeedbackAttachmentDto>
          rows={items}
          rowId={(a) => a.id}
          selectedIds={selectedIds}
          loading={listQuery.isLoading}
          loadingView={
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]">
              {t('加载中...')}
            </div>
          }
          emptyView={
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]">
              {t('暂无附件')}
            </div>
          }
          bottomBar={batchBar}
          paginationMeta={{
            total,
            page,
            limit: pageSize,
            totalPages: Math.ceil(total / pageSize),
          }}
          onPageChange={handlePageChange}
          showSizeChanger
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[30, 50, 100]}
          onToggleSelect={handleNodeSelect}
          onToggleSelectAll={handleSelectAll}
          onRubberBandSelect={selectMany}
          renderHeader={() => (
            <>
              <th className="px-4 py-2 font-medium">{t('附件')}</th>
              <th className="px-4 py-2 font-medium">{t('类型')}</th>
              <th className="px-4 py-2 font-medium">{t('形态')}</th>
              <th className="px-4 py-2 font-medium">{t('大小')}</th>
              <th className="px-4 py-2 font-medium">{t('上传者')}</th>
              <th className="px-4 py-2 font-medium">{t('时间')}</th>
              <th className="px-4 py-2 font-medium text-right">{t('操作')}</th>
            </>
          )}
          renderRow={(att) => (
            <>
              <td className="px-4 py-2">
                <FeedbackAttachmentList attachments={[att]} compact />
              </td>
              <td className="px-4 py-2">
                <Tag variant={TYPE_TAG[att.type] ?? 'neutral'}>
                  {t(TYPE_LABEL[att.type] ?? att.type)}
                </Tag>
              </td>
              <td className="px-4 py-2 text-xs">
                {t(KIND_LABEL[att.kind] ?? att.kind)}
              </td>
              <td className="px-4 py-2 text-xs">{formatSize(att.size)}</td>
              <td className="px-4 py-2 text-xs">
                {att.uploadedByName || t('匿名')}
              </td>
              <td className="px-4 py-2 text-xs whitespace-nowrap">
                {new Date(att.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <div
                  className="flex justify-end gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canViewAttachment(att) && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void handleView(att)}
                    >
                      {t('查看')}
                    </Button>
                  )}
                  {canDownloadAttachment(att) && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void handleDownload(att)}
                    >
                      {t('下载')}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => handleRemove(att)}
                  >
                    {t('删除')}
                  </Button>
                </div>
              </td>
            </>
          )}
        />
      </Card>
      {previewModal}
    </>
  );
};

export default FeedbackAttachmentAdminPanel;
