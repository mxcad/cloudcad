/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Plus, RefreshCw, Search, X, FileCode2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Menu } from '@/components/ui/Menu';
import { Tag } from '@/components/ui/Tag';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useFileBrowserSelection } from '@/hooks/file-browser';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import { SelectableTable } from '@/components/common/SelectableTable';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { t } from '@/languages';
import { globalShowToast } from '@/utils/notificationEvents';
import { useCopy } from '@/hooks/useCopy';
import { ipWhitelistControllerRemove } from '@/api-sdk';
import { AddEntryModal } from './components/AddEntryModal';
import { RemoveEntryModal } from './components/RemoveEntryModal';
import {
  FILE_ENTRY_ID_PREFIX,
  IP_WHITELIST_PAGE_SIZE,
  IP_WHITELIST_PRESETS,
  IP_WHITELIST_SOURCE_META,
} from './constants';
import {
  useAddIpWhitelistEntry,
  useBatchAddIpWhitelistPreset,
  useIpWhitelistList,
} from './hooks/useIpWhitelist';
import type { IpWhitelistEntry, IpWhitelistEntryForm } from './types';


function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

/** 本地文件条目（id 以 file: 开头）不可经接口移除 */
function isFileEntry(entry: IpWhitelistEntry): boolean {
  return entry.id.startsWith(FILE_ENTRY_ID_PREFIX);
}

/**
 * @param embedded 嵌入 IP 访问控制 Tab 时为 true：隐藏独立页头与外边距
 * （标题由外层 Tab 承担）
 */
