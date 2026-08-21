import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import {
  useBatchDownloadStore,
  BatchTask,
} from '@/stores/useBatchDownloadStore';
import { useBatchDownload } from '@/hooks/file-system';
import { BatchDownloadProgress } from './BatchDownloadProgress';
import { t } from '@/languages';
import { Z_LAYERS } from '@/constants/layers';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { getRelativeTime } from '@/utils/dateUtils';

const STATUS_LABELS: Record<string, string> = {
  PENDING: '等待中',
  PROCESSING: '处理中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'var(--text-tertiary)',
  PROCESSING: 'var(--primary-500)',
  COMPLETED: 'var(--success)',
  FAILED: 'var(--danger)',
  CANCELLED: 'var(--text-tertiary)',
};

interface DownloadManagerProps {
  showToast?: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
}

export const DownloadManager: React.FC<DownloadManagerProps> = ({
  showToast,
}) => {
  const { tasks, removeTask } = useBatchDownloadStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null);
  const { cancelTask, downloadZip } = useBatchDownload(showToast);

  const activeTasks = tasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'PROCESSING'
  );

  const activeCount = activeTasks.length;

  return (
    <>
      <div className="relative">
        <Tooltip content={t('下载管理')}>
          <Button
            variant="secondary"
            onClick={() => setIsOpen(!isOpen)}
            className="relative rounded-xl transition-all duration-300 ease-out hover:scale-110 active:scale-95 hover:bg-[var(--bg-tertiary)] group"
            aria-label={t('下载管理')}
          >
            <Download
              size={18}
              className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-500)]"
            />
            {activeCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold rounded-full"
                style={{
                  background: 'var(--primary-500)',
                  color: 'var(--text-inverse)',
                }}
              >
                {activeCount > 9 ? '9+' : activeCount}
              </span>
            )}
          </Button>
        </Tooltip>

        {isOpen && (
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: Z_LAYERS.OVERLAY }}
              onClick={() => setIsOpen(false)}
            />
            <div
              className="absolute right-0 mt-2 w-80 rounded-xl shadow-2xl overflow-hidden"
              style={{
                zIndex: Z_LAYERS.POPUP,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span
                  className="font-semibold text-sm"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t('下载管理')}
                </span>
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {tasks.length} {t('个任务')}
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {tasks.length === 0 ? (
                  <div
                    className="p-6 text-center text-sm"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {t('暂无下载任务')}
                  </div>
                ) : (
                  tasks.slice(0, 20).map((task) => (
                    <div
                      key={task.taskId}
                      className="flex items-center gap-3 px-4 py-3 hover:opacity-80 cursor-pointer border-b"
                      style={{ borderColor: 'var(--border-subtle)' }}
                      onClick={() => {
                        setSelectedTask(task);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              background:
                                STATUS_COLORS[task.status] ||
                                'var(--text-tertiary)',
                            }}
                          />
                          <span
                            className="text-sm font-medium truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {t(STATUS_LABELS[task.status] || task.status)}
                          </span>
                        </div>
                        <div
                          className="text-xs mt-0.5"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {task.completedCount}/{task.totalCount}
                          {task.createdAt && (
                            <>
                              {' · '}
                              {getRelativeTime(task.createdAt)}
                            </>
                          )}
                        </div>
                      </div>
                      {task.status === 'COMPLETED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadZip(task);
                          }}
                          className="flex-shrink-0 p-1 rounded hover:opacity-70"
                          style={{ color: 'var(--primary-500)' }}
                        >
                          <Download size={16} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTask(task.taskId);
                        }}
                        className="flex-shrink-0 p-1 rounded hover:opacity-70"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {selectedTask && (
        <BatchDownloadProgress
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          showToast={showToast}
        />
      )}
    </>
  );
};
