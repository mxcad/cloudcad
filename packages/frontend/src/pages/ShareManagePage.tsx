import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Trash2, Search, ExternalLink, Loader2, Plus, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import {
  shareControllerListShares,
  shareControllerRevokeShare,
  shareControllerUpdateShare,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { Modal } from '@/components/ui/Modal';
import { SelectFileModal } from '@/components/modals/SelectFileModal';
import { ShareDialog } from '@/components/modals/ShareDialog';
import './ShareManagePage/ShareManagePage.css';

type ExpirationOption = 'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom';

const EXPIRATION_LABELS: Record<ExpirationOption, string> = {
  never: '永不过期',
  '2h': '2 小时',
  '6h': '6 小时',
  '12h': '12 小时',
  '1d': '1 天',
  '3d': '3 天',
  '7d': '7 天',
  custom: '自定义',
};

const EXPIRATION_VALUES: Record<Exclude<ExpirationOption, 'never' | 'custom'>, number> = {
  '2h': 7200,
  '6h': 21600,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '7d': 604800,
};

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

  const [editToken, setEditToken] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editExpiration, setEditExpiration] = useState<ExpirationOption>('never');
  const [editCustomDays, setEditCustomDays] = useState(1);

  const fetchShares = useCallback(async (p: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await shareControllerListShares({
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
      const result = await shareControllerRevokeShare({ path: { token } });
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

  const openEditModal = (token: string, expiresAt: string | null) => {
    setEditToken(token);
    setEditCustomDays(1);
    if (!expiresAt) {
      setEditExpiration('never');
    } else {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 7200 * 1000) setEditExpiration('2h');
      else if (diff <= 21600 * 1000) setEditExpiration('6h');
      else if (diff <= 43200 * 1000) setEditExpiration('12h');
      else if (diff <= 86400 * 1000) setEditExpiration('1d');
      else if (diff <= 259200 * 1000) setEditExpiration('3d');
      else if (diff <= 604800 * 1000) setEditExpiration('7d');
      else {
        setEditExpiration('custom');
        setEditCustomDays(Math.ceil(diff / (86400 * 1000)));
      }
    }
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editToken) return;
    let expiresAt: string | null = null;
    if (editExpiration === 'custom') {
      expiresAt = new Date(Date.now() + editCustomDays * 86400 * 1000).toISOString();
    } else if (editExpiration !== 'never') {
      const secs = EXPIRATION_VALUES[editExpiration];
      expiresAt = new Date(Date.now() + secs * 1000).toISOString();
    }
    try {
      const result = await shareControllerUpdateShare({
        path: { token: editToken },
        body: { expiresAt } as any,
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      showToast('有效期已更新', 'success');
      setShowEditModal(false);
      fetchShares(page, search);
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
                          icon={Edit3}
                          onClick={() => openEditModal(item.token, item.expiresAt as string | null)}
                          tooltip="修改有效期"
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

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="修改有效期"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
          <div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
              有效期
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(Object.keys(EXPIRATION_LABELS) as ExpirationOption[]).map((key) => (
                <Button
                  key={key}
                  variant={editExpiration === key ? 'primary' : 'outline'}
                  size="xs"
                  onClick={() => setEditExpiration(key)}
                >
                  {EXPIRATION_LABELS[key]}
                </Button>
              ))}
            </div>
            {editExpiration === 'custom' && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={editCustomDays}
                  onChange={(e) => setEditCustomDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
                  style={{ width: '60px', padding: '4px 8px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>天后过期</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowEditModal(false)}>取消</Button>
            <Button variant="primary" onClick={handleSaveEdit}>保存</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ShareManagePage;
