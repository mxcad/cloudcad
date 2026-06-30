import React, { useState, useCallback } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { t } from '@/languages';

interface CollabShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  workId: number;
  drawingId?: string;
  projectId?: string | null;
  libraryKey?: 'drawing' | 'block';
}

export const CollabShareModal: React.FC<CollabShareModalProps> = ({
  isOpen,
  onClose,
  workId,
  drawingId,
  projectId,
  libraryKey,
}) => {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/cad-editor?collabWorkId=${workId}${drawingId ? `&drawingId=${encodeURIComponent(drawingId)}` : ''}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}${libraryKey ? `&library=${libraryKey}` : ''}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [shareUrl]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('分享协同')} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
        <div style={{
          background: 'var(--bg-primary)',
          padding: '16px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
        }}>
          <QRCodeSVG value={shareUrl} size={160} level="M" />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
        }}>
          <Link2 size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <span style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
          }}>
            {shareUrl}
          </span>
          <Button
            variant="secondary"
            size="xs"
            icon={copied ? Check : Copy}
            onClick={handleCopy}
          >
            {copied ? t('已复制') : t('复制')}
          </Button>
        </div>

        <Button variant="primary" onClick={onClose} style={{ width: '100%' }}>
          {t('完成')}
        </Button>
      </div>
    </Modal>
  );
};

export default CollabShareModal;
