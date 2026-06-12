import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Trash2, Search, ExternalLink, Loader2, Plus, Edit3, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Tag } from '@/components/ui/Tag';
import { Checkbox } from '@/components/ui/Checkbox';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import {
  shareControllerListShares,
  shareControllerRevokeShare,
  shareControllerUpdateShare,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { SelectFileModal } from '@/components/modals/SelectFileModal';
import { ShareDialog } from '@/components/modals/ShareDialog';
import { EditExpiryModal } from '@/components/modals/EditExpiryModal';
import { ConfirmRevokeModal } from '@/components/modals/ConfirmRevokeModal';
import { formatExpiryDate, isExpired } from '@/constants/share';
import './ShareManagePage/ShareManagePage.css';

type SortField = 'createdAt' | 'expiresAt' | 'usedCount';
type SortOrder = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  order: SortOrder;
}

const SORTABLE_COLUMNS: { field: SortField; label: string }[] = [
  { field: 'createdAt', label: '创建时间' },
  { field: 'expiresAt', label: '有效期' },
  { field: 'usedCount', label: '次数' },
];

export const ShareManagePage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useNotification();

  const [items, setItems] = useState<ShareListItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const [sort, setSort] = useState<SortConfig>({ field: 'createdAt', order: 'desc' });
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());

  const [editTarget, setEditTarget] = useState<{ token: string; expiresAt: string | null } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [showBatchRevokeConfirm, setShowBatchRevokeConfirm] = useState(false);
  const [batchRevoking, setBatchRevoking] = useState(false);

  const fetchShares = useCallback(async (p: number, q: string, s: SortConfig) => {
    setLoading(true);
    setError(null);
    try {
      const result = await shareControllerListShares({
        query: {
          page: p,
          pageSize: 20,
          search: q || undefined,
          sortBy: s.field,
          sortOrder: s.order,
        },
      });
      if (result.error) {
        setError(getErrorMessage(result.error));
        return;
      }
      const data = result.data as { items: ShareListItemDto[]; total: number; page: number; pageSize: number } | undefined;
      setItems(data?.items ?? []);
      setTotal(data?.total ?? 0);
      setSelectedTokens(new Set());
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShares(page, search, sort);
  }, [page, sort]);

  const handleSearch = () => {
    setPage(1);
    fetchShares(1, search, sort);
  };

  const handleClearSearch = () => {
    setSearch('');
    setPage(1);
    fetchShares(1, '', sort);
  };

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  };

  const renderSortIcon = (field: SortField) => {
    if (sort.field !== field) return null;
    return sort.order === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />;
  };

  const toggleSelect = (token: string) => {
    setSelectedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTokens.size === items.length) {
      setSelectedTokens(new Set());
    } else {
      setSelectedTokens(new Set(items.map((i) => i.token)));
    }
  };

  const allSelected = items.length > 0 && selectedTokens.size === items.length;

  const confirmRevoke = (token: string) => {
    setRevokeTarget(token);
    setShowRevokeConfirm(true);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const result = await shareControllerRevokeShare({ path: { token: revokeTarget } });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      setItems((prev) => prev.filter((i) => i.token !== revokeTarget));
      setTotal((prev) => prev - 1);
      showToast('分享已撤销', 'success');
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setRevoking(false);
    }
  };

  const handleBatchRevoke = async () => {
    setBatchRevoking(true);
    const tokens = Array.from(selectedTokens);
    let successCount = 0;
    let failCount = 0;
    for (const token of tokens) {
      try {
        const result = await shareControllerRevokeShare({ path: { token } });
        if (!result.error) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    if (successCount > 0) {
      showToast(`已撤销 ${successCount} 个分享${failCount > 0 ? `，${failCount} 个失败` : ''}`, 'success');
    } else if (failCount > 0) {
      showToast(`撤销失败 ${failCount} 个`, 'error');
    }
    setShowBatchRevokeConfirm(false);
    setBatchRevoking(false);
    fetchShares(page, search, sort);
  };

  const handleCopy = async (linkUrl: string, token?: string) => {
    const fullUrl = `${window.location.origin}${linkUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedToken(token ?? linkUrl);
      setTimeout(() => setCopiedToken(null), 2000);
      showToast('链接已复制', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleEditExpiry = (token: string, expiresAt: string | null) => {
    setEditTarget({ token, expiresAt });
    setShowEditModal(true);
  };

  const handleSaveEdit = async (expiresAt: string | null) => {
    if (!editTarget) return;
    try {
      const result = await shareControllerUpdateShare({
        path: { token: editTarget.token },
        body: { expiresAt } as any,
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      showToast('有效期已更新', 'success');
      setShowEditModal(false);
      setEditTarget(null);
      fetchShares(page, search, sort);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const paginationMeta = useMemo(() => ({
    total,
    page,
    limit: pageSize,
    totalPages: Math.ceil(total / pageSize),
  }), [total, page, pageSize]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="share-mgmt-page">
      <div className="share-mgmt-page-header">
        <h1 className="share-mgmt-page-title">分享管理</h1>
        <p className="share-mgmt-page-subtitle">查看和管理所有分享链接</p>
      </div>

      <div className="share-mgmt-toolbar">
        <div className="share-mgmt-search">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => (e as unknown as React.KeyboardEvent<HTMLInputElement>).key === 'Enter' && handleSearch()}
            placeholder="搜索文件名..."
            leftIcon={Search}
            size="md"
          />
          <Button variant="secondary" size="sm" onClick={handleSearch}>搜索</Button>
        </div>
        <div className="share-mgmt-toolbar-actions">
          {selectedTokens.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon={Trash2}
              onClick={() => setShowBatchRevokeConfirm(true)}
              style={{ color: 'var(--error)' }}
            >
              批量撤销 ({selectedTokens.size})
            </Button>
          )}
          {items.length > 0 && (
            <Button variant="primary" size="sm" onClick={() => setShowFileSelector(true)}>
              <Plus size={14} />
              新建分享
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="share-mgmt-loading">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        </div>
      ) : error ? (
        <div className="share-mgmt-table-container">
          <div className="share-mgmt-table-empty">
            <p style={{ marginBottom: '8px' }}>{error}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchShares(page, search, sort)}>
              重试
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="share-mgmt-table-container">
          <div className="share-mgmt-table-empty">
            <p className="share-mgmt-empty-title">
              {search ? '没有找到匹配的分享' : '还没有分享过图纸'}
            </p>
            <p className="share-mgmt-empty-desc">
              {search ? '尝试其他搜索词' : '去文件管理器选择图纸，右键即可分享'}
            </p>
            {search && (
              <Button variant="ghost" size="sm" style={{ marginTop: '12px' }} onClick={handleClearSearch}>
                清除搜索
              </Button>
            )}
            {!search && (
              <Button variant="primary" size="sm" style={{ marginTop: '16px' }} onClick={() => setShowFileSelector(true)}>
                新建分享
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="share-mgmt-table-container">
          <div className="share-mgmt-table-scroll">
            <table className="share-mgmt-table">
              <thead>
                <tr>
                  <th className="share-mgmt-th-checkbox">
                    <Checkbox
                      size="xs"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>文件</th>
                  <th>链接</th>
                  <th>状态</th>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th
                      key={col.field}
                      className="share-mgmt-th-sortable"
                      onClick={() => handleSort(col.field)}
                    >
                      <span className="share-mgmt-th-content">
                        {col.label}
                        <span className="share-mgmt-sort-icon">
                          {renderSortIcon(col.field)}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const expired = isExpired(item.expiresAt as string | null);
                  return (
                    <tr key={item.id} className={selectedTokens.has(item.token) ? 'share-mgmt-row-selected' : ''}>
                      <td className="share-mgmt-td-checkbox">
                        <Checkbox
                          size="xs"
                          checked={selectedTokens.has(item.token)}
                          onChange={() => toggleSelect(item.token)}
                        />
                      </td>
                      <td className="share-mgmt-td-filename">{item.fileName}</td>
                      <td>
                        <div className="share-mgmt-link-cell">
                          <span className="share-mgmt-link-text">
                            {item.url?.length > 25 ? item.url.slice(0, 25) + '...' : item.url}
                          </span>
                          <button
                            onClick={() => handleCopy(item.url, item.token)}
                            className="share-mgmt-copy-btn"
                            title="复制链接"
                          >
                            {copiedToken === item.token ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td>
                        <Tag
                          variant={expired ? 'neutral' : 'success'}
                          size="xs"
                          onClick={() => handleEditExpiry(item.token, item.expiresAt as string | null)}
                        >
                          {expired ? '已过期' : '有效'}
                        </Tag>
                      </td>
                      <td className="share-mgmt-td-meta">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                      </td>
                      <td
                        className="share-mgmt-td-meta share-mgmt-td-clickable"
                        onClick={() => handleEditExpiry(item.token, item.expiresAt as string | null)}
                      >
                        {formatExpiryDate(item.expiresAt as string | null)}
                      </td>
                      <td className="share-mgmt-td-meta">{item.usedCount}</td>
                      <td>
                        <div className="share-mgmt-action-cell">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={ExternalLink}
                            onClick={() => navigate(item.url)}
                            tooltip="打开文件"
                          />
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Edit3}
                            onClick={() => handleEditExpiry(item.token, item.expiresAt as string | null)}
                            tooltip="修改有效期"
                          />
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Trash2}
                            onClick={() => confirmRevoke(item.token)}
                            tooltip="撤销分享"
                            style={{ color: 'var(--error)' }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > pageSize && (
            <div className="share-mgmt-pagination">
              <Pagination
                meta={paginationMeta}
                onPageChange={handlePageChange}
                simple
              />
            </div>
          )}
        </div>
      )}

      <SelectFileModal
        isOpen={showFileSelector}
        onClose={() => setShowFileSelector(false)}
        onConfirm={(fileId, _fileName) => {
          setShowFileSelector(false);
          setShareFileId(fileId);
          setShowShareDialog(true);
        }}
      />

      {shareFileId && (
        <ShareDialog
          isOpen={showShareDialog}
          onClose={() => {
            setShowShareDialog(false);
            setShareFileId(null);
            fetchShares(page, search, sort);
          }}
          fileId={shareFileId}
        />
      )}

      {editTarget && (
        <EditExpiryModal
          isOpen={showEditModal}
          onClose={() => { setShowEditModal(false); setEditTarget(null); }}
          currentExpiresAt={editTarget.expiresAt}
          onSave={handleSaveEdit}
        />
      )}

      <ConfirmRevokeModal
        isOpen={showRevokeConfirm}
        onClose={() => { setShowRevokeConfirm(false); setRevokeTarget(null); }}
        onConfirm={handleRevoke}
        loading={revoking}
      />

      <ConfirmRevokeModal
        isOpen={showBatchRevokeConfirm}
        onClose={() => setShowBatchRevokeConfirm(false)}
        onConfirm={handleBatchRevoke}
        title="批量撤销分享"
        message={`确定要撤销选中的 ${selectedTokens.size} 个分享链接？`}
        loading={batchRevoking}
      />
    </div>
  );
};

export default ShareManagePage;
