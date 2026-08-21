import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';
import { ExternalReferenceFile } from '../../types/filesystem';
import {
  Upload,
  Download,
  RefreshCw,
  FileText,
  Eye,
  Replace,
} from 'lucide-react';
import { t } from '@/languages';
import { Z_LAYERS } from '@/constants/layers';

interface ExternalReferencePanelProps {
  isOpen: boolean;
  files: ExternalReferenceFile[];
  loading: boolean;
  mode: 'blocking' | 'active';
  onSelectAndUpload: () => void;
  onReplace: (file: ExternalReferenceFile) => void;
  onDownload: (file: ExternalReferenceFile) => void;
  onView: (file: ExternalReferenceFile) => void;
  onRefresh: () => void;
  onComplete: () => void;
  onClose: () => void;
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export const ExternalReferencePanel: React.FC<ExternalReferencePanelProps> = ({
  isOpen,
  files,
  loading,
  mode,
  onSelectAndUpload,
  onReplace,
  onDownload,
  onView,
  onComplete,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleView = (file: ExternalReferenceFile) => {
    onView(file);
  };

  const cardCount = files.length;
  const missingCount = files.filter(
    (f) => !f.exists && f.uploadState !== 'success'
  ).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('外部参照管理')}
      size="lg"
      zIndex={Z_LAYERS.MODAL}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {missingCount > 0
              ? t('还有 {count} 个文件未处理', { count: missingCount })
              : files.length > 0
                ? t('所有文件已处理')
                : ''}
          </span>
          {mode === 'blocking' ? (
            <Button variant="secondary" size="sm" onClick={onComplete}>
              {t('继续打开')}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t('关闭')}
            </Button>
          )}
        </div>
      }
    >
      <div>
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw
              size={20}
              className="animate-spin"
              style={{ color: 'var(--text-muted)' }}
            />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FileText size={36} style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-tertiary)' }} className="text-sm">
              {t('暂无外部参照文件')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('共 {count} 个文件', { count: cardCount })}
                {missingCount > 0 && (
                  <span className="ml-1" style={{ color: 'var(--warning)' }}>
                    {t('，{count} 个缺失', { count: missingCount })}
                  </span>
                )}
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {files.map((file) => {
                const isMissing =
                  !file.exists && file.uploadState !== 'success';

                return (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--bg-tertiary)' }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          file.uploadState === 'success' || file.exists
                            ? 'var(--success)'
                            : file.uploadState === 'fail'
                              ? 'var(--error)'
                              : file.uploadState === 'uploading'
                                ? 'var(--info)'
                                : 'var(--warning)',
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Tag
                          variant={file.type === 'img' ? 'info' : 'primary'}
                          size="xs"
                        >
                          {file.type === 'img' ? t('图片') : t('图纸')}
                        </Tag>
                        <span
                          className="text-sm font-medium truncate block"
                          style={{ color: 'var(--text-primary)' }}
                          title={file.name}
                        >
                          {file.name}
                        </span>
                      </div>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {formatFileSize(file.size)}
                        {file.uploadState === 'uploading' && (
                          <span
                            className="ml-2"
                            style={{ color: 'var(--info)' }}
                          >
                            {t('上传中 {progress}%', {
                              progress: Math.round(file.progress),
                            })}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {file.uploadState === 'uploading' && (
                        <div className="w-16">
                          <div
                            className="h-1 rounded-full overflow-hidden"
                            style={{ background: 'var(--bg-elevated)' }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${file.progress}%`,
                                background: 'var(--primary-500)',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {isMissing ? (
                        <Button
                          variant="primary"
                          size="xs"
                          icon={Upload}
                          onClick={() => onReplace(file)}
                        >
                          {t('上传')}
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="xs"
                            icon={Eye}
                            onClick={() => handleView(file)}
                          >
                            {t('查看')}
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            icon={Replace}
                            onClick={() => onReplace(file)}
                          >
                            {t('替换')}
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            icon={Download}
                            onClick={() => onDownload(file)}
                          >
                            {t('下载')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ExternalReferencePanel;
