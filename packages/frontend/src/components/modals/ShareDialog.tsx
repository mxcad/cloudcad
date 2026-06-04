import React, { useState, useCallback, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Trash2, Loader2, Link2, Users } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useNotification } from '../../contexts/NotificationContext';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import {
  cooperateControllerCreateShare,
  cooperateControllerRevokeShare,
} from '@/api-sdk';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId?: string;
}

interface ShareInfo {
  token: string;
  url: string;
  expiresAt: string | null;
  collaborationEnabled: boolean;
}

type ExpirationOption = 'never' | '1d' | '3d' | '7d' | 'custom';

const EXPIRATION_LABELS: Record<ExpirationOption, string> = {
  never: '永不过期',
  '1d': '1 天后过期',
  '3d': '3 天后过期',
  '7d': '7 天后过期',
  custom: '自定义',
};

const EXPIRATION_VALUES: Record<ExpirationOption, number | null> = {
  never: null,
  '1d': 86400,
  '3d': 259200,
  '7d': 604800,
  custom: null,
};

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  fileId: propFileId,
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
    } catch {
      showToast('创建分享链接失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [resolvedFileId, collaborationEnabled, expiration, customDays, showToast]);

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
      showToast('分享已撤销', 'success');
    } catch {
      showToast('撤销分享失败', 'error');
    } finally {
      setRevoking(false);
    }
  }, [shareInfo, showToast]);

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

  useEffect(() => {
    if (!isOpen) {
      setShareInfo(null);
      setCopied(false);
      prevFileIdRef.current = null;
      setCollaborationEnabled(false);
      setExpiration('7d');
      setCustomDays(1);
      return;
    }

    if (!resolvedFileId) return;

    if (prevFileIdRef.current !== resolvedFileId) {
      prevFileIdRef.current = resolvedFileId;
      setShareInfo(null);
    }
  }, [isOpen, resolvedFileId]);

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="分享图纸" size="sm">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '8px 0',
        }}
      >
        {!shareInfo && !loading && (
          <>
            <div style={rowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} style={{ color: 'var(--text-tertiary)' }} />
                <span style={labelStyle}>允许加入实时协同</span>
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
          </>
        )}

        {loading && (
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
        )}

        {shareInfo && !loading && (
          <>
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
                  协同：{shareInfo.collaborationEnabled ? '开启' : '关闭'}
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

            {shareInfo.expiresAt && (
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                }}
              >
                有效期至: {new Date(shareInfo.expiresAt).toLocaleString()}
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
              <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>
                完成
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ShareDialog;
