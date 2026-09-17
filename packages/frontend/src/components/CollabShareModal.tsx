import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ShareLinkBar } from '@/components/common/ShareLinkBar';
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
  const shareUrl = `${window.location.origin}/cad-editor?collabWorkId=${workId}${drawingId ? `&drawingId=${encodeURIComponent(drawingId)}` : ''}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}${libraryKey ? `&library=${libraryKey}` : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('分享协同')} size="sm">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '8px 0',
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
          <QRCodeSVG value={shareUrl} size={160} level="M" />
        </div>

        <ShareLinkBar url={shareUrl} label={t('协同链接')} />

        <Button variant="primary" onClick={onClose} style={{ width: '100%' }}>
          {t('完成')}
        </Button>
      </div>
    </Modal>
  );
};

export default CollabShareModal;
