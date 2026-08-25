import React, { useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { X, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { BatchTask } from '@/stores/useBatchDownloadStore';
import { useBatchDownload } from '@/hooks/file-system';
import { t } from '@/languages';
import { Z_LAYERS } from '@/constants/layers';

interface BatchDownloadProgressProps {
  isOpen: boolean;
  onClose: () => void;
  task: BatchTask;
  showToast?: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
}

export const BatchDownloadProgress: React.FC<BatchDownloadProgressProps> = ({
  isOpen,
  onClose,
  task,
  showToast,
}) => {
  const { cancelTask, downloadZip, downloadAllItems } =
    useBatchDownload(showToast);

  const progress = useMemo(() => {
    if (task.totalCount === 0) return 0;
    return Math.round((task.completedCount / task.totalCount) * 100);
  }, [task.completedCount, task.totalCount]);

  const isActive = task.status === 'PENDING' || task.status === 'PROCESSING';

  const statusIcon = () => {
    switch (task.status) {
      case 'COMPLETED':
        return (
          <CheckCircle
            className="w-5 h-5"
            style={{ color: 'var(--success)' }}
          />
        );
      case 'FAILED':
        return (
          <AlertCircle className="w-5 h-5" style={{ color: 'var(--danger)' }} />
        );
      case 'CANCELLED':
        return (
          <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
        );
      default:
        return (
          <Clock className="w-5 h-5" style={{ color: 'var(--primary-500)' }} />
        );
    }
  };

  const statusText = () => {
    switch (task.status) {
      case 'PENDING':
        return t('等待处理');
      case 'PROCESSING':
        return t('正在处理');
      case 'COMPLETED':
        return t('已完成');
      case 'FAILED':
        return t('处理失败');
      case 'CANCELLED':
        return t('已取消');
      default:
        return task.status;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('批量下载进度')}
      size="md"
      zIndex={Z_LAYERS.MODAL}
      footer={
        <div className="flex gap-2 justify-end">
          {isActive ? (
            <Button variant="secondary" onClick={() => cancelTask(task.taskId)}>
              {t('取消')}
            </Button>
          ) : task.status === 'COMPLETED' ? (
            task.mode === 'individual' ? (
              <Button onClick={() => void downloadAllItems(task)}>
                <Download className="w-4 h-4 mr-1" />
                {t('逐个下载')}
              </Button>
            ) : (
              <Button onClick={() => downloadZip(task)}>
                <Download className="w-4 h-4 mr-1" />
                {t('下载 ZIP')}
              </Button>
            )
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t('关闭')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {statusIcon()}
          <span
            className="font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {statusText()}
          </span>
          {isActive && task.currentFile && (
            <span
              className="text-sm ml-2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              - {task.currentFile}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <div
            className="flex justify-between text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>{t('进度')}</span>
            <span>
              {task.completedCount}/{task.totalCount}
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background:
                  task.status === 'FAILED'
                    ? 'var(--danger)'
                    : 'var(--primary-500)',
              }}
            />
          </div>
        </div>

        {task.errors && task.errors.length > 0 && (
          <Card>
            <div className="space-y-1">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--danger)' }}
              >
                {t('错误详情')} ({task.errors.length})
              </p>
              {task.errors.slice(0, 5).map((err, i) => (
                <p
                  key={i}
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {err.fileName}: {err.error}
                </p>
              ))}
              {task.errors.length > 5 && (
                <p
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  ...
                  {t('还有 {count} 个错误', { count: task.errors.length - 5 })}
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    </Modal>
  );
};