export default function IpWhitelistPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  useDocumentTitle(t('管理员 IP 白名单'), embedded);

  // 保留 copyToClipboard 名称，调用点无需改动
  const { copy: copyToClipboard } = useCopy({
    successMessage: t('复制成功'),
    failMessage: t('复制失败'),
  });

  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTargets, setRemoveTargets] = useState<IpWhitelistEntry[] | null>(
    null
  );
  const [removing, setRemoving] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');

  // 输入防抖 500ms 后生效
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(searchInput.trim());
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { items, total, loading, refetch } = useIpWhitelistList(page, keyword);
  const addMutation = useAddIpWhitelistEntry(() => setAddOpen(false));
  const batchAddMutation = useBatchAddIpWhitelistPreset();

  const totalPages = Math.ceil(total / IP_WHITELIST_PAGE_SIZE);

  // 滚动分页数据合并（追加/前插/替换 + 竞态防护；搜索词变化时整体替换）
  const {
    viewNodes: viewItems,
    handleScrollPageChange,
    minLoadedPage,
  } = useAccumulatedPagination({
    displayNodes: items,
    currentPage: page,
    handlePageChange: setPage,
    resetKey: keyword,
  });

  // ── 多选（ADR-0052 统一机制）──
  // 本地文件条目不可移除，从可选集合中排除，避免被批量移除
  const selectableItems = useMemo(
    () =>
      viewItems
        .filter((i) => !isFileEntry(i))
        .map((i) => ({ id: i.id })),
    [viewItems]
  );
  const {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  } = useFileBrowserSelection({ nodes: selectableItems, multiple: 'always' });
  const selectedCount = selectedNodes.size;

  // 搜索词变化清空选择
  useEffect(() => {
    clearSelection();
  }, [keyword, clearSelection]);

  const openRemoveConfirm = useCallback(
    (entries: IpWhitelistEntry[]) => {
      // 过滤本地文件条目，仅可移除目标进入确认弹窗
      const removable = entries.filter((e) => !isFileEntry(e));
      if (removable.length === 0) return;
      setRemoveTargets(removable);
    },
    []
  );

  const openBatchRemove = useCallback(() => {
    const targets = viewItems.filter((i) => selectedNodes.has(i.id));
    openRemoveConfirm(targets);
  }, [viewItems, selectedNodes, openRemoveConfirm]);

  // 移除（单条/批量）：循环调用现有单条接口，统计成功/失败计数汇总
  const handleConfirmRemove = async () => {
    if (!removeTargets || removeTargets.length === 0) return;
    const targets = removeTargets;
    setRemoving(true);
    let successCount = 0;
    let failCount = 0;
    for (const entry of targets) {
      try {
        const result = await ipWhitelistControllerRemove({
          path: { id: entry.id },
        });
        if (!result.error) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    if (successCount > 0) {
      globalShowToast(
        successCount > 1
          ? t('已移除 {count} 条记录', { count: String(successCount) })
          : t('已移除'),
        'success'
      );
    }
    if (failCount > 0) {
      globalShowToast(
        t('{count} 条移除失败', { count: String(failCount) }),
        'error'
      );
    }
    setRemoving(false);
    setRemoveTargets(null);
    clearSelection();
    void refetch();
  };

  const handleSubmitAdd = (form: IpWhitelistEntryForm) => {
    addMutation.mutate(form);
  };

  // 多选快捷键：ESC 清空 / Ctrl+A 全选 / Delete 批量移除
  useSelectionShortcuts({
    enabled: !loading,
    onClearSelection: clearSelection,
    onSelectAll: handleSelectAll,
    onDeleteSelected: openBatchRemove,
    canDelete: selectedCount > 0,
  });

  return (
    <div
      className={
        embedded
          ? 'h-full flex flex-col overflow-hidden text-text-secondary'
          : 'h-full flex flex-col overflow-hidden p-6 text-text-secondary'
      }
    >
      <div
        className={
          embedded
            ? 'w-full flex flex-col flex-1 min-h-0'
            : 'max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0'
        }
      >
        <div
          className={
            embedded
              ? 'flex-shrink-0 flex items-center justify-between mb-4'
              : 'flex-shrink-0 flex items-center justify-between mb-6'
          }
        >
          {/* 保留占位节点：embedded 时无标题，justify-between 仍需两个子项才能把工具栏推右 */}
          <div className="flex items-center gap-2">
            {!embedded && (
              <h1 className="text-2xl font-bold text-text-primary">
                {t('管理员 IP 白名单')}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('搜索 IP/原因/操作人')}
                className="pl-9 pr-8 w-64"
                size="md"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label={t('清空搜索')}
                  title={t('清空搜索')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: 'var(--text-tertiary)' }}
                  onClick={() => setSearchInput('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={() => void refetch()}
            />
            <Menu>
              <Menu.Trigger>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Wand2}
                  disabled={batchAddMutation.isPending}
                >
                  {t('快速添加')}
                </Button>
              </Menu.Trigger>
              <Menu.Content align="end" style={{ width: 340 }}>
                {IP_WHITELIST_PRESETS.map((preset) => (
                  <Menu.Item
                    key={preset.key}
                    description={preset.description}
                    disabled={batchAddMutation.isPending}
                    onClick={() => batchAddMutation.mutate(preset)}
                  >
                    {preset.label}
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu>
            <Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
              {t('添加')}
            </Button>
          </div>
        </div>

        {/* 表格卡撑满剩余空间 */}
        <Card variant="outlined" padding="none" radius="xl" className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">
            <SelectableTable<IpWhitelistEntry>
              rows={viewItems}
              selectedIds={selectedNodes}
              loading={loading}
              loadingView={
                <div className="flex justify-center py-16">
                  <div
                    className="w-8 h-8 rounded-full animate-spin"
                    style={{
                      border: '3px solid var(--border-default)',
                      borderTopColor: 'var(--primary-500)',
                    }}
                  />
                </div>
              }
              emptyView={
                <div
                  className="text-center py-8 text-sm"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('暂无白名单条目')}
                </div>
              }
              paginationMeta={{
                total,
                page,
                limit: IP_WHITELIST_PAGE_SIZE,
                totalPages,
              }}
              onToggleSelect={handleNodeSelect}
              onToggleSelectAll={handleSelectAll}
              onRubberBandSelect={selectMany}
              onPageChange={(next) => {
                clearSelection();
                setPage(next);
              }}
              paginationSimple
              onScrollPageChange={handleScrollPageChange}
              minLoadedPage={minLoadedPage}
              bottomBar={
                selectedCount > 0 ? (
                  <BatchActionBar
                    count={selectedCount}
                    onClear={clearSelection}
                    actions={[
                      {
                        key: 'remove',
                        label: t('批量移除'),
                        variant: 'danger',
                        loading: removing,
                        onClick: openBatchRemove,
                      },
                    ]}
                  />
                ) : undefined
              }
              renderHeader={() => (
                <>
                  <th className="text-left">{t('IP/CIDR')}</th>
                  <th className="text-left">{t('原因')}</th>
                  <th className="text-center">{t('来源')}</th>
                  <th className="text-left">{t('操作人')}</th>
                  <th className="text-left">{t('创建时间')}</th>
                  <th className="text-left">{t('过期时间')}</th>
                  <th className="text-center">{t('操作')}</th>
                </>
              )}
              renderRow={(entry) => {
                const sourceMeta = IP_WHITELIST_SOURCE_META[entry.source];
                const fileEntry = isFileEntry(entry);
                return (
                  <>
                    <td
                      className="font-mono text-xs"
                      style={{ minWidth: 180 }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="break-all">{entry.ip}</span>
                        <button
                          type="button"
                          aria-label={t('复制 IP')}
                          title={t('复制 IP')}
                          className="shrink-0 cursor-pointer"
                          style={{ color: 'var(--text-tertiary)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyToClipboard(entry.ip);
                          }}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                    <td className="max-w-[280px] truncate">
                      <span className="flex items-center gap-1">
                        {fileEntry && <FileCode2 size={13} />}
                        <span className="truncate">{entry.reason}</span>
                      </span>
                    </td>
                    <td className="text-center">
                      <Tag variant={fileEntry ? 'info' : 'neutral'} size="xs">
                        {sourceMeta?.label ?? entry.source}
                      </Tag>
                    </td>
                    <td className="font-mono text-xs" style={{ minWidth: 180 }}>
                      <div className="flex items-center gap-1.5">
                        <span className="break-all">{entry.createdBy}</span>
                        <button
                          type="button"
                          aria-label={t('复制操作人 ID')}
                          title={t('复制操作人 ID')}
                          className="shrink-0 cursor-pointer"
                          style={{ color: 'var(--text-tertiary)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyToClipboard(entry.createdBy);
                          }}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                    <td className="text-xs">
                      {fileEntry ? t('—') : formatTime(entry.createdAt)}
                    </td>
                    <td className="text-xs">
                      {entry.expiresAt ? (
                        formatTime(entry.expiresAt)
                      ) : (
                        <Tag variant="success" size="xs">
                          {t('永久')}
                        </Tag>
                      )}
                    </td>
                    <td className="text-center">
                      {fileEntry ? (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {t('文件条目')}
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRemoveConfirm([entry]);
                          }}
                        >
                          {t('移除')}
                        </Button>
                      )}
                    </td>
                  </>
                );
              }}
            />
          </div>
        </Card>

        {/* 本地文件兜底说明 */}
        <div
          className="flex-shrink-0 mt-3 flex items-center gap-2 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <FileCode2 size={14} />
          <span>
            {t(
              '本地文件白名单条目来自服务器文件（默认 config/admin-ip-whitelist.json），用于界面误删白名单后的兜底恢复，不可在此移除。'
            )}
          </span>
        </div>
      </div>

      <AddEntryModal
        isOpen={addOpen}
        saving={addMutation.isPending}
        onClose={() => setAddOpen(false)}
        onSubmit={handleSubmitAdd}
      />

      <RemoveEntryModal
        entries={removeTargets}
        removing={removing}
        onClose={() => {
          if (!removing) setRemoveTargets(null);
        }}
        onConfirm={() => void handleConfirmRemove()}
      />
    </div>
  );
}
