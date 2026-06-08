import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Trash2, Loader2, ExternalLink, Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useNotification } from '../../contexts/NotificationContext';
import { getErrorMessage } from '../../utils/errorHandler';
import {
  cooperateControllerListShares,
  cooperateControllerRevokeShare,
  cooperateControllerUpdateShare,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { ShareDialog } from './ShareDialog';
import './ShareManageDialog.css';

interface ShareManageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
}

export const ShareManageDialog: React.FC<ShareManageDialogProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
}) => {
  const { showToast } = useNotification();

  const [items, setItems] = useState<ShareListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await cooperateControllerListShares({
        query: { fileId, page: 1, pageSize: 50 },
      });
      if (result.error) {
        setError(getErrorMessage(result.error));
        return;
      }
      const data = result.data as { items: ShareListItemDto[] } | undefined;
      setItems(data?.items ?? []);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (isOpen) {
      fetchShares();
    }
  }, [isOpen, fetchShares]);

  const handleRevoke = async (token: string) => {
    try {
      const result = await cooperateControllerRevokeShare({ path: { token } });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      setItems((prev) => prev.filter((i) => i.token !== token));
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

  const handleToggleCollaboration = async (item: ShareListItemDto) => {
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

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`"${fileName}" 的分享链接`} size="md">
        <div className="share-dialog-body">
          <div className="share-dialog-toolbar">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus size={14} />
              新建分享
            </Button>
          </div>

          {loading ? (
            <div className="share-dialog-loading">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
            </div>
          ) : error ? (
            <div className="share-dialog-error">
              <p>{error}</p>
              <Button variant="secondary" size="sm" onClick={fetchShares}>重试</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="share-dialog-empty">
              <p className="share-dialog-empty-title">
                还没有分享过这个文件
              </p>
              <Button variant="primary" size="sm" style={{ marginTop: '12px' }} onClick={() => setCreateDialogOpen(true)}>
                新建分享
              </Button>
            </div>
          ) : (
            <div className="share-dialog-table-container">
              <table className="share-dialog-table">
                <thead>
                  <tr>
                    <th>链接</th>
                    <th>自动加入协同</th>
                    <th>有效期</th>
                    <th>次数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="share-dialog-link-cell">
                          <span className="share-dialog-link-text">
                            /share/{item.token.slice(0, 10)}...
                          </span>
                          <button
                            onClick={() => handleCopy(item.token)}
                            className="share-dialog-copy-btn"
                            style={{ display: 'flex', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)' }}
                            title="复制链接"
                          >
                            {copiedToken === item.token ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleCollaboration(item)}
                          className={`share-dialog-collab-btn ${item.collaborationEnabled ? 'share-dialog-collab-btn--on' : 'share-dialog-collab-btn--off'}`}
                        >
                          {item.collaborationEnabled ? '开' : '关'}
                        </button>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {formatDate(item.expiresAt as string | null)}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {item.usedCount}
                      </td>
                      <td>
                        <div className="share-dialog-action-cell">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={ExternalLink}
                            onClick={() => window.open(`/cad-editor/${item.fileId}?shareToken=${item.token}`, '_blank')}
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
          )}
        </div>
      </Modal>

      <ShareDialog
        isOpen={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          fetchShares();
        }}
        fileId={fileId}
      />
    </>
  );
};

export default ShareManageDialog;
