import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Trash2, Search, ExternalLink, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import {
  cooperateControllerListShares,
  cooperateControllerRevokeShare,
  cooperateControllerUpdateShare,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { SelectFileModal } from '@/components/modals/SelectFileModal';
import { ShareDialog } from '@/components/modals/ShareDialog';
import './ShareManagePage/ShareManagePage.css';

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

  const fetchShares = useCallback(async (p: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await cooperateControllerListShares({
        query: {
          page: p,
          pageSize: 20,
          search: q || undefined,
        },
      });
      if (result.error) {
        setError(getErrorMessage(result.error));
        return;
      }
      const data = result.data as { items: ShareListItemDto[]; total: number; page: number; pageSize: number } | undefined;
      setItems(data?.items ?? []);
      setTotal(data?.total ?? 0);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShares(page, search);
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchShares(1, search);
  };

  const handleRevoke = async (token: string) => {
    try {
      const result = await cooperateControllerRevokeShare({ path: { token } });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      setItems((prev) => prev.filter((i) => i.token !== token));
      setTotal((prev) => prev - 1);
      showToast('分享已撤销', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
      showToast('链接已复制', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleEditToggleCollaboration = async (item: ShareListItemDto) => {
    try {
      await cooperateControllerUpdateShare({
        path: { token: item.token },
        body: { collaborationEnabled: !item.collaborationEnabled },
      });
      setItems((prev) =>
        prev.map((i) =>
          i.token === item.token ? { ...i, collaborationEnabled: !i.collaborationEnabled } : i,
        ),
      );
      showToast('已更新', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '永不过期';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
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

  const collaborationBtnStyle = (enabled: boolean): React.CSSProperties => ({
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    background: enabled ? 'var(--success-dim)' : 'transparent',
    color: enabled ? 'var(--success)' : 'var(--text-tertiary)',
    cursor: 'pointer',
  });

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
        {items.length > 0 && (
          <Button variant="primary" size="sm" onClick={() => setShowFileSelector(true)}>
            <Plus size={14} />
            新建分享
          </Button>
        )}
      </div>

      {loading ? (
        <div className="share-mgmt-loading">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        </div>
      ) : error ? (
        <div className="share-mgmt-table-container">
          <div className="share-mgmt-table-empty">
            <p style={{ marginBottom: '8px' }}>{error}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchShares(page, search)}>
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
            <p className="share-mgmt-empty-desc" style={{ marginTop: '4px' }}>
              {search ? '尝试其他搜索词' : '去文件管理器选择图纸，右键即可分享'}
            </p>
            {search && (
              <Button variant="ghost" size="sm" style={{ marginTop: '12px' }} onClick={() => { setSearch(''); fetchShares(1, ''); }}>
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
                  <th>文件</th>
                  <th>链接</th>
                  <th>自动加入协同</th>
                  <th>有效期</th>
                  <th>次数</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 500 }}>{item.fileName}</td>
                    <td>
                      <div className="share-mgmt-link-cell">
                        <span className="share-mgmt-link-text">
                          /share/{item.token.slice(0, 8)}...
                        </span>
                        <button
                          onClick={() => handleCopy(item.token)}
                          className="share-mgmt-copy-btn"
                          style={{ display: 'flex', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)' }}
                          title="复制链接"
                        >
                          {copiedToken === item.token ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => handleEditToggleCollaboration(item)}
                        style={collaborationBtnStyle(item.collaborationEnabled)}
                      >
                        {item.collaborationEnabled ? '开' : '关'}
                      </button>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                      {formatDate(item.expiresAt as string | null)}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                      {item.usedCount}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <div className="share-mgmt-action-cell">
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={ExternalLink}
                          onClick={() => navigate(`/cad-editor/${item.fileId}?shareToken=${item.token}`)}
                          tooltip="打开文件"
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Trash2}
                          onClick={() => handleRevoke(item.token)}
                          tooltip="撤销分享"
                          style={{ color: 'var(--error)' }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
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
            fetchShares(page, search);
          }}
          fileId={shareFileId}
        />
      )}
    </div>
  );
};

export default ShareManagePage;
