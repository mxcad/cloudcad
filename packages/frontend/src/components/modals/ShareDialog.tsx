import React, { useState, useCallback, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Trash2, Loader2, Link2, Users, Plus, ArrowLeft, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useNotification } from '../../contexts/NotificationContext';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import {
  cooperateControllerCreateShare,
  cooperateControllerRevokeShare,
  cooperateControllerListShares,
  cooperateControllerUpdateShare,
} from '@/api-sdk';
import { client } from '@/api-sdk/client.gen';
import type { ShareListItemDto } from '@/api-sdk';
import './ShareManageDialog.css';

interface ShareListItem {
  token: string;
  url: string;
  collaborationEnabled: boolean;
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
  collaborationEnabled: boolean;
}

type ExpirationOption = 'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom';

const EXPIRATION_LABELS: Record<ExpirationOption, string> = {
  never: '永不过期',
  '2h': '2 小时后过期',
  '6h': '6 小时后过期',
  '12h': '12 小时后过期',
  '1d': '1 天后过期',
  '3d': '3 天后过期',
  '7d': '7 天后过期',
  custom: '自定义',
};

const EXPIRATION_VALUES: Record<ExpirationOption, number | null> = {
  never: null,
  '2h': 7200,
  '6h': 21600,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '7d': 604800,
  custom: null,
};

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  fileId: propFileId,
  readOnly = false,
}) => {
  const { currentFileId } = useCADEditorStore();
  const { showToast } = useNotification();

  const resolvedFileId = propFileId || currentFileId;

  const [collaborationEnabled, setCollaborationEnabled] = useState(false);
  const [expiration, setExpiration] = useState<ExpirationOption>('7d');
  const [customDays, setCustomDays] = useState(1);

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevFileIdRef = useRef<string | null>(null);

  const [items, setItems] = useState<ShareListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  type ViewMode = 'list' | 'create' | 'created';
  const [view, setView] = useState<ViewMode>('list');

  const fetchShares = useCallback(async () => {
    if (!resolvedFileId) return;
    setListLoading(true);
    setListError(null);
    try {
      if (readOnly) {
        const response = await (
          client as { get: (opts: { url: string }) => Promise<{ data: unknown; error?: unknown }> }
        ).get({ url: `/api/v1/collaboration/share/file/${resolvedFileId}` });
        if (response.error) {
          setListError('获取分享链接失败');
          return;
        }
        const fetched = (response.data as ShareListItem[]) ?? [];
        setItems(fetched);
      } else {
        const result = await cooperateControllerListShares({
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
          url: `/share/${item.token}`,
          collaborationEnabled: item.collaborationEnabled,
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
  }, [resolvedFileId, view, readOnly]);

  useEffect(() => {
    if (!isOpen) {
      setShareInfo(null);
      setCopied(false);
      prevFileIdRef.current = null;
      setCollaborationEnabled(false);
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
    if (expiration === 'custom') {
      expiresIn = customDays * 86400;
    } else {
      const val = EXPIRATION_VALUES[expiration];
      if (val !== null) expiresIn = val;
    }

    setLoading(true);
    try {
      const result = await cooperateControllerCreateShare({
        body: {
          fileId: resolvedFileId,
          ...(expiresIn !== undefined ? { expiresIn } : {}),
          collaborationEnabled,
        },
      });
      if (result.error) {
        showToast('创建分享链接失败', 'error');
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
        collaborationEnabled: !!raw.collaborationEnabled,
      };
      setShareInfo(data);
      setView('created');
      fetchShares();
    } catch {
      showToast('创建分享链接失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [resolvedFileId, collaborationEnabled, expiration, customDays, showToast, fetchShares]);

  const revokeShare = useCallback(async () => {
    if (!shareInfo) return;

    setRevoking(true);
    try {
      const result = await cooperateControllerRevokeShare({
        path: { token: shareInfo.token },
      });
      if (result.error) {
        showToast('撤销分享失败', 'error');
        return;
      }
      setShareInfo(null);
      setView('list');
      fetchShares();
      showToast('分享已撤销', 'success');
    } catch {
      showToast('撤销分享失败', 'error');
    } finally {
      setRevoking(false);
    }
  }, [shareInfo, showToast, fetchShares]);

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

  const handleRevoke = async (token: string) => {
    if (readOnly) return;
    try {
      const result = await cooperateControllerRevokeShare({ path: { token } });
      if (result.error) {
        showToast('撤销失败', 'error');
        return;
      }
      setItems((prev) => prev.filter((i) => i.token !== token));
      showToast('分享已撤销', 'success');
    } catch {
      showToast('撤销失败', 'error');
    }
  };

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
      showToast('链接已复制', 'success');
    } catch {
      showToast('复制失败', 'error');
    }
  };

  const handleToggleCollaboration = async (item: ShareListItem) => {
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
    } catch {
      showToast('更新失败', 'error');
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

  const fullUrl = shareInfo ? `${window.location.origin}${shareInfo.url}` : '';

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 0',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontWeight: 500,
  };

  const toggleStyle = (on: boolean): React.CSSProperties => ({
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    background: on ? 'var(--primary-500)' : 'var(--border-default)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s',
    border: 'none',
    padding: 0,
    flexShrink: 0,
  });

  const toggleKnobStyle = (on: boolean): React.CSSProperties => ({
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: 'white',
    position: 'absolute',
    top: '2px',
    left: on ? '18px' : '2px',
    transition: 'left 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  });

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    width: '100%',
  };

  const renderListView = () => (
    <div className="share-dialog-body">
      {!readOnly && (
        <div className="share-dialog-toolbar">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setCollaborationEnabled(false);
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
        </div>
      ) : (
        <div className="share-dialog-table-container">
          <table className="share-dialog-table">
            <thead>
              <tr>
                <th>链接</th>
                <th>自动加入协同</th>
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
                      onClick={() => { if (!readOnly) handleToggleCollaboration(item); }}
                      className={`share-dialog-collab-btn ${item.collaborationEnabled ? 'share-dialog-collab-btn--on' : 'share-dialog-collab-btn--off'}`}
                    >
                      {item.collaborationEnabled ? '开' : '关'}
                    </button>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {formatDate(item.expiresAt)}
                  </td>
                  <td>
                    <div className="share-dialog-action-cell">
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Trash2}
                          onClick={() => handleRevoke(item.token)}
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '8px 0',
      }}
    >
      <div style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Users size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span style={labelStyle}>自动加入协同</span>
        </div>
        <button
          onClick={() => setCollaborationEnabled(!collaborationEnabled)}
          style={toggleStyle(collaborationEnabled)}
          type="button"
        >
          <div style={toggleKnobStyle(collaborationEnabled)} />
        </button>
      </div>

      <div
        style={{
          width: '100%',
          height: '1px',
          background: 'var(--border-default)',
        }}
      />

      <div style={{ width: '100%' }}>
        <span style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>
          有效期
        </span>
        <div style={radioGroupStyle}>
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
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              min={1}
              max={365}
              value={customDays}
              onChange={(e) => setCustomDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
              style={{
                width: '60px',
                padding: '4px 8px',
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              天后过期
            </span>
          </div>
        )}
      </div>

      <Button
        variant="primary"
        onClick={createShare}
        style={{ width: '100%', marginTop: '4px' }}
      >
        生成分享链接
      </Button>

      {items.length > 0 && (
        <Button
          variant="ghost"
          onClick={() => setView('list')}
          style={{ width: '100%' }}
        >
          <ArrowLeft size={14} />
          返回分享列表
        </Button>
      )}
    </div>
  );

  const renderCreatedView = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '8px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div
          style={{
            background: 'var(--bg-primary)',
            padding: '16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-default)',
          }}
        >
          <QRCodeSVG
            value={fullUrl}
            size={160}
            level="M"
            bgColor="transparent"
            fgColor="var(--text-primary)"
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}
        >
          <Users size={12} />
          <span>
            自动加入协同：{shareInfo!.collaborationEnabled ? '开启' : '关闭'}
          </span>
        </div>
      </div>

      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
        }}
      >
        <Link2
          size={14}
          style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
        />
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {fullUrl}
        </span>
        <button
          onClick={copyLink}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 8px',
            gap: '4px',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: copied ? 'var(--success)' : 'var(--primary-500)',
            background: copied ? 'var(--success-dim)' : 'transparent',
            border:
              '1px solid ' +
              (copied
                ? 'rgba(34, 197, 94, 0.2)'
                : 'var(--border-default)'),
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      {shareInfo!.expiresAt && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}
        >
          有效期至: {new Date(shareInfo!.expiresAt).toLocaleString()}
        </span>
      )}

      <div
        style={{
          display: 'flex',
          gap: '8px',
          width: '100%',
        }}
      >
        <Button
          variant="ghost"
          onClick={revokeShare}
          disabled={revoking}
          style={{ flex: 1 }}
        >
          {revoking ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
          撤销分享
        </Button>
        <Button variant="primary" onClick={() => { setView('list'); fetchShares(); }} style={{ flex: 1 }}>
          完成
        </Button>
      </div>
    </div>
  );

  const renderLoadingView = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '24px',
      }}
    >
      <Loader2
        size={24}
        className="animate-spin"
        style={{ color: 'var(--primary-500)' }}
      />
      <span
        style={{
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
        }}
      >
        正在生成分享链接...
      </span>
    </div>
  );

  return (
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
  );
};

export default ShareDialog;
