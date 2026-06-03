import React, { useState, useCallback, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Trash2, Loader2, Link2 } from 'lucide-react';
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
}

interface ShareInfo {
  token: string;
  url: string;
  expiresAt: string | null;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentFileId } = useCADEditorStore();
  const { showToast } = useNotification();

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  const createShare = useCallback(async () => {
    if (!currentFileId) {
      showToast('请先打开图纸', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await cooperateControllerCreateShare({
        body: { fileId: currentFileId, expiresIn: 7 * 24 * 3600 },
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
      };
      setShareInfo(data);
    } catch {
      showToast('创建分享链接失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentFileId, showToast]);

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
    if (isOpen && currentFileId && !shareInfo) {
      createShare();
    }
    if (!isOpen) {
      setShareInfo(null);
      setCopied(false);
    }
  }, [isOpen, createShare, currentFileId, shareInfo]);

  const fullUrl = shareInfo ? `${window.location.origin}${shareInfo.url}` : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="分享协同" size="sm">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '8px 0',
        }}
      >
        {loading ? (
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
        ) : shareInfo ? (
          <>
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
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
            }}
          >
            <span
              style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-sm)',
              }}
            >
              未能生成分享链接
            </span>
            <Button onClick={createShare} disabled={loading}>
              重试
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ShareDialog;
