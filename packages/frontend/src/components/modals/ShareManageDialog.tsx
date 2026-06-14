import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Trash2, Loader2, ExternalLink, Plus, Edit3 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useNotification } from '../../contexts/NotificationContext';
import { getErrorMessage } from '../../utils/errorHandler';
import {
  shareControllerListShares,
  shareControllerRevokeShare,
  shareControllerUpdateShare,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { ShareDialog } from './ShareDialog';
import { EditExpiryModal } from './EditExpiryModal';
import { ConfirmRevokeModal } from './ConfirmRevokeModal';
import { formatExpiryDate } from '@/constants/share';
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

  const [editTarget, setEditTarget] = useState<{ token: string; expiresAt: string | null } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await shareControllerListShares({
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
      showToast('分享已撤销', 'success');
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = async (linkUrl: string, token?: string) => {
    const fullUrl = `${window.location.origin}${linkUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedToken(token ?? linkUrl);
      setTimeout(() => setCopiedToken(null), 2000);
      showToast('链接已复制', 'success');
    } catch {
      showToast('复制失败', 'error');
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
      fetchShares();
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
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
                            {item.url?.length > 25 ? item.url.slice(0, 25) + '...' : item.url}
                          </span>
                          <button
                            onClick={() => handleCopy(item.url, item.token)}
                            className="share-dialog-copy-btn"
                            title="复制链接"
                          >
                            {copiedToken === item.token ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td
                        className="share-dialog-td-meta share-dialog-td-clickable"
                        onClick={() => handleEditExpiry(item.token, item.expiresAt as string | null)}
                      >
                        {formatExpiryDate(item.expiresAt as string | null)}
                      </td>
                      <td className="share-dialog-td-meta">
                        {item.usedCount}
                      </td>
                      <td>
                        <div className="share-dialog-action-cell">
                          <Button
                            variant="secondary"
                            size="xs"
                            icon={ExternalLink}
                            onClick={() => window.open(item.url, '_blank')}
                            tooltip="打开文件"
                          />
                          <Button
                            variant="secondary"
                            size="xs"
                            icon={Edit3}
                            onClick={() => handleEditExpiry(item.token, item.expiresAt as string | null)}
                            tooltip="修改有效期"
                          />
                          <Button
                            variant="secondary"
                            size="xs"
                            icon={Trash2}
                            onClick={() => confirmRevoke(item.token)}
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
    </>
  );
};

export default ShareManageDialog;
