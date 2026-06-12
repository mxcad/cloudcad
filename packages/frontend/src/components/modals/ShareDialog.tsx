import React, { useState, useCallback, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Trash2, Loader2, Link2, Plus, ArrowLeft } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useNotification } from '../../contexts/NotificationContext';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { getErrorMessage } from '../../utils/errorHandler';
import {
  shareControllerCreateShare,
  shareControllerRevokeShare,
  shareControllerListShares,
  shareControllerGetFileShares,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { ConfirmRevokeModal } from './ConfirmRevokeModal';
import {
  ExpirationOption,
  EXPIRATION_LABELS,
  EXPIRATION_VALUES,
  formatExpiryDate,
} from '@/constants/share';
import './ShareManageDialog.css';

interface ShareListItem {
  token: string;
  url: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId?: string;
  readOnly?: boolean;
}

interface ShareInfo {
  token: string;
  url: string;
  expiresAt: string | null;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  fileId: propFileId,
  readOnly = false,
}) => {
  const { currentFileId } = useCADEditorStore();
  const { showToast } = useNotification();

  const resolvedFileId = propFileId || currentFileId;

  const [expiration, setExpiration] = useState<ExpirationOption>('7d');
  const [customDays, setCustomDays] = useState(1);

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevFileIdRef = useRef<string | null>(null);

  const [items, setItems] = useState<ShareListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  type ViewMode = 'list' | 'create' | 'created';
  const [view, setView] = useState<ViewMode>('list');

  const fetchShares = useCallback(async () => {
    if (!resolvedFileId) return;
    setListLoading(true);
    setListError(null);
    try {
      if (readOnly) {
        const response = await shareControllerGetFileShares({
          path: { fileId: resolvedFileId },
        });
        if (response.error) {
          setListError('获取分享链接失败');
          return;
        }
        const fetched = (response.data as ShareListItem[]) ?? [];
        setItems(fetched);
      } else {
        const result = await shareControllerListShares({
          query: { fileId: resolvedFileId, page: 1, pageSize: 50 },
        });
        if (result.error) {
          setListError('获取分享列表失败');
          return;
        }
        const data = result.data as { items: ShareListItemDto[] } | undefined;
        const raw = data?.items ?? [];
        const mapped: ShareListItem[] = raw.map((item) => ({
          token: item.token,
          url: item.url,
          expiresAt: (item as Record<string, unknown>).expiresAt as string | null,
          createdAt: (item as Record<string, unknown>).createdAt as string,
          createdBy: '',
        }));
        setItems(mapped);
        if (mapped.length === 0 && view === 'list') {
          setView('create');
        }
      }
    } catch {
      setListError('获取分享列表失败');
    } finally {
      setListLoading(false);
    }
  }, [resolvedFileId, readOnly]);

  useEffect(() => {
    if (!isOpen) {
      setShareInfo(null);
      setCopied(false);
      prevFileIdRef.current = null;
      setExpiration('7d');
      setCustomDays(1);
      setItems([]);
      setListError(null);
      setCopiedToken(null);
      setView('list');
      return;
    }

    if (!resolvedFileId) return;

    if (prevFileIdRef.current !== resolvedFileId) {
      prevFileIdRef.current = resolvedFileId;
      setShareInfo(null);
      setView('list');
    }
    fetchShares();
  }, [isOpen, resolvedFileId, fetchShares]);

  const createShare = useCallback(async () => {
    if (!resolvedFileId) {
      showToast('请先打开图纸', 'error');
      return;
    }

    let expiresIn: number | undefined;
    if (expiration === 'never') {
      expiresIn = undefined;
    } else if (expiration === 'custom') {
      expiresIn = customDays * 86400;
    } else {
      expiresIn = EXPIRATION_VALUES[expiration];
    }

    setLoading(true);
    try {
      const result = await shareControllerCreateShare({
        body: {
          fileId: resolvedFileId,
          ...(expiresIn !== undefined ? { expiresIn } : {}),
        },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      const raw = result.data as Record<string, unknown> | undefined;
      if (!raw || typeof raw.token !== 'string') {
        showToast('创建分享链接失败', 'error');
        return;
      }
      const data: ShareInfo = {
        token: raw.token,
        url: raw.url as string,
        expiresAt: raw.expiresAt
          ? typeof raw.expiresAt === 'string'
            ? raw.expiresAt
            : new Date(raw.expiresAt as number | string).toISOString()
          : null,
      };
      setShareInfo(data);
      setView('created');
      fetchShares();
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [resolvedFileId, expiration, customDays, showToast, fetchShares]);

  const confirmRevokeCurrent = () => {
    if (!shareInfo) return;
    setRevokeTarget(shareInfo.token);
    setShowRevokeConfirm(true);
  };

  const handleRevokeCurrent = async () => {
    if (!shareInfo) return;
    setRevoking(true);
    try {
      const result = await shareControllerRevokeShare({
        path: { token: shareInfo.token },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      setShareInfo(null);
      setView('list');
      fetchShares();
      showToast('分享已撤销', 'success');
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setRevoking(false);
    }
  };

  const copyLink = useCallback(async () => {
    if (!shareInfo) return;
    const fullUrl = `${window.location.origin}${shareInfo.url}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = fullUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareInfo]);

  const confirmRevokeItem = (token: string) => {
    setRevokeTarget(token);
    setShowRevokeConfirm(true);
  };

  const handleRevokeItem = async () => {
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

  const handleCopyItem = async (linkUrl: string, token?: string) => {
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

  const fullUrl = shareInfo ? `${window.location.origin}${shareInfo.url}` : '';

  const renderListView = () => (
    <div className="share-dialog-body">
      {!readOnly && (
        <div className="share-dialog-toolbar">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setExpiration('7d');
              setCustomDays(1);
              setView('create');
            }}
          >
            <Plus size={14} />
            新建分享
          </Button>
        </div>
      )}

      {listLoading ? (
        <div className="share-dialog-loading">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        </div>
      ) : listError ? (
        <div className="share-dialog-error">
          <p>{listError}</p>
          <Button variant="secondary" size="sm" onClick={fetchShares}>重试</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="share-dialog-empty">
          <p className="share-dialog-empty-title">
            {readOnly ? '当前没有可复制的分享链接' : '还没有分享过这个文件'}
          </p>
          {!readOnly && (
            <Button variant="primary" size="sm" style={{ marginTop: '12px' }} onClick={() => { setExpiration('7d'); setCustomDays(1); setView('create'); }}>
              新建分享
            </Button>
          )}
        </div>
      ) : (
        <div className="share-dialog-table-container">
          <table className="share-dialog-table">
            <thead>
              <tr>
                <th>链接</th>
                <th>有效期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.token}>
                  <td>
                    <div className="share-dialog-link-cell">
                      <span className="share-dialog-link-text">
                        {item.url?.length > 25 ? item.url.slice(0, 25) + '...' : item.url}
                      </span>
                      <button
                        onClick={() => handleCopyItem(item.url, item.token)}
                        className="share-dialog-copy-btn"
                        title="复制链接"
                      >
                        {copiedToken === item.token ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="share-dialog-td-meta">
                    {formatExpiryDate(item.expiresAt)}
                  </td>
                  <td>
                    <div className="share-dialog-action-cell">
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Trash2}
                          onClick={() => confirmRevokeItem(item.token)}
                          tooltip="撤销分享"
                          style={{ color: 'var(--error)' }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderCreateView = () => (
    <div className="share-dialog-create-body">
      <div className="share-dialog-create-section">
        <span className="share-dialog-create-label">有效期</span>
        <div className="share-dialog-expiration-group">
          {(Object.keys(EXPIRATION_LABELS) as ExpirationOption[]).map(
            (key) => (
              <Button
                key={key}
                variant={expiration === key ? 'primary' : 'outline'}
                size="xs"
                onClick={() => setExpiration(key)}
              >
                {EXPIRATION_LABELS[key]}
              </Button>
            ),
          )}
        </div>
        {expiration === 'custom' && (
          <div className="share-dialog-custom-days">
            <input
              type="number"
              min={1}
              max={365}
              value={customDays}
              onChange={(e) => setCustomDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
              className="share-dialog-custom-input"
            />
            <span className="share-dialog-custom-label">天后过期</span>
          </div>
        )}
      </div>

      <Button variant="primary" onClick={createShare} className="share-dialog-action-btn">
        生成分享链接
      </Button>

      {items.length > 0 && (
        <Button variant="ghost" onClick={() => setView('list')} className="share-dialog-action-btn">
          <ArrowLeft size={14} />
          返回分享列表
        </Button>
      )}
    </div>
  );

  const renderCreatedView = () => (
    <div className="share-dialog-created-body">
      <div className="share-dialog-qr-container">
        <div className="share-dialog-qr-box">
          <QRCodeSVG
            value={fullUrl}
            size={160}
            level="M"
            bgColor="transparent"
            fgColor="var(--text-primary)"
          />
        </div>
      </div>

      <div className="share-dialog-url-bar">
        <Link2 size={14} className="share-dialog-url-icon" />
        <span className="share-dialog-url-text">{fullUrl}</span>
        <button onClick={copyLink} className={`share-dialog-copy-link-btn ${copied ? 'share-dialog-copy-link-btn--copied' : ''}`}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      {shareInfo!.expiresAt && (
        <span className="share-dialog-expiry-hint">
          有效期至: {new Date(shareInfo!.expiresAt).toLocaleString()}
        </span>
      )}

      <div className="share-dialog-created-actions">
        <Button variant="ghost" onClick={confirmRevokeCurrent} disabled={revoking} style={{ flex: 1 }}>
          {revoking ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          撤销分享
        </Button>
        <Button variant="primary" onClick={() => { setView('list'); fetchShares(); }} style={{ flex: 1 }}>
          完成
        </Button>
      </div>
    </div>
  );

  const renderLoadingView = () => (
    <div className="share-dialog-loading-view">
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      <span className="share-dialog-loading-text">正在生成分享链接...</span>
    </div>
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={readOnly ? '复制分享链接' : '分享图纸'} size={readOnly ? 'md' : (view === 'list' ? 'md' : 'sm')}>
        {readOnly ? (
          renderListView()
        ) : (
          <>
            {view === 'list' && renderListView()}
            {view === 'create' && !loading && renderCreateView()}
            {view === 'create' && loading && renderLoadingView()}
            {view === 'created' && renderCreatedView()}
          </>
        )}
      </Modal>

      <ConfirmRevokeModal
        isOpen={showRevokeConfirm}
        onClose={() => { setShowRevokeConfirm(false); setRevokeTarget(null); }}
        onConfirm={handleRevokeItem}
        loading={revoking}
      />
    </>
  );
};

export default ShareDialog;
